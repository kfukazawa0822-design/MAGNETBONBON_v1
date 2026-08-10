// ==========================================================================
// js/profile.js — プロフィール画面（研究員証）
//
// 氏名（自由入力）・称号（獲得済みの実績称号からプルダウン選択）・アイコン
// （ショップのアイコンガチャで獲得した分から選択可能）と、各種統計（レベル／モード別
// 最高スコア／図鑑達成率／実績達成率／総プレイ時間）を1枚の「研究員証」風カードに
// まとめて表示する。
//
// 氏名・称号の選択状態は saveData.profile（{ name, title }）に永続化する。
// 統計値は window.Achievements / window.Zukan が持っている値をそのまま読みに行くだけで、
// このファイル側では計算・保存しない（データの二重管理を避けるため）。
//
// 画面の開閉自体は js/collection.js が公開している window.CollectionUI を使う
// （js/zukan.js と同じパターン）。
// ※ 要素が見つからない場合は console.warn を出しつつ処理をスキップする
//   （collection.js / zukan.js と同じ方針）。
// ==========================================================================

(function(){
  function byId(id){
    const el = document.getElementById(id);
    if (!el) console.warn('[profile.js] 要素が見つかりません:', id);
    return el;
  }

  const screen       = byId('profile-screen');
  const nameInput    = byId('profile-name-input');
  const titleSelect  = byId('profile-title-select');
  const iconBox      = byId('profile-icon-placeholder');
  const iconHint     = byId('profile-icon-hint');
  const pickerOverlay = byId('profile-icon-picker-overlay');
  const pickerGrid    = byId('profile-icon-picker-grid');
  const pickerClose   = byId('profile-icon-picker-close');
  const statLevel    = byId('profile-stat-level');
  const statQuick    = byId('profile-stat-quick');
  const statEndless  = byId('profile-stat-endless');
  const statZukan    = byId('profile-stat-zukan');
  const statAch      = byId('profile-stat-achievement');
  const statPlaytime = byId('profile-stat-playtime');

  const DEFAULT_ICON_ID = 'icon_00'; // 誰もが最初から持っている証明写真。ガチャの抽選対象には含まれない

  // ── 保存データの読み書き（saveData.profile に { name, title, iconId } の形で永続化） ──
  function getProfileStore(){
    if (typeof saveData === 'undefined') return { name:'', title:'', iconId:DEFAULT_ICON_ID };
    if (!saveData.profile || typeof saveData.profile !== 'object' || Array.isArray(saveData.profile)) {
      saveData.profile = { name:'', title:'', iconId:DEFAULT_ICON_ID };
    }
    if (!saveData.profile.iconId) saveData.profile.iconId = DEFAULT_ICON_ID;
    return saveData.profile;
  }
  function persist(){
    if (typeof saveSaveData === 'function') saveSaveData();
  }

  // 救済措置：有料応援パック②には「限定アイコン」(icon_12) の解放も含まれる想定だが、
  // 以前のjs/shop.js:grantReward()には付与処理が無く、既に②を購入済みのプレイヤーの
  // データには icon_12 が反映されていなかった（js/zukan.jsのapplySavedUnlockState()と
  // 同じ考え方の救済措置）。②購入済みなのにicon_12がまだ無い場合は、起動時にここで解放する
  (function grantMissingPaidPack2Icon(){
    if (typeof saveData === 'undefined' || !saveData.shopPurchases) return;
    if (saveData.shopPurchases['paid_pack_2'] && !saveData.shopPurchases['icon_12']){
      saveData.shopPurchases['icon_12'] = true;
      persist();
    }
  })();

  function formatPlayTime(sec){
    sec = Math.floor(sec || 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}時間${m}分`;
  }
  function formatPercent(v){
    return `${Math.round((v || 0) * 100)}%`;
  }

  // 獲得済み（受け取り済み）の実績称号一覧を、画面表示用の文字列配列で返す。
  // 段階実績は「現時点で受け取り済みの中で一番高い段階の称号名」だけを1つ入れる。
  function collectClaimedTitles(){
    if (!window.Achievements) return [];
    const titles = [];
    for (const def of window.Achievements.defs){
      const state = window.Achievements.getState(def.id);
      if (def.tiers){
        const claimed = state.claimedTiers || [];
        let lastClaimedIdx = -1;
        for (let i = 0; i < claimed.length; i++){ if (claimed[i]) lastClaimedIdx = i; }
        if (lastClaimedIdx >= 0) titles.push(def.tiers[lastClaimedIdx].title);
      } else if (state.claimed){
        titles.push(def.title);
      }
    }
    return titles;
  }

  function renderTitleSelect(){
    if (!titleSelect) return;
    const store  = getProfileStore();
    const titles = collectClaimedTitles();
    titleSelect.innerHTML = '';

    if (titles.length === 0){
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = '（まだ称号がありません）';
      titleSelect.appendChild(opt);
      titleSelect.disabled = true;
      return;
    }

    titleSelect.disabled = false;
    titles.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      titleSelect.appendChild(opt);
    });

    // 保存されている称号が、獲得済み一覧に無い（未獲得・データ変更などで消えた）場合は
    // 一覧の先頭に自動でフォールバックする
    if (!titles.includes(store.title)){
      store.title = titles[0];
      persist();
    }
    titleSelect.value = store.title;
  }

  function renderStats(){
    if (typeof playerProgress !== 'undefined' && statLevel){
      statLevel.textContent = `Lv ${playerProgress.level}`;
    }
    if (window.Achievements){
      if (statQuick)    statQuick.textContent    = (window.Achievements.getStatValue('bestScoreQuick')    || 0).toLocaleString();
      if (statEndless)  statEndless.textContent  = (window.Achievements.getStatValue('bestScoreEndless')  || 0).toLocaleString();
      if (statPlaytime) statPlaytime.textContent = formatPlayTime(window.Achievements.getStatValue('totalPlayTimeSec'));
      if (statAch && typeof window.Achievements.getCompletionRate === 'function'){
        statAch.textContent = formatPercent(window.Achievements.getCompletionRate());
      }
    }
    if (statZukan && window.Zukan && typeof window.Zukan.getCompletionRate === 'function'){
      statZukan.textContent = formatPercent(window.Zukan.getCompletionRate());
    }
  }

  // 所持しているアイコンID一覧（デフォルト写真 + ガチャで獲得した分 + 有料応援パック②の限定アイコン）を返す。
  // 表示順は獲得順ではなく、icon_00→icon_12の番号順に並べ替える
  // （例：05→09→02の順で獲得しても、選択画面には00→02→05→09の順で並ぶ）
  function ownedIconIds(){
    const gachaOwned = (typeof saveData !== 'undefined' && Array.isArray(saveData.ownedIcons)) ? saveData.ownedIcons : [];
    const ids = [DEFAULT_ICON_ID, ...gachaOwned];
    // icon_12はガチャの抽選対象(ICON_GACHA_POOL)には含まれない特別枠。
    // 有料応援パック②購入で直接解放される（js/shop.js:grantReward参照）
    if (typeof saveData !== 'undefined' && saveData.shopPurchases && saveData.shopPurchases['icon_12']){
      ids.push('icon_12');
    }
    return ids.sort((a, b) => {
      const na = parseInt(a.replace(/[^0-9]/g, ''), 10);
      const nb = parseInt(b.replace(/[^0-9]/g, ''), 10);
      return na - nb;
    });
  }

  function iconImgSrc(iconId){
    return `assets/icons/${iconId}.webp`;
  }

  // 現在選択中のアイコンを、プロフィールカード上のアイコン枠に反映する
  function renderIcon(){
    if (!iconBox) return;
    const store = getProfileStore();
    iconBox.innerHTML = `<img src="${iconImgSrc(store.iconId)}" alt="" onerror="this.remove();">`;
  }

  function renderIconPicker(){
    if (!pickerGrid) return;
    const store = getProfileStore();
    const ids = ownedIconIds();
    pickerGrid.innerHTML = '';
    ids.forEach(id => {
      const cell = document.createElement('div');
      cell.className = 'profile-icon-picker-item' + (id === store.iconId ? ' selected' : '');
      cell.innerHTML = `<img src="${iconImgSrc(id)}" alt="" onerror="this.parentElement.remove();">`;
      cell.addEventListener('click', () => selectIcon(id));
      pickerGrid.appendChild(cell);
    });
  }

  function selectIcon(iconId){
    const store = getProfileStore();
    store.iconId = iconId;
    persist();
    renderIcon();
    renderIconPicker();
    closeIconPicker();
  }

  function openIconPicker(){
    if (!pickerOverlay) return;
    renderIconPicker();
    pickerOverlay.classList.add('show');
  }
  function closeIconPicker(){
    if (pickerOverlay) pickerOverlay.classList.remove('show');
  }

  if (iconBox){
    iconBox.addEventListener('click', openIconPicker);
    iconBox.addEventListener('touchstart', e=>{ e.preventDefault(); }, {passive:false});
    iconBox.addEventListener('touchend', e=>{ e.preventDefault(); openIconPicker(); }, {passive:false});
  }
  if (pickerClose){
    pickerClose.addEventListener('click', closeIconPicker);
    pickerClose.addEventListener('touchstart', e=>{ e.preventDefault(); closeIconPicker(); }, {passive:false});
  }
  if (pickerOverlay){
    // 背景(オーバーレイ自体)をタップした時も閉じる。ただしピッカー本体(カード)のクリックは伝播させない
    pickerOverlay.addEventListener('click', (e)=>{ if (e.target === pickerOverlay) closeIconPicker(); });
  }

  function renderProfile(){
    const store = getProfileStore();
    if (nameInput) nameInput.value = store.name || '';
    renderTitleSelect();
    renderStats();
    renderIcon();
  }

  if (nameInput){
    nameInput.addEventListener('input', () => {
      const store = getProfileStore();
      store.name = nameInput.value;
      persist();
    });
  }
  if (titleSelect){
    titleSelect.addEventListener('change', () => {
      const store = getProfileStore();
      store.title = titleSelect.value;
      persist();
    });
  }

  // コレクション画面の「プロフィール」カード → この画面を開く
  const openProfile = () => {
    if (!window.CollectionUI){
      console.warn('[profile.js] window.CollectionUI が未定義のためプロフィールを開けません（js/collection.jsの初期化に失敗している可能性）');
      return;
    }
    if (!screen) return;
    window.CollectionUI.openSubscreen(screen);
    renderProfile();
    if (window.Story) window.Story.check('profile_open'); // js/story.js: profile_intro_doctor
  };
  const closeProfile = () => {
    if (window.CollectionUI && screen) window.CollectionUI.closeSubscreen(screen);
  };
  const collectionProfileBtn = byId('collection-profile');
  if (collectionProfileBtn){
    collectionProfileBtn.addEventListener('click', openProfile);
    collectionProfileBtn.addEventListener('touchstart', e=>{ e.preventDefault(); }, {passive:false});
    collectionProfileBtn.addEventListener('touchend', e=>{ e.preventDefault(); openProfile(); }, {passive:false});
  }
  const profileBackBtn = byId('profile-back');
  if (profileBackBtn){
    profileBackBtn.addEventListener('click', closeProfile);
    profileBackBtn.addEventListener('touchstart', e=>{ e.preventDefault(); closeProfile(); }, {passive:false});
  }

  console.log('[profile.js] 初期化完了。');
})();
