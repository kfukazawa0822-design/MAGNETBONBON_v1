// ==========================================================================
// js/explosionSkins.js — 爆発エフェクトのビジュアル・スキンシステム
//
// index.html本体から切り出したファイル。js/marbleSkins.jsと同じ考え方で、
// 「爆発の見た目」に関する描画関数・スキン切り替えの仕組みだけを置く。
//
// 新しいエフェクトを追加する手順：
//   1. drawExplosionSkin_◯◯という名前の描画関数をこのファイルに追加する
//      （引数は (e, progress, alpha) に合わせる。eはexplosions配列の1要素）
//   2. 下のEXPLOSION_SKINSオブジェクトに1行追加する
//   3. index.html側のEXPLOSION_SKIN_DEFSにも対応する項目を追加する
//      （ショップ購入状況との紐付けはそちら側で行う）
//
// 依存関係の注意：js/marbleSkins.js側の注意書きと同様（ctxはindex.html本体のグローバル変数）。
// ==========================================================================

// ── 爆発エフェクトのビジュアル・スキンシステム ──────────────────
// 玉のスキンシステム（MARBLE_SKINS）と同じ考え方。ショップで選べるようにする想定。
let activeExplosionSkin = 'default'; // 現在の標準エフェクト

// 【標準】手描きのウニョウニョした波線が外側へ広がる、既存の爆発エフェクト
function drawExplosionSkin_default(e, progress, alpha){
  const numLines = e.isRock ? 14 : 10;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(20,20,20,1)';
  ctx.lineWidth = 0.9;
  for(let i = 0; i < numLines; i++){
    const baseAngle = (i / numLines) * Math.PI * 2;
    // 各ラインの波打ち位相をずらす
    const phaseOffset = (i / numLines) * Math.PI * 2;
    const innerR = e.r * 0.18;
    const outerR = e.r * (0.55 + progress * 0.45);
    // ウニョウニョのステップ数
    const steps = 18;
    ctx.beginPath();
    for(let s = 0; s <= steps; s++){
      const ratio = s / steps;
      const curR = innerR + (outerR - innerR) * ratio;
      // 音波的な横揺れ：距離に応じて振幅が変化
      const waveFreq = e.isRock ? 4.5 : 3.5;
      const waveAmp = curR * 0.09 * Math.sin(progress * Math.PI); // 中間で最大
      const angle = baseAngle + Math.sin(ratio * Math.PI * waveFreq + phaseOffset + progress * 3) * waveAmp / curR;
      const x = e.x + Math.cos(angle) * curR;
      const y = e.y + Math.sin(angle) * curR;
      s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// 爆発の位置から決定論的な疑似乱数を作る（同じ爆発は毎フレーム同じ見た目になるように）
function explosionSeededRand(seed){
  const x = Math.sin(seed*12.9898)*43758.5453;
  return x - Math.floor(x);
}

// 【爆発エフェクト①候補】花火：カラフルな火花が放射状に飛び散り、少し落下しながら消える
// FB反映：①火花の形を丸→進行方向に伸びた楕円（線に近い形）に変更
// 　　　　②1回の爆発で使う色は2色までに絞り（全体で見た時にカラフルになるように、
// 　　　　　1発1発は色数を抑える）、パーティクルごとに虹色にならないようにした
// 　　　　③パレットから白を削除（他の色に対して浮いて見えるため）
// 　　　　④火花の形状を「中心側は細く、外側に行くほど丸く太くなる」しずく型に変更
// 　　　　　（添付リファレンスの、外側が丸く膨らんだ火花の粒を参考に、根元→先端の
// 　　　　　テーパーの向きを逆転。全長(innerR〜到達距離)は変えず、丸い頭の分だけ
// 　　　　　軸を内側に詰めて、頭の先端がちょうど元の到達距離に一致するようにしている）
function drawExplosionSkin_fireworks(e, progress, alpha){
  const baseSeed = e.x*0.31 + e.y*0.71 + (e.isRock?500:0);
  const n = e.isRock ? 26 : 20;
  const palette = ['#FF3B3B','#FFD23B','#3BFFF0','#FF3BE0','#5CFF3B','#3B7BFF'];
  // この爆発1回だけで使う色を2色選ぶ（爆発ごとに固定。玉ごとではなく発生位置から決定論的に決める）
  const colorIdxA = Math.floor(explosionSeededRand(baseSeed*1.7 + 0.11) * palette.length);
  let colorIdxB = Math.floor(explosionSeededRand(baseSeed*2.9 + 0.37) * palette.length);
  if(colorIdxB === colorIdxA) colorIdxB = (colorIdxB+1) % palette.length;
  const colorA = palette[colorIdxA];
  const colorB = palette[colorIdxB];

  const t = progress;
  ctx.save();

  // 中心の閃光（弾けた瞬間だけ）
  if(t < 0.3){
    ctx.globalAlpha = alpha*(1-t/0.3);
    const flashR = e.r*0.55;
    const grad = ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,flashR);
    grad.addColorStop(0,'rgba(255,255,255,0.9)');
    grad.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(e.x,e.y,flashR,0,Math.PI*2); ctx.fill();
  }

  const innerR = e.maxR * 0.15; // 出発地点：中心から少し離す（例：半径200pxなら30px相当）
  for(let i=0;i<n;i++){
    const s1 = explosionSeededRand(baseSeed + i*3.17);
    const s2 = explosionSeededRand(baseSeed + i*7.91);
    const angle = s1*Math.PI*2;
    // 終了地点は必ず爆発範囲(e.maxR)まで届くようにする（速度差はイーズの掛かり方だけに反映）
    const easeSpeed = 2.2 + s2*1.6; // 個体差：伸びていく速さの違い（到達距離は変えない）
    const easedT = 1 - Math.pow(1-Math.min(1,t), easeSpeed);
    const dist = innerR + (e.maxR - innerR) * easedT;
    const gravityDrop = t*t*e.maxR*0.12; // 直線から大きく逸れないよう、落下の影響は控えめに
    const rootX = e.x + Math.cos(angle)*innerR;
    const rootY = e.y + Math.sin(angle)*innerR;
    const x = e.x + Math.cos(angle)*dist;
    const y = e.y + Math.sin(angle)*dist + gravityDrop;
    const baseSize = Math.max(0.8, (2.4-t*1.7) * (e.r/34));
    const color = (i%2===0) ? colorA : colorB;

    // 火花を「出発地点(innerR)から到達地点(e.maxRまで)へ伸びるしずく型」として描く
    // （中心側の根元は細く、外側の先端に行くほど丸く太くなる）
    // ※輪郭を明示的な点列で計算し、両サイド＋先端の丸い頭を1つのpolygonとして塗る
    //   （ctx.arcの回転方向指定に頼ると先端が正しく塗られない場合があったため、
    //   　外向き角度(angOut)に実際に近いほうの向きを毎回計算で選ぶ方式にしている）
    const dx = x - rootX, dy = y - rootY;
    const lineLen = Math.hypot(dx, dy);
    if(lineLen < 0.5) continue;
    const ux = dx/lineLen, uy = dy/lineLen; // 進行方向の単位ベクトル
    const px = -uy, py = ux; // 進行方向に垂直な単位ベクトル
    const rootWidth = baseSize*0.12; // 根元(中心側)の太さ：細く
    const tipWidth  = baseSize*0.58; // 先端(外側)の丸い頭の半径：太く

    // 丸い頭の分だけ軸を内側に詰め、頭の先端がちょうど元の到達距離(dist)に一致するようにする
    const bellyLen = Math.max(rootWidth, lineLen - tipWidth);
    const tipCx = rootX + ux*bellyLen, tipCy = rootY + uy*bellyLen;

    // 両サイドの縁：根元(s=0, 幅rootWidth)→先端の丸い頭の縁(s=1, 幅tipWidth)まで、
    // 幅を滑らかに増やしながら点列を作る（s^1.6でカーブの終盤に膨らみが集中するようにしている）
    const TAPER_STEPS = 6;
    const leftPts = [], rightPts = [];
    for (let k = 0; k <= TAPER_STEPS; k++){
      const s = k / TAPER_STEPS;
      const w = rootWidth + (tipWidth - rootWidth) * Math.pow(s, 1.6);
      const cx = rootX + ux * (bellyLen * s), cy = rootY + uy * (bellyLen * s);
      leftPts.push({ x: cx + px*w, y: cy + py*w });
      rightPts.push({ x: cx - px*w, y: cy - py*w });
    }

    // 先端の丸い頭：左の縁から右の縁まで、外向き(angOut)を通る側の半円を点列で作る
    const angOut = Math.atan2(uy, ux);
    const angLeft = Math.atan2(leftPts[TAPER_STEPS].y - tipCy, leftPts[TAPER_STEPS].x - tipCx);
    const angDiff = (a, b) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
    const sweepDir = Math.abs(angDiff(angLeft + Math.PI/2, angOut)) < Math.abs(angDiff(angLeft - Math.PI/2, angOut)) ? 1 : -1;
    const CAP_STEPS = 8;
    const capPts = [];
    for (let k = 0; k <= CAP_STEPS; k++){
      const a = angLeft + sweepDir * (k/CAP_STEPS) * Math.PI;
      capPts.push({ x: tipCx + Math.cos(a)*tipWidth, y: tipCy + Math.sin(a)*tipWidth });
    }

    ctx.globalAlpha = Math.max(0, alpha*(1-t*0.6));
    ctx.beginPath();
    ctx.moveTo(leftPts[0].x, leftPts[0].y);
    for (let k = 1; k <= TAPER_STEPS; k++) ctx.lineTo(leftPts[k].x, leftPts[k].y);
    for (let k = 1; k < capPts.length; k++) ctx.lineTo(capPts[k].x, capPts[k].y);
    for (let k = TAPER_STEPS; k >= 0; k--) ctx.lineTo(rightPts[k].x, rightPts[k].y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

// 【限定エフェクト候補】ネオンドット破片：ドット(四角)が四方に飛び散る、ネオンカラーの破片エフェクト
// （explosion_effect.htmlのdoDeathBurst構成＝白いリング衝撃波＋放射状の破片、を踏襲。
// 　円ではなく四角にし、爆発範囲(e.maxR)に合わせて大きくスケールしている）
function drawExplosionSkin_neonDebris(e, progress, alpha){
  const baseSeed = e.x*0.53 + e.y*0.19 + (e.isRock?700:0);
  // FB反映：16bit風のドット感を出すため、粒の数を増やして小さくした
  const n = e.isRock ? 42 : 34;
  const neonPalette = ['#00F0FF','#FF00E5','#39FF14','#FFEA00','#FF6D00','#B026FF'];
  const t = progress;
  ctx.save();

  // 白いリング（衝撃波）
  const ringT = Math.min(1, t/0.4);
  ctx.globalAlpha = alpha*(1-ringT);
  ctx.beginPath();
  ctx.arc(e.x,e.y, e.maxR*0.3*(1+ringT*2.3), 0, Math.PI*2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, 3*(1-ringT));
  ctx.stroke();

  // ドットのグリッド単位（この倍数に座標を丸めて、カクカクしたピクセル移動にする）
  const pixelUnit = Math.max(2, e.maxR*0.02);

  for(let i=0;i<n;i++){
    const s1 = explosionSeededRand(baseSeed + i*2.31);
    const s2 = explosionSeededRand(baseSeed + i*5.13);
    const s3 = explosionSeededRand(baseSeed + i*8.77);
    const angle = s1*Math.PI*2;
    const speed = (0.7+s2*0.8) * e.maxR * 1.3;
    const dist = speed*t;
    const gravityDrop = t*t*e.maxR*0.5;
    let x = e.x + Math.cos(angle)*dist;
    let y = e.y + Math.sin(angle)*dist + gravityDrop;
    // FB反映：座標をピクセル単位にスナップして、レトロなドット移動感を出す
    x = Math.round(x/pixelUnit)*pixelUnit;
    y = Math.round(y/pixelUnit)*pixelUnit;
    // FB反映：粒を大幅に小さくする（以前は最大9px程度→今回は最大4px程度）
    let sz = Math.max(1.5, (1.8-t*1.2) * (e.r/34) * 3.0); // 前回より大きく、元のサイズよりは小さい"中間"サイズ
    sz = Math.max(pixelUnit, Math.round(sz/pixelUnit)*pixelUnit); // サイズもグリッド単位に揃える
    const color = neonPalette[Math.floor(s3*neonPalette.length)];

    // FB反映：発光(shadow)を削除。不透明度を常に100%にして、ドット同士が重なっても
    // 透けて色が混ざり合う（カラーフィルムが重なったような）見え方をしないようにした
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillRect(x-sz/2, y-sz/2, sz, sz);
  }
  ctx.restore();
}

// 【爆発エフェクト②】インク飛び散り（トレース版）：白黒2色のみ
// ※ユーザーが用意した実際のインクブロット画像をOpenCVで輪郭抽出し、
// 　その形をそのまま爆発エフェクトとして採用した（手続き生成ではなく実データ）。
// 　IoU(重なり具合)95.6%で元画像を再現したパス・水滴データをそのまま使用。
// 　爆発ごとにランダムな回転を加えることで、同じ絵を使い回しても不自然に
// 　見えないようにしている（拡大縮小は爆発の範囲(e.maxR)に自動で追従する）。

// 輪郭パスの頂点（元画像587x590ピクセル座標系のまま、141点）
const INK_BLOT_PATH_POINTS = [[445,134],[431,134],[421,138],[408,148],[387,179],[377,190],[377,194],[366,212],[359,219],[350,223],[345,223],[329,212],[324,203],[325,198],[323,196],[321,174],[312,166],[302,167],[292,176],[285,200],[278,211],[266,222],[260,223],[251,213],[245,194],[239,184],[228,182],[221,185],[216,197],[216,206],[225,219],[226,231],[211,235],[197,223],[189,222],[183,226],[180,234],[184,242],[195,249],[199,266],[191,277],[172,282],[168,285],[165,301],[171,320],[164,329],[155,333],[128,332],[119,335],[85,326],[62,327],[51,336],[47,349],[51,358],[59,363],[68,364],[88,361],[93,358],[114,358],[127,355],[162,354],[177,366],[178,372],[175,378],[165,388],[159,401],[162,407],[175,408],[183,415],[182,422],[184,428],[178,441],[163,460],[154,467],[149,477],[147,497],[151,504],[154,506],[165,505],[174,499],[187,486],[199,461],[211,448],[222,441],[236,441],[242,447],[243,457],[241,460],[243,472],[254,480],[264,478],[271,471],[274,474],[286,474],[297,479],[306,475],[311,450],[322,443],[337,451],[347,462],[353,509],[365,535],[379,544],[385,543],[388,540],[391,530],[388,524],[389,518],[385,505],[382,503],[374,486],[371,475],[356,457],[353,448],[354,438],[370,424],[399,423],[407,418],[403,398],[404,388],[420,370],[421,366],[418,356],[421,329],[413,307],[423,294],[448,277],[453,268],[449,264],[435,263],[432,266],[425,266],[414,273],[391,272],[380,263],[376,255],[376,245],[391,222],[437,177],[450,147],[449,139]];

// 離れた水滴（元画像座標系）：[x, y, 半径]
const INK_BLOT_DOTS = [
  [311.7,89.7,30.2],
  [78.5,240.3,21.3],
  [275.7,562.7,13.1],
  [178.0,169.5,12.3],
  [302.5,25.0,11.1],
  [488.6,417.0,10.2],
  [512.0,329.0,9.0],
  [229.0,552.3,8.0],
  [354.9,119.8,7.2],
  [471.8,229.0,3.3]
];

// 元画像上でのシルエットの中心・基準半径（スケーリングの基準に使う）
const INK_BLOT_CENTER = { x: 284.0, y: 295.0 };
const INK_BLOT_REF_RADIUS = 281.0;

function drawExplosionSkin_mangaBurst(e, progress, alpha){
  const baseSeed = e.x*0.41 + e.y*0.59 + (e.isRock?900:0);
  const t = progress;
  ctx.save();

  // 演出：インパクトフラッシュ（弾けた瞬間、1〜2フレームだけ白く光らせる）
  if(t < 0.06){
    ctx.globalAlpha = alpha * (1 - t/0.06);
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.maxR*0.95, 0, Math.PI*2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // 演出：出現時に少しオーバーシュートしてから落ち着く（弾力のあるポップ感）
  const growT = Math.min(1, t/0.2);
  const overshoot = 1 + Math.sin(growT*Math.PI) * 0.1 * (1-growT);
  const curR = e.maxR * growT * overshoot;
  const scaleFactor = curR / INK_BLOT_REF_RADIUS;

  // 色：共通alphaに頼らない独自の不透明度。フェード開始までは完全な黒(opacity=1.0)を維持
  const fadeStart = 0.45; // ※フェードアウトの時間を長くするため、開始タイミングを前倒しした
  const shapeOpacity = t < fadeStart ? 1.0 : Math.max(0, 1 - (t-fadeStart)/(1-fadeStart));
  ctx.globalAlpha = shapeOpacity;
  ctx.fillStyle = '#000000';

  // 爆発ごとにランダムな回転を加える（同じ絵の使い回し感を無くすため）
  const rot = explosionSeededRand(baseSeed + 500) * Math.PI*2;

  ctx.translate(e.x, e.y);
  ctx.rotate(rot);
  ctx.scale(scaleFactor, scaleFactor);
  ctx.translate(-INK_BLOT_CENTER.x, -INK_BLOT_CENTER.y);

  // 本体（トレースした輪郭パス）
  ctx.beginPath();
  for(let i=0; i<INK_BLOT_PATH_POINTS.length; i++){
    const p = INK_BLOT_PATH_POINTS[i];
    i===0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.fill();

  // 離れた水滴
  for(let i=0; i<INK_BLOT_DOTS.length; i++){
    const d = INK_BLOT_DOTS[i];
    ctx.beginPath();
    ctx.arc(d[0], d[1], d[2], 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

// id → 描画関数。爆発エフェクト②・その他の限定エフェクトのデザインができ次第、ここに追加していく
// （未追加のidが選択された場合はdrawExplosionSkin_defaultにフォールバックする）
const EXPLOSION_SKINS = {
  default: drawExplosionSkin_default,
  fireworks: drawExplosionSkin_fireworks,
  neonDebris: drawExplosionSkin_neonDebris,
  mangaBurst: drawExplosionSkin_mangaBurst,
};

// 爆発SE（効果音）は js/sound_se.js に移設した（Web Audio APIでの簡易合成音から、
// 本物の音声ファイルを再生する方式に変更）。triggerExplosion()からは変わらず
// playExplosionSE(skinId) を呼び出すだけでよい（グローバル関数名はそのまま維持している）。
