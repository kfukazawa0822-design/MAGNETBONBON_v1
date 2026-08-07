// ==========================================================================
// js/marbleSkins.js — 玉のビジュアル・スキンシステム
//
// index.html本体から切り出したファイル。ここには「玉の見た目」に関する
// 描画関数・スキン切り替えの仕組みだけを置く（ゲームロジック本体はindex.html側）。
//
// 新しいスキンを追加する手順：
//   1. drawMarbleSkin_◯◯という名前の描画関数をこのファイルに追加する
//      （引数は (m, t, pulse, ringColor, lineW, hsl) に合わせる）
//   2. 下のMARBLE_SKINSオブジェクトに1行追加する
//   3. index.html側のMARBLE_SKIN_DEFSにも対応する項目を追加する
//      （ショップ購入状況との紐付けはそちら側で行う）
//
// 依存関係の注意：
//   ctx（キャンバスの2D コンテキスト）はindex.html本体で
//   let ctx = canvas.getContext('2d'); として定義されているグローバル変数。
//   このファイルはindex.html本体より後に読み込まれる前提（読み込み順は
//   index.html側の<script src="js/marbleSkins.js"></script>の位置を参照）。
//   ただし実際にctxが使われるのはdrawMarbles()から呼ばれた時（ゲーム開始後）
//   なので、定義の読み込み順自体はさほど厳密でなくても動作する。
// ==========================================================================

// ── 玉のビジュアル・スキンシステム ──────────────────
// 将来ショップで選べるようにする想定。activeMarbleSkinの値を切り替えると見た目が変わる。
let activeMarbleSkin = 'inkHalftone'; // 現在の標準スキン

// ctxを一時的にオフスクリーンcanvasのコンテキストに差し替えて描画するヘルパー
// （スプライト事前生成のために、既存の描画コードをそのまま使い回せるようにする）
function withOffscreenCtx(targetCtx, fn){
  const prev = ctx;
  ctx = targetCtx;
  try { fn(); } finally { ctx = prev; }
}

// 繊細磁晶核スキンの見た目（脈動しない部分＝色づきグラデーション・リング・装飾・ハイライト）を
// 玉ごとに一度だけオフスクリーンcanvasへ焼き込む。以後は draw のたびに毎フレーム再計算せず、
// drawImageで貼るだけにして負荷を大きく下げる（連鎖で玉が増えるとカクつく問題への対策）。
function buildFragileGlassSprites(m, ringColor, lineW, hsl){
  const PAD = 1.5; // スパイクのヒゲ等がはみ出さないよう余白を持たせる
  const half = m.r * PAD;
  const size = Math.max(2, Math.ceil(half*2));
  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.width = size; bodyCanvas.height = size;

  withOffscreenCtx(bodyCanvas.getContext('2d'), () => {
    ctx.translate(half, half);

    if(hsl){
      const grad = ctx.createRadialGradient(0,0,0, 0,0, m.r);
      grad.addColorStop(0,    `hsla(${hsl.h},${hsl.s}%,${hsl.l}%,0)`);
      grad.addColorStop(0.55, `hsla(${hsl.h},${hsl.s}%,${hsl.l}%,0.04)`);
      grad.addColorStop(1,    `hsla(${hsl.h},${hsl.s}%,${hsl.l}%,0.16)`);
      ctx.beginPath(); ctx.arc(0,0,m.r,0,Math.PI*2);
      ctx.fillStyle = grad; ctx.fill();
    }

    for(let ri=0; ri<m.fineRingLoopsA.length; ri++){
      const isOuter = ri === m.fineRingLoopsA.length-1;
      ctx.strokeStyle = ringColor;
      ctx.globalAlpha = isOuter ? 0.55 : 0.4;
      ctx.lineWidth = isOuter ? lineW*0.7 : lineW*0.45;
      pathSmoothBlob(m.fineRingLoopsA[ri]); ctx.stroke();
      pathSmoothBlob(m.fineRingLoopsB[ri]); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if(m.marbleType === 'boost'){
      // 跳躍磁晶核：後方に流れるスピード線（見るからに速そうな見た目）
      ctx.strokeStyle='rgba(255,140,40,0.65)'; ctx.lineWidth=0.6;
      for(let si=0;si<3;si++){
        const yOff=(si-1)*m.r*0.34;
        ctx.beginPath();
        ctx.moveTo(-m.r*0.92, yOff); ctx.lineTo(-m.r*0.32, yOff);
        ctx.stroke();
      }
    } else if(m.marbleType === 'homing'){
      // 追尾磁晶核：中心の照準マーク（狙いを定める意思を表現）
      ctx.strokeStyle='rgba(255,60,120,0.6)'; ctx.lineWidth=0.6;
      ctx.beginPath();
      ctx.arc(0,0,m.r*0.32,0,Math.PI*2);
      ctx.moveTo(-m.r*0.48,0); ctx.lineTo(-m.r*0.32,0);
      ctx.moveTo(m.r*0.32,0);  ctx.lineTo(m.r*0.48,0);
      ctx.moveTo(0,-m.r*0.48); ctx.lineTo(0,-m.r*0.32);
      ctx.moveTo(0,m.r*0.32);  ctx.lineTo(0,m.r*0.48);
      ctx.stroke();
    } else if(m.marbleType === 'sOnly'){
      // S磁晶核：S極では動かせず、N極で通常よりずっと強く弾かれることを手描き文字で明示
      ctx.strokeStyle='rgba(255,90,60,0.75)'; ctx.lineWidth=0.8;
      ctx.font=`bold ${Math.round(m.r*0.5)}px Courier New`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.strokeText('S', 0, 0.5);
    } else if(m.marbleType === 'nOnly'){
      // N磁晶核：N極では動かせず、S極では通常よりずっと遠くから引き寄せられることを手描き文字で明示
      ctx.strokeStyle='rgba(60,120,255,0.75)'; ctx.lineWidth=0.8;
      ctx.font=`bold ${Math.round(m.r*0.5)}px Courier New`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.strokeText('N', 0, 0.5);
    } else if(m.marbleType === 'delay'){
      // 遅延磁晶核：導火線マーク（明滅・膨張収縮の動的演出は毎フレーム側＝drawMarbleSkin_fragileGlassで行う）
      ctx.strokeStyle='rgba(190,40,40,0.8)'; ctx.lineWidth=0.8;
      ctx.beginPath();
      ctx.moveTo(0,-m.r*0.3); ctx.quadraticCurveTo(m.r*0.26,-m.r*0.56, m.r*0.1,-m.r*0.78);
      ctx.stroke();
    } else if(m.marbleType === 'gravity'){
      ctx.strokeStyle='rgba(160,80,255,0.55)'; ctx.lineWidth=0.55;
      ctx.beginPath();
      for(let si=0;si<=16;si++){
        const a=si/16*Math.PI*2.2;
        const rr=m.r*0.04+m.r*0.14*(si/16);
        const px=Math.cos(a)*rr, py=Math.sin(a)*rr;
        si===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
      }
      ctx.stroke();
    }

    const ha = m.highlightAngle;
    const hx = Math.cos(ha)*m.r*0.4, hy = Math.sin(ha)*m.r*0.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = m.r*0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx - m.r*0.16, hy - m.r*0.1);
    ctx.lineTo(hx + m.r*0.05, hy + m.r*0.05);
    ctx.stroke();
  });

  // コア（点描）は脈動で拡大縮小させたいので、本体とは別の小さなスプライトに分離
  const coreHalf = m.coreSpriteHalf;
  const coreCanvas = document.createElement('canvas');
  coreCanvas.width = Math.max(2, Math.ceil(coreHalf*2));
  coreCanvas.height = coreCanvas.width;
  withOffscreenCtx(coreCanvas.getContext('2d'), () => {
    ctx.translate(coreHalf, coreHalf);
    for(const d of m.coreStipple){
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(30,26,20,${d.a})`;
      ctx.fill();
    }
  });

  m._glassBody = bodyCanvas; m._glassBodyHalf = half;
  m._glassCore = coreCanvas; m._glassCoreHalf = coreHalf;
  m._glassSkinBuilt = true;
}

// 【標準】繊細で壊れそうな磁晶核：線を細く・揺らぎをごくわずかにし、光の反射と気泡で「ガラス感」を出す
// 見た目自体は初回にスプライトへ焼き込み、毎フレームはdrawImageのみ（脈動する芯だけ別スプライトで拡縮）
function drawMarbleSkin_fragileGlass(m, t, pulse, ringColor, lineW, hsl){
  if(!m._glassSkinBuilt){
    buildFragileGlassSprites(m, ringColor, lineW, hsl);
  }

  // 遅延磁晶核：残り時間が少ないほど「膨張と収縮」が大きく速くなり、赤い発光が強まる（爆ぜる予感を演出）
  let bombScale = 1;
  if(m.marbleType === 'delay' && m.fuseTimer !== null && m.fuseTimer !== undefined){
    const urgency = 1 - Math.min(1, Math.max(0, m.fuseTimer / 7)); // 0(開始)→1(爆発直前)
    const beatSpeed = 3 + urgency * 14;   // 明滅・拍動の速さ
    const beatAmp   = 0.05 + urgency * 0.22; // 拍動の振れ幅
    bombScale = 1 + Math.sin(t * beatSpeed) * beatAmp;
    if(urgency > 0.15){
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.beginPath();
      ctx.arc(0, 0, m._glassBodyHalf * bombScale * 1.15, 0, Math.PI*2);
      ctx.fillStyle = `rgba(220,30,20,${(urgency-0.15)*0.5*(0.6+Math.sin(t*beatSpeed)*0.4)})`;
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(m.x, m.y);
  if(bombScale !== 1) ctx.scale(bombScale, bombScale);
  ctx.drawImage(m._glassBody, -m._glassBodyHalf, -m._glassBodyHalf);
  const cs = m._glassCoreHalf * 2 * pulse;
  ctx.drawImage(m._glassCore, -cs/2, -cs/2, cs, cs);
  ctx.restore();
}

// 【ショップスキン①】手描き落書き風：太い線と大きな揺らぎのラフなスケッチ（没案だが気に入ったため保存）
function drawMarbleSkin_sketchScribble(m, t, pulse, ringColor, lineW){
  ctx.save();
  ctx.translate(m.x, m.y);

  // ── 手描きの同心円リング（本数で玉の価値を表現） ──
  for(let ri=0; ri<m.ringLoops.length; ri++){
    pathSmoothBlob(m.ringLoops[ri]);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = ri === m.ringLoops.length-1 ? lineW*1.15 : lineW*0.8; // 一番外側を心持ち太く
    ctx.stroke();
  }

  // ── 種類別の手描き装飾（機能を伝えるアレンジ） ──
  if(m.marbleType === 'boost'){
    // 跳躍磁晶核：後方に流れるスピード線
    ctx.strokeStyle='rgba(255,140,40,0.75)'; ctx.lineWidth=1.0;
    for(let si=0;si<3;si++){
      const yOff=(si-1)*m.r*0.34;
      ctx.beginPath(); ctx.moveTo(-m.r*0.95, yOff); ctx.lineTo(-m.r*0.3, yOff); ctx.stroke();
    }
  } else if(m.marbleType === 'homing'){
    // 追尾磁晶核：照準マーク
    ctx.strokeStyle='rgba(255,60,120,0.75)'; ctx.lineWidth=1.0;
    ctx.beginPath();
    ctx.arc(0,0,m.r*0.32,0,Math.PI*2);
    ctx.moveTo(-m.r*0.5,0); ctx.lineTo(-m.r*0.32,0);
    ctx.moveTo(m.r*0.32,0); ctx.lineTo(m.r*0.5,0);
    ctx.moveTo(0,-m.r*0.5); ctx.lineTo(0,-m.r*0.32);
    ctx.moveTo(0,m.r*0.32); ctx.lineTo(0,m.r*0.5);
    ctx.stroke();
  } else if(m.marbleType === 'sOnly'){
    ctx.strokeStyle='rgba(255,90,60,0.85)'; ctx.lineWidth=1.1;
    ctx.font=`bold ${Math.round(m.r*0.55)}px Courier New`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeText('S', 0, 0.5);
  } else if(m.marbleType === 'nOnly'){
    ctx.strokeStyle='rgba(60,120,255,0.85)'; ctx.lineWidth=1.1;
    ctx.font=`bold ${Math.round(m.r*0.55)}px Courier New`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.strokeText('N', 0, 0.5);
  } else if(m.marbleType === 'delay'){
    // 遅延磁晶核：手描きの導火線
    ctx.strokeStyle='rgba(190,40,40,0.85)'; ctx.lineWidth=1.0;
    ctx.beginPath();
    ctx.moveTo(0,-m.r*0.3); ctx.quadraticCurveTo(m.r*0.3,-m.r*0.6, m.r*0.12,-m.r*0.85);
    ctx.stroke();
  } else if(m.marbleType === 'gravity'){
    // 重力磁晶核：中心に小さな渦の書き込み
    ctx.strokeStyle='rgba(160,80,255,0.7)'; ctx.lineWidth=0.9;
    ctx.beginPath();
    for(let si=0;si<=18;si++){
      const a = si/18*Math.PI*2.4;
      const rr = m.r*0.05 + m.r*0.16*(si/18);
      const px=Math.cos(a)*rr, py=Math.sin(a)*rr;
      si===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
    }
    ctx.stroke();
  }

  // ── 芯の点（インク色・脈動） ──
  ctx.beginPath();
  ctx.arc(0, 0, m.r*0.24*pulse, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(20,18,15,0.92)';
  ctx.fill();

  ctx.restore();
}

// ── 【新デザイン】うごメモ風×砂鉄風：太い一発描きリング＋网点ハーフトーンコア＋星ハイライト ──
// 色は既存の玉タイプ別hsl（drawMarbles側で決定）をそのまま使うので、種類ごとに固定色になる
function inkRand(min,max){ return min+Math.random()*(max-min); }

function drawInkBoldRing(R,unit,hsl){
  const segs=40, seed=inkRand(0,10), jitter=0.4*unit;
  ctx.beginPath();
  for(let i=0;i<=segs;i++){
    const angle=(i/segs)*Math.PI*2;
    const j=Math.sin(angle*3+seed)*jitter*0.6+Math.sin(angle*7+seed*1.6)*jitter*0.4;
    const rr=R+j;
    const x=Math.cos(angle)*rr, y=Math.sin(angle)*rr;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.closePath();
  ctx.strokeStyle=`hsla(${hsl.h},${hsl.s}%,${Math.max(hsl.l-8,6)}%,0.95)`;
  ctx.lineWidth=Math.max(unit*3.6,1.6);
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.stroke();
}

function drawInkDust(R,coreR,hsl,shadowAngle,spacing,maxDotR){
  ctx.save();
  ctx.beginPath(); ctx.arc(0,0,R*0.93,0,Math.PI*2); ctx.clip();
  for(let y=-R;y<=R;y+=spacing){
    for(let x=-R;x<=R;x+=spacing){
      const jx=x+inkRand(-spacing*0.4,spacing*0.4), jy=y+inkRand(-spacing*0.4,spacing*0.4);
      const dist=Math.sqrt(jx*jx+jy*jy);
      if(dist>R*0.92||dist<coreR*1.08) continue;
      const dirAngle=Math.atan2(jy,jx);
      const diff=Math.abs(((dirAngle-shadowAngle+Math.PI*3)%(Math.PI*2))-Math.PI);
      const weight=1-Math.min(diff/Math.PI,1);
      const density=weight*0.65+0.18;
      if(Math.random()>density) continue;
      const dotR=Math.max(maxDotR*inkRand(0.55,1.0),0.35);
      ctx.beginPath(); ctx.arc(jx,jy,dotR,0,Math.PI*2);
      ctx.fillStyle=`hsla(${hsl.h},${hsl.s}%,${Math.max(hsl.l-18+Math.random()*8,4)}%,${0.4+density*0.4})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawInkHalftone(R,hsl,shadowAngle,spacing,maxDotR,edgeBias){
  ctx.save();
  ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.clip();
  for(let y=-R;y<=R;y+=spacing){
    for(let x=-R;x<=R;x+=spacing){
      const jx=x+inkRand(-spacing*0.3,spacing*0.3), jy=y+inkRand(-spacing*0.3,spacing*0.3);
      const dist=Math.sqrt(jx*jx+jy*jy);
      if(dist>R) continue;
      const dirAngle=Math.atan2(jy,jx);
      const diff=Math.abs(((dirAngle-shadowAngle+Math.PI*3)%(Math.PI*2))-Math.PI);
      const weight=1-Math.min(diff/Math.PI,1);
      const edge=edgeBias*(dist/R);
      const density=Math.max(0,weight*(1-edgeBias)+edge-0.08);
      if(density<=0.02) continue;
      const dotR=Math.max(maxDotR*Math.min(density*1.15,1)*inkRand(0.8,1.1),0.4);
      ctx.beginPath(); ctx.arc(jx,jy,dotR,0,Math.PI*2);
      ctx.fillStyle=`hsla(${hsl.h},${hsl.s}%,${Math.max(hsl.l-16+Math.random()*8,4)}%,${0.55+density*0.4})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawInkOuterDots(R,unit,hsl,count){
  for(let i=0;i<count;i++){
    const angle=Math.random()*Math.PI*2, rr=R+inkRand(3,11)*unit;
    const x=Math.cos(angle)*rr, y=Math.sin(angle)*rr;
    ctx.beginPath(); ctx.arc(x,y,Math.max(unit*inkRand(0.5,1.2),0.6),0,Math.PI*2);
    ctx.fillStyle=`hsla(${hsl.h},${hsl.s}%,${Math.min(hsl.l+10,55)}%,${inkRand(0.6,0.95)})`;
    ctx.fill();
  }
}

function drawInkStar(x,y,size,color,alpha){
  ctx.save(); ctx.translate(x,y);
  const pts=[[0,-1],[0.16,-0.16],[1,0],[0.16,0.16],[0,1],[-0.16,0.16],[-1,0],[-0.16,-0.16]];
  ctx.beginPath();
  pts.forEach(([px,py],i)=>{ const x2=px*size, y2=py*size; i===0?ctx.moveTo(x2,y2):ctx.lineTo(x2,y2); });
  ctx.closePath();
  ctx.globalAlpha=alpha; ctx.fillStyle=color; ctx.fill();
  ctx.restore();
}
function drawInkSparkleHighlight(coreR,unit,ha,rich){
  const bx=Math.cos(ha)*coreR*0.5-coreR*0.18, by=Math.sin(ha)*coreR*0.5-coreR*0.22;
  drawInkStar(bx,by,rich?3.6*unit:2.0*unit,'rgba(255,255,255,0.95)',1);
  if(rich){
    ctx.beginPath(); ctx.arc(bx+2.8*unit,by+1.6*unit,1.1*unit,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.75)'; ctx.fill();
    drawInkStar(bx-2.6*unit,by+2.4*unit,1.4*unit,'rgba(255,255,255,0.85)',1);
  }
}

function drawInkBurstLines(R,hsl,count,rotationOffset,twinkle){
  for(let i=0;i<count;i++){
    const a=(i/count)*Math.PI*2+rotationOffset+inkRand(-0.04,0.04);
    const len=R*inkRand(0.5,1.0)*(0.8+twinkle*0.4);
    const rStart=R*1.18;
    const x1=Math.cos(a)*rStart, y1=Math.sin(a)*rStart;
    const x2=Math.cos(a)*(rStart+len), y2=Math.sin(a)*(rStart+len);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
    ctx.strokeStyle=`hsla(${hsl.h},${hsl.s}%,${Math.min(hsl.l+20,80)}%,${inkRand(0.4,0.7)})`;
    ctx.lineWidth=inkRand(0.9,1.8);
    ctx.stroke();
  }
}

function drawInkTypeIcon(type,R){
  const icon={
    boost:()=>{ctx.strokeStyle='rgba(255,150,40,0.9)';ctx.lineWidth=1.6;for(let si=0;si<3;si++){const y=(si-1)*R*0.34;ctx.beginPath();ctx.moveTo(-R*1.35,y);ctx.lineTo(-R*0.45,y);ctx.stroke();}},
    homing:()=>{ctx.strokeStyle='rgba(255,70,130,0.9)';ctx.lineWidth=1.6;ctx.beginPath();
      ctx.arc(0,0,R*0.32,0,Math.PI*2);
      ctx.moveTo(-R*0.48,0);ctx.lineTo(-R*0.32,0);
      ctx.moveTo(R*0.32,0);ctx.lineTo(R*0.48,0);
      ctx.moveTo(0,-R*0.48);ctx.lineTo(0,-R*0.32);
      ctx.moveTo(0,R*0.32);ctx.lineTo(0,R*0.48);
      ctx.stroke();},
    sOnly:()=>{ctx.strokeStyle='rgba(26,26,26,0.9)';ctx.lineWidth=1.8;ctx.font=`bold ${Math.round(R*0.55)}px "Segoe UI",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeText('S',0,1);},
    nOnly:()=>{ctx.strokeStyle='rgba(26,26,26,0.9)';ctx.lineWidth=1.8;ctx.font=`bold ${Math.round(R*0.55)}px "Segoe UI",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeText('N',0,1);},
    delay:()=>{ctx.strokeStyle='rgba(210,50,50,0.95)';ctx.lineWidth=1.6;ctx.beginPath();
      ctx.moveTo(0,-R*0.3); ctx.quadraticCurveTo(R*0.26,-R*0.56,R*0.1,-R*0.78); ctx.stroke();},
    gravity:()=>{ctx.strokeStyle='rgba(26,26,26,0.85)';ctx.lineWidth=1.3;ctx.beginPath();
      for(let si=0;si<=16;si++){
        const a=si/16*Math.PI*2.2, rr2=R*0.04+R*0.16*(si/16);
        const px=Math.cos(a)*rr2, py=Math.sin(a)*rr2;
        si===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
      }
      ctx.stroke();}
  }[type];
  if(icon) icon();
}

// 玉ごとに個別にスプライトを作るのをやめて、あらかじめ少数パターンだけ作っておき、
// 各玉はそこから使い回す方式（重い網点走査が「玉が湧くたび」ではなく「ゲーム起動時に1回だけ」になる）
const INK_VARIANTS_PER_COLOR = 1; // 色（種類）ごとに用意する見た目バリエーション数
const INK_TYPE_HSL = {
  normal:{h:0,s:0,l:27}, boost:{h:41,s:100,l:52}, gravity:{h:259,s:75,l:55}, homing:{h:176,s:75,l:54},
  delay:{h:282,s:52,l:35}, sOnly:{h:11,s:100,l:61}, nOnly:{h:220,s:100,l:67},
  red:{h:341,s:83,l:42}, gold:{h:44,s:52,l:58},
};
const INK_SIZE_MULT = {normal:1.0,boost:0.85,gravity:1.1,homing:1.05,delay:1.15,sOnly:1.0,nOnly:1.0,red:1.2,gold:1.3};
let inkSpritePool = null; // { marbleType: [variant, ...] }

function buildInkSpriteVariant(marbleType, hsl){
  const r = MARBLE_R * (INK_SIZE_MULT[marbleType]||1.0);
  const unit=r/32;
  const coreR=r*0.56;
  const special=(marbleType==='red'||marbleType==='gold');
  const highlightAngle=Math.random()*Math.PI*2;
  const shadowAngle=highlightAngle+Math.PI;
  const half=r*(special?1.9:1.55);
  const size=Math.max(2,Math.ceil(half*2));
  const bodyCanvas=document.createElement('canvas');
  bodyCanvas.width=size; bodyCanvas.height=size;
  withOffscreenCtx(bodyCanvas.getContext('2d'), () => {
    ctx.translate(half,half);
    drawInkBoldRing(r,unit,hsl);
    drawInkDust(r,coreR,hsl,shadowAngle,unit*2.6,unit*0.9);
    if(special) drawInkOuterDots(r,unit,hsl,14);
    drawInkTypeIcon(marbleType,r);
  });
  const ch=coreR*1.4;
  const coreCanvas=document.createElement('canvas');
  coreCanvas.width=Math.max(2,Math.ceil(ch*2)); coreCanvas.height=coreCanvas.width;
  withOffscreenCtx(coreCanvas.getContext('2d'), () => {
    ctx.translate(ch,ch);
    drawInkHalftone(coreR,hsl,shadowAngle,unit*1.8,unit*1.3,0.22);
  });
  return { body:bodyCanvas, bodyHalf:half, core:coreCanvas, coreHalf:ch, coreR, unit, special, highlightAngle };
}

function buildInkSpritePool(){
  if(inkSpritePool) return; // 一度作ったら二度と作り直さない
  inkSpritePool = {};
  for(const type of ['normal','boost','gravity','homing','delay','sOnly','nOnly','red','gold']){
    inkSpritePool[type] = Array.from({length:INK_VARIANTS_PER_COLOR}, () => buildInkSpriteVariant(type, INK_TYPE_HSL[type]));
  }
}
buildInkSpritePool(); // ページ読み込み時に1回だけ構築（プレイ中の玉湧きタイミングで作らせない）

function drawMarbleSkin_inkHalftone(m,t,pulse,ringColor,lineW,hsl){
  if(!inkSpritePool) buildInkSpritePool();
  if(!m._inkSprite){
    const variants = inkSpritePool[m.marbleType] || inkSpritePool['normal'];
    m._inkSprite = variants[Math.floor(Math.random()*variants.length)];
  }
  const s = m._inkSprite;

  // 遅延磁晶核：残り時間が少ないほど「膨張と収縮」が大きく速くなり、赤い発光が強まる（爆ぜる予感を演出）
  let bombScale = 1;
  if(m.marbleType === 'delay' && m.fuseTimer !== null && m.fuseTimer !== undefined){
    const urgency = 1 - Math.min(1, Math.max(0, m.fuseTimer / 7)); // 0(開始)→1(爆発直前)
    const beatSpeed = 3 + urgency * 14;      // 明滅・拍動の速さ
    const beatAmp   = 0.05 + urgency * 0.22; // 拍動の振れ幅
    bombScale = 1 + Math.sin(t * beatSpeed) * beatAmp;
    if(urgency > 0.15){
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.beginPath();
      ctx.arc(0, 0, s.bodyHalf * bombScale * 1.15, 0, Math.PI*2);
      ctx.fillStyle = `rgba(220,30,20,${(urgency-0.15)*0.5*(0.6+Math.sin(t*beatSpeed)*0.4)})`;
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(m.x,m.y);
  if(bombScale !== 1) ctx.scale(bombScale, bombScale);
  if(s.special){
    const twinkle=0.5+0.5*Math.sin(t*2.2+m.phase);
    drawInkBurstLines(m.r,hsl,16,t*0.2,twinkle);
  }
  // 追尾磁晶核：常時ゆっくり回転する走査リングで「狙ってる感」を出す（浮遊中から視認できるように）
  if(m.marbleType === 'homing' && !m.detonating){
    ctx.save();
    ctx.rotate(t*0.9 + m.phase);
    ctx.beginPath();
    for(let k=0;k<4;k++){
      const a0 = k*(Math.PI/2), a1 = a0 + Math.PI*0.28;
      ctx.moveTo(Math.cos(a0)*m.r*1.35, Math.sin(a0)*m.r*1.35);
      ctx.arc(0,0,m.r*1.35,a0,a1);
    }
    ctx.strokeStyle = 'rgba(255,70,130,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
  // 追尾磁晶核：起爆猶予中、曲がっていく方向にロックオン線を伸ばす（残り時間が少ないほど濃く）
  if(m.marbleType === 'homing' && m.detonating){
    const spd = Math.hypot(m.vx, m.vy);
    if(spd > 0.05){
      const urgency = 1 - Math.min(1, Math.max(0, m.detonateTimer / (m.detonateTime||1.5)));
      const ang = Math.atan2(m.vy, m.vx);
      const lineLen = m.r*(2.2+urgency*1.8);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang)*m.r*1.2, Math.sin(ang)*m.r*1.2);
      ctx.lineTo(Math.cos(ang)*lineLen, Math.sin(ang)*lineLen);
      ctx.strokeStyle = `rgba(255,70,130,${0.35+urgency*0.5})`;
      ctx.lineWidth = 1.2+urgency*1.2;
      ctx.stroke();
    }
  }
  ctx.drawImage(s.body,-s.bodyHalf,-s.bodyHalf);
  const cs=s.coreHalf*2*pulse;
  ctx.drawImage(s.core,-cs/2,-cs/2,cs,cs);
  drawInkSparkleHighlight(s.coreR,s.unit,s.highlightAngle,s.special);
  ctx.restore();
}

// 各果物のSVGマークアップ（ユーザー提供のIllustrator書き出しデータをそのまま使用。
// アートボードは共通で 547.29 x 651.38、玉本体の中心・半径は FRUIT_SKIN_LOCAL 側で管理）
const FRUIT_SKIN_SVG = {
  grape: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 547.29 651.38"><g xmlns="http://www.w3.org/2000/svg">
    <circle cx="273.65" cy="322.19" r="200.8" fill="#8848ed" stroke="#000" stroke-miterlimit="10" stroke-width="10" />
    <ellipse cx="199.3" cy="429.4" rx="54.27" ry="28.94" transform="translate(-202.48 179.05) rotate(-33.17)" fill="#fff" opacity=".5" />
    <circle cx="297.89" cy="283.53" r="113.07" fill="#e7f97d" />
    <ellipse cx="303.49" cy="273.44" rx="11.38" ry="55.36" transform="translate(-50.76 70.02) rotate(-12.15)" fill="#c4dd31" />
    <path d="M273.69,290.67c-.99,12.53-8.07,22.2-15.82,21.59-7.75-.61-13.24-11.26-12.25-23.79s9.32-38.09,17.07-37.48,11.99,27.16,11,39.69Z" fill="#8e6d42" />
    <path d="M338.69,276.67c6.06,11.02,16.49,16.91,23.3,13.16,6.81-3.75,7.43-15.71,1.37-26.73-6.06-11.02-24.17-30.88-30.98-27.13s.25,29.68,6.31,40.7Z" fill="#8e6d42" />
  </g>
  </svg>`,
  lemon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 547.29 651.38"><g xmlns="http://www.w3.org/2000/svg">
    <circle cx="273.65" cy="322.19" r="200.8" fill="#fbe14a" stroke="#000" stroke-miterlimit="10" stroke-width="10" />
    <circle cx="190.98" cy="422.16" r="23.34" fill="#e8c72a" />
    <circle cx="158.78" cy="369.7" r="15.74" fill="#e8c72a" />
    <circle cx="297.89" cy="283.53" r="113.07" fill="#fbe14a" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="16" />
    <circle cx="304.84" cy="278.96" r="25.54" fill="#fff6c2" />
    <line x1="283.65" y1="170.87" x2="326.13" y2="390.03" fill="none" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="10" />
    <line x1="397.39" y1="342.92" x2="212.39" y2="217.98" fill="none" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="10" />
    <line x1="414.47" y1="259.22" x2="195.31" y2="301.69" fill="none" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="10" />
    <line x1="367.36" y1="187.95" x2="242.42" y2="372.95" fill="none" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="10" />
  </g>
  </svg>`,
  kiwi: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 547.29 651.38"><g xmlns="http://www.w3.org/2000/svg">
    <circle cx="273.65" cy="322.19" r="200.8" fill="#a9743a" stroke="#000" stroke-miterlimit="10" stroke-width="10" />
    <circle cx="192.43" cy="422.16" r="23.34" fill="#7a5327" />
    <circle cx="160.23" cy="369.7" r="15.74" fill="#7a5327" />
    <circle cx="297.89" cy="283.53" r="113.07" fill="#b6e33d" />
    <circle cx="300.91" cy="279.22" r="34.19" fill="#f5f0d9" />
    <circle cx="290.18" cy="227.01" r="7.78" />
    <circle cx="316.13" cy="329.54" r="7.78" />
    <circle cx="340.5" cy="241.29" r="7.78" />
    <circle cx="264.8" cy="314.65" r="7.78" />
    <circle cx="354.71" cy="289.23" r="7.78" />
    <circle cx="250.81" cy="266.74" r="7.78" />
  </g>
  </svg>`,
  orange: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 547.29 651.38"><g xmlns="http://www.w3.org/2000/svg">
    <circle cx="273.65" cy="322.19" r="200.8" fill="#ff9d1f" stroke="#000" stroke-miterlimit="10" stroke-width="10" />
    <circle cx="182.3" cy="422.16" r="23.34" fill="#e8850a" />
    <circle cx="150.1" cy="369.7" r="15.74" fill="#e8850a" />
    <circle cx="298.82" cy="283.57" r="113.07" fill="#ff9d1f" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="16" />
    <circle cx="298.97" cy="273.87" r="25.54" fill="#fff6c2" />
    <line x1="267.54" y1="168.31" x2="330.77" y2="382.4" fill="none" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="10" />
    <line x1="397.21" y1="328.69" x2="201.11" y2="222.02" fill="none" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="10" />
    <line x1="406.2" y1="243.74" x2="192.11" y2="306.97" fill="none" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="10" />
    <line x1="352.49" y1="177.31" x2="245.82" y2="373.41" fill="none" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="10" />
  </g>
  </svg>`,
  cherry: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 547.29 651.38"><g xmlns="http://www.w3.org/2000/svg">
    <circle cx="273.65" cy="353.69" r="200.8" fill="#d2263f" stroke="#000" stroke-miterlimit="10" stroke-width="10" />
    <ellipse cx="199.3" cy="460.9" rx="54.27" ry="28.94" transform="translate(-219.71 184.18) rotate(-33.17)" fill="#fff" opacity=".5" />
    <circle cx="297.89" cy="315.03" r="113.07" fill="#ffbe71" />
    <circle cx="303.02" cy="314.72" r="40.7" fill="#8a5a34" />
    <path d="M291.84,80.82c-22.24,15.91-35.72,40.57-39.35,67.5-4.08,30.21,4.41,60.28,18.11,87.04,6.16,12.03,24.29,1.42,18.13-10.6-11.39-22.25-18.76-47.56-15.72-72.74,2.46-20.34,12.51-40.96,29.42-53.06,4.61-3.29,6.82-9.15,3.77-14.37-2.66-4.55-9.73-7.08-14.37-3.77h0Z" fill="#63af00" />
  </g>
  </svg>`,
  red_apple: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 547.29 651.38"><g xmlns="http://www.w3.org/2000/svg">
    <circle cx="273.65" cy="340.54" r="200.8" fill="#e8342a" stroke="#000" stroke-miterlimit="10" stroke-width="10" />
    <ellipse cx="199.3" cy="447.75" rx="54.27" ry="28.94" transform="translate(-212.52 182.04) rotate(-33.17)" fill="#fff" opacity=".5" />
    <circle cx="297.89" cy="301.88" r="113.07" fill="#fff3d6" />
    <path d="M270.96,296.72c-6.15-10.97-16.63-16.77-23.41-12.97-6.78,3.8-7.3,15.77-1.15,26.74s24.42,30.68,31.2,26.88c6.78-3.8-.49-29.68-6.64-40.65Z" fill="#8e6d42" />
    <path d="M335.84,282.19c.88-12.54,7.89-22.26,15.64-21.72,7.76.55,13.33,11.15,12.45,23.69-.88,12.54-9.01,38.16-16.76,37.62s-12.21-27.06-11.33-39.6Z" fill="#8e6d42" />
    <g>
      <path d="M295.49,167.63c-5.19,5.86-10.51,11.5-17.42,15.01-15.21,7.65-33.19,5.59-49.49,3.1-28.59-4.62-47.43-10.07-63.72-35.41-6.3-9.57-13.46-20.44-18.3-30.43-5.26-11.36.9-15.31,11.61-16.08,42.54-1.49,68.4-3.54,104.46,22.67,17.77,12.54,28.2,22.64,30.61,45.24" fill="#66d60d" />
      <path d="M290.19,162.32c-4.32,4.85-8.74,9.82-14.45,13.05s-12.23,4.61-18.64,4.99c-12.63.75-25.47-1.4-37.82-3.87-9.56-1.92-19.12-4.43-27.57-9.44s-14.97-12.34-20.37-20.52c-3.95-5.99-7.9-11.99-11.58-18.16-1.67-2.79-3.28-5.61-4.8-8.49-1.03-1.96-3.04-4.87-2.81-7.19-.08.81-.29.04.87-.42,1.38-.56,3.01-.76,4.49-.91,6.56-.66,13.32-.54,19.91-.7,21.43-.52,42.62.58,62.13,10.37,11.56,5.8,23.13,13.45,32.5,22.45,8.03,7.71,12.42,17.16,13.7,28.23.47,4.02,3.11,7.5,7.5,7.5,3.69,0,7.97-3.45,7.5-7.5-1.5-12.9-5.43-24.49-13.95-34.46-8.52-9.98-20.44-18.01-31.6-24.71-23.34-14-48.73-17.46-75.52-16.92-7.37.15-14.82.18-22.16.75-5.65.44-12.02,1.67-16.14,5.92-10.67,10.99,1.63,27.59,7.8,37.54,7.33,11.81,14.73,24.44,25.55,33.44,9.21,7.66,19.97,12.58,31.52,15.62,15.43,4.07,32.37,7,48.34,6.58,8.88-.23,17.67-1.85,25.75-5.62s14.56-10.27,20.47-16.91c6.4-7.19-4.17-17.84-10.61-10.61h0Z" fill="#007f0c" />
    </g>
  </g>
  </svg>`,
  green_apple: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 547.29 651.38"><g xmlns="http://www.w3.org/2000/svg">
    <circle cx="273.65" cy="340.54" r="200.8" fill="#7ed321" stroke="#000" stroke-miterlimit="10" stroke-width="10" />
    <ellipse cx="199.3" cy="447.75" rx="54.27" ry="28.94" transform="translate(-212.52 182.04) rotate(-33.17)" fill="#fff" opacity=".5" />
    <circle cx="297.89" cy="301.88" r="113.07" fill="#fff3d6" />
    <path d="M271.2,295.58c-5.68-11.22-15.9-17.46-22.84-13.95-6.94,3.51-7.96,15.45-2.29,26.67,5.68,11.22,23.1,31.69,30.04,28.18,6.94-3.51.76-29.67-4.91-40.89Z" fill="#8e6d42" />
    <path d="M336.64,283.82c1.41-12.49,8.82-21.91,16.55-21.03,7.73.87,12.84,11.71,11.43,24.2s-10.61,37.75-18.34,36.87-11.05-27.55-9.64-40.04Z" fill="#8e6d42" />
    <g>
      <path d="M295.49,167.63c-5.19,5.86-10.51,11.5-17.42,15.01-15.21,7.65-33.19,5.59-49.49,3.1-28.59-4.62-47.43-10.07-63.72-35.41-6.3-9.57-13.46-20.44-18.3-30.43-5.26-11.36.9-15.31,11.61-16.08,42.54-1.49,68.4-3.54,104.46,22.67,17.77,12.54,28.2,22.64,30.61,45.24" fill="#66d60d" />
      <path d="M290.19,162.32c-4.32,4.85-8.74,9.82-14.45,13.05s-12.23,4.61-18.64,4.99c-12.63.75-25.47-1.4-37.82-3.87-9.56-1.92-19.12-4.43-27.57-9.44s-14.97-12.34-20.37-20.52c-3.95-5.99-7.9-11.99-11.58-18.16-1.67-2.79-3.28-5.61-4.8-8.49-1.03-1.96-3.04-4.87-2.81-7.19-.08.81-.29.04.87-.42,1.38-.56,3.01-.76,4.49-.91,6.56-.66,13.32-.54,19.91-.7,21.43-.52,42.62.58,62.13,10.37,11.56,5.8,23.13,13.45,32.5,22.45,8.03,7.71,12.42,17.16,13.7,28.23.47,4.02,3.11,7.5,7.5,7.5,3.69,0,7.97-3.45,7.5-7.5-1.5-12.9-5.43-24.49-13.95-34.46s-20.44-18.01-31.6-24.71c-23.34-14-48.73-17.46-75.52-16.92-7.37.15-14.82.18-22.16.75-5.65.44-12.02,1.67-16.14,5.92-10.67,10.99,1.63,27.59,7.8,37.54,7.33,11.81,14.73,24.44,25.55,33.44,9.21,7.66,19.97,12.58,31.52,15.62,15.43,4.07,32.37,7,48.34,6.58,8.88-.23,17.67-1.85,25.75-5.62,8.17-3.82,14.56-10.27,20.47-16.91,6.4-7.19-4.17-17.84-10.61-10.61h0Z" fill="#007f0c" />
    </g>
  </g>
  </svg>`,
  watermelon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 547.29 651.38"><g xmlns="http://www.w3.org/2000/svg">
    <circle cx="273.65" cy="321.97" r="262.67" fill="#00a02d" stroke="#000" stroke-miterlimit="10" stroke-width="7" />
    <g>
      <path d="M270.67,585.09c1.78-.25,2.73-2.29,2.5-4.11-.25,0-.51,0-.76,0-1,1.14-1.62,2.6-1.74,4.11Z" fill="none" />
      <path d="M234.4,75.2c9.2,6.53,19.06,12.13,29.37,16.7,1.45.64,2.99,1.32,3.92,2.61.9,1.25,1.09,2.87,1.2,4.4.27,3.75.28,7.53.38,11.29,11.91-3.11,24.36-4.89,37.18-5.19,1.55-1.23,3.11-2.45,4.66-3.68,1.19-.94,2.5-2.2,2.22-3.68-.17-.87-.86-1.53-1.53-2.12-10.76-9.38-24.45-14.57-36.68-21.93-2.23-1.34-4.48-2.83-5.84-5.04-1.2-1.95-1.56-4.17-1.54-6.49-14.47.36-28.65,1.93-42.44,4.57,2.35,3.33,5.77,6.19,9.11,8.56Z" />
      <g>
        <path d="M189.19,158.47c-6.68-6.43-10.77-15.75-13.59-23.19l-.13-.34c-1.46-3.85-2.96-7.82-6.07-10.57-3.9-3.44-9.54-4.14-14.07-4.71-10.77-1.34-23.18-3.07-34.65-6.65,30.81-22.75,66.88-38.58,104.38-45.81,2.02,2.78,4.98,5.53,9.04,8.41,9.21,6.54,19.13,12.17,29.46,16.74,1.41.62,2.86,1.27,3.71,2.45.83,1.14,1,2.67,1.1,4.15.2,2.76.25,5.58.31,8.31.02.85.03,1.71.06,2.56-30.7,8.08-58.2,24.89-79.56,48.65Z" fill="#00a02d" />
        <path d="M224.85,67.75c2.05,2.74,4.99,5.45,8.97,8.27,9.24,6.56,19.18,12.21,29.54,16.79,1.35.6,2.74,1.21,3.51,2.28.75,1.04.91,2.49,1.01,3.89.2,2.75.25,5.57.31,8.29.01.72.03,1.44.05,2.17-30.48,8.1-57.78,24.78-79.07,48.31-6.4-6.35-10.35-15.39-13.1-22.65l-.13-.34c-1.48-3.9-3.01-7.94-6.21-10.77-4.01-3.55-9.74-4.26-14.33-4.83-10.45-1.3-22.45-2.97-33.62-6.34,30.49-22.33,66.07-37.89,103.07-45.07M225.29,66.65c-39.04,7.48-74.98,23.69-105.69,46.54,11.45,3.69,23.68,5.48,35.67,6.97,4.89.61,10.11,1.33,13.8,4.59,3.11,2.75,4.59,6.84,6.06,10.71,3.28,8.65,7.45,17.54,14.08,23.73,20.97-23.46,48.66-40.8,80.04-48.98-.1-3.77-.11-7.54-.38-11.29-.11-1.54-.29-3.15-1.2-4.4-.93-1.29-2.46-1.97-3.92-2.61-10.31-4.57-20.17-10.17-29.37-16.7-3.34-2.37-6.76-5.23-9.11-8.56h0Z" />
      </g>
      <g>
        <path d="M385.18,122.65c-22.96-11.9-48.84-18.19-74.85-18.19-.81,0-1.61,0-2.42.02l3.49-2.75c1.29-1.02,2.74-2.42,2.4-4.17-.2-1.02-.98-1.77-1.69-2.4-7.16-6.25-15.73-10.71-24.02-15.02-4.23-2.2-8.6-4.48-12.73-6.96-2.15-1.29-4.36-2.73-5.67-4.87-.96-1.55-1.43-3.39-1.47-5.74,2.06-.05,4.13-.07,6.15-.07,43.59,0,86.64,11.03,124.64,31.93-1.11-.03-2.15-.04-3.16-.04h-.54c-2.25.01-4.6.14-6.44,1.48-2.3,1.69-2.93,4.77-2.74,7.09.17,2.13.9,4.16,1.6,6.12.14.38.27.76.41,1.15,1.08,3.12,1.91,6.35,2.44,9.6.09.52.16,1.11-.09,1.48-.25.37-.81.52-1.37.64-1.18.25-2.47.49-3.94.73Z" fill="#00a02d" />
        <path d="M274.38,62.99c42.83,0,85.13,10.67,122.61,30.89-.38,0-.76,0-1.13,0h-.55c-2.33.01-4.77.14-6.73,1.57-2.07,1.51-3.19,4.4-2.94,7.53.18,2.2.91,4.25,1.63,6.24.14.38.27.76.41,1.14,1.07,3.09,1.89,6.29,2.42,9.52.05.29.15.88-.01,1.12-.16.24-.74.36-1.06.43-1.13.24-2.36.47-3.75.7-22.99-11.89-48.9-18.17-74.93-18.17-.31,0-.63,0-.95,0l.57-.45,1.77-1.4c.83-.65,3.02-2.38,2.58-4.66-.23-1.18-1.08-2-1.85-2.68-7.2-6.28-15.8-10.76-24.12-15.09-4.22-2.2-8.59-4.47-12.7-6.95-2.1-1.26-4.25-2.66-5.5-4.71-.84-1.37-1.29-2.97-1.38-4.99,1.88-.04,3.78-.06,5.64-.06M274.38,61.99c-2.23,0-4.44.03-6.66.08-.02,2.33.35,4.54,1.54,6.49,1.36,2.21,3.62,3.7,5.84,5.04,12.23,7.36,25.92,12.55,36.68,21.93.67.58,1.36,1.24,1.53,2.12.29,1.48-1.03,2.75-2.22,3.68-1.55,1.23-3.11,2.45-4.66,3.68,1.29-.03,2.59-.05,3.89-.05,26.96,0,52.39,6.58,74.77,18.21,1.38-.22,2.76-.47,4.13-.76.63-.13,1.32-.31,1.68-.85.36-.52.28-1.22.17-1.85-.54-3.29-1.37-6.53-2.46-9.68-.81-2.34-1.78-4.67-1.98-7.14-.2-2.47.54-5.18,2.54-6.64,1.72-1.26,4.01-1.37,6.14-1.38.18,0,.36,0,.54,0,1.74,0,3.47.04,5.2.1-37.47-21-80.67-32.99-126.68-32.99h0Z" />
      </g>
      <path d="M115.79,155.26c1.76,1.19,2.68,3.25,3.48,5.22,3.17,7.78,5.93,15.72,8.26,23.79,1,3.45,2.07,7.16,4.91,9.36,4.52,3.51,11.16,1.56,16.6,3.33,4.44,1.44,7.64,5.17,11.28,8.12,7.04-16.94,16.87-32.43,28.91-45.9-6.63-6.19-10.81-15.08-14.08-23.73-1.47-3.88-2.96-7.97-6.06-10.71-3.69-3.26-8.91-3.98-13.8-4.59-11.99-1.49-24.23-3.27-35.67-6.97-17.34,12.91-33.01,27.94-46.64,44.7,11.8-1.2,23.6-2.4,35.4-3.59,2.54-.26,5.32-.46,7.44.97Z" />
      <path d="M508.64,276.47c-5.84-4.09-8.56-11.2-12.34-17.24-.91-1.45-1.96-2.92-3.5-3.66-1.36-.66-2.93-.66-4.45-.66-5.37.02-10.73.03-16.1.05.31,4.09.47,8.23.47,12.4,0,17.61-2.81,34.56-8,50.43,9.73,7.93,20.21,14.81,32.29,17.73,6.66,1.61,14.46,1.66,19.47-3,1.61-1.5,2.96-3.49,5.08-4.08,2.23-.63,4.54.52,6.57,1.65,1.83,1.02,3.65,2.06,5.47,3.11.17-3.88.28-7.79.28-11.72,0-14.18-1.15-28.08-3.34-41.64-.55.06-1.09.13-1.64.18-6.98.66-14.52.46-20.26-3.56Z" />
      <g>
        <path d="M523.31,279.81c-6.07,0-10.77-1.23-14.38-3.76-4.25-2.97-6.88-7.71-9.42-12.28-.89-1.6-1.81-3.25-2.78-4.81-.96-1.53-2.07-3.05-3.71-3.84-1.36-.65-2.89-.71-4.35-.71l-15.95.05c-2.62-33.47-15.32-64.83-36.74-90.77,1.12-.45,2.45-1.18,3.26-2.46.75-1.19,1-2.73.76-4.71-.31-2.55-1.23-4.98-2.12-7.32-.45-1.18-.91-2.4-1.28-3.61-.77-2.5-1.71-7.18.71-10.49,2.18-2.98,6.24-3.87,9.94-4.34.69-.09,1.38-.17,2.07-.24,42.72,39.15,71.34,92.01,80.64,148.9-.37.04-.74.08-1.11.12-2.04.19-3.85.29-5.55.29Z" fill="#00a02d" />
        <path d="M449.15,131.03c21.02,19.3,38.59,41.74,52.23,66.72,13.86,25.39,23.28,52.71,28,81.22-.19.02-.38.04-.57.06-2.02.19-3.82.28-5.5.28-5.96,0-10.57-1.2-14.09-3.67-4.15-2.91-6.64-7.38-9.27-12.12-.89-1.6-1.81-3.26-2.8-4.83-1-1.59-2.16-3.18-3.91-4.03-1.45-.7-3.05-.76-4.56-.76h-.32s-8.04.03-8.04.03l-7.14.02c-2.69-33.18-15.26-64.27-36.4-90.07,1.04-.49,2.14-1.23,2.88-2.39.82-1.29,1.09-2.94.84-5.04-.31-2.61-1.25-5.07-2.15-7.44-.44-1.17-.9-2.38-1.27-3.57-.75-2.41-1.65-6.92.63-10.05,2.06-2.82,6.01-3.68,9.6-4.14.61-.08,1.22-.15,1.84-.22M449.5,129.99c-.77.08-1.54.17-2.31.27-3.82.49-8,1.43-10.28,4.55-2.24,3.06-1.9,7.31-.78,10.94,1.12,3.62,2.93,7.07,3.38,10.84.18,1.5.12,3.11-.69,4.39-.81,1.29-2.2,2-3.67,2.51,20.99,25.18,34.5,56.82,37.12,91.49,5.37-.02,10.73-.03,16.1-.05.1,0,.21,0,.31,0,1.41,0,2.86.05,4.13.66,1.54.74,2.59,2.21,3.5,3.66,3.78,6.04,6.5,13.15,12.34,17.24,4.23,2.96,9.43,3.85,14.67,3.85,1.88,0,3.76-.11,5.6-.29.55-.05,1.09-.12,1.64-.18-9.51-58.97-38.88-111.29-81.05-149.86h0Z" />
      </g>
      <path d="M389.17,96.25c-2,1.46-2.73,4.17-2.54,6.64.2,2.47,1.17,4.8,1.98,7.14,1.1,3.15,1.92,6.39,2.46,9.68.1.63.18,1.32-.17,1.85-.36.53-1.05.71-1.68.85-1.37.29-2.75.54-4.13.76,19.26,10.01,36.27,23.76,50.05,40.3,1.47-.51,2.86-1.22,3.67-2.51.81-1.28.87-2.89.69-4.39-.45-3.77-2.26-7.22-3.38-10.84-1.12-3.62-1.46-7.87.78-10.94,2.27-3.11,6.45-4.05,10.28-4.55.77-.1,1.54-.19,2.31-.27-14.69-13.44-30.94-25.21-48.43-35.01-1.92-.07-3.83-.11-5.75-.1-2.14.01-4.42.12-6.14,1.38Z" />
      <g>
        <path d="M300.81,565.24c-1.5-1.28-2.78-2.47-3.16-4.05-.85-3.48,3.1-6.39,7.08-7.95,8.1-3.17,16.52-5.66,25.05-7.39,2.59-.53,5.44-1.11,7.35-3.05,2.33-2.37,2.55-5.95,2.58-9.41.04-5.4.09-11.51-2.66-16.7-2.96-5.58-8.79-9.18-13.48-12.07l-17.37-10.71c-1.95-1.2-3.63-2.34-4.38-4.08-.74-1.72-.41-3.72.01-5.45,2.46-10.13,9.13-18.66,15.59-26.91.82-1.04,1.63-2.08,2.43-3.12,5.62-7.27,11.58-16,13.38-25.7,24.95-3.51,49.07-12.96,69.81-27.34,1.5,7.2,4.4,14.19,8.43,20.25,8.23,12.4,21.6,21.91,36.66,26.09l.43.12c1.5.41,3.05.84,4.3,1.72,1.71,1.2,2.77,3.19,3.71,4.95l17.25,32.31c-40.35,48.64-96.75,80.8-158.85,90.57l-14.16-12.08Z" fill="#00a02d" />
        <path d="M402.71,402.14c1.55,7,4.42,13.78,8.35,19.69,8.3,12.5,21.76,22.08,36.94,26.3l.43.12c1.53.42,2.97.82,4.15,1.64,1.61,1.13,2.64,3.07,3.55,4.78l8.57,16.06,8.51,15.95c-40.21,48.34-96.32,80.32-158.1,90.1l-13.99-11.93c-1.44-1.23-2.65-2.36-3-3.79-1-4.09,5.47-6.85,6.78-7.36,8.07-3.16,16.47-5.64,24.97-7.36h.07c2.59-.54,5.52-1.14,7.54-3.19,2.46-2.51,2.69-6.19,2.72-9.75.04-5.45.09-11.64-2.72-16.94-3.03-5.7-8.92-9.34-13.66-12.26l-8.68-5.35-8.68-5.35c-1.88-1.16-3.49-2.25-4.18-3.86-.68-1.59-.36-3.49.04-5.14,2.43-10.02,9.07-18.51,15.5-26.72.82-1.04,1.63-2.08,2.44-3.13,5.58-7.23,11.51-15.9,13.41-25.56,24.66-3.53,48.49-12.83,69.06-26.95M403.38,400.46c-20.55,14.39-44.58,24.14-70.58,27.74-1.65,9.44-7.38,18.11-13.35,25.84-7.24,9.37-15.32,18.71-18.11,30.22-.46,1.9-.76,3.97.02,5.77.84,1.96,2.76,3.19,4.57,4.31,5.79,3.57,11.58,7.14,17.37,10.71,5.12,3.16,10.48,6.56,13.3,11.87,2.63,4.96,2.65,10.85,2.61,16.47-.03,3.21-.19,6.77-2.43,9.06-1.82,1.86-4.55,2.4-7.09,2.91-8.57,1.74-16.99,4.22-25.13,7.41-3.84,1.5-8.36,4.52-7.38,8.53.44,1.79,1.92,3.11,3.33,4.31,4.78,4.08,9.56,8.15,14.34,12.23,63.94-10,120.13-43.34,159.6-91.04-.09-.16-.17-.32-.26-.48-5.72-10.71-11.43-21.42-17.15-32.13-1.02-1.9-2.09-3.88-3.86-5.12-1.44-1.01-3.19-1.44-4.88-1.91-14.65-4.07-27.96-13.23-36.38-25.89-4.17-6.28-7.07-13.42-8.51-20.82h0Z" />
      </g>
      <path d="M297.16,561.31c-.98-4.01,3.54-7.03,7.38-8.53,8.14-3.19,16.56-5.67,25.13-7.41,2.55-.52,5.28-1.06,7.09-2.91,2.25-2.29,2.41-5.85,2.43-9.06.04-5.62.03-11.5-2.61-16.47-2.82-5.32-8.18-8.72-13.3-11.87-5.79-3.57-11.58-7.14-17.37-10.71-1.81-1.12-3.73-2.35-4.57-4.31-.77-1.8-.48-3.87-.02-5.77,2.79-11.51,10.88-20.85,18.11-30.22,5.97-7.73,11.7-16.4,13.35-25.84-7.35,1.02-14.84,1.55-22.47,1.55-2.13,0-4.24-.05-6.35-.13-12.65,20.51-30.93,37.33-45.41,56.78-1.33,1.78-2.68,3.74-2.72,5.97-.05,3.04,2.32,5.52,4.63,7.49,14.38,12.27,32.73,19.35,46.53,32.28,1.11,1.04,2.23,2.18,2.68,3.64.73,2.37-.57,4.98-2.49,6.53-1.92,1.56-4.37,2.28-6.74,2.98-15.35,4.47-30.71,8.95-46.06,13.42-1.6.47-3.57,1.49-3.28,3.13.15.86.91,1.46,1.61,1.97,5.37,3.94,10.74,7.89,16.11,11.83,1.67,1.23,3.44,2.57,4.14,4.53.09.26.15.54.19.82.41,0,.81.02,1.21.02,13.76,0,27.26-1.08,40.44-3.14-4.78-4.08-9.56-8.15-14.34-12.23-1.41-1.2-2.89-2.52-3.33-4.31Z" />
      <g>
        <path d="M15.4,319.21c.26-29.7,5.5-58.78,15.59-86.45,9.84-26.98,24.04-52.01,42.22-74.4l35.19-3.57c.86-.09,1.87-.18,2.83-.18,1.84,0,3.2.34,4.28,1.06,1.6,1.08,2.47,2.98,3.3,4.99,3.15,7.73,5.93,15.72,8.24,23.74.99,3.43,2.11,7.32,5.08,9.62,2.82,2.19,6.43,2.35,9.92,2.51,2.31.1,4.7.21,6.83.9,3.2,1.04,5.7,3.27,8.35,5.64.8.72,1.63,1.46,2.48,2.16-7.07,17.13-11.13,35.25-12.06,53.85-12.99-.98-25.39-7.58-33.27-17.72l-.22-.28c-2.14-2.77-4.58-5.9-8.1-5.9h-.22c-2.12.08-3.94,1.37-5.44,2.61-7.45,6.19-12.47,14.75-17.32,23.02-.82,1.4-1.64,2.79-2.46,4.17-5.39,8.99-12.25,18.77-22.37,23.35l-8.6-17.12c-.58-1.16-1.38-2.74-2.85-3.48-.56-.28-1.17-.42-1.8-.42-2.24,0-4.41,1.77-5.83,3.26-10,10.44-16.96,24.03-19.59,38.25l-.05.25c-.69,3.72-1.46,7.89-4.13,10.13Z" fill="#00a02d" />
        <path d="M111.24,155.11c1.73,0,3,.31,4,.98,1.49,1,2.32,2.83,3.11,4.77,3.15,7.72,5.91,15.69,8.23,23.69,1.01,3.5,2.16,7.47,5.25,9.88,2.94,2.29,6.64,2.45,10.21,2.61,2.28.1,4.63.21,6.7.88,3.1,1,5.56,3.21,8.17,5.54.72.64,1.45,1.3,2.21,1.93-6.94,16.93-10.96,34.8-11.93,53.16-12.66-1.1-24.71-7.59-32.4-17.48l-.22-.28c-2.11-2.72-4.72-6.1-8.5-6.1-.08,0-.16,0-.23,0-2.27.08-4.17,1.42-5.74,2.72-7.52,6.25-12.56,14.84-17.43,23.15-.82,1.4-1.63,2.79-2.46,4.17-5.27,8.8-11.96,18.35-21.71,22.95l-8.38-16.68c-.61-1.22-1.45-2.89-3.07-3.7-.63-.32-1.31-.48-2.02-.48-2.42,0-4.7,1.86-6.2,3.41-10.07,10.51-17.07,24.19-19.72,38.5l-.05.25c-.59,3.2-1.25,6.74-3.13,8.99.39-29.22,5.62-57.82,15.55-85.05,9.8-26.86,23.93-51.79,42.01-74.09l13.88-1.41,21.1-2.14c.85-.09,1.84-.18,2.78-.18M111.24,154.11c-.96,0-1.94.09-2.88.18-11.8,1.2-23.6,2.4-35.4,3.59-36.05,44.33-57.76,100.78-58.06,162.3,3.56-2.2,4.4-7.07,5.18-11.26,2.63-14.19,9.48-27.57,19.46-37.99,1.48-1.54,3.5-3.11,5.47-3.11.53,0,1.06.11,1.57.37,1.27.64,1.99,1.99,2.62,3.26,2.94,5.85,5.88,11.69,8.81,17.54,10.29-4.46,17.27-14.13,23.03-23.74,5.76-9.62,11.05-19.9,19.67-27.07,1.49-1.24,3.2-2.42,5.13-2.49.07,0,.13,0,.2,0,3.4,0,5.82,3.28,7.93,5.99,8.13,10.47,20.93,17.1,34.14,17.94.9-19.25,5.16-37.61,12.19-54.54-3.64-2.95-6.84-6.69-11.28-8.12-5.44-1.76-12.08.18-16.6-3.33-2.83-2.2-3.91-5.92-4.91-9.36-2.33-8.07-5.09-16.02-8.26-23.79-.8-1.97-1.72-4.03-3.48-5.22-1.33-.9-2.92-1.15-4.56-1.15h0Z" />
      </g>
      <path d="M483.89,426.6c-2.83-2.88-6.54-4.84-9.12-7.94-4.06-4.89-5.08-12.34-10.5-15.66-2.87-1.76-6.4-1.95-9.58-3.06-7.31-2.56-11.98-9.66-15.36-16.63-1.79-3.7-3.38-7.5-4.76-11.38-9.1,10.81-19.59,20.41-31.19,28.53,1.43,7.4,4.34,14.54,8.51,20.82,8.41,12.66,21.73,21.82,36.38,25.89,1.69.47,3.45.9,4.88,1.91,1.77,1.24,2.84,3.22,3.86,5.12,5.72,10.71,11.43,21.42,17.15,32.13.09.16.17.32.26.48,8.64-10.44,16.46-21.58,23.4-33.3-2.36-5.19-4.72-10.39-7.08-15.58-1.84-4.04-3.73-8.17-6.84-11.33Z" />
      <g>
        <path d="M491.19,437.73c-1.75-3.85-3.73-8.21-6.94-11.48-1.28-1.3-2.74-2.42-4.15-3.51-1.74-1.34-3.54-2.72-4.94-4.41-1.59-1.91-2.73-4.28-3.83-6.58-1.68-3.5-3.42-7.12-6.8-9.19-1.88-1.15-4.04-1.66-6.12-2.14-1.18-.28-2.41-.56-3.55-.96-7.7-2.7-12.29-10.64-15.07-16.38-1.73-3.57-3.29-7.29-4.64-11.06,13.32-15.87,23.36-33.82,29.84-53.39,11.78,9.52,21.65,14.89,31.92,17.37,2.75.67,5.4,1,7.88,1,5.06,0,9.12-1.39,12.06-4.12.42-.39.83-.82,1.23-1.24,1.13-1.19,2.2-2.32,3.64-2.72.38-.11.77-.16,1.18-.16,1.7,0,3.47.91,5.01,1.76,1.74.97,3.47,1.96,5.2,2.95-1.91,41.84-14.08,82.94-35.22,118.95l-6.69-14.71Z" fill="#00a02d" />
        <path d="M465.23,319.48c11.6,9.29,21.37,14.55,31.56,17.02,2.79.68,5.48,1.02,7.99,1.02,5.19,0,9.36-1.43,12.4-4.26.44-.41.85-.84,1.25-1.26,1.08-1.14,2.11-2.22,3.42-2.59.34-.09.68-.14,1.05-.14,1.58,0,3.29.88,4.76,1.7,1.54.86,3.16,1.78,4.93,2.8-1.93,41.33-13.9,81.92-34.65,117.58l-4.32-9.5-1.97-4.33c-1.77-3.89-3.77-8.29-7.04-11.62-1.3-1.33-2.78-2.46-4.21-3.55-1.8-1.38-3.5-2.68-4.86-4.33-1.55-1.87-2.67-4.21-3.76-6.47-1.71-3.57-3.48-7.25-6.98-9.4-1.95-1.19-4.15-1.71-6.27-2.2-1.17-.27-2.38-.56-3.5-.95-7.53-2.63-12.04-10.47-14.79-16.13-1.68-3.47-3.2-7.08-4.53-10.74,13.12-15.68,23.04-33.38,29.52-52.65M464.73,317.79c-6.54,20.04-16.88,38.37-30.16,54.13,1.38,3.87,2.97,7.67,4.76,11.38,3.38,6.97,8.04,14.07,15.36,16.63,3.18,1.11,6.71,1.3,9.58,3.06,5.42,3.32,6.44,10.77,10.5,15.66,2.58,3.11,6.29,5.06,9.12,7.94,3.11,3.17,5,7.29,6.84,11.33,2.36,5.19,4.72,10.39,7.08,15.58,21.04-35.53,33.85-76.5,35.79-120.31-1.81-1.05-3.63-2.09-5.47-3.11-1.63-.91-3.44-1.83-5.25-1.83-.44,0-.88.05-1.32.18-2.12.59-3.47,2.58-5.08,4.08-3.14,2.92-7.36,3.99-11.72,3.99-2.61,0-5.26-.39-7.76-.99-12.08-2.93-22.56-9.8-32.29-17.73h0Z" />
      </g>
      <g>
        <path d="M272.54,580.47l-.19-.19c-.06.06-.12.12-.17.18-56.4-.47-109.82-18.73-154.57-52.81,2.4-.69,4.8-1.42,7.14-2.19.91-.3,1.92-.7,2.34-1.67.45-1.06-.05-2.14-.67-3.15l-13.13-21.53c-3.06-5.02-6.17-11.4-3.01-16.25,1.85-2.84,5.29-4.11,8.66-5.18,9.43-2.98,19.16-5.35,28.9-7.03,2.71-.47,5.48-.9,8.16-1.31,10.47-1.61,21.3-3.28,31.06-7.76,1.38-.64,3.24-1.7,3.4-3.57.12-1.43-.84-2.62-1.79-3.59-2.72-2.78-5.84-5.21-8.85-7.55-3.17-2.46-6.44-5.01-9.22-7.95-4.78-5.06-9.21-13.62-5.95-21.13,1.65-3.81,4.96-6.62,8.49-9.39,8.95-7.05,18.44-13.78,28.2-20,28.03,25.26,64.13,40.05,101.8,41.69-7.4,11.83-16.83,22.63-25.95,33.08-6.43,7.37-13.07,14.99-18.98,22.93-1.4,1.88-2.77,3.92-2.82,6.26-.06,3.3,2.54,5.94,4.8,7.88,6.77,5.78,14.53,10.48,22.03,15.02,8.45,5.12,17.19,10.41,24.48,17.24,1.06.99,2.13,2.07,2.54,3.42.7,2.28-.67,4.65-2.33,6-1.88,1.52-4.37,2.24-6.57,2.88l-46.06,13.42c-2.55.74-3.91,2.12-3.64,3.69.18,1.02.99,1.69,1.8,2.29l16.11,11.83c1.47,1.08,3.29,2.42,3.97,4.3.02.05.03.09.05.14h-.01Z" fill="#00a02d" />
        <path d="M201.26,389.02c27.86,24.99,63.63,39.7,100.97,41.53-7.31,11.51-16.52,22.07-25.44,32.3-6.43,7.38-13.08,15-19.01,22.96-1.45,1.95-2.87,4.06-2.91,6.55-.06,3.51,2.63,6.26,4.98,8.26,6.8,5.81,14.58,10.52,22.1,15.07,8.43,5.11,17.15,10.38,24.4,17.18,1.01.95,2.03,1.98,2.41,3.21.63,2.04-.68,4.26-2.16,5.46-1.8,1.45-4.14,2.13-6.4,2.79l-30.71,8.95-15.35,4.47c-2.82.82-4.31,2.41-3.99,4.26.23,1.3,1.34,2.12,2,2.61l9.87,7.25,6.24,4.59c1.26.93,2.8,2.06,3.56,3.53-28.38-.28-56.23-5.13-82.78-14.41-25.25-8.83-48.9-21.51-70.32-37.69,2.08-.61,4.16-1.25,6.2-1.92.73-.24,2.1-.69,2.64-1.94.62-1.44-.27-2.9-.7-3.61l-8.8-14.42-4.34-7.11c-2.75-4.51-6.06-11.05-3.02-15.72,1.76-2.7,5.11-3.94,8.39-4.97,9.41-2.98,19.11-5.34,28.84-7.02,2.7-.47,5.47-.89,8.16-1.31,10.5-1.62,21.36-3.29,31.19-7.8,1.5-.69,3.51-1.85,3.69-3.98.13-1.63-.9-2.93-1.93-3.98-2.75-2.81-5.88-5.24-8.9-7.6-3.15-2.45-6.41-4.99-9.17-7.9-4.68-4.95-9.02-13.3-5.86-20.59,1.6-3.7,4.86-6.46,8.34-9.2,8.84-6.96,18.2-13.61,27.84-19.77M201.36,387.76c-9.85,6.27-19.39,13.02-28.56,20.24-3.42,2.69-6.91,5.6-8.64,9.59-3.16,7.29.59,15.9,6.05,21.67,5.46,5.78,12.53,9.83,18.08,15.51.87.89,1.75,1.97,1.65,3.2-.13,1.55-1.7,2.51-3.11,3.16-12.2,5.6-25.87,6.75-39.09,9.03-9.8,1.69-19.49,4.05-28.97,7.05-3.38,1.07-6.99,2.41-8.92,5.38-3.28,5.04-.13,11.65,3,16.78,4.38,7.18,8.76,14.35,13.13,21.53.5.82,1.02,1.81.64,2.69-.33.78-1.23,1.13-2.03,1.39-2.68.87-5.37,1.69-8.08,2.46,43.25,33.2,97.25,53.09,155.89,53.52.1-.11.2-.23.3-.33-.11.11-.2.22-.3.33.25,0,.51,0,.76,0-.04-.28-.1-.56-.19-.82-.7-1.96-2.47-3.3-4.14-4.53-5.37-3.94-10.74-7.89-16.11-11.83-.7-.52-1.46-1.11-1.61-1.97-.29-1.64,1.69-2.66,3.28-3.13,15.35-4.47,30.71-8.95,46.06-13.42,2.38-.69,4.82-1.42,6.74-2.98,1.92-1.56,3.22-4.17,2.49-6.53-.45-1.46-1.57-2.6-2.68-3.64-13.8-12.93-32.15-20.01-46.53-32.28-2.31-1.97-4.68-4.45-4.63-7.49.04-2.22,1.39-4.18,2.72-5.97,14.48-19.44,32.76-36.27,45.41-56.78-39.44-1.52-75.27-17.09-102.62-41.86h0Z" />
      </g>
      <g>
        <path d="M72.88,484.21c-27.42-33.91-45.9-74.38-53.5-117.12,2.45.21,4.92.32,7.37.32,2.32,0,4.65-.1,6.95-.28,1.72-.14,3.52-.37,4.98-1.39,1.3-.92,2.1-2.32,2.81-3.56l13-22.86c3.59-6.31,7.66-13.47,14.31-17.49,1.71-1.03,3.35-1.58,4.75-1.58.67,0,1.29.12,1.86.37,1.3.56,2.22,1.69,3.19,2.89.61.75,1.24,1.53,1.99,2.18,1.66,1.44,3.87,2.19,6.4,2.19,1.74,0,3.55-.36,5.23-1.05,3.32-1.36,6.1-3.72,8.78-6l.93-.79c5.88-4.95,12.23-9.44,18.87-13.32,2.02-1.19,4.03-2.27,6.23-2.49.29-.03.57-.04.86-.04,2.57,0,5.15,1.13,7.35,2.2,4.23,2.03,8.38,4.33,12.34,6.83l.48.31c1.92,1.22,3.91,2.48,6.17,3.09.28.08.57.14.85.19,3.74,11.76,8.84,23.11,15.17,33.75h-.02c-17.66,4.4-35.93,8.95-50.76,19.87-2.4,1.77-4.77,3.79-5.86,6.64-2.36,6.16,2.43,12.62,5.6,16.91,3.81,5.15,7.42,10.79,8.01,17.16.1,1.06.14,2.6-.56,3.77-.74,1.24-2.15,1.93-3.65,2.59-7.49,3.27-15.29,5.99-23.19,8.1l-.1.03c-5.89,1.57-12.56,3.34-15.54,8.8-3.47,6.36-.02,13.97,3.82,20.57l8.32,14.31c1.91,3.29,2.24,5.6,1.01,7.08-.98,1.17-2.69,1.44-4.36,1.69-6.9,1.05-13.66,3.13-20.08,6.17Z" fill="#00a02d" />
        <path d="M127.88,304.67c2.47,0,4.98,1.11,7.14,2.15,4.21,2.02,8.34,4.31,12.29,6.81l.48.3c1.96,1.24,3.98,2.52,6.31,3.15.19.05.39.1.6.14,3.68,11.48,8.65,22.57,14.79,32.99-17.51,4.36-35.57,8.94-50.3,19.79-2.46,1.81-4.9,3.9-6.03,6.86-2.46,6.41,2.43,13.01,5.67,17.38,3.77,5.09,7.34,10.66,7.91,16.91.09.99.14,2.42-.49,3.47-.66,1.11-2,1.76-3.42,2.38-7.47,3.26-15.25,5.98-23.12,8.07l-.11.03c-5.99,1.59-12.77,3.4-15.85,9.04-3.59,6.58-.08,14.34,3.83,21.07l2.9,4.98,5.42,9.32c1.79,3.08,2.14,5.21,1.06,6.51-.86,1.03-2.48,1.27-4.05,1.51-6.82,1.04-13.5,3.07-19.87,6.05-27.09-33.61-45.41-73.66-53.03-115.95,2.25.18,4.52.27,6.76.27s4.68-.1,6.99-.29c1.79-.15,3.66-.38,5.22-1.48,1.39-.98,2.22-2.44,2.95-3.73l6-10.55,7-12.32c3.56-6.26,7.6-13.36,14.13-17.31,1.63-.99,3.18-1.51,4.49-1.51.6,0,1.16.11,1.66.33,1.19.51,2.07,1.6,3,2.74.62.77,1.27,1.57,2.05,2.24,1.75,1.51,4.07,2.32,6.72,2.32,1.8,0,3.68-.38,5.42-1.09,3.39-1.39,6.2-3.78,8.91-6.08.31-.26.62-.53.93-.79,5.86-4.94,12.19-9.4,18.8-13.27,1.98-1.16,3.92-2.21,6.03-2.42.26-.03.54-.04.81-.04M127.88,303.67c-.3,0-.6.01-.91.05-2.31.23-4.43,1.38-6.43,2.55-6.68,3.91-13.02,8.39-18.94,13.37-2.99,2.52-5.96,5.22-9.58,6.71-1.58.65-3.32,1.02-5.04,1.02-2.23,0-4.4-.62-6.07-2.07-1.88-1.63-3.02-4.17-5.31-5.15-.66-.28-1.35-.41-2.05-.41-1.72,0-3.49.74-5,1.65-6.59,3.99-10.68,10.98-14.48,17.67-4.33,7.62-8.67,15.24-13,22.86-.72,1.26-1.47,2.57-2.66,3.4-1.35.95-3.08,1.17-4.73,1.3-2.3.19-4.6.28-6.91.28-2.66,0-5.32-.13-7.97-.37,7.76,44.32,26.76,84.76,53.96,118.29,6.41-3.08,13.27-5.23,20.3-6.3,1.69-.26,3.57-.54,4.66-1.86,1.76-2.11.42-5.28-.96-7.65-2.77-4.77-5.55-9.54-8.32-14.31-3.59-6.18-7.24-13.81-3.82-20.08,2.89-5.3,9.5-7.03,15.33-8.58,7.94-2.12,15.73-4.83,23.26-8.12,1.49-.65,3.05-1.4,3.88-2.79.72-1.2.75-2.68.63-4.08-.59-6.46-4.24-12.2-8.1-17.41-3.6-4.86-7.7-10.78-5.54-16.43,1.04-2.71,3.36-4.69,5.69-6.41,14.93-10.99,33.06-15.41,51.25-19.95-6.46-10.76-11.71-22.32-15.56-34.51-.37-.06-.74-.14-1.11-.24-2.36-.64-4.44-2.03-6.51-3.33-4-2.52-8.13-4.81-12.39-6.86-2.39-1.15-4.95-2.25-7.57-2.25h0Z" />
      </g>
      <path d="M33.67,366.63c1.65-.14,3.38-.35,4.73-1.3,1.19-.84,1.94-2.14,2.66-3.4,4.33-7.62,8.67-15.24,13-22.86,3.81-6.7,7.89-13.68,14.48-17.67,2.13-1.29,4.78-2.22,7.06-1.25,2.29.98,3.43,3.52,5.31,5.15,2.96,2.56,7.48,2.54,11.11,1.05s6.58-4.19,9.58-6.71c5.92-4.99,12.26-9.46,18.94-13.37,2.01-1.17,4.12-2.32,6.43-2.55,2.94-.3,5.81.92,8.48,2.2,4.26,2.05,8.4,4.34,12.39,6.86,2.07,1.31,4.15,2.69,6.51,3.33.37.1.74.17,1.11.24-4.88-15.46-7.53-31.91-7.53-48.98,0-2.59.07-5.17.19-7.73-13.21-.85-26.01-7.47-34.14-17.94-2.15-2.77-4.62-6.12-8.12-5.99-1.94.07-3.64,1.25-5.13,2.49-8.62,7.17-13.91,17.45-19.67,27.07-5.76,9.62-12.75,19.28-23.03,23.74-2.94-5.85-5.88-11.69-8.81-17.54-.64-1.27-1.36-2.62-2.62-3.26-2.42-1.22-5.17.78-7.05,2.73-9.98,10.42-16.83,23.8-19.46,37.99-.78,4.19-1.61,9.07-5.18,11.26,0,.44-.02.87-.02,1.3,0,15.36,1.34,30.41,3.91,45.05,4.95.46,9.93.5,14.88.09Z" />
      <path d="M126.63,523.6c.38-.88-.14-1.87-.64-2.69-4.38-7.18-8.76-14.35-13.13-21.53-3.13-5.13-6.28-11.74-3-16.78,1.94-2.97,5.54-4.31,8.92-5.38,9.48-3,19.17-5.36,28.97-7.05,13.22-2.29,26.9-3.44,39.09-9.03,1.41-.65,2.98-1.61,3.11-3.16.1-1.24-.78-2.32-1.65-3.2-5.56-5.68-12.62-9.74-18.08-15.51-5.46-5.78-9.21-14.38-6.05-21.67,1.73-3.99,5.22-6.9,8.64-9.59,9.17-7.22,18.71-13.97,28.56-20.24-11.83-10.71-22.07-23.15-30.34-36.91-18.19,4.53-36.32,8.95-51.25,19.95-2.33,1.72-4.65,3.71-5.69,6.41-2.17,5.65,1.94,11.57,5.54,16.43,3.86,5.21,7.51,10.95,8.1,17.41.13,1.39.09,2.88-.63,4.08-.83,1.39-2.39,2.14-3.88,2.79-7.53,3.29-15.32,6.01-23.26,8.12-5.83,1.55-12.44,3.29-15.33,8.58-3.42,6.27.23,13.91,3.82,20.08,2.77,4.77,5.55,9.54,8.32,14.31,1.38,2.38,2.72,5.54.96,7.65-1.1,1.32-2.97,1.6-4.66,1.86-7.03,1.07-13.89,3.22-20.3,6.3,12.86,15.86,27.56,30.17,43.77,42.61,2.71-.76,5.4-1.58,8.08-2.46.81-.26,1.7-.61,2.03-1.39Z" />
    </g>
    <circle cx="310.77" cy="267.21" r="159.29" fill="#ff3c15" stroke="#fff6c2" stroke-miterlimit="10" stroke-width="16" />
    <path d="M210.15,289.08c1.31,6.07,10.04,9.34,19.5,7.29,9.46-2.04,30.09-11.65,28.77-17.72s-24.07-6.3-33.53-4.26-16.06,8.62-14.75,14.69Z" />
    <path d="M252.64,360.69c5.22,3.37,13.7-.5,18.94-8.63s13.03-29.51,7.81-32.88c-5.22-3.37-21.48,12.56-26.72,20.69-5.24,8.13-5.26,17.45-.04,20.82Z" />
    <path d="M218.89,204.5c3.37-5.22,12.69-5.2,20.82.04s24.06,21.5,20.69,26.72-24.75-2.57-32.88-7.81-12-13.72-8.63-18.94Z" />
    <path d="M417.42,244.29c1.31,6.07-5.29,12.65-14.75,14.69s-32.21,1.81-33.53-4.26c-1.31-6.07,19.32-15.68,28.77-17.72s18.19,1.22,19.5,7.29Z" />
    <path d="M408.29,327.05c-3.37,5.22-12.69,5.2-20.82-.04s-24.06-21.5-20.69-26.72c3.37-5.22,24.75,2.57,32.88,7.81s12,13.72,8.63,18.94Z" />
    <path d="M374.53,170.87c-5.22-3.37-13.7.5-18.94,8.63s-13.03,29.51-7.81,32.88c5.22,3.37,21.48-12.56,26.72-20.69s5.26-17.45.04-20.82Z" />
  </g>
  </svg>`,
  pineapple: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 547.29 651.38"><g xmlns="http://www.w3.org/2000/svg">
    <path d="M269.05,138.25c-.06-4.79-2.61-10.43-3.59-15.75-4.86-25.42-9.23-50.61-8.32-76.72.53-13.69,3.25-27.46,8.72-39.98,3.95-9.57-3.91-5.03-8.49-2.32-20.27,12.24-35.41,32.88-48.43,54.33-5.3,8.83-9.74,9.18-15.89,1.04-9.43-12.08-18.52-24.42-28.1-36.5-11.45-13.9-16.55-5.84-15.99,8.71.23,13.91.49,27.65.7,41.44.1,5.07-.02,12.76-7.08,11.73-2.3-.23-5.21-1.25-7.62-2.13-23.18-8.64-47.12-15.05-70.12-12.36-18.03,2.16-5.75,6.39,2.7,11.92,22.22,14.77,37.43,37.83,50.57,60.36,6.89,11.97,14.11,24.52,19.21,37.27,2.86,7.09,7.09,4.97,13.57,2.22,9.62-4.03,21.48-8.95,31.48-13.13,9.33-3.73,17.99-8.09,27.38-10.51,13.13-3.59,26.96-7.4,40.11-11.01,4.77-1.32,9.1-2.49,12.42-3.42,3.19-.84,6.88-2.4,6.78-5.07v-.11Z" fill="#56af00" />
    <circle cx="273.65" cy="377.73" r="268.65" fill="#d9a441" stroke="#000" stroke-miterlimit="10" stroke-width="10" />
    <circle cx="297.92" cy="328.64" r="159.29" fill="#ffe317" stroke="#ffce00" stroke-miterlimit="10" stroke-width="16" />
    <circle cx="303.84" cy="323.34" r="58.93" fill="#fff6c2" />
    <ellipse cx="196.45" cy="361.54" rx="36.09" ry="5.43" transform="translate(-118.91 97.24) rotate(-21.52)" fill="#fff6c2" />
    <ellipse cx="255.88" cy="423.03" rx="36.09" ry="5.43" transform="translate(-235.64 476.22) rotate(-65.01)" fill="#fff6c2" />
    <ellipse cx="201.44" cy="282.96" rx="5.43" ry="36.09" transform="translate(-140.13 345.99) rotate(-65.01)" fill="#fff6c2" />
    <ellipse cx="398.02" cy="282.08" rx="36.09" ry="5.43" transform="translate(-75.72 165.63) rotate(-21.52)" fill="#fff6c2" />
    <ellipse cx="396.53" cy="367.58" rx="5.43" ry="36.09" transform="translate(-92.73 597.74) rotate(-68.02)" fill="#fff6c2" />
    <ellipse cx="340.74" cy="228.04" rx="36.09" ry="5.43" transform="translate(1.76 458.69) rotate(-68.02)" fill="#fff6c2" />
    <path d="M129.37,446.87c1.17,35.71.83,71.45-1.01,107.13-.4,7.72,11.6,7.7,12,0,1.84-35.68,2.18-71.42,1.01-107.13-.25-7.7-12.25-7.74-12,0h0Z" fill="#b77306" />
    <path d="M164.15,491.49c1.6,2.05,1.17,6.37,1.34,8.74.28,3.96.53,7.93.75,11.89.44,7.93.77,15.87.97,23.82.42,15.89.34,31.78-.16,47.67-.24,7.72,11.76,7.72,12,0,.56-17.87.58-35.75-.02-53.62-.29-8.6-.71-17.2-1.28-25.79-.49-7.57-.28-14.96-5.12-21.19s-13.17,2.46-8.49,8.49h0Z" fill="#b77306" />
    <path d="M95.75,492.99c36.16,10.07,72.9,17.91,110.03,23.48,7.55,1.13,10.81-10.43,3.19-11.57-37.12-5.57-73.86-13.41-110.03-23.48-7.45-2.07-10.63,9.5-3.19,11.57h0Z" fill="#b77306" />
    <path d="M112.34,536.62c36.92,10.09,73.83,20.18,110.75,30.27,7.46,2.04,10.64-9.53,3.19-11.57-36.92-10.09-73.83-20.18-110.75-30.27-7.46-2.04-10.64,9.53-3.19,11.57h0Z" fill="#b77306" />
  </g>
</svg>`,
};

// 各果物の元アートボードにおける「玉本体」の中心・半径（提供SVGの座標系のまま）
const FRUIT_SKIN_LOCAL = {
  grape: { cx:273.65, cy:322.19, r:200.8 },
  lemon: { cx:273.65, cy:322.19, r:200.8 },
  kiwi: { cx:273.65, cy:322.19, r:200.8 },
  orange: { cx:273.65, cy:322.19, r:200.8 },
  cherry: { cx:273.65, cy:353.69, r:200.8 },
  red_apple: { cx:273.65, cy:340.54, r:200.8 },
  green_apple: { cx:273.65, cy:340.54, r:200.8 },
  watermelon: { cx:273.65, cy:321.97, r:262.67 },
  pineapple: { cx:273.65, cy:377.73, r:268.65 },
};
const FRUIT_SKIN_VIEWBOX = { w:547.29, h:651.38 };

// ══════════════════════════════════════════════════════════════════
// 【特別スキン】フルーツ：有料応援パック②に同梱される限定玉スキン。
// MARBLE_SKIN_DEFS(index.html)の id:'special'（saveData.shopPurchases['marble_skin_special']で
// 所持判定）に対応する描画関数で、9種類の玉タイプにそれぞれ果物を割り当てている。
// ユーザー提供のSVGイラストを画像としてそのまま焼き込み、drawImageで貼るだけにしている
// （複雑なベジエパスを手で書き写すとズレが出るため、SVGをdata URIのImageとして
//   一度オフスクリーンcanvasにラスタライズし、以後はそのスプライトを使い回す）。
//
// 玉タイプ → 果物の対応：
//   通常(normal) → ぶどう／boost → レモン／gravity → キウイ／homing → オレンジ／
//   delay → チェリー／sOnly → 赤りんご／nOnly → 青りんご／red → スイカ／gold → パイナップル
//
// 注意：この見た目自体が玉タイプの見分けを兼ねるため、他スキンにある「S」「N」文字や
// 重力磁晶核のぐるぐるマークのような追加装飾はここでは一切描き足していない。
// ══════════════════════════════════════════════════════════════════

const FRUIT_SKIN_TYPE_MAP = {
  normal: 'grape', boost: 'lemon', gravity: 'kiwi', homing: 'orange',
  delay: 'cherry', sOnly: 'red_apple', nOnly: 'green_apple', red: 'watermelon', gold: 'pineapple',
};

const FRUIT_SKIN_REF_R = 150; // スプライトに焼き込む際の基準半径(px)
let fruitSkinSpritePool = {}; // { [fruit名]: {canvas, ox, oy} | null(読み込み中) }

function buildFruitSkinSprite(name){
  if (fruitSkinSpritePool[name] !== undefined) return; // 構築済み or 構築中
  fruitSkinSpritePool[name] = null; // 読み込み中マーク（この間はdrawMarbleSkin_fruit側でフォールバック表示）
  const local = FRUIT_SKIN_LOCAL[name];
  const scale = FRUIT_SKIN_REF_R / local.r;
  const img = new Image();
  img.onload = () => {
    const w = Math.ceil(FRUIT_SKIN_VIEWBOX.w * scale);
    const h = Math.ceil(FRUIT_SKIN_VIEWBOX.h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    // ox,oy＝スプライト内での「玉本体の中心」の位置。描画時にこの点をm.x,m.yへ合わせる
    fruitSkinSpritePool[name] = { canvas, ox: local.cx*scale, oy: local.cy*scale };
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRUIT_SKIN_VIEWBOX.w} ${FRUIT_SKIN_VIEWBOX.h}">${FRUIT_SKIN_SVG[name]}</svg>`
  );
}
for (const name of Object.keys(FRUIT_SKIN_LOCAL)) buildFruitSkinSprite(name); // ページ読み込み時に1回だけ構築（9種類分）

function drawMarbleSkin_fruit(m, t, pulse, ringColor, lineW, hsl){
  const fruitName = FRUIT_SKIN_TYPE_MAP[m.marbleType] || 'grape';
  const sprite = fruitSkinSpritePool[fruitName];

  // 遅延磁晶核：残り時間が少ないほど拍動が大きく速くなる（他スキンと同じ演出）
  let bombScale = 1;
  if (m.marbleType === 'delay' && m.fuseTimer !== null && m.fuseTimer !== undefined){
    const urgency = 1 - Math.min(1, Math.max(0, m.fuseTimer / 7));
    const beatSpeed = 3 + urgency * 14;
    const beatAmp = 0.05 + urgency * 0.22;
    bombScale = 1 + Math.sin(t * beatSpeed) * beatAmp;
    if (urgency > 0.15){
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.beginPath();
      ctx.arc(0, 0, m.r * bombScale * 1.15, 0, Math.PI*2);
      ctx.fillStyle = `rgba(220,30,20,${(urgency-0.15)*0.5*(0.6+Math.sin(t*beatSpeed)*0.4)})`;
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(m.x, m.y);
  if (bombScale !== 1) ctx.scale(bombScale, bombScale);

  if (sprite){
    const drawScale = m.r / FRUIT_SKIN_REF_R;
    ctx.scale(drawScale, drawScale);
    ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy);
  } else {
    // スプライト読み込み中のみ一瞬映るフォールバック（読み込み後は表示されない）
    ctx.beginPath();
    ctx.arc(0, 0, m.r, 0, Math.PI*2);
    ctx.fillStyle = ringColor;
    ctx.fill();
  }
  ctx.restore();

  // 追尾磁晶核：常時ゆっくり回転する走査リング（絵柄はそのまま、他スキンと同じ演出だけ重ねる）
  if (m.marbleType === 'homing' && !m.detonating){
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(t*0.9 + m.phase);
    ctx.beginPath();
    for (let k=0; k<4; k++){
      const a0 = k*(Math.PI/2), a1 = a0 + Math.PI*0.28;
      ctx.moveTo(Math.cos(a0)*m.r*1.35, Math.sin(a0)*m.r*1.35);
      ctx.arc(0,0,m.r*1.35,a0,a1);
    }
    ctx.strokeStyle = 'rgba(255,70,130,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
  if (m.marbleType === 'homing' && m.detonating){
    const spd = Math.hypot(m.vx, m.vy);
    if (spd > 0.05){
      const urgency = 1 - Math.min(1, Math.max(0, m.detonateTimer / (m.detonateTime||1.5)));
      const ang = Math.atan2(m.vy, m.vx);
      const lineLen = m.r*(2.2+urgency*1.8);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang)*m.r*1.2, Math.sin(ang)*m.r*1.2);
      ctx.lineTo(Math.cos(ang)*lineLen, Math.sin(ang)*lineLen);
      ctx.strokeStyle = `rgba(255,70,130,${0.35+urgency*0.5})`;
      ctx.lineWidth = 1.2+urgency*1.2;
      ctx.stroke();
      ctx.restore();
    }
  }
}


const MARBLE_SKINS = {
  inkHalftone:    drawMarbleSkin_inkHalftone,    // 標準スキン（新デザイン）
  fragileGlass:   drawMarbleSkin_fragileGlass,   // 旧標準スキン
  sketchScribble: drawMarbleSkin_sketchScribble, // ショップスキン①候補
  inkSketch2:     drawMarbleSkin_inkSketch2,     // ショップスキン②（marble_types.htmlのモックアップを移植）
  jellyGem:       drawMarbleSkin_jellyGem,       // ショップ玉スキン①（スライム/ジェリー×中央宝石）
  special:        drawMarbleSkin_fruit,          // 特別スキン（有料応援パック②同梱の限定玉スキン＝フルーツ、9種類の玉タイプに対応）
};

// ══════════════════════════════════════════════════════════════════
// 【ショップスキン②】手描きインク風：なぞり直しのある輪郭線＋種類別アクセント
// （marble_types.html のプロトタイプをそのまま移植したもの）
// ══════════════════════════════════════════════════════════════════

// ── 共通：わずかに歪んだ円のパス（コア用） ──
function sk2_wobblyCirclePath(ctx, cx, cy, r, seed, jitterAmt, segments) {
  segments = segments || 28;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const jitter =
      Math.sin(angle * 3 + seed) * jitterAmt * 0.55 +
      Math.sin(angle * 7 + seed * 2.3) * jitterAmt * 0.35;
    const rr = r + jitter;
    const x = cx + Math.cos(angle) * rr;
    const y = cy + Math.sin(angle) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

// ── 共通：手描きの輪郭線（筆圧ゆらぎ＋なぞり直し＋切り欠き対応） ──
function sk2_angularDistance(a, b) {
  let d = Math.abs(((a - b + Math.PI) % (Math.PI * 2)) - Math.PI);
  return d;
}

function sk2_drawHandInkedRing(ctx, cx, cy, R, unit, baseWidth, opts) {
  opts = opts || {};
  const segments = 64;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const jitter =
      Math.sin(angle * 3 + 1.0) * (0.35 * unit) * 0.55 +
      Math.sin(angle * 7 + 2.3) * (0.35 * unit) * 0.35;
    const rr = R + jitter;
    points.push({ x: cx + Math.cos(angle) * rr, y: cy + Math.sin(angle) * rr, angle });
  }

  const gapCenter = opts.gapCenter;
  const gapHalf = (opts.gapWidth || 0.34) / 2;
  function inGap(angle) {
    if (gapCenter === undefined || gapCenter === null) return false;
    return sk2_angularDistance(angle, gapCenter) < gapHalf;
  }

  const ringColor = opts.ringColor || '#111111';
  ctx.strokeStyle = ringColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // メインストローク（筆圧のゆらぎ）
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (inGap(a.angle) || inGap(b.angle)) continue;
    const pressure = 1 + 0.28 * Math.sin(a.angle * 2 + 1.3) + 0.16 * Math.sin(a.angle * 5 + 0.6);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = Math.max(baseWidth * pressure, 1);
    ctx.stroke();
  }

  // なぞり直しの重なり（円の上部、切り欠きと被らない位置に固定）
  const overlapCenter = 4.71; // 円の上部あたり
  const overlapHalf = 0.22;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (sk2_angularDistance(a.angle, overlapCenter) > overlapHalf) continue;
    if (inGap(a.angle) || inGap(b.angle)) continue;
    const offset = 1.1 * unit;
    ctx.beginPath();
    ctx.moveTo(a.x + offset * 0.6, a.y - offset * 0.5);
    ctx.lineTo(b.x + offset * 0.6, b.y - offset * 0.5);
    ctx.lineWidth = Math.max(baseWidth * 0.75, 1);
    ctx.stroke();
  }
}

// ── 共通：コア（塗りつぶし） ──
function sk2_drawCore(ctx, cx, cy, coreR, jitterAmt, color) {
  ctx.beginPath();
  sk2_wobblyCirclePath(ctx, cx, cy, coreR, 2.0, jitterAmt * 0.6, 28);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ── 共通：点描ハイライト ──
function sk2_drawHighlightDots(ctx, cx, cy, coreR, unit) {
  const baseX = cx - coreR * 0.38;
  const baseY = cy - coreR * 0.5;
  const dots = [
    { dx: 0, dy: 0, r: 2.3 * unit },
    { dx: 3.4 * unit, dy: 2.0 * unit, r: 1.2 * unit },
    { dx: -1.6 * unit, dy: 2.6 * unit, r: 0.9 * unit },
    { dx: 1.8 * unit, dy: -1.8 * unit, r: 0.8 * unit }
  ];
  ctx.fillStyle = '#ffffff';
  dots.forEach(d => {
    ctx.beginPath();
    ctx.arc(baseX + d.dx, baseY + d.dy, Math.max(d.r, 0.6), 0, Math.PI * 2);
    ctx.fill();
  });
}

// ── アクセント：S反応玉／N反応玉（コアに刻んだ文字マーク） ──
function sk2_drawSNGlyph(ctx, cx, cy, coreR, unit, letter) {
  const gx = cx + coreR * 0.08;
  const gy = cy + coreR * 0.10;
  const w = coreR * 0.44;
  const h = coreR * 0.56;

  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.6 * unit, 1.4);

  if (letter === 'S') {
    ctx.beginPath();
    ctx.moveTo(gx + w * 0.55, gy - h);
    ctx.bezierCurveTo(
      gx - w * 0.95, gy - h,
      gx - w * 0.95, gy - h * 0.1,
      gx, gy
    );
    ctx.bezierCurveTo(
      gx + w * 0.95, gy + h * 0.1,
      gx + w * 0.95, gy + h,
      gx - w * 0.55, gy + h
    );
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(gx - w, gy + h);
    ctx.lineTo(gx - w, gy - h);
    ctx.lineTo(gx + w, gy + h);
    ctx.lineTo(gx + w, gy - h);
    ctx.stroke();
  }
}

// ── アクセント：ぶっ飛び玉/boost（速度線） ──
// colorは省略可（未指定ならinkSketch2スキンと同じ黒のまま）
function sk2_drawSpeedLines(ctx, cx, cy, R, unit, color) {
  const baseAngle = 2.35;
  ctx.strokeStyle = color || '#111111';
  ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const perp = baseAngle + Math.PI / 2;
    const offset = (k - 0.5) * 5.2 * unit;
    const ox = Math.cos(perp) * offset;
    const oy = Math.sin(perp) * offset;
    const x1 = cx + Math.cos(baseAngle) * (R + 2 * unit) + ox;
    const y1 = cy + Math.sin(baseAngle) * (R + 2 * unit) + oy;
    const x2 = cx + Math.cos(baseAngle) * (R + 10 * unit) + ox;
    const y2 = cy + Math.sin(baseAngle) * (R + 10 * unit) + oy;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = Math.max(1.6 * unit, 1);
    ctx.stroke();
  }
}

// ── アクセント：重力玉（引力フィールドの破線） ──
function sk2_drawGravityField(ctx, cx, cy, R, unit, color) {
  const fieldR = R * 1.34;
  const ticks = 10;
  ctx.strokeStyle = color || '#111111';
  ctx.lineCap = 'round';
  for (let i = 0; i < ticks; i++) {
    const angle = (i / ticks) * Math.PI * 2;
    const inner = fieldR - 2.4 * unit;
    const outer = fieldR + 2.4 * unit;
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * outer;
    const y2 = cy + Math.sin(angle) * outer;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = Math.max(1.1 * unit, 1);
    ctx.stroke();
  }
}

// ── アクセント：追尾玉（フィン＋旋回の軌跡） ──
function sk2_drawHomingFin(ctx, cx, cy, R, unit, color) {
  const angle = 0.62;
  const col = color || '#111111';

  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 5.5 * unit, angle - 1.35, angle - 0.42);
  ctx.lineWidth = Math.max(1.4 * unit, 1);
  ctx.stroke();

  const tip = { x: cx + Math.cos(angle) * (R + 12 * unit), y: cy + Math.sin(angle) * (R + 12 * unit) };
  const b1a = angle - 0.22, b2a = angle + 0.15;
  const baseR = R - 1 * unit;
  const b1 = { x: cx + Math.cos(b1a) * baseR, y: cy + Math.sin(b1a) * baseR };
  const b2 = { x: cx + Math.cos(b2a) * baseR, y: cy + Math.sin(b2a) * baseR };
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(b1.x, b1.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();

  const dotPos = { x: cx + Math.cos(angle) * (R - 4 * unit), y: cy + Math.sin(angle) * (R - 4 * unit) };
  ctx.beginPath();
  ctx.arc(dotPos.x, dotPos.y, Math.max(1.1 * unit, 0.8), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

// ── アクセント：遅延玉（上部の導火線） ──
function sk2_drawFuse(ctx, cx, cy, R, unit, color) {
  const topAngle = -Math.PI / 2;
  const x1 = cx + Math.cos(topAngle) * (R - 1 * unit);
  const y1 = cy + Math.sin(topAngle) * (R - 1 * unit);
  const x2 = cx + Math.cos(topAngle) * (R + 7 * unit);
  const y2 = cy + Math.sin(topAngle) * (R + 7 * unit);
  const col = color || '#111111';
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = Math.max(1.8 * unit, 1);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x2, y2, Math.max(1.7 * unit, 1), 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
}

// ── アクセント：金玉（散布を示す小さな粒） ──
function sk2_drawScatterDots(ctx, cx, cy, R, unit, color) {
  const positions = [-0.35, 1.25, 2.55];
  ctx.fillStyle = color;
  positions.forEach(angle => {
    const x = cx + Math.cos(angle) * (R + 7 * unit);
    const y = cy + Math.sin(angle) * (R + 7 * unit);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.7 * unit, 1), 0, Math.PI * 2);
    ctx.fill();
  });
}

// ゲーム内のmarbleType → モックアップの種類別設定 への対応表
// （marble_types.html の MARBLE_TYPES と同じ組み合わせ。sizeMulはゲーム側で
// 　既にm.rへ反映済みのため、ここでは持たない）
const SK2_TYPE_CONFIG = {
  normal:  { coreColor: '#111111' },
  boost:   { coreColor: '#111111', accent: 'speedLines' },
  gravity: { coreColor: '#111111', accent: 'gravityField' },
  homing:  { coreColor: '#111111', accent: 'homingFin' },
  delay:   { coreColor: '#111111', accent: 'fuse' },
  sOnly:   { coreColor: '#111111', letter: 'S' },
  nOnly:   { coreColor: '#111111', letter: 'N' },
  red:     { coreColor: '#c62828' },
  gold:    { coreColor: '#d4a017', accent: 'scatterDots' },
};

function drawMarbleSkin_inkSketch2(m, t, pulse, ringColor, lineW, hsl){
  const R = m.r; // ゲーム側で既に種類ごとのサイズ倍率が反映済み
  const unit = R / 32;
  const ringWidth = 4.6 * unit;
  const coreR = 19 * unit;
  const jitterAmt = 0.35 * unit;
  const cfg = SK2_TYPE_CONFIG[m.marbleType] || SK2_TYPE_CONFIG.normal;

  // 遅延磁晶核：残り時間が少ないほど拍動が大きく速くなる（他スキンと同じ演出）
  let bombScale = 1;
  if(m.marbleType === 'delay' && m.fuseTimer !== null && m.fuseTimer !== undefined){
    const urgency = 1 - Math.min(1, Math.max(0, m.fuseTimer / 7));
    const beatSpeed = 3 + urgency * 14;
    const beatAmp   = 0.05 + urgency * 0.22;
    bombScale = 1 + Math.sin(t * beatSpeed) * beatAmp;
  }

  sk2_drawHandInkedRing(ctx, m.x, m.y, R, unit, ringWidth, {
    gapCenter: cfg.gapCenter,
    gapWidth: 0.34,
    ringColor: '#111111',
  });

  sk2_drawCore(ctx, m.x, m.y, coreR * bombScale * pulse, jitterAmt, cfg.coreColor);
  sk2_drawHighlightDots(ctx, m.x, m.y, coreR, unit);

  if (cfg.letter) {
    sk2_drawSNGlyph(ctx, m.x, m.y, coreR, unit, cfg.letter);
  }

  switch (cfg.accent) {
    case 'speedLines':   sk2_drawSpeedLines(ctx, m.x, m.y, R, unit); break;
    case 'gravityField': sk2_drawGravityField(ctx, m.x, m.y, R, unit); break;
    case 'homingFin':    sk2_drawHomingFin(ctx, m.x, m.y, R, unit); break;
    case 'fuse':         sk2_drawFuse(ctx, m.x, m.y, R, unit); break;
    case 'scatterDots':  sk2_drawScatterDots(ctx, m.x, m.y, R, unit, cfg.coreColor); break;
  }
}

// ══════════════════════════════════════════════════════════════════
// 【ショップ玉スキン①】ぷるぷるジェリー磁晶核：半透明でカラフルなスライム状の玉、
// 中央にカット宝石を埋め込んだデザイン。種類別アクセントはsk2_*の意匠を流用して
// 他スキンとの「意味の一貫性」（何の玉か一目で分かる形）を保つ。
// ══════════════════════════════════════════════════════════════════

function jellyRand(min,max){ return min+Math.random()*(max-min); }

// ── ぷるぷるした不定形の輪郭パス（なめらかなブロブ、なめらかな二次曲線でつなぐ） ──
// ※FBにより、以前より丸に近づけるため揺らぎ幅を約1/3に縮小
function jellyBlobPath(ctx, R, points, seedOffset){
  const n = points;
  const pts = [];
  for(let i=0;i<n;i++){
    const angle = (i/n)*Math.PI*2;
    const wig = Math.sin(angle*3+seedOffset)*0.018 + Math.sin(angle*5+seedOffset*1.7)*0.012;
    const rr = R*(1+wig);
    pts.push([Math.cos(angle)*rr, Math.sin(angle)*rr]);
  }
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const m0=mid(pts[n-1],pts[0]);
  ctx.beginPath();
  ctx.moveTo(m0[0],m0[1]);
  for(let i=0;i<n;i++){
    const cur=pts[i], nx=pts[(i+1)%n];
    const mp=mid(cur,nx);
    ctx.quadraticCurveTo(cur[0],cur[1],mp[0],mp[1]);
  }
  ctx.closePath();
}

// 種類ごとの色（ユーザー指定のHEXカラーをHSLに変換して反映）
// 磁晶核#39EFFF／跳躍#FF9800／重力#8A2BE2／追尾#FF3FA8／遅延#7CFF4F／
// S#FF5A2A／N#2962FF／紅#D6003F／金#FFD700
const JELLY_TYPE_HSL = {
  normal:{h:185,s:100,l:61}, boost:{h:36,s:100,l:50}, gravity:{h:271,s:76,l:53}, homing:{h:327,s:100,l:62},
  delay:{h:105,s:100,l:65}, sOnly:{h:14,s:100,l:58}, nOnly:{h:224,s:100,l:58},
  red:{h:342,s:100,l:42}, gold:{h:51,s:100,l:50},
};

// ══════════════════════════════════════════════════════════════════
// 【ショップ玉スキン①】フラットアイコン風の同心円デザイン
// （ball_icon_reproduction.htmlで作った見本をベースに、種類ごとの色・個性を追加）
// ・陰影は明度を落とすのではなく、色相を少しずつずらして表現する
//   （見本画像を実測した結果、彩度・明度はほぼ一定で色相だけが変化していたため。
// 　 「彩度は変えないで」というFBの通り、各層とも元の彩度をそのまま使う）
// ・軽量化のため、全レイヤーを起動時に1回だけオフスクリーンcanvasへ描画し、
// 　プレイ中は毎フレームdrawImageで貼るだけにする（ジェリー版の2枚重ねより単純）
// ══════════════════════════════════════════════════════════════════

function buildBallIconSprite(marbleType, hsl){
  const r = MARBLE_R * (INK_SIZE_MULT[marbleType]||1.0);
  const h=hsl.h, s=hsl.s, l=hsl.l;
  const special = (marbleType==='red'||marbleType==='gold');
  const half = r*1.3; // ハイライトが縁からはみ出さない程度の余白
  const size = Math.max(2,Math.ceil(half*2));
  const canvas=document.createElement('canvas');
  canvas.width=size; canvas.height=size;
  withOffscreenCtx(canvas.getContext('2d'), () => {
    ctx.translate(half,half);
    const R2=r;

    // 外周：白いリング + 色付き太いリング（色相を-12ずらし、明度を少し落として濃く見せる）
    ctx.beginPath(); ctx.arc(0,0,R2*0.97,0,Math.PI*2);
    ctx.fillStyle='#FFFFFF'; ctx.fill();
    ctx.lineWidth=Math.max(R2*0.11,1); ctx.strokeStyle=`hsl(${h-12},${s}%,${Math.max(l-4,8)}%)`;
    ctx.beginPath(); ctx.arc(0,0,R2*0.93,0,Math.PI*2); ctx.stroke();
    ctx.lineWidth=Math.max(R2*0.07,1); ctx.strokeStyle='#FFFFFF';
    ctx.beginPath(); ctx.arc(0,0,R2*0.87,0,Math.PI*2); ctx.stroke();

    // 本体：指定色そのまま
    ctx.beginPath(); ctx.arc(0,0,R2*0.83,0,Math.PI*2);
    ctx.fillStyle=`hsl(${h},${s}%,${l}%)`; ctx.fill();

    // 内側の陰影同心円（中央配置。色相だけをずらして立体感を出す。彩度・明度は基本維持）
    ctx.beginPath(); ctx.arc(0,0,R2*0.70,0,Math.PI*2);
    ctx.fillStyle=`hsl(${h-13},${s}%,${l}%)`; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,R2*0.44,0,Math.PI*2);
    ctx.fillStyle=`hsl(${h-19},${s}%,${l}%)`; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,R2*0.40,0,Math.PI*2);
    ctx.fillStyle=`hsl(${h-6},${s}%,${l}%)`; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,R2*0.31,0,Math.PI*2);
    ctx.fillStyle=`hsl(${h-12},${s}%,${Math.max(l-4,8)}%)`; ctx.fill();

    // ハイライト（白い楕円3つ。玉からはみ出さないようクリップ）
    ctx.save();
    ctx.beginPath(); ctx.arc(0,0,R2*0.97,0,Math.PI*2); ctx.clip();
    const hl=(cx,cy,rx,ry,rot)=>{
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(rot);
      ctx.beginPath(); ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.fill();
      ctx.restore();
    };
    hl(-R2*0.3,-R2*0.46,R2*0.26,R2*0.23,-0.44);
    hl(-R2*0.085,-R2*0.14,R2*0.085,R2*0.065,-0.35);
    hl(R2*0.315,R2*0.32,R2*0.065,R2*0.05,-0.26);
    ctx.restore();

    // 種類別の個性（アクセント）：既存のsk2_*描画をそのまま流用
    const unit=r/32;
    const accentColor=`hsl(${h-19},${s}%,${Math.max(l-18,8)}%)`;
    switch(marbleType){
      case 'boost':   sk2_drawSpeedLines(ctx,0,0,r,unit,accentColor); break;
      case 'gravity': sk2_drawGravityField(ctx,0,0,r,unit,accentColor); break;
      case 'homing':  sk2_drawHomingFin(ctx,0,0,r,unit,accentColor); break;
      case 'delay':   sk2_drawFuse(ctx,0,0,r,unit,accentColor); break;
      case 'gold':    sk2_drawScatterDots(ctx,0,0,r,unit,`hsl(${h},${s}%,${Math.min(l+15,75)}%)`); break;
      case 'sOnly':   sk2_drawSNGlyph(ctx,0,0,r*0.31,unit,'S'); break;
      case 'nOnly':   sk2_drawSNGlyph(ctx,0,0,r*0.31,unit,'N'); break;
    }
  });
  return { canvas, half, r, special, hsl };
}

let ballIconSpritePool = null;
function buildBallIconSpritePool(){
  if(ballIconSpritePool) return; // 一度作ったら二度と作り直さない
  ballIconSpritePool={};
  for(const type of ['normal','boost','gravity','homing','delay','sOnly','nOnly','red','gold']){
    ballIconSpritePool[type]=buildBallIconSprite(type,JELLY_TYPE_HSL[type]);
  }
}
buildBallIconSpritePool(); // ページ読み込み時に1回だけ構築

function drawMarbleSkin_jellyGem(m,t,pulse,ringColor,lineW,hsl){
  if(!ballIconSpritePool) buildBallIconSpritePool();
  const s=ballIconSpritePool[m.marbleType]||ballIconSpritePool['normal'];

  // 遅延磁晶核：残り時間が少ないほど拍動が大きく速くなる（他スキンと同じ演出）
  let bombScale=1;
  if(m.marbleType==='delay' && m.fuseTimer!==null && m.fuseTimer!==undefined){
    const urgency=1-Math.min(1,Math.max(0,m.fuseTimer/7));
    const beatSpeed=3+urgency*14;
    const beatAmp=0.05+urgency*0.22;
    bombScale=1+Math.sin(t*beatSpeed)*beatAmp;
    if(urgency>0.15){
      ctx.save();
      ctx.translate(m.x,m.y);
      ctx.beginPath();
      ctx.arc(0,0,s.half*bombScale*1.15,0,Math.PI*2);
      ctx.fillStyle=`rgba(220,30,20,${(urgency-0.15)*0.5*(0.6+Math.sin(t*beatSpeed)*0.4)})`;
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(m.x,m.y);
  ctx.scale(bombScale,bombScale);
  ctx.drawImage(s.canvas,-s.half,-s.half);
  ctx.restore();

  // 追尾磁晶核：常時ゆっくり回転する走査リング（他スキンと同じ演出）
  if(m.marbleType==='homing' && !m.detonating){
    ctx.save();
    ctx.translate(m.x,m.y);
    ctx.rotate(t*0.9+m.phase);
    ctx.beginPath();
    for(let k=0;k<4;k++){
      const a0=k*(Math.PI/2), a1=a0+Math.PI*0.28;
      ctx.moveTo(Math.cos(a0)*m.r*1.35, Math.sin(a0)*m.r*1.35);
      ctx.arc(0,0,m.r*1.35,a0,a1);
    }
    ctx.strokeStyle=`hsla(${s.hsl.h},${s.hsl.s}%,${Math.min(s.hsl.l+20,80)}%,0.55)`;
    ctx.lineWidth=1.2;
    ctx.stroke();
    ctx.restore();
  }
  // 追尾磁晶核：起爆猶予中、曲がっていく方向にロックオン線を伸ばす
  if(m.marbleType==='homing' && m.detonating){
    const spd=Math.hypot(m.vx,m.vy);
    if(spd>0.05){
      const urgency=1-Math.min(1,Math.max(0,m.detonateTimer/(m.detonateTime||1.5)));
      const ang=Math.atan2(m.vy,m.vx);
      const lineLen=m.r*(2.2+urgency*1.8);
      ctx.save();
      ctx.translate(m.x,m.y);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang)*m.r*1.2, Math.sin(ang)*m.r*1.2);
      ctx.lineTo(Math.cos(ang)*lineLen, Math.sin(ang)*lineLen);
      ctx.strokeStyle=`hsla(${s.hsl.h},${s.hsl.s}%,60%,${0.35+urgency*0.5})`;
      ctx.lineWidth=1.2+urgency*1.2;
      ctx.stroke();
      ctx.restore();
    }
  }
}
