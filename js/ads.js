// ==========================================================================
// js/ads.js — 広告プレースホルダー（リワード広告）
//
// 【現状】
//   AdMob等の実広告SDKはまだ接続していない（Capacitor導入後、ネイティブアプリ化の
//   フェーズ⑥で対応予定）。ここでは「広告SDKを呼ぶ場所」をjs/shop.js側から切り離し、
//   window.Ads.showRewarded(onResult) という統一インターフェースだけを先に用意しておく。
//
//   中身は「N秒のカウントダウン画面を出して、最後まで見たら成功扱いにする」という仮の
//   実装だが、呼び出し側（js/shop.js）から見た挙動は本番実装と同じになるようにしている。
//     - 最後まで見た　　　　→ onResult(true)  が呼ばれる → 報酬を渡してよい
//     - 途中で×を押して閉じた／広告の準備に失敗した → onResult(false) が呼ばれる → 何も渡さない
//   onResultは必ず1回だけ呼ばれる。
//
// 【AdMob接続時にやること（メモ）】
//   このファイルの中身（showRewarded関数の内部）だけを、実際の
//   @capacitor-community/admob 等の呼び出しに置き換える想定。
//   呼び出し側（js/shop.js）のコードは変更不要になるはず。
//
// 【インタースティシャル広告について】
//   まだプレースホルダーすら用意していない（今回のフェーズでは無料応援パックの
//   リワード広告のみを対象にしたいとのことだったため）。導入するタイミングで
//   window.Ads.showInterstitial(onClose) のような形で同じ考え方で追加する想定。
// ==========================================================================
(function(){
  const REWARDED_PLACEHOLDER_SEC = 5; // 仮の視聴時間（秒）。本番の広告に繋いだらこの秒数固定ではなくなる

  const overlay  = document.getElementById('ad-placeholder-overlay');
  const timerEl  = document.getElementById('ad-placeholder-timer');
  const closeBtn = document.getElementById('ad-placeholder-close');

  let tickTimer = null;
  let activeOnResult = null; // 視聴中のコールバック。多重起動防止の判定にも使う

  function cleanup(){
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (overlay) overlay.classList.remove('show');
  }

  // ×ボタン：視聴を打ち切る。まだ結果を返していない時だけ「失敗」として返す
  function cancel(){
    if (!activeOnResult) return;
    const cb = activeOnResult; activeOnResult = null;
    cleanup();
    cb(false);
  }
  if (closeBtn) closeBtn.addEventListener('click', cancel);

  // リワード広告を表示する。onResult(success:boolean) が視聴結果を1回だけ受け取る。
  function showRewarded(onResult){
    if (typeof onResult !== 'function') return;
    if (!overlay || !timerEl){
      // プレースホルダー画面がHTML側に見つからない場合（組み込み忘れ等）。
      // テストを止めないためだが、無音で成功扱いにはせず失敗として返す＝報酬は渡らない。
      console.warn('[ads.js] #ad-placeholder-overlayが見つかりません。');
      onResult(false);
      return;
    }
    if (activeOnResult){
      // 既に広告表示中（多重タップ等）は新しい呼び出しを弾く
      onResult(false);
      return;
    }
    activeOnResult = onResult;
    let remain = REWARDED_PLACEHOLDER_SEC;
    timerEl.textContent = String(remain);
    overlay.classList.add('show');
    tickTimer = setInterval(() => {
      remain -= 1;
      if (remain <= 0){
        cleanup();
        const cb = activeOnResult; activeOnResult = null;
        if (cb) cb(true); // 最後まで見た → 成功
        return;
      }
      timerEl.textContent = String(remain);
    }, 1000);
  }

  window.Ads = { showRewarded };
  console.log('[ads.js] 初期化完了（広告プレースホルダー版）。');
})();
