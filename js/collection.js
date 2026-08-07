// ==========================================================================
// js/collection.js — コレクション画面（プロフィール／チュートリアル／図鑑／実績称号）
//
// プロフィール・図鑑・実績称号の中身は実装済み（js/profile.js・js/zukan.js・
// このファイル内の実績称号レンダリングを参照）。チュートリアル一覧だけは、
// まだ実際のポップ内容を出す処理が無いダミー20件のままになっている
// （下の「チュートリアル一覧」セクション内の // TODO 参照）。
//
// アイコン画像は js/assets.js の IMAGE_ASSET_PATHS.collection に登録したパスから
// 読み込む。ファイルがまだ無くても壊れず、その項目のアイコン欄が空くだけになる
// （<img>のonerrorで自動的に非表示にする）。
//
// ※ 全てのdocument.getElementById呼び出しにnullチェックを入れている。
//   理由：どこか1箇所でも要素が見つからずエラーになると、このIIFE全体がそこで
//   停止してしまい、後続の処理（tutorial/achievement一覧の生成や、末尾の
//   window.CollectionUI の公開）が丸ごと実行されなくなる。特にCollectionUIが
//   未定義のままだと、js/zukan.js側の画面遷移が静かに機能しなくなるため、
//   要素が見つからない場合はconsole.warnで知らせつつ、その処理だけスキップして
//   スクリプト全体は最後まで実行されるようにしている。
// ==========================================================================

(function(){
  function byId(id){
    const el = document.getElementById(id);
    if (!el) console.warn('[collection.js] 要素が見つかりません:', id);
    return el;
  }

  // 各カードの <img class="collection-card-icon"> に、対応するアセットパスを設定する
  function loadCollectionIcons(){
    if (typeof IMAGE_ASSET_PATHS === 'undefined' || !IMAGE_ASSET_PATHS.collection) return;
    const map = {
      'collection-profile':      'profile',
      'collection-tutorial':     'tutorial',
      'collection-zukan':        'zukan',
      'collection-achievements': 'achievements',
    };
    for (const cardId in map){
      const card = document.getElementById(cardId);
      if (!card) continue;
      const img = card.querySelector('.collection-card-icon');
      const path = IMAGE_ASSET_PATHS.collection[map[cardId]];
      if (!img || !path) continue;
      img.onerror = () => { img.removeAttribute('src'); };
      img.src = path;
    }
  }
  loadCollectionIcons();

  // ── 画面遷移 ──
  const modeSelect  = byId('mode-select');
  const collection  = byId('collection-screen');
  const statusBar   = byId('player-status-bar');

  function openCollection(){
    if (!modeSelect || !collection || !statusBar) return;
    if (typeof saveData !== 'undefined' && saveData.storyFlags && !saveData.storyFlags.collectionUnlocked){
      if (typeof showBanner === 'function') showBanner('まだ解放されていません', '#888888');
      return;
    }
    modeSelect.classList.add('hide');
    collection.classList.remove('hide');
    modeCollectionBtn.classList.remove('story-glow'); // 1度使ったら発光は消す（mode-quick/endless/shopと同じ扱い）
    // #player-status-barは通常「#mode-selectが表示中のときだけ表示」というCSSの隣接セレクタで
    // 制御されているため、コレクション画面でも表示し続けたい場合はここでJS側から明示的に上書きする
    // （インラインstyleはCSSのセレクタより優先される）
    statusBar.style.display = 'flex';
    if (typeof updatePlayerStatusBar === 'function') updatePlayerStatusBar();
    if (window.Achievements) window.Achievements.unlock('ach_004'); // コレクション機能解放の実績（実際に解除されるのは初回のみ）
  }
  function closeCollection(){
    if (!modeSelect || !collection || !statusBar) return;
    collection.classList.add('hide');
    modeSelect.classList.remove('hide');
    statusBar.style.display = ''; // 上書きを解除し、通常のCSS制御に戻す
    if (window.Story) window.Story.check('mode_select');
  }

  // モード選択画面のコレクションボタン → コレクション画面を開く
  const modeCollectionBtn = document.getElementById('mode-collection');
  if (modeCollectionBtn){
    modeCollectionBtn.addEventListener('click', openCollection);
    // 押下時(touchstart)ではなく指を離した時(touchend)に遷移させ、押している間の
    // ボイルアニメーションがきちんと見えるようにする
    modeCollectionBtn.addEventListener('touchstart', e=>{ e.preventDefault(); }, {passive:false});
    modeCollectionBtn.addEventListener('touchend', e=>{ e.preventDefault(); openCollection(); }, {passive:false});
  } else {
    console.warn('[collection.js] 要素が見つかりません: mode-collection');
  }

  const backBtn = byId('collection-to-mode');
  if (backBtn){
    backBtn.addEventListener('click', closeCollection);
    backBtn.addEventListener('touchstart', e=>{ e.preventDefault(); closeCollection(); }, {passive:false});
  }

  // ── サブ画面（チュートリアル一覧・実績称号一覧・図鑑）共通の開閉処理 ──
  // コレクション画面の4項目とは違い、こちらは上部ステータスバーを非表示にして使う
  function openSubscreen(screenEl){
    if (!collection || !statusBar || !screenEl) return;
    collection.classList.add('hide');
    screenEl.classList.remove('hide');
    statusBar.style.display = 'none';
  }
  function closeSubscreen(screenEl){
    if (!collection || !statusBar || !screenEl) return;
    screenEl.classList.add('hide');
    collection.classList.remove('hide');
    statusBar.style.display = 'flex'; // コレクション画面はステータスバーを表示するのでflexに戻す
  }

  // ── チュートリアル一覧 ──
  const TUTORIAL_ITEMS = Array.from({length:20}, (_,i) => ({
    no: String(i+1).padStart(3,'0'),
    title: 'チュートリアルタイトル（仮）',
  }));

  const tutorialScreen = document.getElementById('tutorial-screen');
  const tutorialList   = byId('tutorial-list');
  if (tutorialList){
    TUTORIAL_ITEMS.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'tutorial-card';
      card.innerHTML = `<div class="tutorial-card-no">No.${item.no}</div><div class="tutorial-card-title">${item.title}</div>`;
      card.addEventListener('click', () => {
        // TODO: 実際のポップ内容が決まったら、ここでその内容を表示する処理を呼ぶ
        console.log('チュートリアル', item.no, 'を開く（未実装）');
      });
      tutorialList.appendChild(card);
    });
  }

  const collectionTutorialBtn = byId('collection-tutorial');
  const tutorialBackBtn = byId('tutorial-back');
  // チュートリアル一覧を開く処理をまとめて、開くたびにストーリー進行もチェックする
  function openTutorialScreen(){
    openSubscreen(tutorialScreen);
    if (window.Story) window.Story.check('tutorial_open'); // js/story.js: tutorial_screen_intro_doctor
  }
  if (collectionTutorialBtn && tutorialScreen){
    collectionTutorialBtn.addEventListener('click', openTutorialScreen);
    collectionTutorialBtn.addEventListener('touchstart', e=>{ e.preventDefault(); }, {passive:false});
    collectionTutorialBtn.addEventListener('touchend', e=>{ e.preventDefault(); openTutorialScreen(); }, {passive:false});
  }
  if (tutorialBackBtn && tutorialScreen){
    tutorialBackBtn.addEventListener('click', () => closeSubscreen(tutorialScreen));
    tutorialBackBtn.addEventListener('touchstart', e=>{ e.preventDefault(); closeSubscreen(tutorialScreen); }, {passive:false});
  }

  // ── 実績称号一覧 ──
  // 実績の定義・解除/受け取り状態は js/achievements.js（window.Achievements）が管理している。
  // ここでは一覧の描画と、カードタップ時のEP受け取り操作（受け取り演出込み）だけを担当する。
  // 実績には「単発」（達成したら即その場で確定）と「段階」（統計値が閾値を超えるたびに
  // tierが1つずつ進む。tierごとに個別にEPを受け取れる）の2種類がある。
  const achievementScreen = document.getElementById('achievement-screen');
  const achievementList   = byId('achievement-list');

  // タップした瞬間だけ出る「+◯◯EP獲得」ポップ（単発・段階どちらのカードでも共通で使う）
  function showClaimPopup(card, ep){
    const popup = document.createElement('div');
    popup.className = 'achv-claim-popup';
    popup.textContent = `+${ep}EP獲得`;
    card.appendChild(popup);
    requestAnimationFrame(()=> requestAnimationFrame(()=> popup.classList.add('show')));
    setTimeout(()=>{
      popup.classList.remove('show');
      setTimeout(()=> popup.remove(), 300);
    }, 900);
  }

  function renderSingleCard(card, def, state){
    if (!state.unlocked) {
      card.className = 'achv-card locked';
      card.innerHTML = `
        <div class="achv-title">？？？？？</div>
        <div class="achv-desc">${def.condition}</div>`;
      return;
    }
    card.className = 'achv-card unlocked' + (state.claimed ? '' : ' glow');
    // 「取得時Lv」ではなく「何を達成して獲得したか」（def.condition）を表示する。
    // ロック中カードの説明文と同じ文言を使い回すことで、未取得時に見えていたヒントと
    // 取得後の実績内容が一致し、後から見返しても分かりやすいようにしている
    const metaText = state.claimed
      ? `取得日：${state.claimedAt || '-'}　${def.condition}`
      : `獲得EP：${def.ep}（タップで受け取り）`;
    card.innerHTML = `
      <div class="achv-title">${def.title}</div>
      <div class="achv-desc">${def.desc}</div>
      <div class="achv-meta">${metaText}</div>`;
    if (!state.claimed) {
      card.addEventListener('click', () => {
        const result = window.Achievements.claim(def.id);
        if (result == null) return;
        card.classList.remove('glow');
        const metaEl = card.querySelector('.achv-meta');
        if (metaEl) metaEl.textContent = `取得日：${result.claimedAt}　${def.condition}`;
        showClaimPopup(card, result.ep);
      }, { once:true });
    }
  }

  function renderTieredCard(card, def, state){
    const notified = state.notifiedTiers || [];
    const claimed  = state.claimedTiers  || [];
    const unit = def.progressUnit ?? '回';

    // まだ最初の段階にも届いていない：条件を伏せて表示（通常の未解除カードと同じ見た目）
    if (!notified.some(Boolean)) {
      card.className = 'achv-card locked';
      const condText = `${def.progressLabel}：${def.tiers.map(t => t.threshold.toLocaleString() + unit).join('/')}`;
      card.innerHTML = `
        <div class="achv-title">？？？？？</div>
        <div class="achv-desc">${condText}</div>`;
      return;
    }

    const allClaimed = def.tiers.every((_, i) => claimed[i]);
    if (allClaimed) {
      // 最終段階まで受け取り済み：取得Lvの代わりに、現在の実測値を「進行形」で表示する。
      // 最終しきい値を超えても実際の統計値(getStatValue)をそのまま出し続けるので、
      // 例えば「紅晶を出現させる：340/500回」のように基準値を超えた数字も伸び続けて見える。
      // ただし桁数が大きい実績（def.hideDenominatorWhenComplete）は、
      // 「2,000,000/2,000,000」のように長くなりすぎるため分母を省略する
      const finalTier = def.tiers[def.tiers.length - 1];
      const value = window.Achievements.getStatValue(def.statKey);
      const progressText = def.hideDenominatorWhenComplete
        ? `${def.progressLabel}：${value.toLocaleString()}${unit}`
        : `${def.progressLabel}：${value.toLocaleString()}/${finalTier.threshold.toLocaleString()}${unit}`;
      card.className = 'achv-card unlocked';
      card.innerHTML = `
        <div class="achv-title">${finalTier.title}</div>
        <div class="achv-desc">${def.desc}</div>
        <div class="achv-meta">取得日：${state.claimedAt || '-'}　${progressText}</div>`;
      return;
    }

    const pendingIndex = notified.findIndex((n, i) => n && !claimed[i]);
    if (pendingIndex !== -1) {
      // 受け取り待ちの段階がある：グロー＋タップで受け取り。
      // まだ最終段階ではないので、説明文はまだ出さずタイトルとEP受け取りのみ表示する
      const tier = def.tiers[pendingIndex];
      card.className = 'achv-card unlocked glow';
      card.innerHTML = `
        <div class="achv-title">${tier.title}</div>
        <div class="achv-meta">獲得EP：${tier.ep}（タップで受け取り）</div>`;
      card.addEventListener('click', () => {
        const result = window.Achievements.claim(def.id, pendingIndex);
        if (result == null) return;
        // 受け取り後の見た目は「次はこうなるはず」と決め打ちで書き換えるのではなく、
        // 最新state（1回の記録更新で複数段階を同時に突破していた場合、次の段階も
        // 既に受け取り待ちになっている可能性がある）から同じカードを描き直す。
        // これをしないと、赤バッジ側は「まだ受け取っていない段階がある」と正しく
        // 判定しているのに、カード側は次段階の受け取りボタンが出ないまま
        // 進捗表示に固定されてしまい、バッジが消えないバグになる。
        renderTieredCard(card, def, window.Achievements.getState(def.id));
        showClaimPopup(card, result.ep);
      }, { once:true });
      return;
    }

    // 直近の段階は受け取り済みだが、まだ次の段階には届いていない：進捗表示のみ（説明文はまだ出さない）
    let lastClaimedIndex = -1;
    for (let i = 0; i < claimed.length; i++) { if (claimed[i]) lastClaimedIndex = i; }
    const currentTitle = def.tiers[lastClaimedIndex].title;
    const nextTier = def.tiers[lastClaimedIndex + 1];
    const value = window.Achievements.getStatValue(def.statKey);
    card.className = 'achv-card unlocked';
    card.innerHTML = `
      <div class="achv-title">${currentTitle}</div>
      <div class="achv-meta">${def.progressLabel}：${value.toLocaleString()}/${nextTier.threshold.toLocaleString()}${unit}</div>`;
  }

  function renderAchievementList(){
    if (!achievementList || typeof window.Achievements === 'undefined') return;
    achievementList.innerHTML = '';
    for (const def of window.Achievements.defs) {
      const state = window.Achievements.getState(def.id);
      // おまけ実績（スポンサー系）は、未取得の間は「？？？？？」の伏せカードすら出さず、
      // 取得して初めて一覧に姿を現す（他の実績のように存在を匂わせない）
      if (def.bonus && !state.unlocked) continue;
      const card = document.createElement('div');
      card.dataset.achId = def.id;
      if (def.tiers) renderTieredCard(card, def, state);
      else           renderSingleCard(card, def, state);
      achievementList.appendChild(card);
    }
  }
  renderAchievementList();

  const collectionAchievementsBtn = byId('collection-achievements');
  const achievementBackBtn = byId('achievement-back');
  // 実績称号一覧を開く処理をまとめて、開くたびにストーリー進行もチェックする
  function openAchievementScreen(){
    openSubscreen(achievementScreen);
    if (window.Story) window.Story.check('achievement_open'); // js/story.js: achievement_intro_doctor
  }
  if (collectionAchievementsBtn && achievementScreen){
    collectionAchievementsBtn.addEventListener('click', openAchievementScreen);
    collectionAchievementsBtn.addEventListener('touchstart', e=>{ e.preventDefault(); }, {passive:false});
    collectionAchievementsBtn.addEventListener('touchend', e=>{ e.preventDefault(); openAchievementScreen(); }, {passive:false});
  }
  if (achievementBackBtn && achievementScreen){
    achievementBackBtn.addEventListener('click', () => closeSubscreen(achievementScreen));
    achievementBackBtn.addEventListener('touchstart', e=>{ e.preventDefault(); closeSubscreen(achievementScreen); }, {passive:false});
  }

  // 他のコレクション系ファイル（js/zukan.js など）から同じ開閉処理を使えるように公開。
  // refreshAchievementsは、実績解除／段階到達の瞬間にコレクション画面を開いていた場合に
  // js/achievements.js側から呼ばれ、一覧を最新状態に描き直すためのもの。
  window.CollectionUI = { openSubscreen, closeSubscreen, refreshAchievements: renderAchievementList };
  console.log('[collection.js] 初期化完了。window.CollectionUI を公開しました。');
})();
