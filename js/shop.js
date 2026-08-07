// ==========================================================================
// js/shop.js — ショップ画面
//
// 4カテゴリ構成：①応援（リスト形式）②スキル（横長1枠＋2列3段）
// ③カスタム（横長1枠＋2列3段）④博士支援（2列4段、横長枠なし）
//
// モード選択画面の「ショップ」ボタン → この画面を開く（コレクション画面と同じ、
// window.CollectionUIは使わずmode-selectを直接開閉する）。
//
// 【購入の実データ管理】
//   - 単発購入品（スキル／カスタム／博士支援／応援パック）: saveData.shopPurchases[id] = true
//   - スキル購入は追加でsaveData.unlockedSkillsにもidを積む（スキル選択画面がここを見る）
//   - エンドレスモード解放: saveData.endlessUnlocked
//   - アイコンガチャ: saveData.ownedIcons（重複無し、最大12でSOLD OUT）
//   - 無料応援パック: saveData.freePackClaimedDate（1日1回）
//
// 【まだ実装できていないこと（次のフェーズで対応）】
//   - 実際の課金決済／広告SDK連携（①ページの2商品は、現状「ダミーで即成功」扱い）
//   - カスタム購入品（エフェクト／玉スキン／機体スキン）の、実際の見た目切り替えUI
//     → 今回は「購入済みにする」ところまで。見た目に反映する仕組みは別途相談。
// ==========================================================================

(function(){
  function byId(id){
    const el = document.getElementById(id);
    if (!el) console.warn('[shop.js] 要素が見つかりません:', id);
    return el;
  }

  const modeSelect  = byId('mode-select');
  const shopScreen  = byId('shop-screen');
  const statusBar   = byId('player-status-bar');
  const doctorBubble = byId('shop-doctor-bubble');
  const doctorTextEl = byId('shop-doctor-text');
  let doctorRevertTimer = null;
  // 購入直後ではなく、報酬ポップアップ(#shop-reward-overlay)をプレイヤーが閉じた
  // タイミングでストーリー進行をチェックしたいので、いったんここに保留しておく
  // （js/story.jsのfavorite_skill_tutorial／buff_tutorial／
  // 　paid_pack_1_tutorial／paid_pack_2_tutorialステップに対応）
  let pendingStoryContext = null;

  // 吹き出しのテキストを、スライドインのアニメーション付きで更新する
  function setDoctorText(text){
    if (!doctorTextEl) return;
    doctorTextEl.textContent = text;
    doctorTextEl.classList.remove('anim');
    void doctorTextEl.offsetWidth; // 強制リフローで再トリガーできるようにする
    doctorTextEl.classList.add('anim');
  }
  // 購入後メッセージ（item.afterMsg）がある場合、5秒だけそれを表示してから
  // 元のページ用セリフに戻す
  // ※afterMsgは固定の文字列だけでなく、関数も渡せる（購入時点のsaveDataを見て
  // 　文言を出し分けたい場合はfunction(){ return '...'; }の形で書く）
  //
  // ただし1ページ目（応援ページ＝無料/有料応援パック）だけは例外。獲得ポップと
  // 重なって専用セリフを読み切る前に5秒経過→自動で元のセリフへ戻ってしまう、という
  // 声をいただいたため、このページの商品はタイマーで自動的に戻さず、ページ切り替えや
  // ショップを開き直す（＝次にrenderGrid()が呼ばれる）までずっと表示し続けるようにする。
  function maybeShowAfterMsg(item){
    if (!item.afterMsg) return;
    const msg = typeof item.afterMsg === 'function' ? item.afterMsg() : item.afterMsg;
    if (!msg) return;
    if (doctorRevertTimer) clearTimeout(doctorRevertTimer);
    setDoctorText(msg);
    const page = SHOP_PAGES[currentPage];
    if (page && page.id === 'support'){
      // 応援ページ：自動で戻すタイマーは張らない（ページ切り替え/ショップ再オープン時の
      // renderGrid()が通常のセリフへ戻す役目を担う）
      doctorRevertTimer = null;
      return;
    }
    doctorRevertTimer = setTimeout(() => {
      doctorRevertTimer = null;
      const page = SHOP_PAGES[currentPage];
      setDoctorText(page ? computeDoctorLine(page) : '');
    }, 5000);
  }
  const categoryLabel = byId('shop-category-label');
  const grid        = byId('shop-grid');
  const dotsEl      = byId('shop-dots');
  const rewardOv    = byId('shop-reward-overlay');
  const rewardIconEmoji = byId('shop-reward-icon-emoji');
  const rewardIconImg   = byId('shop-reward-icon-img');
  const rewardName  = byId('shop-reward-name');
  const rewardSunburst = byId('shop-reward-sunburst'); // 獲得ポップと同時にON/OFFするガチャ演出レイヤー
  const confirmOv    = byId('shop-confirm-overlay');
  const confirmNameEl = byId('shop-confirm-name');
  const confirmDescEl = byId('shop-confirm-desc');
  const confirmQuestionEl = byId('shop-confirm-question');
  const confirmYesBtn = byId('shop-confirm-yes');
  const confirmNoBtn  = byId('shop-confirm-no');
  const errorOv = byId('shop-error-overlay');
  if (errorOv) errorOv.addEventListener('click', () => errorOv.classList.remove('show'));
  function showInsufficientEP(){
    if (errorOv) errorOv.classList.add('show');
  }

  const introOv = byId('shop-page-intro-overlay');
  const introTextEl = byId('shop-page-intro-text');
  if (introOv) introOv.addEventListener('click', () => introOv.classList.remove('show'));

  // ガチャで当たるのはicon_01〜icon_11の11種類。icon_00は「誰もが最初から持っているデフォルトの
  // 証明写真」で、ガチャの抽選対象には含めない（常に選択肢として使える扱いはjs/profile.js側で行う）
  const ICON_GACHA_POOL = Array.from({length:11}, (_,i) => `icon_${String(i+1).padStart(2,'0')}`);

  // アイコンガチャの排出結果ポップに出す「表示名」。icon_01〜icon_11に対応。
  // ※ここを増やす場合はICON_GACHA_POOL／assets/icons配下のファイルとidを揃えること
  const ICON_DISPLAY_NAMES = {
    icon_01: '研究助手A',
    icon_02: '研究助手B',
    icon_03: '研究助手C',
    icon_04: '研究助手D',
    icon_05: '研究助手E',
    icon_06: '研究助手F',
    icon_07: 'マグネス博士',
    icon_08: 'ボンボン（デフォルメ）',
    icon_09: 'ボンボン（リアル）',
    icon_10: '宇宙人',
    icon_11: 'NULL',
  };

  const SHOP_PAGES = [
    {
      id:'support', label:'応援', layout:'list',
      doctorLine:'外部からの支援物資を受け取れるようになったぞ。',
      minPagesUnlocked:2, // カスタム/博士支援と同じ仕組みで、Lv15(shopPagesUnlocked>=2)までシャッター
      items:[
        { id:'free_pack', name:'無料応援パック', kind:'free', icon:'🎁',
          desc:'動画の視聴でコインとバフを獲得できます。毎日1回受け取れます。',
          afterMsg:'おや？何やらエネルギーが活発化しているようじゃ。確認してきてくれ。' },
        { id:'paid_pack_1', name:'有料応援パック①', kind:'real_money', priceLabel:'390円', icon:'💳',
          desc:'広告を削除し、限定称号を獲得できます。',
          afterMsg:'（制作者より）ご購入ありがとうございます！あなたの応援が制作の励みになります。' },
        { id:'paid_pack_2', name:'有料応援パック②', kind:'real_money', priceLabel:'777円', icon:'💳',
          desc:'限定称号・限定アイコン・限定スキンを獲得できます。',
          afterMsg:'（制作者より）\nThank you.\nMerci.\nDanke.\nGracias.\nGrazie.\n감사합니다.\n谢谢.\n\n応援、本当にありがとうございます。マグネットボンバーを引き続きお楽しみください。' },
      ],
    },
    {
      id:'skill', label:'スキル', layout:'featured-grid',
      doctorLine:'エンドレスモード用の新しいスキルを開発したぞ！',
      // シャッターは出さない（エンドレスモード強制購入チュートリアルで最初から
      // このページを使うため）。代わりに、下の6枚のスキルカードだけ名前を「???」にして隠す。
      maskNonFeaturedUntilPages:2, // shopPagesUnlockedがこの値未満の間は「???」表記
      items:[
        { id:'endless_unlock', name:'エンドレスモード解放', ep:100, originalEp:1100, kind:'endless_unlock', icon:'▶',
          desc:'エンドレスモードがプレイ可能になります。', featured:true,
          afterMsg:'協力ありがとう！これで実験の幅がさらに広がるぞ。' },
        { id:'skill_shield',   name:'スキル：シールド',       ep:800,  kind:'skill', skillId:'shield',          icon:'🛡',
          desc:'一定時間、自機を守るシールドを展開します。' },
        { id:'skill_typhoon',  name:'スキル：台風の目',       ep:1000, kind:'skill', skillId:'typhoon',         icon:'🌪',
          desc:'周囲のガラス玉を引き寄せます。' },
        { id:'skill_beacon',   name:'スキル：ワープビーコン', ep:1300, kind:'skill', skillId:'beacon',          icon:'🛰',
          desc:'設置したビーコンへ瞬時に移動します。' },
        { id:'skill_dash',     name:'スキル：ダッシュ',       ep:1600, kind:'skill', skillId:'dash',            icon:'💨',
          desc:'一定距離を高速で移動します。' },
        { id:'skill_cannon',   name:'スキル：大砲',           ep:2000, kind:'skill', skillId:'cannon',          icon:'💣',
          desc:'前方へ大砲の弾をぶっ放します。' },
        { id:'skill_energy',   name:'スキル：エネルギー変換器', ep:2500, kind:'skill', skillId:'energyConverter', icon:'🔌',
          desc:'周囲のガラス玉をエネルギーへ変換します。' },
      ],
    },
    {
      id:'custom', label:'カスタム', layout:'featured-grid',
      doctorLine:'研究機材の見た目にもこだわってみるかのう？',
      minPagesUnlocked:4, // saveData.storyFlags.shopPagesUnlocked がこの値未満の間はシャッターで隠す
      items:[
        { id:'icon_gacha',     name:'アイコンガチャ（1回）', ep:500,  kind:'icon_gacha', icon:'🎰',
          desc:'プロフィールで使用できるアイコンをランダムで1つ獲得します。', featured:true },
        { id:'explode_fx_1',   name:'爆発エフェクト①', ep:1200, kind:'cosmetic', icon:'💥',
          desc:'爆発時のエフェクトを変更します。※性能は変わりません。' },
        { id:'explode_fx_2',   name:'爆発エフェクト②', ep:1200, kind:'cosmetic', icon:'💥',
          desc:'爆発時のエフェクトを変更します。※性能は変わりません。' },
        { id:'marble_skin_1',  name:'玉スキン①',       ep:2000, kind:'cosmetic', icon:'🔮',
          desc:'玉の見た目を変更します。※性能は変わりません。' },
        { id:'marble_skin_2',  name:'玉スキン②',       ep:2000, kind:'cosmetic', icon:'🔮',
          desc:'玉の見た目を変更します。※性能は変わりません。' },
        { id:'player_skin_1',  name:'プレイヤー機体スキン①', ep:2000, kind:'cosmetic', icon:'🛸',
          desc:'プレイヤー機体の見た目を変更します。※性能は変わりません。' },
        { id:'player_skin_2',  name:'プレイヤー機体スキン②', ep:2000, kind:'cosmetic', icon:'🛸',
          desc:'プレイヤー機体の見た目を変更します。※性能は変わりません。' },
        // 「通過ライン①②」はショップ・図鑑ともに内容未確定とのことなので、まだ追加していない
      ],
    },
    {
      id:'gift', label:'博士支援', layout:'grid',
      doctorLine:'研究ばかりで、生活用品はいつも後回しなのじゃ……。',
      minPagesUnlocked:4, // カスタムページと同じくLv30(shopPagesUnlocked>=4)で解放
      items:[
        { id:'gift_ramen',   name:'カップラーメン',   ep:100,   kind:'gift', icon:'🍜',
          descBefore:'カップラーメンが食べたい気分じゃ。', descAfter:'これでいつでもラーメンが食べられるぞ！',
          afterMsg:'おぉ、これは助かる！腹が減っては研究は捗らぬからのう。' },
        { id:'gift_kettle',  name:'電気ケトル',       ep:300,   kind:'gift', icon:'♨️', desc:'博士へ電気ケトルを贈ります。',
          afterMsg: () => saveData.shopPurchases['gift_ramen']
            ? 'これでいつでもラーメンが食べられるぞ！'
            : 'カップラーメンが食べたい気分じゃ。' },
        { id:'gift_coffee',  name:'コーヒーメーカー', ep:600,   kind:'gift', icon:'☕', desc:'博士へコーヒーメーカーを贈ります。',
          afterMsg:'徹夜ができるようになったのじゃ。' },
        { id:'gift_microwave', name:'電子レンジ',     ep:1200,  kind:'gift', icon:'📡', desc:'博士へ電子レンジを贈ります。',
          afterMsg:'研究も料理も、温め直しは大事じゃ。' },
        { id:'gift_coat',    name:'新品の白衣',       ep:2500,  kind:'gift', icon:'🥼', desc:'博士へ新しい白衣を贈ります。',
          afterMsg:'新品の白衣は気持ちが引き締まるのう。' },
        { id:'gift_chair',   name:'オフィスチェア',   ep:4000,  kind:'gift', icon:'💺', desc:'博士へ新しいオフィスチェアを贈ります。',
          afterMsg:'これは良い……立ちたくなくなる椅子じゃ。' },
        { id:'gift_bed',     name:'ベッド',           ep:6000,  kind:'gift', icon:'🛏', desc:'博士へ新しいベッドを贈ります。',
          afterMsg:'これでぐっすり眠れる……3時間寝たら研究再開じゃ。' },
        { id:'gift_rocket',  name:'ロケット設計図',   ep:20000, kind:'gift', icon:'📜', desc:'博士の宇宙研究計画に必要な設計図です。',
          afterMsg:'……ありがとう。君のおかげで、夢に一歩近づいた。' },
      ],
    },
  ];

  let currentPage = 0;

  function todayStr(){
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }

  function isPurchased(item){
    if (item.kind === 'endless_unlock') return !!saveData.endlessUnlocked;
    if (item.kind === 'skill') return (saveData.unlockedSkills || []).includes(item.skillId);
    if (item.kind === 'free') return saveData.freePackClaimedDate === todayStr();
    if (item.kind === 'icon_gacha') return (saveData.ownedIcons || []).length >= ICON_GACHA_POOL.length;
    return !!(saveData.shopPurchases || {})[item.id];
  }

  // ストーリー進行（js/story.jsがLv15/Lv30達成時に更新するsaveData.storyFlags.shopPagesUnlocked）
  // に応じて、ページ丸ごとシャッターで隠すかどうかを判定する
  function shopPagesUnlocked(){
    return (saveData.storyFlags && saveData.storyFlags.shopPagesUnlocked) || 1;
  }
  function isPageLocked(page){
    return !!page.minPagesUnlocked && shopPagesUnlocked() < page.minPagesUnlocked;
  }
  // スキルページだけはシャッターを出さず、非featuredの6枚だけ名前を「???」にして隠す
  function shouldMaskName(page, item){
    return !item.featured && !!page.maskNonFeaturedUntilPages && shopPagesUnlocked() < page.maskNonFeaturedUntilPages;
  }

  // ── ページ解放お知らせポップ ──
  // 応援ページとスキルページ（1・2ページ目）、カスタムページと博士支援ページ（3・4ページ目）は
  // 同時に解放されるが、告知ポップはページごとに別々の文言で1回ずつ出す。
  // ※文言はこちらの想定なので、実際に意図している内容と違えば教えてください
  //   （PAGE_INTRO_TEXTを直せば済みます）。
  const PAGE_INTRO_TEXT = {
    support: '特別なパックを追加しました',
    skill:   '新しいスキルを追加しました',
    custom:  'スキンや見た目変更の商品を追加しました',
    gift:    '博士支援の新しい商品を追加しました',
  };
  // そのページが「完全に見える状態」になっているかどうか。
  // 応援ページのようにページ自体は最初から見えているが、お知らせポップだけは
  // 特定のタイミングまで待ちたい場合はintroUnlockAtを使う（他の判定より優先）
  function isPageFullyRevealed(page){
    if (page.introUnlockAt) return shopPagesUnlocked() >= page.introUnlockAt;
    if (page.maskNonFeaturedUntilPages) return shopPagesUnlocked() >= page.maskNonFeaturedUntilPages;
    if (page.minPagesUnlocked) return shopPagesUnlocked() >= page.minPagesUnlocked;
    return true;
  }
  // ページごとの博士セリフを決める。スキルページ（page.id==='skill'）だけは
  // 「エンドレスモード解放済みか」と「ページが完全に見える状態か（Lv15）」の
  // 組み合わせで4パターンに出し分ける：
  //   ①未購入・未解放　　　　：新モードの告知
  //   ②購入済み・未解放　　　：残りスキルは開発中の一言
  //   ③購入済み・解放済み　　：page.doctorLine（通常の告知）
  // （購入直後の一言はitem.afterMsg／maybeShowAfterMsgが別途担当する）
  function computeDoctorLine(page){
    if (isPageLocked(page)) return '商品準備中じゃ。';
    const stillMasked = !isPageFullyRevealed(page);
    if (page.id === 'skill'){
      if (!saveData.endlessUnlocked) return '新たな実験モードを完成させたぞ！';
      if (stillMasked) return 'まだ開発中じゃ。完成までしばらく待っておくれ。';
      return page.doctorLine || '';
    }
    return stillMasked ? 'すまん、まだ準備中のようじゃ……。' : (page.doctorLine || '');
  }
  function maybeShowPageIntro(page){
    const text = PAGE_INTRO_TEXT[page.id];
    if (!text) return;
    if (!isPageFullyRevealed(page)) return;
    const seen = saveData.storyFlags.shopPageIntroSeen || (saveData.storyFlags.shopPageIntroSeen = {});
    if (seen[page.id]) return;
    seen[page.id] = true;
    if (typeof saveSaveData === 'function') saveSaveData();
    if (introOv && introTextEl){
      introTextEl.textContent = text;
      introOv.classList.add('show');
    }
  }

  function canAfford(item){
    return (playerProgress.coins || 0) >= item.ep;
  }

  function spendEP(amount){
    addCoins(-amount);
    if (typeof updatePlayerStatusBar === 'function') updatePlayerStatusBar();
  }

  function grantReward(item){
    if (item.kind === 'endless_unlock'){
      saveData.endlessUnlocked = true;
      if (typeof updateEndlessLockUI === 'function') updateEndlessLockUI();
    } else if (item.kind === 'skill'){
      if (!saveData.unlockedSkills) saveData.unlockedSkills = [];
      if (!saveData.unlockedSkills.includes(item.skillId)) saveData.unlockedSkills.push(item.skillId);
      pendingStoryContext = 'skill_purchased'; // js/story.js: favorite_skill_tutorial
    } else if (item.kind === 'free'){
      saveData.freePackClaimedDate = todayStr();
      addCoins(50); // 無料パックの獲得コイン（バフ部分は今後の課題）
      pendingStoryContext = 'free_pack_claimed'; // js/story.js: buff_tutorial
    } else if (item.kind === 'icon_gacha'){
      const owned = saveData.ownedIcons || (saveData.ownedIcons = []);
      const remaining = ICON_GACHA_POOL.filter(id => !owned.includes(id));
      const picked = remaining[Math.floor(Math.random() * remaining.length)];
      owned.push(picked);
      item._pickedIcon = picked; // ポップアップ表示用に一時保持
      // 実績「わたしは…／気分屋さん／正体不明」：所持アイコン数を更新
      // （デフォルトの証明写真(icon_00)も1枚として数えるため+1している）
      if (window.Achievements) window.Achievements.setStatIfHigher('ownedIconCount', owned.length + 1);
    } else {
      saveData.shopPurchases[item.id] = true;
      // 「見た目スキン」「博士への差し入れ」は、ショップ購入と同時に図鑑側も解放する。
      // 図鑑側（js/zukan.js）のSKIN_ITEMS/GIFT_ITEMSのidをショップ側と完全に一致させて
      // あるので、item.idをそのまま渡すだけでよい
      if ((item.kind === 'cosmetic' || item.kind === 'gift') && window.Zukan) window.Zukan.unlock(item.id);
      // 実績「やさしい助手／世話好き／博士の恩人」：差し入れ回数を更新
      if (item.kind === 'gift' && window.Achievements) window.Achievements.incrementStat('doctorGiftCount');
      // 有料応援パック②は「限定スキン」も同梱しているため、専用の所持フラグも一緒に立てる
      // （設定画面の機体スキン選択リストは saveData.shopPurchases['player_skin_special'] を見る）
      if (item.id === 'paid_pack_2') {
        saveData.shopPurchases['player_skin_special'] = true;
        saveData.shopPurchases['marble_skin_special'] = true;
        saveData.shopPurchases['explode_fx_special'] = true;
        // 上記3つは単独のショップ商品ではない（kind==='cosmetic'を通らない）ため、
        // 上のif((item.kind === 'cosmetic' ...))では図鑑が解放されない。
        // 以前はjs/zukan.js起動時の「救済措置」に解放を任せていたが、それだと次回
        // 起動／リロードまで図鑑がシルエットのまま反映されない不具合があったため、
        // 購入したその場でも明示的に解放するようにした
        if (window.Zukan) {
          window.Zukan.unlock('player_skin_special');
          window.Zukan.unlock('marble_skin_special');
          window.Zukan.unlock('explode_fx_special');
        }
      }
      // 実績「スポンサー」「名誉スポンサー」：応援パック購入で解除（おまけ枠。他の実績や
      // コンプリート実績には一切影響しない。js/achievements.js側でbonus:trueとして扱う）
      if (item.id === 'paid_pack_1' && window.Achievements) window.Achievements.unlock('ach_027');
      if (item.id === 'paid_pack_2' && window.Achievements) window.Achievements.unlock('ach_028');
      // 有料応援パック①②：初回購入時だけ特典の説明ポップを出す（無料応援パックの
      // buff_tutorialと同じ仕組み。js/story.js:SIDE_STEPSのcontextに対応、表示済みなら
      // 二度と出ない＝saveData.storyProgress.sideDoneで管理されるため、ここでは
      // 「初めて購入した時だけ」を気にせずpendingStoryContextへ積むだけでよい）
      if (item.id === 'paid_pack_1') pendingStoryContext = 'paid_pack_1_purchased';
      if (item.id === 'paid_pack_2') pendingStoryContext = 'paid_pack_2_purchased';
    }
    if (typeof saveSaveData === 'function') saveSaveData();
  }

  let rewardOnClose = null;
  const rewardPopupEl = byId('shop-reward-popup');
  function showRewardPopup(item, customName, onClose){
    if (!rewardOv) return;
    // 画像優先で表示し、画像が無い(onerror)場合だけ絵文字にフォールバックする
    // （js/shop.jsのショップ一覧カードと同じ考え方。assets/shop/<item.id>.webpが
    //   未設置の商品は、用意され次第自動でこちらにも反映される）
    const isIconGacha = item.kind === 'icon_gacha' && !!item._pickedIcon;
    const imgSrc = isIconGacha
      ? `assets/icons/${item._pickedIcon}.webp`
      : `assets/shop/${item.id}.webp`;

    if (rewardIconEmoji){
      rewardIconEmoji.style.display = ''; // 画像読み込み完了までは絵文字を仮表示
      rewardIconEmoji.textContent = item.icon || '🎁';
    }
    if (rewardIconImg){
      rewardIconImg.classList.toggle('is-portrait', isIconGacha); // アイコンガチャだけ人物ポートレート用の見た目にする
      rewardIconImg.style.display = 'none';
      rewardIconImg.onerror = () => { rewardIconImg.style.display = 'none'; };
      rewardIconImg.onload  = () => {
        rewardIconImg.style.display = 'block';
        if (rewardIconEmoji) rewardIconEmoji.style.display = 'none';
      };
      rewardIconImg.src = imgSrc;
    }
    if (rewardName) rewardName.textContent = customName || item.name;
    rewardOnClose = onClose || null;
    rewardOv.classList.add('show');
    // ガチャ演出（サンバースト）はアイコンガチャでアイコンを引いた時だけ表示する
    if (rewardSunburst) rewardSunburst.classList.toggle('show', isIconGacha);
    if (rewardPopupEl){
      rewardPopupEl.classList.remove('pop-in');
      void rewardPopupEl.offsetWidth; // 強制リフローで再トリガーできるようにする
      rewardPopupEl.classList.add('pop-in');
    }
  }
  if (rewardOv){
    rewardOv.addEventListener('click', () => {
      rewardOv.classList.remove('show');
      if (rewardSunburst) rewardSunburst.classList.remove('show'); // ガチャ演出も同時にOFF
      const cb = rewardOnClose; rewardOnClose = null;
      if (cb) cb();
      // 報酬ポップを閉じ終わってから、保留していたストーリー進行チェックを行う
      // （ポップと博士のチュートリアルカードが同時に重ならないようにするため）
      if (pendingStoryContext && window.Story) window.Story.check(pendingStoryContext);
      pendingStoryContext = null;
    });
  }

  function priceText(item){
    if (item.kind === 'real_money') return item.priceLabel;
    if (item.kind === 'endless_unlock') return `${item.ep}EP`;
    return `${item.ep}EP`;
  }

  function showConfirm(item, onYes, opts){
    if (!confirmOv || !confirmNameEl) { onYes(); return; }
    confirmNameEl.textContent = item.name;
    if (confirmDescEl) confirmDescEl.textContent = item.desc || item.descBefore || '';
    if (confirmQuestionEl) confirmQuestionEl.textContent = `${priceText(item)}で購入しますか？`;
    confirmOv.classList.add('show');
    const hideNo = !!(opts && opts.hideNo);
    if (confirmNoBtn) confirmNoBtn.style.display = hideNo ? 'none' : '';
    const cleanup = () => {
      confirmOv.classList.remove('show');
      if (confirmNoBtn) confirmNoBtn.style.display = '';
      confirmYesBtn.removeEventListener('click', onYesClick);
      confirmNoBtn.removeEventListener('click', onNoClick);
    };
    const onYesClick = () => { cleanup(); onYes(); };
    const onNoClick  = () => { cleanup(); };
    confirmYesBtn.addEventListener('click', onYesClick);
    confirmNoBtn.addEventListener('click', onNoClick);
  }

  function purchase(item){
    if (isPurchased(item)) return;

    if (item.kind === 'free'){
      // 無料受け取りは確認ポップを挟まずそのまま
      grantReward(item);
      showRewardPopup(item);
      renderGrid();
      maybeShowAfterMsg(item);
      return;
    }

    if (item.kind !== 'real_money' && !canAfford(item)) {
      showInsufficientEP();
      return;
    }

    showConfirm(item, () => executePurchase(item));
  }

  // 有料応援パック購入時の獲得ポップ表示名：商品名(パック①/②)ではなく、
  // 実際に貰える特典の内訳をここでだけ表示する（ショップ一覧の商品名自体は変更しないため）
  const PAID_PACK_REWARD_LABEL = {
    paid_pack_1: '広告削除・限定称号',
    paid_pack_2: '限定称号・限定アイコン・限定機体スキン・限定玉スキン・限定爆発エフェクト',
  };

  function executePurchase(item){
    if (item.kind === 'real_money'){
      // 実際の課金決済はまだ繋がっていないため、ダミーで即成功扱いにしている
      grantReward(item);
      showRewardPopup(item, PAID_PACK_REWARD_LABEL[item.id]);
      renderGrid();
      maybeShowAfterMsg(item);
      return;
    }
    if (item.kind === 'icon_gacha'){
      if (!canAfford(item)) { showInsufficientEP(); return; }
      spendEP(item.ep);
      grantReward(item);
      showRewardPopup(item, ICON_DISPLAY_NAMES[item._pickedIcon] || item._pickedIcon);
      renderGrid();
      maybeShowAfterMsg(item);
      return;
    }
    // skill / cosmetic / gift / endless_unlock 共通
    if (!canAfford(item)) { showInsufficientEP(); return; }
    spendEP(item.ep);
    grantReward(item);
    showRewardPopup(item);
    renderGrid();
    maybeShowAfterMsg(item);
  }

  // ── エンドレスモード値引き購入（js/story.jsの購入チュートリアルステップから呼ばれる）──
  // ①スキルページへ強制移動 → ②1100→100EPの値引き演出（線が引かれる、約2秒）
  // → ③自動で購入確認ポップ（「はい」のみ）→ ④プレイヤーが「はい」を押す
  // → EP消費・付与 → ⑤「獲得！」ポップ（プレイヤーがタップして閉じたらonComplete）
  function runEndlessDiscountPurchase(onComplete){
    const def = SHOP_PAGES[1].items[0]; // エンドレスモード解放
    if (saveData.endlessUnlocked) { if (onComplete) onComplete(); return; }

    gotoPage(1); // ①スキルページへ強制移動
    renderGrid();

    const cardEl = grid.querySelector('.shop-card-featured');
    const priceEl = cardEl ? cardEl.querySelector('.shop-card-price-pill') : null;
    if (priceEl) priceEl.innerHTML = `${def.originalEp}EP`; // まずは通常価格のみ表示

    setTimeout(() => {
      // ②値引き演出：線が引かれて、割引後の価格がふわっと出てくる（合計約1.6秒）
      if (priceEl){
        priceEl.innerHTML =
          `<span class="shop-price-strike shop-price-strike-anim">${def.originalEp}</span>` +
          `<span class="shop-price-discounted-anim">${def.ep}EP</span>`;
      }
      setTimeout(() => {
        // ③自動で購入確認ポップを出す（選択肢は「はい」のみ）
        showConfirm(def, () => {
          // ④「はい」を押した後：EP消費・付与
          const spend = Math.min(def.ep, playerProgress.coins || 0);
          if (spend > 0) spendEP(spend);
          grantReward(def);
          renderGrid(); // 購入済み状態（チェックマーク）を即座に反映
          maybeShowAfterMsg(def); // 「協力ありがとう！」の一言を一時的に表示
          // ⑤「獲得！」ポップ。プレイヤーがタップして閉じたらonCompleteへ進む
          showRewardPopup(def, null, onComplete);
        }, { hideNo: true });
      }, 2400); // 値引きアニメ(約1.6秒)がしっかり見えた上で、余韻を持たせてから確認ポップへ
    }, 900); // まず通常価格をひと呼吸見せてから値引き演出を始める
  }

  function buildCardEl(item, maskName){
    const purchased = isPurchased(item);
    const card = document.createElement('div');
    card.className = 'shop-card' + (item.featured ? ' shop-card-featured' : '') + (purchased ? ' purchased' : '');

    let priceHtml;
    if (item.kind === 'real_money'){
      priceHtml = item.priceLabel;
    } else if (item.kind === 'free'){
      priceHtml = purchased ? '受取済み' : '無料';
    } else if (item.kind === 'endless_unlock'){
      priceHtml = purchased ? '購入済み' : `<span class="shop-price-strike">${item.originalEp}</span>${item.ep}EP`;
    } else if (item.kind === 'icon_gacha'){
      priceHtml = purchased ? 'SOLD OUT' : `${item.ep}EP`;
    } else {
      priceHtml = purchased ? '購入済み' : `${item.ep}EP`;
    }

    const desc = item.kind === 'gift' && item.descBefore
      ? (purchased ? item.descAfter : item.descBefore)
      : item.desc;
    const displayName = maskName ? '？？？' : item.name;

    // アイコン画像：後日 assets/shop/<商品id>.webp（512×512px）を配置すれば自動で反映される。
    // ファイルが無い間は絵文字（item.icon）がそのまま表示される（zukan.js等と同じonerror方式）
    card.innerHTML = `
      <div class="shop-card-icon-box${maskName ? ' masked' : ''}">
        <span class="shop-card-icon-emoji">${maskName ? '' : (item.icon || '🎁')}</span>
        <img class="shop-card-icon-img" src="assets/shop/${item.id}.webp" alt=""
             width="512" height="512" decoding="async" loading="lazy"
             onerror="this.remove();"
             onload="this.previousElementSibling.style.display='none';">
      </div>
      <div class="shop-card-body">
        <div class="shop-card-name">${displayName}</div>
        ${desc && item.featured ? `<div class="shop-card-desc">${desc}</div>` : ''}
        <div class="shop-card-price-pill">${priceHtml}</div>
      </div>
      ${purchased ? '<div class="shop-card-check">✔</div>' : ''}
    `;
    if (!purchased && !maskName) {
      card.addEventListener('click', () => purchase(item));
    }
    return card;
  }

  function buildListCardEl(item){
    const purchased = isPurchased(item);
    const card = document.createElement('div');
    card.className = 'shop-card-list' + (purchased ? ' purchased' : '');
    const priceLabel = item.kind === 'real_money' ? item.priceLabel : (purchased ? '受取済み' : '無料');
    const btnLabel = purchased ? '受取済み' : (item.kind === 'free' ? '受け取る' : '購入する');
    card.innerHTML = `
      <div class="shop-card-list-top">
        <span class="shop-card-name">${item.icon || ''} ${item.name}</span>
        <span class="shop-card-price">${priceLabel}</span>
      </div>
      <div class="shop-card-desc">${item.desc}</div>
      <button class="shop-card-buy-btn" ${purchased ? 'disabled' : ''}>${btnLabel}</button>
    `;
    if (!purchased){
      card.querySelector('.shop-card-buy-btn').addEventListener('click', () => purchase(item));
    }
    return card;
  }

  const shutterEl = byId('shop-page-shutter');
  const shutterConditionEl = byId('shop-page-shutter-condition');
  // ページごとの解放条件の説明文（シャッターの下に小さく出す）
  const PAGE_UNLOCK_CONDITION_TEXT = { 2:'レベル15到達で解放', 4:'レベル30到達で解放' };

  function renderGrid(){
    if (!grid) return;
    const page = SHOP_PAGES[currentPage];
    if (categoryLabel) categoryLabel.textContent = `＞ ${page.label}`;
    if (doctorRevertTimer) { clearTimeout(doctorRevertTimer); doctorRevertTimer = null; } // ページ切替時は購入後メッセージの表示を打ち切る

    const locked = isPageLocked(page);
    // スキルページ(page.maskNonFeaturedUntilPages)は、シャッターこそ出ないが、まだ「???」で
    // 隠れているスキルがある間は「開発したぞ！」ではなく準備中の一言に差し替える
    // （具体的な出し分けはcomputeDoctorLineを参照）
    const stillMasked = !locked && !isPageFullyRevealed(page);
    setDoctorText(computeDoctorLine(page));

    if (shutterEl) shutterEl.classList.toggle('show', locked);
    if (categoryLabel) categoryLabel.style.display = locked ? 'none' : '';
    if (grid) grid.style.display = locked ? 'none' : '';
    maybeShowPageIntro(page); // このページが今回初めて「完全に見える状態」になっていればお知らせを出す
    if (locked){
      if (shutterConditionEl) shutterConditionEl.textContent = PAGE_UNLOCK_CONDITION_TEXT[page.minPagesUnlocked] || '';
      return; // 商品は組み立てず、シャッターだけ見せる（押せる要素も一切生成しない）
    }

    grid.innerHTML = '';
    grid.classList.toggle('shop-grid-list', page.layout === 'list');
    for (const item of page.items){
      if (page.layout === 'list'){
        grid.appendChild(buildListCardEl(item));
      } else {
        grid.appendChild(buildCardEl(item, shouldMaskName(page, item)));
      }
    }
  }

  function renderDots(){
    if (!dotsEl) return;
    dotsEl.innerHTML = '';
    SHOP_PAGES.forEach((p,i) => {
      const dot = document.createElement('button');
      dot.className = 'zukan-dot' + (i===currentPage ? ' active' : '');
      dot.title = p.label;
      dot.addEventListener('click', () => gotoPage(i));
      dotsEl.appendChild(dot);
    });
  }

  function gotoPage(i){
    currentPage = (i + SHOP_PAGES.length) % SHOP_PAGES.length;
    renderGrid();
    renderDots();
  }

  const prevBtn = byId('shop-prev');
  if (prevBtn) prevBtn.addEventListener('click', () => gotoPage(currentPage - 1));
  const nextBtn = byId('shop-next');
  if (nextBtn) nextBtn.addEventListener('click', () => gotoPage(currentPage + 1));

  function openShop(){
    if (!modeSelect || !shopScreen || !statusBar) return;
    modeSelect.classList.add('hide');
    shopScreen.classList.remove('hide');
    if (shopBackBtn) shopBackBtn.classList.remove('hide');
    statusBar.style.display = 'flex';
    if (typeof updatePlayerStatusBar === 'function') updatePlayerStatusBar();
    if (window.Achievements) window.Achievements.unlock('ach_002'); // ショップ機能解放の実績
    gotoPage(0);
    if (window.Story) window.Story.check('shop');
  }
  function closeShop(){
    if (!modeSelect || !shopScreen || !statusBar) return;
    shopScreen.classList.add('hide');
    if (shopBackBtn) shopBackBtn.classList.add('hide');
    modeSelect.classList.remove('hide');
    statusBar.style.display = '';
    if (window.Story) window.Story.check('mode_select');
  }

  const shopBackBtn = byId('shop-back');
  if (shopBackBtn){
    shopBackBtn.addEventListener('click', closeShop);
    shopBackBtn.addEventListener('touchstart', e=>{ e.preventDefault(); closeShop(); }, {passive:false});
  }

  window.ShopUI = { open: openShop, close: closeShop, runEndlessDiscountPurchase, gotoPage };
  console.log('[shop.js] 初期化完了。');
})();
