// ==========================================================================
// js/sound_se.js — 効果音（SE）システム
//
// 短い効果音はWeb Audio APIで扱う：起動時に一度だけ全SEをfetch+decodeして
// AudioBufferとしてメモリに載せておき、再生する瞬間は軽量なAudioBufferSourceNode
// を作って.start()するだけにする（毎回ファイルを読み直さないので、連発しても
// 重くならない・遅延が出ない）。
//
// 音声ファイルはまだ用意されていない前提で作っている。fetch/decodeに失敗した
// SEはbuffers[key]がnullのままになり、再生要求は黙って無視される
// （画像アセットのonerror runtime fallbackと同じ考え方。ファイルが後から
// assets/sound/se/に置かれれば、次回リロード時からそのまま鳴るようになる）。
//
// 効果音を追加・差し替えたい場合：
//   1. assets/sound/se/ に音声ファイルを置く（下のSE_FILESに書いてあるファイル名）
//   2. 必要ならSE_FILESに1行追加し、再生用の関数を増やす
// ==========================================================================

(function(){
  // ── SEファイル一覧（種類ごとのファイル名） ─────────────────
  const SE_FILES = {
    button:         'assets/sound/se/se_button.mp3',       // ページ送り以外の画面遷移UIボタン
    buttonHold:     'assets/sound/se/se_button_hold.mp3',   // UIボタン長押し/ホバー（ボイルアニメーション使用ボタンのみ）
    page:           'assets/sound/se/se_page.mp3',          // ページ送りボタン（矢印・ドット）
    popup:          'assets/sound/se/se_popup.mp3',         // 詳細ポップを開く時（図鑑セル／チュートリアル一覧カードのみ）
    tutorial:       'assets/sound/se/se_tutorial.mp3',      // チュートリアルポップのタップ進行
    doctor:         'assets/sound/se/se_doctor.mp3',        // 博士セリフのタップ進行
    bombDefault:    'assets/sound/se/se_bomb.mp3',          // 玉爆発（デフォルト）
    bombSkin01:     'assets/sound/se/se_bomb_skin01.mp3',   // 玉爆発（スキン①）
    bombSkin02:     'assets/sound/se/se_bomb_skin02.mp3',   // 玉爆発（スキン②）
    bombLimited:    'assets/sound/se/se_bomb_limited.mp3',  // 玉爆発（限定スキン）
    itemGet:        'assets/sound/se/se_item_get.mp3',      // アイテム獲得時（バッテリー系以外）
    batteryHit:     'assets/sound/se/se_battery_hit.mp3',   // アイテム：バッテリーのあたり
    batteryMiss:    'assets/sound/se/se_battery_miss.mp3',  // アイテム：バッテリーのハズレ
    gimmick:        'assets/sound/se/se_gimmick.mp3',       // ギミック装置発動時
    epGet:          'assets/sound/se/se_ep_get.mp3',        // リザルト：EP獲得
    achievementGet: 'assets/sound/se/se_achievement_get.mp3', // 実績称号：EP獲得（コレクション画面で受け取った瞬間）
    achievementUnlock: 'assets/sound/se/se_achievement_unlock.mp3', // 実績解除トースト（画面左下からポップがスライドしてくる瞬間）
    epUse:          'assets/sound/se/se_ep_use.mp3',        // ショップ：EP消費
    skillBlink:     'assets/sound/se/se_skill_blink.mp3',
    skillFreeze:    'assets/sound/se/se_skill_freeze.mp3',  // フリーズショット（内部id: bubble）
    skillSweep:     'assets/sound/se/se_skill_sweep.mp3',
    skillShield:    'assets/sound/se/se_skill_shield.mp3',
    skillTyphoon:   'assets/sound/se/se_skill_typhoon.mp3',
    skillBeacon:    'assets/sound/se/se_skill_beacon.mp3',  // ワープビーコン：1回目（設置）
    skillWarp:      'assets/sound/se/se_skill_warp.mp3',    // ワープビーコン：2回目（ワープ実行）
    skillDash:      'assets/sound/se/se_skill_dash.mp3',
    skillCannon:    'assets/sound/se/se_skill_cannon.mp3',
    skillConvert:   'assets/sound/se/se_skill_convert.mp3', // エネルギー変換器
  };

  // 爆発エフェクトスキンID → SEキー（js/explosionSkins.jsのEXPLOSION_SKIN_DEFSに対応）
  const EXPLOSION_SKIN_SE = {
    default:    'bombDefault',
    fireworks:  'bombSkin01',
    mangaBurst: 'bombSkin02',
    neonDebris: 'bombLimited',
  };
  // スキルID(SKILL_DEFS) → SEキー（beaconは2段階あるので専用関数で別扱いにする）
  const SKILL_ID_SE = {
    blink:           'skillBlink',
    bubble:          'skillFreeze',
    sweep:           'skillSweep',
    shield:          'skillShield',
    typhoon:         'skillTyphoon',
    dash:            'skillDash',
    cannon:          'skillCannon',
    energyConverter: 'skillConvert',
  };

  let audioCtx = null;
  let unlocked = false;
  const buffers = {};       // key -> AudioBuffer（読込中/失敗はundefined/null）
  const activeVoices = {};  // key -> 現在再生中のAudioBufferSourceNode[]
  const MAX_VOICES_PER_SE = 5; // 同じSEの同時再生数の上限（連鎖などでの音割れ防止）
  const MIN_INTERVAL_MS = 20;  // 同一SEの最短再発動間隔（極端な連打時の負荷対策）
  const lastPlayedAt = {};
  let buttonHoldSource = null; // ホバー/長押し中のSE（押している間だけループ再生する専用の1本）

  function getCtx(){
    if (!audioCtx){
      try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(err){ return null; }
    }
    return audioCtx;
  }

  // 初回のユーザー操作でAudioContextを解禁する（iOS/Safari等の自動再生制限対策）。
  // タイトル画面の最初のタップ含め、ページ内どこを触っても解禁されるようにしておく。
  function unlock(){
    if (unlocked) return;
    unlocked = true;
    const ac = getCtx();
    if (ac && ac.state === 'suspended') ac.resume().catch(()=>{});
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(evName => {
    document.addEventListener(evName, unlock, { once: true, passive: true });
  });

  // 起動時に全SEを1回だけデコードしてメモリに載せておく。
  // ファイルがまだ無い（404）/デコード失敗の場合はnullにして、以後の再生要求を静かに無視する。
  function preloadAll(){
    const ac = getCtx();
    if (!ac) return;
    for (const key in SE_FILES){
      fetch(SE_FILES[key])
        .then(res => { if (!res.ok) throw new Error('se not found: ' + key); return res.arrayBuffer(); })
        .then(data => ac.decodeAudioData(data))
        .then(buf => { buffers[key] = buf; })
        .catch(() => { buffers[key] = null; });
    }
  }

  function seEnabled(){
    return !(typeof settings !== 'undefined' && settings && settings.seEnabled === false);
  }

  function play(key){
    if (!key || !seEnabled()) return;
    const ac = getCtx();
    if (!ac) return;
    const buf = buffers[key];
    if (!buf) return; // 未読込・読込失敗・ファイル未配置のいずれか（ゲーム進行には影響させない）

    const now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (lastPlayedAt[key] && now - lastPlayedAt[key] < MIN_INTERVAL_MS) return;
    lastPlayedAt[key] = now;

    try{
      const voices = activeVoices[key] || (activeVoices[key] = []);
      if (voices.length >= MAX_VOICES_PER_SE){
        const oldest = voices.shift();
        try{ oldest.stop(); }catch(e){}
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(ac.destination);
      src.onended = () => {
        const idx = voices.indexOf(src);
        if (idx !== -1) voices.splice(idx, 1);
      };
      src.start(0);
      voices.push(src);
    }catch(err){ /* 再生失敗はゲームを止めずに無視する */ }
  }

  // ── 個別SE再生関数（index.html本体・各jsファイルから呼び出す） ──────
  function playButton(){ play('button'); }
  // ホバー/長押し中のSEは、他のSEと違い「押されている間だけ」鳴らす必要があるため、
  // 単発再生ではなくループ再生にして、専用のstopButtonHold()で明示的に止める方式にしている
  // （単発再生だと、音声ファイル自体の長さ分は指を離した後も鳴り続けてしまう）。
  function playButtonHold(){
    if (!seEnabled()) return;
    const ac = getCtx();
    if (!ac) return;
    const buf = buffers['buttonHold'];
    if (!buf) return;
    if (buttonHoldSource) return; // 既に鳴っている場合は多重再生しない
    try{
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(ac.destination);
      src.start(0);
      buttonHoldSource = src;
    }catch(err){ /* 再生失敗はゲームを止めずに無視する */ }
  }
  function stopButtonHold(){
    if (buttonHoldSource){
      try{ buttonHoldSource.stop(); }catch(err){}
      buttonHoldSource = null;
    }
  }
  function playPage(){ play('page'); }
  function playPopup(){ play('popup'); }
  function playTutorial(){ play('tutorial'); }
  function playDoctor(){ play('doctor'); }
  // triggerExplosion()側から `playExplosionSE(skinId)` という名前で呼ばれる想定
  // （js/explosionSkins.js側の簡易合成SEを置き換える形。互換のため関数名を維持）
  function playExplosionSE(skinId){ play(EXPLOSION_SKIN_SE[skinId] || 'bombDefault'); }
  function playItemGet(){ play('itemGet'); }
  function playBatteryHit(){ play('batteryHit'); }
  function playBatteryMiss(){ play('batteryMiss'); }
  function playGimmick(){ play('gimmick'); }
  function playEpGet(){ play('epGet'); }
  function playAchievementGet(){ play('achievementGet'); }
  // 実績解除トースト用（js/achievements.js: createToastElementから、ポップがスライドインする瞬間に呼ばれる）
  function playAchievementUnlock(){ play('achievementUnlock'); }
  function playEpUse(){ play('epUse'); }
  function playSkill(skillId){ play(SKILL_ID_SE[skillId]); }
  function playBeaconSet(){ play('skillBeacon'); }
  function playBeaconWarp(){ play('skillWarp'); }

  window.SoundSE = {
    playButton, playButtonHold, stopButtonHold, playPage, playPopup, playTutorial, playDoctor,
    playExplosionSE,
    playItemGet, playBatteryHit, playBatteryMiss, playGimmick,
    playEpGet, playAchievementGet, playAchievementUnlock, playEpUse,
    playSkill, playBeaconSet, playBeaconWarp,
  };
  // 既存のtriggerExplosion()は `typeof playExplosionSE === 'function'` というグローバル関数名を
  // 直接呼び出しているため、グローバルにも同名で公開しておく（js/explosionSkins.js側の
  // 簡易合成SEはこの新しい実装に置き換える）
  window.playExplosionSE = playExplosionSE;

  preloadAll();

  // ══════════════════════════════════════════════════════════════════
  // ボタン系SEの自動デリゲーション
  //
  // 個別のクリックハンドラを1つ1つ書き換えるのではなく、対象IDやクラス名を
  // ここにまとめて登録し、click/touchendをdocumentレベルでまとめて監視する方式。
  // ショップ商品カードや図鑑セルなど動的に生成される要素にも自動的に効く。
  //
  // すり合わせ済みの区分：
  //   ・se_button   … ページ送り以外の画面遷移・確認系ボタン
  //   ・se_page     … ページ送りの矢印/ドット
  //   ・se_popup    … 図鑑の詳細ポップ／チュートリアル一覧カードを開く時のみ
  //     （購入確認・セーブ初期化確認・名前入力ポップ・スキル獲得ポップは対象外）
  // 爆発/アイテム/スキル/ギミック/EP関連のSEは、各ゲームロジック側から
  // 直接window.SoundSEの関数を呼ぶ形にしている（クリック起点ではないため）。
  // ══════════════════════════════════════════════════════════════════
  const BUTTON_IDS = [
    'title-play-btn', 'title-settings-btn', 'psb-settings-btn',
    'mode-quick', 'mode-endless', 'mode-shop', 'mode-collection', 'mode-to-title',
    'pause-btn', 'pause-resume', 'pause-quit', 'pause-option', 'option-back',
    'opt-bgm-on', 'opt-bgm-off', 'opt-se-on', 'opt-se-off',
    'opt-absolute', 'opt-floating', 'opt-floating-only',
    'opt-speedbar-off', 'opt-speedbar-on',
    'option-reset-save', 'reset-confirm-cancel', 'reset-confirm-ok',
    'go-retry', 'go-menu', 'go-complete',
    'achv-bell-btn', 'achv-log-back',
    'shop-back', 'shop-confirm-no', // shop-confirm-yes は playEpUse() 側で鳴らすので対象外（二重再生防止）
    'collection-to-mode', 'collection-profile', 'collection-tutorial', 'collection-zukan', 'collection-achievements',
    'profile-back', 'profile-icon-picker-close',
    'tutorial-back', 'achievement-back', 'zukan-back',
    'zukan-menu-btn', 'zukan-drawer-close', 'zukan-popup-close',
    'skill-back-btn', 'skill-start-btn', 'bubble-fire-btn',
    'story-name-submit', 'story-skill-grant-claim-btn',
  ];
  // 動的生成される「選ぶ」系ボタン（実績カードは playAchievementGet() 側で鳴らすため対象外）
  const DYNAMIC_BUTTON_SELECTORS = ['.shop-card', '.shop-card-list', '.skill-card', '.profile-icon-picker-item'];
  const PAGE_SELECTORS = [
    '#zukan-prev', '#zukan-next', '#shop-prev', '#shop-next',
    '#zukan-popup-prev', '#zukan-popup-next', '.zukan-dot',
  ];
  const POPUP_SELECTORS = ['.zukan-cell:not(.empty)', '.tutorial-card'];

  const BUTTON_ID_SELECTOR = BUTTON_IDS.map(id => '#' + id).join(',');

  const lastFiredAt = new WeakMap();
  function fireOnce(el, fn){
    const now = (window.performance && performance.now) ? performance.now() : Date.now();
    const last = lastFiredAt.get(el) || 0;
    if (now - last < 200) return; // 同一要素でclick/touchendが両方発火した場合の二重再生防止
    lastFiredAt.set(el, now);
    fn();
  }

  function handleDelegatedEvent(e){
    const target = e.target;
    if (!(target instanceof Element)) return;

    let hit = target.closest(PAGE_SELECTORS.join(','));
    if (hit){ fireOnce(hit, playPage); return; }

    hit = target.closest(POPUP_SELECTORS.join(','));
    if (hit){ fireOnce(hit, playPopup); return; }

    hit = target.closest(BUTTON_ID_SELECTOR);
    if (hit){ fireOnce(hit, playButton); return; }

    hit = target.closest(DYNAMIC_BUTTON_SELECTORS.join(','));
    if (hit){ fireOnce(hit, playButton); return; }
  }
  document.addEventListener('click', handleDelegatedEvent, true);
  document.addEventListener('touchend', handleDelegatedEvent, true);

  console.log('[sound_se.js] 初期化完了。window.SoundSE を公開しました。');
})();
