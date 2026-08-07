// ==========================================================================
// js/story.js — 博士ストーリー／チュートリアル進行エンジン
//
// 「最初はクイックプレイと設定だけ解放。プレイして条件を満たすたびに、
//  博士との会話やチュートリアルポップを挟みながら機能を解放していく」
// という一連の流れを管理する。
//
// STORY_STEPS は上から順番に並んだ「次に見せるべきもの」のリスト。
// saveData.storyProgress.nextIndex が「次に判定すべきステップの番号（配列の添字）」。
// window.Story.check(context) を、機能の要所（モード選択画面に戻った時、
// ショップを開いた時、初回リザルト画面を閉じた時など）で呼ぶと、
//   1) 現在のnextIndexのステップのcontext条件・condition関数を確認
//   2) 満たしていればそのステップを表示（doctor/tutorialは複数ページをタップで送る）
//   3) ステップが完了したらnextIndexを進めて保存し、続けて次のステップも
//      即座に判定する（条件が既に満たされていれば連続で表示される）
// という流れで進む。
//
// 【ステップの種類】
//   doctor        : 画面下部の博士の吹き出し（#story-doctor-overlay）
//   tutorial      : 画面中央のチュートリアルカード（#story-tutorial-overlay）
//   name_input    : 名前入力ポップ（#story-name-overlay）
//   purchase_endless : ショップのエンドレスモード値引き強制購入
//                      （js/shop.js の window.ShopUI.runEndlessDiscountPurchase を呼ぶ）
//   skill_grant   : スキル獲得ポップ（#story-skill-grant-overlay）
//
// 【contextの一覧】（いただいたストーリー設計表 No.001〜043 に対応）
//   null           : どの画面からでも進む（直前のステップに連続して表示する場合など）
//   'mode_select'  : モード選択画面に戻った時
//   'shop'         : ショップ画面を開いた時
//   'item_pickup'      : ゲームプレイ中、アイテムを取得した瞬間（index.html:applyItem）
//   'skill_purchased'  : ショップでスキルを購入した瞬間（js/shop.js:grantReward→報酬ポップを閉じた時）
//   'free_pack_claimed': ショップで無料応援パックを受け取った瞬間（js/shop.js:同上）
//   'paid_pack_1_purchased': ショップで有料応援パック①を購入した瞬間（初回のみ。js/shop.js:同上）
//   'paid_pack_2_purchased': ショップで有料応援パック②を購入した瞬間（初回のみ。js/shop.js:同上）
//   'profile_open'     : プロフィール画面を開いた瞬間（js/profile.js:openProfile）
//   'tutorial_open'    : チュートリアル一覧画面を開いた瞬間（js/collection.js:openTutorialScreen）
//   'achievement_open' : 実績称号一覧画面を開いた瞬間（js/collection.js:openAchievementScreen）
//   'zukan_open'       : 図鑑画面を開いた瞬間（js/zukan.js:openZukan）
//   → お送りいただいたjs/shop.js・js/profile.js・js/collection.js・js/zukan.jsに
//     全てフックを追加済み。
//
// 【まだ差し込めていないもの（後日対応）】
//   - 博士の姿（#story-doctor-portrait-placeholder）
//   - チュートリアル画像（#story-tutorial-image-placeholder、元画像1000×800想定）
//   本文テキストはNo.001〜043まで正式なものに差し替え済み（2026年時点）。
//   画像は他ファイルの画像アセットと同じ考え方で、パスを差し替えるだけで反映されるようにしてある。
//
// 【チュートリアル画像の置き場所・ファイル名】
//   保存先：assets/tutorial/ フォルダ（新規。まだ無ければ作成する）
//   ファイル名：そのチュートリアルのid をそのまま使う。
//     ・1ページのみのステップ（例：tips_rock） → assets/tutorial/tips_rock.webp
//     ・複数ページのステップ（例：welcome_tutorial＝3ページ）
//       → assets/tutorial/welcome_tutorial_1.webp / _2.webp / _3.webp（1始まり）
//   サイズ：1000×800px推奨（#story-tutorial-imageのaspect-ratioに合わせてある）。
//
//   ★js/shop.js・js/zukan.jsの画像と同じ「置くだけで反映される」方式にしてある。
//   　上記のファイル名で正しい場所に置きさえすれば、コード側は一切編集不要で自動的に
//   　表示される（tutorialImagePath()が組み立てたパスを毎回読みに行き、画像が無ければ
//   　onerrorで検知してプレースホルダー表示に戻すだけ＝renderTutorialPage内）。
//   　ファイル名やフォルダを間違えると読み込みに失敗し、その場合も「Loading...」表示のまま
//   　据え置かれる（2026-08〜：読み込み中／読み込み失敗を見分ける文言は表示しない仕様に変更）。
//   　page.image:'任意のパス.webp' を明示的に指定した場合はそちらが優先される。
//
//   画像を「そもそも付けない」ページには、ページのオブジェクトに noImage:true を追記する。
//   これを付けると画像枠自体を非表示にする（プレースホルダーも出さない、テキストのみのカードになる）。
//   例：{ text:'……', noImage:true }
// ==========================================================================

(function(){
  function byId(id){
    const el = document.getElementById(id);
    if (!el) console.warn('[story.js] 要素が見つかりません:', id);
    return el;
  }

  // ── ステップ定義 ──
  // 文中の {name} は、名前入力ステップで決めたプレイヤー名に置き換えられる。
  //
  // 【いただいたストーリー設計表（No.001〜043）との対応】
  // 表のNo.をコメントで付記している。表の「種類」列がそのままtypeに対応する
  // （博士ストーリー→doctor、チュートリアル→tutorial、プレイヤー操作→name_input/
  //  purchase_endless/skill_grantなど個別のtype）。
  //
  const STORY_STEPS = [
    // No.001 博士ストーリー：はじめまして（1/3）
    { id:'greet1', type:'doctor', context:'mode_select', condition: () => true,
      pages: ['ようこそ我が研究所へ。私はマグネス博士だ。…おや、見かけない顔だね。君の名前を教えてもらえるかな？'] },

    // No.002 プレイヤー操作：名前入力ポップアップ
    { id:'name_input', type:'name_input', context:null, condition: () => true },

    // No.003-004 博士ストーリー：はじめまして（2/3）（3/3）
    { id:'greet2', type:'doctor', context:null, condition: () => true,
      pages: [
        '{name}くん…あぁ！君が研究所のアシスタントに応募してくれた子だね。',
        '実はこの研究所の周りでは、未知の物質が採集できてね。私は【磁晶核】と名付けて研究しているんだ。',
      ] },

    // No.005-007 チュートリアル：研究所へようこそ（1/3〜3/3）
    { id:'welcome_tutorial', type:'tutorial', context:null, condition: () => true,
      titleBase:'研究所へようこそ',
      pages: [
        { text:'ようこそ、磁晶核研究所へ。あなたはマグネス博士の「研究助手」となり、不思議な鉱石「磁晶核」を利用したエネルギー開発のため、さまざまな実験をサポートしていただきます。' },
        { text:'この地域でしか採れない未知の鉱石「磁晶核」。その内部には、未知のエネルギーが秘められています。マグネス博士は、その無限の可能性を信じ、この地で研究を続けています。' },
        { text:'【操作方法】　ドラッグ：移動\n長押し：S極で吸引／離す：N極で反発\n磁晶核同士をぶつけて爆発を連鎖させ、研究エネルギーを集めましょう！' },
      ],
      effectsAfter: () => glowButton('mode-quick') },

    // No.008 チュートリアル：アイテムに関して（初アイテム獲得時／ゲームプレイ中に一時停止して表示）
    // ※このステップだけ画面下部の博士ではなく、ゲームプレイ中に中央のチュートリアルカードとして
    //   割り込み表示する想定。表示中はgamePausedをtrueにして、裏でボールが動き続けないようにしている。
    { id:'first_item_tutorial', type:'tutorial', context:'item_pickup', condition: () => true,
      titleBase:'アイテムに関して',
      pages: [ { text:'フィールドには、磁晶核のほかに装置を強化する「アイテム」が出現します。アイテムを拾うと、そのプレイ中だけ装置を強化できます。見つけたら積極的に回収して、大連鎖を狙いましょう！' } ],
      pauseGame:true },

    // No.009-010 博士ストーリー：初プレイ後（1/2）（2/2）
    // ※初回プレイのみリザルト画面の選択肢が「完了」1択になる処理は、index.html側の
    //   goCompleteFirstPlay関連で既に実装済み（このファイルでの対応は不要）。
    { id:'after_first_play', type:'doctor', context:'mode_select',
      condition: () => quickPlayCount() >= 1,
      pages: [
        // No.009：笑顔の立ち絵（hakase_2）を使用
        { text:'お見事じゃ、{name}くん！\n初仕事としては十分じゃよ。安心して研究を任せられそうじゃ。', portrait:'hakase_2' },
        'この調子で磁晶核の可能性をともに解き明かしていこう！……おっと、そうじゃった。研究を続ける前に、覚えておいてほしいことがまだあったのう。',
      ] },

    // No.011 チュートリアル：岩の種類（011〜013は表のタイトルに(x/y)表記が無いため、
    // 3つとも別々のタイトルを持つ独立したチュートリアルカードとして扱っている）
    { id:'tips_rock', type:'tutorial', context:null, condition: () => true,
      titleBase:'岩の種類',
      pages: [ { text:'フィールドに点在する黒い岩に気づきましたか？あれは磁晶核の動きを変化させる特殊な岩です。岩は一定時間ごとに呼吸するように光り、それぞれ固有の能力を発揮します。' } ] },

    // No.012 チュートリアル：ガラス玉の種類
    { id:'tips_marble', type:'tutorial', context:null, condition: () => true,
      titleBase:'ガラス玉の種類',
      pages: [ { text:'フィールドには、性質の異なるさまざまな磁晶核が出現します。重力を発するものや、一定時間後に爆発するもの、特定の磁極にしか反応しないものなど...。性質を理解して、大連鎖を巻き起こしましょう！' } ] },

    // No.013 チュートリアル：レベルアップに関して
    { id:'levelup_tutorial', type:'tutorial', context:null, condition: () => true,
      titleBase:'レベルアップに関して',
      pages: [ { text:'スコアを伸ばすほど経験値取得量も増加します。レベルアップするとEP（ｴﾈﾙｷﾞｰﾎﾟｲﾝﾄ）を獲得したり、新たな機能が解放されていきます。たくさん磁晶核に触れて研究レベルを上げていきましょう！' } ] },

    // No.014 博士ストーリー：ショップ開放
    { id:'shop_intro', type:'doctor', context:'mode_select',
      condition: () => quickPlayCount() >= 3 && (typeof playerProgress !== 'undefined' ? playerProgress.coins : 0) >= 100,
      pages: ['そういえば、研究を進めるうちに「EP」が貯まってきておるじゃろう？実はそれには、大切な使い道があるんじゃ。'] },

    // No.015 チュートリアル：EPの使い道
    { id:'ep_usage_tutorial', type:'tutorial', context:null, condition: () => true,
      titleBase:'EPの使い道',
      pages: [ { text:'EPは、研究の成果として得られる「研究資源」です。新たな装備やスキンの購入に使用できます。大切に使いましょう！' } ] },

    // No.016 チュートリアル：ショップ機能解放（閲覧後にショップボタンを解放して発光させる）
    { id:'shop_unlock_tutorial', type:'tutorial', context:null, condition: () => true,
      titleBase:'ショップ機能解放',
      pages: [ { text:'研究所に新たな設備を用意しました！今は品数も少ないですが、研究レベルを上げるほど商品が増えていきます。' } ],
      effectsAfter: () => {
        saveData.storyFlags.shopUnlocked = true;
        if (typeof saveSaveData === 'function') saveSaveData();
        if (typeof updateShopLockUI === 'function') updateShopLockUI();
        glowButton('mode-shop');
      } },

    // No.017-019 博士ストーリー：ショップチュートリアル（1/4〜3/4）
    { id:'shop_dialogue_1', type:'doctor', context:'shop', condition: () => true,
      pages: [
        'ここでは君のEPと引き換えにアイテムを考案できる場所じゃ',
        '君が集めてくれたEP（エネルギーポイント）はわたしに引き取らせてくれないか？',
        '早速エンドレスモードを解放してもらいたいんじゃ。。。今回は値引いて置くので購入してほしい。',
      ] },

    // No.020 プレイヤー操作：購入チュートリアル（値引き演出→確認ポップ→購入後ポップ）
    { id:'purchase_endless', type:'purchase_endless', context:null, condition: () => true },

    // No.021 博士ストーリー：ショップチュートリアル（4/4）：笑顔の立ち絵（hakase_2）を使用
    { id:'shop_dialogue_2', type:'doctor', context:null, condition: () => true,
      pages: [ { text:'ありがとう！エンドレスモードにはスキルを1つもっていける。これを受け取ってくれ。', portrait:'hakase_2' } ] },

    // No.022 プレイヤー操作：スキル受け取り
    { id:'skill_grant', type:'skill_grant', context:null, condition: () => true,
      skills:['ブリンク', 'フリーズショット', 'マグネットスイープ'] },

    // No.023 チュートリアル：エンドレスモード解放・バッテリー
    { id:'endless_battery_tutorial', type:'tutorial', context:'mode_select', condition: () => true,
      titleBase:'エンドレスモード解放・バッテリー',
      pages: [ { text:'エンドレスモードでは、「バッテリーアイテム」が出現！改造・暴走バッテリーは失敗すると減ってしまうが、小型バッテリーは確実に回復できる安全型だ。当たれば大きく回復できる。運と駆け引き次第で、バッテリーを切らさず遊び続けられるかも！？' } ] },

    // No.024 チュートリアル：スキルについて
    { id:'endless_skill_tutorial', type:'tutorial', context:null, condition: () => true,
      titleBase:'スキルについて',
      pages: [ { text:'エンドレスモード限定の特別な力、それが「スキル」だ。プレイ開始前に好きなスキルを1つ選んで出発しよう。玉を爆発させるとSPが貯まり、満タンになると発動可能。ここぞという場面で使って、一気に状況を変えよう！' } ] },

    // No.025 チュートリアル：エンドレスモード限定ギミック（閲覧後にエンドレスボタンを発光）
    { id:'endless_gimmick_tutorial', type:'tutorial', context:null, condition: () => true,
      titleBase:'エンドレスモード限定ギミック',
      pages: [ { text:'フィールドに現れる不思議な装置の範囲内で、規定数爆発を起こすと「ギミック」が発動！エンドレスモード限定の特別な現象が起こります。見つけたら、積極的に玉を引き寄せて起動しよう！' } ],
      effectsAfter: () => glowButton('mode-endless') },

    // No.026 チュートリアル：このゲームの定石（レベル15を目指そう）（エンドレス初クリア後）
    // 「endlessPlayCount」統計値は、index.html側（リザルト集計処理）にquickPlayCountと
    // 同じパターンで新設した。20秒未満のプレイはカウントしない点もquickPlayCountに合わせている。
    { id:'lv15_goal_tutorial', type:'tutorial', context:'mode_select',
      condition: () => endlessPlayCount() >= 1,
      titleBase:'このゲームの定石（レベル15を目指そう）',
      pages: [ { text:'君のおかげで研究は順調だ！研究が進むほど、研究所の設備も充実していく。次は研究レベル15を目指そう！' } ] },

    // No.027 チュートリアル：ショップ：新商品が追加されました！（Lv15達成、1・2ページ目解放）
    // ショップ側の「ページ数によって表示するアイテムを絞る」ロジックはjs/shop.js側に実装済み
    // （SHOP_PAGESの各ページのminPagesUnlockedと、この値を見比べてシャッターを出し分けている）。
    { id:'lv15_shop_new_tutorial', type:'tutorial', context:'mode_select',
      condition: () => playerLevel() >= 15,
      titleBase:'ショップ：新商品追加！',
      pages: [ { text:'ショップに新商品が追加されました！研究レベルが上がると、新たな商品や機能が順次解放されます。', noImage:true } ],
      effectsAfter: () => {
        saveData.storyFlags.shopPagesUnlocked = Math.max(saveData.storyFlags.shopPagesUnlocked || 1, 2);
        if (typeof saveSaveData === 'function') saveSaveData();
        addBadge('mode-shop');
      } },

    // No.028 チュートリアル：限定パック・スキル解放！
    { id:'lv15_shop_new_tutorial2', type:'tutorial', context:null, condition: () => true,
      titleBase:'限定パック・スキル解放！',
      pages: [ { text:'「限定パック」と「スキル」が追加されました！ショップからいつでも内容を確認できます。' } ] },

    // No.029 博士ストーリー：実質ショップ機能解放（ショップボタンに赤バッジ）
    { id:'lv15_shop_doctor', type:'doctor', context:null, condition: () => true,
      pages: [
        'おお、研究もずいぶん進んできたのう！君が集めた研究データをもとに、新しいスキルを開発したぞ。ぜひ試してみてくれ！',
      ],
      effectsAfter: () => addBadge('mode-shop') },

    // No.030「お気に入りスキルに関して」・No.031「バフに関して」は、それぞれ
    // 「スキルを買ったら」「無料パックを受け取ったら」という、プレイヤーが必ずしも
    // やるとは限らない行動が条件になっている。これをこのメインの順番待ち列に
    // そのまま入れてしまうと、その行動をまだしていないプレイヤーは、Lv20やLv30などの
    // 後続のステップが（条件を満たしていても）ずっと表示されなくなってしまう
    // （このバグが実際に起きていた：Lv20達成してもコレクションが解放されない）。
    // そのため、この2つは下のSIDE_STEPSという別枠に移動し、メインの順番とは無関係に
    // 条件を満たした時だけ割り込みで表示されるようにした。

    // No.032-033 博士ストーリー：コレクション解放（1/2）（2/2）（Lv20達成）
    { id:'lv20_collection_doctor', type:'doctor', context:'mode_select',
      condition: () => playerLevel() >= 20,
      pages: [
        '君も立派な研究助手になってきたのう。これからは研究の記録もしっかり残していこう。新しい設備を用意しておいたぞ。',
        // No.033：笑顔の立ち絵（hakase_2）を使用
        { text:'研究の成果は、積み重ねるほど価値がある。自分の成長を振り返りながら、さらなる高みを目指してくれ！', portrait:'hakase_2' },
      ] },

    // No.034-035 チュートリアル：コレクション解放（1/2）（2/2）（閲覧後にコレクションボタン解放・発光）
    { id:'collection_unlock_tutorial', type:'tutorial', context:null, condition: () => true,
      titleBase:'コレクション解放',
      pages: [
        { text:'「コレクション」が解放されました！研究の記録や実績などを、いつでも確認できるようになります。' },
        { text:'【プロフィール】研究記録を確認できます。\n【チュートリアル】過去の説明ポップアップを見返せます。\n【実績称号】実績を達成すると称号やEPを獲得できます。', noImage:true },
      ],
      effectsAfter: () => {
        saveData.storyFlags.collectionUnlocked = true;
        if (typeof saveSaveData === 'function') saveSaveData();
        if (typeof updateCollectionLockUI === 'function') updateCollectionLockUI();
        glowButton('mode-collection');
      } },

    // No.036〜038「初めてプロフィール／チュートリアル／実績称号を開いた」の3つも、
    // favorite_skill_tutorial/buff_tutorialと全く同じ理由（プレイヤーが必ずしも
    // その画面を開くとは限らない）で、下のSIDE_STEPSに移動した。

    // No.039 博士ストーリー：図鑑説明とショップおまけ（Lv30達成）：笑顔の立ち絵（hakase_2）を使用
    { id:'lv30_doctor', type:'doctor', context:'mode_select',
      condition: () => playerLevel() >= 30,
      pages: [ { text:'ここまで研究を続けてくれて感謝する。君のおかげで、磁晶核についてもずいぶん多くのことが分かってきた。', portrait:'hakase_2' } ] },

    // No.040 チュートリアル：ショップ：新商品が追加されました！（Lv30、3・4ページ目解放、赤バッジ）
    { id:'lv30_shop_new_tutorial', type:'tutorial', context:null, condition: () => true,
      titleBase:'ショップ：新商品が追加されました！',
      pages: [ { text:'ショップに新商品が追加されました！スキンや博士支援など、新たな商品が利用できるようになりました。' } ],
      effectsAfter: () => {
        saveData.storyFlags.shopPagesUnlocked = Math.max(saveData.storyFlags.shopPagesUnlocked || 1, 4);
        if (typeof saveSaveData === 'function') saveSaveData();
        addBadge('mode-shop');
      } },

    // No.041 チュートリアル：コレクション：図鑑が解放されました！（コレクションに赤バッジ・図鑑ボタン発光）
    { id:'lv30_zukan_unlock_tutorial', type:'tutorial', context:null, condition: () => true,
      titleBase:'コレクション：図鑑が解放されました！',
      pages: [ { text:'「図鑑」が解放されました。集めた情報の確認や、装置・磁晶核のカスタマイズができるようになりました。' } ],
      effectsAfter: () => {
        saveData.storyFlags.zukanUnlocked = true;
        if (typeof saveSaveData === 'function') saveSaveData();
        if (typeof updateZukanLockUI === 'function') updateZukanLockUI();
        addBadge('mode-collection');
        glowButton('collection-zukan');
        // 実績「研究所の新たな一歩」：このチュートリアルを読み終えた（閉じた）瞬間に解除
        if (window.Achievements) window.Achievements.unlock('ach_021');
      } },

    // No.042-043 博士ストーリー：図鑑説明（初めて図鑑を開いた）
    { id:'zukan_intro_doctor', type:'doctor', context:'zukan_open', condition: () => true,
      pages: [
        '図鑑には、細かな研究結果まで記録しておる。研究とは、一度の発見で終わるものではない。一度知ったことでも、改めて読み返せば新たな発見があるかもしれぬぞ。',
        'これから見つかる新たな発見は、この図鑑へ記録していってほしい。{name}くん、この研究の記録係を君に任せてもよいかな。',
      ] },

    // ※表がNo.044以降も続いていそうでしたが、画像で確認できたのはここまででした。
    //   続きがあれば教えてください。
  ];

  // ── SIDE_STEPS：メインの順番待ち列（STORY_STEPS）とは独立した「おまけ」の一言 ──
  // 条件を満たした時にだけ割り込みで表示され、表示済みかどうかは
  // saveData.storyProgress.sideDone[id] で個別に管理する（メインの進行度=nextIndexとは無関係）。
  // メインの列に混ぜてしまうと、これらの行動条件（スキル購入・無料パック受取・
  // プロフィール／チュートリアル／実績称号画面を開く）をプレイヤーがまだ行っていない間、
  // それ以降の全ステップ（Lv20やLv30の解放など）が表示されなくなってしまうため、
  // あえて別枠にしている。
  const SIDE_STEPS = [
    // No.030 チュートリアル：お気に入りスキルに関して（スキル購入後）
    { id:'favorite_skill_tutorial', type:'tutorial', context:'skill_purchased', condition: () => true,
      titleBase:'お気に入りスキルに関して',
      pages: [ { text:'「お気に入り」に設定したスキルは、ゲーム開始時のスキル選択に必ず登場します。設定はオプション画面からいつでも変更できます。' } ] },

    // No.031 チュートリアル：バフに関して（初無料パック購入後）
    { id:'buff_tutorial', type:'tutorial', context:'free_pack_claimed', condition: () => true,
      titleBase:'バフに関して',
      pages: [ { text:'動画を視聴すると、100EPと「EXPバフ」を獲得できます。EXPバフは次の1プレイのみ有効で、獲得EXPが2倍になります。（1日1回限定）' } ] },

    // 新規追加（ご要望対応）：有料応援パック①購入時の特典説明ポップ（初回購入時のみ、
    // buff_tutorialと全く同じ仕組み）。タイトル・本文は未定のプレースホルダーなので、
    // 正式な内容が決まり次第ここを差し替える
    { id:'paid_pack_1_tutorial', type:'tutorial', context:'paid_pack_1_purchased', condition: () => true,
      titleBase:'（未定：有料応援パック①の特典について）',
      pages: [ { text:'（本文未定。有料応援パック①購入直後・初回のみ表示される説明ポップです。内容が決まり次第差し替えてください。）' } ] },

    // 新規追加（ご要望対応）：有料応援パック②購入時の特典説明ポップ（初回購入時のみ）
    { id:'paid_pack_2_tutorial', type:'tutorial', context:'paid_pack_2_purchased', condition: () => true,
      titleBase:'（未定：有料応援パック②の特典について）',
      pages: [ { text:'（本文未定。有料応援パック②購入直後・初回のみ表示される説明ポップです。内容が決まり次第差し替えてください。）' } ] },

    // No.036 博士ストーリー：プロフィール説明（初めてプロフィールを開いた）
    { id:'profile_intro_doctor', type:'doctor', context:'profile_open', condition: () => true,
      pages: [ 'ここでは君の研究記録を確認できる。称号やアイコンを設定して、自分だけの研究員証を作ってみるんじゃ。' ] },

    // No.037 博士ストーリー：チュートリアル説明（初めてチュートリアルを開いた）
    { id:'tutorial_screen_intro_doctor', type:'doctor', context:'tutorial_open', condition: () => true,
      pages: [ '忘れてしまった説明は、ここでいつでも見返せる。困ったときは遠慮なく頼るとよい。' ] },

    // No.038 博士ストーリー：実績称号説明（初めて実績称号を開いた）
    { id:'achievement_intro_doctor', type:'doctor', context:'achievement_open', condition: () => true,
      pages: [ '研究の成果は実績として記録される。称号を集めながら、一流の研究助手を目指してくれ。' ] },
  ];

  function quickPlayCount(){
    return window.Achievements ? window.Achievements.getStatValue('quickPlayCount') : 0;
  }
  // index.html側のリザルト集計処理でquickPlayCountと同じパターンで新設した統計値
  function endlessPlayCount(){
    return window.Achievements ? window.Achievements.getStatValue('endlessPlayCount') : 0;
  }
  function playerLevel(){
    return (typeof playerProgress !== 'undefined' && playerProgress.level) ? playerProgress.level : 1;
  }
  // 「新着あり」の赤バッジ（.has-unclaimed）を付ける。既存の実績称号・コレクションの
  // 未受け取りバッジと同じCSSクラスを流用している（index.html側でmode-shopにも
  // このクラスのスタイルを効かせるようセレクタを拡張済み）
  function addBadge(id){
    const el = document.getElementById(id);
    if (el) el.classList.add('has-unclaimed');
  }
  function playerName(){
    return (saveData.profile && saveData.profile.name) || '';
  }
  function fillTemplate(text){
    return text.replace(/\{name\}/g, playerName());
  }
  function glowButton(id){
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('story-glow');
    const clear = () => { el.classList.remove('story-glow'); el.removeEventListener('click', clear); };
    el.addEventListener('click', clear);
  }

  // ── 進行状態の読み書き ──
  function getProgress(){
    if (!saveData.storyProgress || typeof saveData.storyProgress !== 'object') {
      saveData.storyProgress = { nextIndex: 0 };
    }
    if (!saveData.storyProgress.sideDone || typeof saveData.storyProgress.sideDone !== 'object') {
      saveData.storyProgress.sideDone = {};
    }
    return saveData.storyProgress;
  }
  function persist(){
    if (typeof saveSaveData === 'function') saveSaveData();
  }
  function isSideStepDone(id){
    return !!getProgress().sideDone[id];
  }
  function markSideStepDone(id){
    getProgress().sideDone[id] = true;
    persist();
  }

  let activePopupOpen = false; // 何らかのポップ表示中は多重発火を防ぐ
  // 現在表示中のステップ本体（メインの列のものかSIDE_STEPSのものかを問わず、
  // ここに入っているものを進行させる）。doctor/tutorialの「次へ」処理は
  // 全てこの変数を見るようにして、メインの列番号(nextIndex)に直接依存しないようにしている
  let activeStep = null;
  let activeStepIsSide = false;
  let pageIndex = 0;

  function advance(){
    getProgress().nextIndex += 1;
    persist();
    activePopupOpen = false;
    // 続けて次のステップの条件も既に満たされているかもしれないので、同じcontextで再チェックする
    check(lastContext);
  }
  // doctor/tutorialの表示が最後まで進んだ時に呼ぶ完了処理。
  // 今表示していたのがメインの列(STORY_STEPS)のものかSIDE_STEPSのものかで分岐する
  function finishActiveStep(){
    if (activeStepIsSide){
      markSideStepDone(activeStep.id);
      activePopupOpen = false;
      check(lastContext);
    } else {
      advance();
    }
  }

  // ── 博士の吹き出し ──
  const doctorOv   = byId('story-doctor-overlay');
  const doctorText = byId('story-doctor-text');
  const doctorBubbleEl = byId('story-doctor-bubble');
  const doctorPortraitEl = byId('story-doctor-portrait');
  const doctorPortraitSpacer = byId('story-doctor-portrait-spacer');
  const doctorImgEl = byId('story-doctor-img');
  let doctorEntering = false; // 登場演出の2秒待ち中はタップで進めないようにするフラグ

  // 博士の立ち絵：目以外は共通のため、笑顔違いの2種類を切り替えられるようにしている。
  // pages配列の要素は今まで単なる文字列だったが、笑顔を使いたいページだけ
  // { text:'…', portrait:'hakase_2' } という形（オブジェクト）で指定できるようにした。
  // 何も指定しなければ従来通りデフォルト（hakase＝真顔）になる
  const DOCTOR_DEFAULT_PORTRAIT = 'hakase';
  function applyDoctorPortrait(portraitId){
    if (!doctorImgEl) return;
    doctorImgEl.src = `assets/story/${portraitId || DOCTOR_DEFAULT_PORTRAIT}.webp`;
  }

  // 博士の姿（#story-doctor-portrait）は、ボイルキャンバスより上に出すため独立要素にしている。
  // レイアウト上の位置は#story-doctor-portrait-spacer（overlay内の透明な確保枠）に
  // ぴったり重なるよう、都度座標を synchronize する
  const DOCTOR_SAFE_MARGIN = 14; // 吹き出しを伸ばしても、これより画面端に近づけない
  const BUBBLE_BASE_PADDING_LEFT = 40; // CSSの元のpadding-left（30px）より少し右にテキストをずらす

  function syncDoctorPortraitPosition(){
    if (!doctorPortraitEl || !doctorPortraitSpacer || !doctorBubbleEl) return;

    // まず吹き出し側の拡張スタイルを一旦リセットして「自然な位置」を測り直す
    // （リサイズのたびに前回の拡張量が残ったまま計算すると、ズレが蓄積するため）
    doctorBubbleEl.style.marginLeft = '';
    doctorBubbleEl.style.width = '';
    doctorBubbleEl.style.paddingLeft = '';
    void doctorBubbleEl.offsetWidth; // 強制リフロー

    const spacerRect = doctorPortraitSpacer.getBoundingClientRect();
    doctorPortraitEl.style.left   = `${spacerRect.left}px`;
    doctorPortraitEl.style.top    = `${spacerRect.top}px`;
    doctorPortraitEl.style.width  = `${spacerRect.width}px`;
    doctorPortraitEl.style.height = `${spacerRect.height}px`;

    // 吹き出しの白背景を博士のエリアまで伸ばす。ただし画面端ギリギリまでは伸ばさない
    // （スマホの狭い画面で左にはみ出さないよう、実測した自然な位置をもとに安全な範囲に収める）
    const naturalRect = doctorBubbleEl.getBoundingClientRect();
    const desiredExtend = Math.max(0, naturalRect.left - spacerRect.left);
    const maxExtend = Math.max(0, naturalRect.left - DOCTOR_SAFE_MARGIN);
    const extend = Math.min(desiredExtend, maxExtend);
    if (extend > 0){
      doctorBubbleEl.style.marginLeft = `-${extend}px`;
      doctorBubbleEl.style.width = `calc(min(330px, 72vw) + ${extend}px)`;
      doctorBubbleEl.style.paddingLeft = `${BUBBLE_BASE_PADDING_LEFT + extend}px`;
    }
  }
  window.addEventListener('resize', () => {
    if (doctorPortraitEl && !doctorPortraitEl.classList.contains('hide')) syncDoctorPortraitPosition();
  });

  function showDoctorStep(step){
    pageIndex = 0;
    renderDoctorPage(step);
    if (doctorOv) doctorOv.classList.remove('hide');
    if (doctorPortraitEl) doctorPortraitEl.classList.remove('hide');
    syncDoctorPortraitPosition();
    // 画面はすぐ暗くする（＝#story-doctor-overlayが覆うことで背後のボタンは
    // タップできなくなる）が、吹き出し・ポートレート自体は2秒待ってから
    // 下からスライドインさせる
    if (doctorBubbleEl) doctorBubbleEl.classList.remove('slide-in');
    if (doctorPortraitEl) doctorPortraitEl.classList.remove('slide-in');
    doctorEntering = true;
    setTimeout(() => {
      doctorEntering = false;
      syncDoctorPortraitPosition(); // 直前でレイアウトが変わっている可能性があるので念のため再計算
      if (doctorBubbleEl) doctorBubbleEl.classList.add('slide-in');
      if (doctorPortraitEl) doctorPortraitEl.classList.add('slide-in');
      if (window.BoilFX && doctorBubbleEl) window.BoilFX.register(doctorBubbleEl);
    }, 1000);
  }
  function renderDoctorPage(step){
    const page = step.pages[pageIndex];
    // pages要素は文字列（従来通り）と、笑顔指定つきのオブジェクト{ text, portrait }の
    // どちらも受け付ける
    const text = (typeof page === 'string') ? page : page.text;
    const portrait = (typeof page === 'string') ? null : page.portrait;
    if (doctorText) doctorText.textContent = fillTemplate(text);
    applyDoctorPortrait(portrait);
  }
  function advanceDoctor(step){
    pageIndex++;
    if (pageIndex >= step.pages.length){
      if (doctorOv) doctorOv.classList.add('hide');
      if (doctorPortraitEl) doctorPortraitEl.classList.add('hide');
      if (doctorBubbleEl) doctorBubbleEl.classList.remove('slide-in');
      if (doctorPortraitEl) doctorPortraitEl.classList.remove('slide-in');
      if (window.BoilFX && doctorBubbleEl) window.BoilFX.unregister(doctorBubbleEl);
      finishActiveStep();
    } else {
      renderDoctorPage(step);
    }
  }
  if (doctorOv){
    doctorOv.addEventListener('click', () => {
      if (doctorEntering) return; // 登場演出中はタップしても進めない
      if (activeStep && activeStep.type === 'doctor') advanceDoctor(activeStep);
    });
  }

  // ── チュートリアルカード ──
  const tutOv    = byId('story-tutorial-overlay');
  const tutCard  = byId('story-tutorial-card');
  const tutTitle = byId('story-tutorial-title');
  const tutText  = byId('story-tutorial-text');
  const tutImageWrap = byId('story-tutorial-image');
  const tutImagePlaceholder = byId('story-tutorial-image-placeholder');
  function showTutorialStep(step){
    pageIndex = 0;
    renderTutorialPage(step);
    // ゲームプレイ中に割り込むタイプのチュートリアル（例：初アイテム獲得時）は、
    // 表示中だけゲームを一時停止する（index.html側に用意したwindow.setGamePausedを使う）
    if (step.pauseGame && typeof window.setGamePaused === 'function') window.setGamePaused(true);
    if (tutOv) tutOv.classList.remove('hide');
    if (window.BoilFX && tutCard) window.BoilFX.register(tutCard);
    // 新しいステップが始まった瞬間だけ「ポヨン」と飛び出す演出を再生する
    // （既存のクラスを一度外して強制的にreflowさせないと、同じクラス名のままでは
    //   アニメーションが再トリガーされないため）
    if (tutCard){
      tutCard.classList.remove('pop-in');
      void tutCard.offsetWidth;
      tutCard.classList.add('pop-in');
    }
  }
  // そのページの推奨画像ファイル名を組み立てる（1ページのみのステップは<id>.webp、
  // 複数ページのステップは<id>_<ページ番号（1始まり）>.webp）。プレースホルダー表示にそのまま使う
  function tutorialImagePath(step, idx){
    const suffix = step.pages.length > 1 ? `_${idx + 1}` : '';
    return `assets/tutorial/${step.id}${suffix}.webp`;
  }
  function renderTutorialPage(step){
    const page = step.pages[pageIndex];
    if (tutTitle) tutTitle.textContent = `${step.titleBase}（${pageIndex + 1}/${step.pages.length}）`;
    if (tutText) tutText.textContent = fillTemplate(page.text);
    if (tutImageWrap && tutImagePlaceholder){
      // noImage:true が付いているページは、画像枠自体を非表示にする（プレースホルダーも出さない）
      if (page.noImage){
        tutImageWrap.classList.add('hide');
        const existingImg = tutImageWrap.querySelector('img');
        if (existingImg) existingImg.remove();
        return;
      }
      tutImageWrap.classList.remove('hide');
      const existingImg = tutImageWrap.querySelector('img');
      if (existingImg) existingImg.remove();
      // 画像パス：page.imageで明示的に指定されていればそちらを優先。
      // 無ければ「assets/tutorial/<id>.webp」（複数ページなら<id>_<ページ番号>.webp）を
      // 自動的に読みに行く（js/shop.js・js/zukan.jsの画像と同じ、置くだけで反映される方式）。
      // 用意前・読み込み中は「Loading...」のみ表示（ファイル名等のヒント文言は出さない）。
      // 404の場合もonerrorで同じ表示のまま据え置かれる（＝読み込み失敗時と読み込み中の見分けはつかない仕様）
      const path = page.image || tutorialImagePath(step, pageIndex);
      tutImagePlaceholder.style.display = '';
      tutImagePlaceholder.textContent = 'Loading...';
      const img = document.createElement('img');
      img.onerror = () => { img.remove(); tutImagePlaceholder.style.display = ''; };
      img.onload  = () => { tutImagePlaceholder.style.display = 'none'; };
      img.src = path;
      tutImageWrap.appendChild(img);
    }
  }
  function advanceTutorial(step){
    pageIndex++;
    if (pageIndex >= step.pages.length){
      if (tutOv) tutOv.classList.add('hide');
      if (window.BoilFX && tutCard) window.BoilFX.unregister(tutCard);
      if (step.pauseGame && typeof window.setGamePaused === 'function') window.setGamePaused(false);
      if (step.effectsAfter) step.effectsAfter();
      finishActiveStep();
    } else {
      renderTutorialPage(step);
    }
  }
  if (tutOv){
    tutOv.addEventListener('click', () => {
      if (activeStep && activeStep.type === 'tutorial') advanceTutorial(activeStep);
    });
  }

  // ── 名前入力ポップ ──
  const nameOv    = byId('story-name-overlay');
  const nameInput = byId('story-name-input');
  const nameSubmitBtn = byId('story-name-submit');
  function showNameInput(){
    if (nameInput) nameInput.value = '';
    if (nameOv) nameOv.classList.remove('hide');
    if (nameInput) setTimeout(() => nameInput.focus(), 50);
  }
  function submitName(){
    const val = (nameInput && nameInput.value.trim()) || '助手';
    if (!saveData.profile || typeof saveData.profile !== 'object') saveData.profile = {};
    saveData.profile.name = val;
    persist();
    if (nameOv) nameOv.classList.add('hide');
    advance();
  }
  if (nameSubmitBtn) nameSubmitBtn.addEventListener('click', submitName);
  if (nameInput) nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); });

  // ── スキル獲得ポップ ──
  const skillOv   = byId('story-skill-grant-overlay');
  const skillList = byId('story-skill-grant-list');
  const skillClaimBtn = byId('story-skill-grant-claim-btn');
  const skillGrantPopupEl = byId('story-skill-grant-popup');
  function showSkillGrant(step){
    if (skillList) skillList.innerHTML = step.skills.map(s => `スキル：${s}`).join('<br>');
    if (skillOv) skillOv.classList.remove('hide');
    if (skillGrantPopupEl){
      skillGrantPopupEl.classList.remove('pop-in');
      void skillGrantPopupEl.offsetWidth;
      skillGrantPopupEl.classList.add('pop-in');
    }
  }
  if (skillClaimBtn){
    skillClaimBtn.addEventListener('click', () => {
      if (skillOv) skillOv.classList.add('hide');
      advance();
    });
  }

  // ── ステップ実行のディスパッチ ──
  function runStep(step, isSide){
    activeStep = step;
    activeStepIsSide = !!isSide;
    activePopupOpen = true;
    if (step.type === 'doctor'){
      // No.017-019「shop_dialogue_1」は、この後の購入チュートリアル(purchase_endless)で
      // エンドレスモード解放(2ページ目)の話をするため、博士が喋り始める前に
      // 先にショップを2ページ目へ移しておく（1ページ目を見ながら喋り出すのを防ぐ）
      if (step.id === 'shop_dialogue_1' && window.ShopUI && typeof window.ShopUI.gotoPage === 'function'){
        window.ShopUI.gotoPage(1);
      }
      return showDoctorStep(step);
    }
    if (step.type === 'tutorial')  return showTutorialStep(step);
    if (step.type === 'name_input') return showNameInput();
    if (step.type === 'skill_grant') return showSkillGrant(step);
    if (step.type === 'purchase_endless'){
      if (window.ShopUI && window.ShopUI.runEndlessDiscountPurchase){
        window.ShopUI.runEndlessDiscountPurchase(() => advance());
      } else {
        advance(); // ショップ側の仕組みが無い場合は素通しして進める
      }
      return;
    }
    activePopupOpen = false;
  }

  let lastContext = null;

  // window.Story.check(context) — 機能の要所から呼ぶ進行チェック。
  // context: 'mode_select' | 'shop' | null（指定なしのステップはどのcontextからでも進む）
  function check(context){
    lastContext = context;
    if (activePopupOpen) return; // 何か表示中なら二重発火させない

    // 特例：クイックプレイのボタン発光は、通常は1度触ったら消える仕様（index.html側）だが、
    // エンドレスモード解禁の条件（クイック3回以上プレイ＆所持EP100以上＝shop_introの条件と同じ）を
    // 満たすまでは、モード選択に戻るたびに再度光らせ直す（＝実質ずっと光り続けるようにする）。
    // 条件を満たした後は、逆に確実に消す（触らずに条件達成した場合の消し忘れ防止）。
    // ※修正：coins>=100は「その時点の所持EP」を毎回見ているだけなので、エンドレス解放後に
    //   ショップで買い物をしてEPが100未満に戻ると、この条件が再びfalseになり永遠に光り続ける
    //   バグがあった。saveData.endlessUnlocked（購入済みなら恒久的にtrue）を優先判定に加えて解消。
    if (context === 'mode_select'){
      const quickBtn = document.getElementById('mode-quick');
      if (quickBtn){
        const welcomeIdx = STORY_STEPS.findIndex(s => s.id === 'welcome_tutorial');
        const pastWelcome = welcomeIdx >= 0 && getProgress().nextIndex > welcomeIdx;
        const endlessUnlockConditionMet =
          !!saveData.endlessUnlocked ||
          (quickPlayCount() >= 3 && (typeof playerProgress !== 'undefined' ? playerProgress.coins : 0) >= 100);
        if (pastWelcome && !endlessUnlockConditionMet){
          quickBtn.classList.add('story-glow');
        } else if (endlessUnlockConditionMet){
          quickBtn.classList.remove('story-glow');
        }
      }
    }

    // まずSIDE_STEPS（メインの列とは独立した「おまけ」の一言）に、条件を満たして
    // まだ見せていないものが無いか確認する。無ければメインの列を通常通りチェックする
    for (const side of SIDE_STEPS){
      if (isSideStepDone(side.id)) continue;
      if (side.context && side.context !== context) continue;
      if (!side.condition()) continue;
      runStep(side, true);
      return;
    }

    const idx = getProgress().nextIndex;
    const step = STORY_STEPS[idx];
    if (!step) return; // 用意されている分は全て終わった
    if (step.context && step.context !== context) return; // 想定の画面から呼ばれるまで待つ
    if (!step.condition()) return; // 条件未達
    runStep(step, false);
  }

  window.Story = { check };

  console.log('[story.js] 初期化完了。');
})();
