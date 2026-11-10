// ProductConfig → похідні розміри; TrifoldRig, Pocket, Sleeve, Record — параметрична геометрія (у мм, root масштабується до метрів).
import * as THREE from 'https://esm.sh/three@0.170.0';

const PANEL_IDS = ['P1', 'P2', 'P3'];
const fmt = v => v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');

export function derive(cfg) {
  const tb = cfg.boardThickness, tp = cfg.sleevePaperThickness;
  const sleeveT = cfg.recordThickness + 2 * tp + cfg.sleeveInnerClearance;
  const cavity = sleeveT + cfg.pocketCavityClearance;
  const T = cavity + 2 * tb;
  const [w1, w2, w3] = cfg.panelWidths, h = cfg.panelHeight;
  const [sw, sh] = cfg.sleeveSize, R = cfg.recordDiameter / 2;
  const report = [];
  const ok = (cond, text) => report.push({ ok: !!cond, text });

  // порядок складання: перша складена стулка лежить на P2, друга — поверх неї
  const inner = cfg.closeOrder[0], outer = cfg.closeOrder[1];
  const sp = { P1: cfg.spineWidths.H12, P3: cfg.spineWidths.H23 };
  const reqInner = 2 * T + cfg.foldClearance;
  const effInner = cfg.enforceFoldClearance ? Math.max(sp[inner], reqInner) : sp[inner];
  const reqOuter = effInner + T + cfg.foldClearance;
  const effOuter = cfg.enforceFoldClearance ? Math.max(sp[outer], reqOuter) : sp[outer];
  const eff = { [inner]: effInner, [outer]: effOuter };
  const spineName = { P1: 'H12', P3: 'H23' };
  for (const [p, req] of [[inner, reqInner], [outer, reqOuter]]) {
    const given = sp[p];
    if (given + 1e-6 >= req) ok(true, `${spineName[p]}: ${fmt(given)} мм ≥ потрібних ${fmt(req)} мм для складання ${p} без перетину`);
    else ok(false, `${spineName[p]}: у схемі ${fmt(given)} мм, але при товщині панелі ${fmt(T)} мм для ${p} потрібно ≥ ${fmt(req)} мм. ${cfg.enforceFoldClearance ? `У прототипі використано ${fmt(eff[p])} мм.` : 'Можливий перетин у закритому стані.'}`);
  }
  ok(cavity >= sleeveT, `Порожнина кишені ${fmt(cavity)} мм ≥ конверт із платівкою ${fmt(sleeveT)} мм`);
  ok(sleeveT - 2 * tp >= cfg.recordThickness, `Внутрішній зазор конверта ${fmt(sleeveT - 2 * tp)} мм ≥ платівка ${fmt(cfg.recordThickness)} мм`);
  ok(cfg.recordDiameter < Math.min(sw, sh) - 2 * tp, `Платівка ⌀${fmt(cfg.recordDiameter)} у конверті ${sw}×${sh} мм`);
  const minW = Math.min(w1, w2, w3) - tb;
  ok(sw < minW && sh < h - 2 * tb, `Конверт ${sw}×${sh} мм у кишені ${fmt(minW)}×${fmt(h - 2 * tb)} мм (без стінок)`);
  const hs = cfg.hingeSplit;
  for (const k of ['H12', 'H23']) ok(Math.abs(hs[k][0] + hs[k][1] - 1) < 1e-6, `${k}: розподіл згину ${hs[k][0]} / ${hs[k][1]} (сума = 1)`);

  const s12 = eff.P1, s23 = eff.P3;
  const cx = [-w2 / 2 - s12 - w1 / 2, 0, w2 / 2 + s23 + w3 / 2];
  const ws = [w1, w2, w3];
  const exits = PANEL_IDS.map(id => cfg.pocketExitDirections[id]);
  const L = cfg.layout;
  const slide = exits.map((d, k) => Math.abs(d[0]) > 0.5 ? ws[k] / 2 + sw / 2 + L.exitMargin : h / 2 + sh / 2 + L.exitMargin);
  // сусідня стулка, що перекриває траєкторію (для P2 з виходом −X → P1)
  const neighborOfPanel = exits.map((d, k) => {
    if (k !== 1) { if ((k === 0 && d[0] > 0.5) || (k === 2 && d[0] < -0.5)) ok(false, `${PANEL_IDS[k]}: отвір дивиться на P2 — траєкторія перетне центральну панель`); return null; }
    return d[0] < -0.5 ? 0 : d[0] > 0.5 ? 2 : null;
  });
  const pairPanel = cfg.pairs.map(p => PANEL_IDS.indexOf(p.panel));
  const sleeveY = -(h / 2 + L.rowGap + sh / 2), recordY = sleeveY - sh / 2 - L.rowGap - R;
  const display = pairPanel.map(k => ({ sleeve: [cx[k], sleeveY, -L.forwardZ], record: [cx[k], recordY, -L.forwardZ] }));
  return {
    T, tb, tp, sleeveT, cavity, h, ws, s12, s23, cx, sw, sh, R, exits, slide, pairPanel, display,
    neighbor: pairPanel.map(k => neighborOfPanel[k]), own: pairPanel.map(k => (k === 1 ? null : k)),
    recExit: sh / 2 + R + L.recordExitMargin, report, inner, outer
  };
}

// плита з довільного контуру: окремі матеріали для −Z, торців і +Z; UV лицьових сторін нормалізовані до bounds без дзеркалення
function slab(shape, b, z0, depth, matNeg, matSide, matPos, segs = 24) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: segs });
  g.translate(0, 0, z0);
  const lid = g.groups.find(gr => gr.materialIndex === 0), side = g.groups.find(gr => gr.materialIndex === 1);
  const pos = g.attributes.position, uv = g.attributes.uv, W = b.x1 - b.x0, H = b.y1 - b.y0;
  for (let v = lid.start; v < lid.start + lid.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), neg = Math.abs(pos.getZ(v) - z0) < 1e-6;
    uv.setXY(v, neg ? (b.x1 - x) / W : (x - b.x0) / W, (y - b.y0) / H);
  }
  const half = lid.count / 2, firstNeg = Math.abs(pos.getZ(lid.start) - z0) < 1e-6;
  g.clearGroups();
  g.addGroup(lid.start, half, firstNeg ? 0 : 2);
  g.addGroup(lid.start + half, half, firstNeg ? 2 : 0);
  g.addGroup(side.start, side.count, 1);
  const m = new THREE.Mesh(g, [matNeg, matSide, matPos]);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function rect(x0, y0, x1, y1, notch) {
  const s = new THREE.Shape(); s.moveTo(x0, y0); s.lineTo(x1, y0);
  if (notch && notch.edge === 'x1') { const cy = (y0 + y1) / 2, r = notch.r; s.lineTo(x1, cy - r); s.absarc(x1, cy, r, -Math.PI / 2, Math.PI / 2, true); }
  s.lineTo(x1, y1); s.lineTo(x0, y1);
  if (notch && notch.edge === 'x0') { const cy = (y0 + y1) / 2, r = notch.r; s.lineTo(x0, cy + r); s.absarc(x0, cy, r, Math.PI / 2, -Math.PI / 2, true); }
  s.lineTo(x0, y0);
  return s;
}
function box(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}

// ---------- процедурні текстури кольорового вінілу ----------
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function makeNoise(seed) {
  const r = rng(seed), P = new Uint8Array(512), G = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; G[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const sm = t => t * t * (3 - 2 * t), h = (x, y) => G[P[P[x & 255] + (y & 255)]];
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = sm(xf), v = sm(yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  return (x, y, oct = 5) => { let s = 0, amp = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += amp * n(x * f, y * f); f *= 2.03; amp *= 0.5; } return s / 0.97; };
}
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function vinylTexture(st) {
  const N = 1024, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const x = cv.getContext('2d');
  if (st.type === 'splatter') drawSplatter(x, N, st); else drawField(x, N, st);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// мармур (domain warping) та двоколірний вир — попіксельно
function drawField(ctx, N, st) {
  const R = 512, img = ctx.createImageData(R, R), d = img.data, nz = makeNoise(st.seed || 1);
  const A = hex(st.base), B = hex(st.accent), Cc = hex(st.highlight || st.accent);
  for (let py = 0; py < R; py++) for (let px = 0; px < R; px++) {
    const u = px / R * 2 - 1, v = py / R * 2 - 1, r = Math.hypot(u, v), th = Math.atan2(v, u);
    let m, hl = 0;
    if (st.type === 'marble') {
      const s = 1.6, qx = nz(u * s, v * s), qy = nz(u * s + 5.2, v * s + 1.3);
      const wx = nz(u * s + 4 * qx + 1.7, v * s + 4 * qy + 9.2), wy = nz(u * s + 4 * qx + 8.3, v * s + 4 * qy + 2.8);
      const f = nz(u * s + 3.5 * wx, v * s + 3.5 * wy);
      const band = Math.sin((u * 0.55 - v * 0.85) * 2.2 + f * 7.5);
      m = sstep(-0.05, 0.55, band + (f - 0.5) * 1.2);
      hl = sstep(0.62, 0.9, wx) * m;
    } else {
      const w = (nz(u * 1.3 + 2, v * 1.3) - 0.5) * 0.5;
      const tw = th + (st.twist ?? 2.4) * Math.pow(r, 1.4) + w;
      const curl = Math.cos(tw - (st.angle ?? 0.6));
      m = sstep(-0.02, 0.02, curl + 0.25 * Math.sin(r * 6 + th));
      hl = 0;
    }
    const shade = 1 - 0.06 * (nz(u * 6 + 30, v * 6) - 0.5);
    const o = (py * R + px) * 4;
    for (let k = 0; k < 3; k++) d[o + k] = Math.max(0, Math.min(255, ((A[k] * (1 - m) + B[k] * m) * (1 - hl) + Cc[k] * hl) * shade));
    d[o + 3] = 255;
  }
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = R; tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(tmp, 0, 0, N, N);
}
// бризки: радіальні краплі й смуги, що подовжуються до краю
function drawSplatter(ctx, N, st) {
  const r = rng(st.seed || 1), c = N / 2, mm = N / 300;
  ctx.fillStyle = st.base; ctx.fillRect(0, 0, N, N);
  ctx.fillStyle = st.accent;
  const drop = (ang, rad, len, wid) => { ctx.save(); ctx.translate(c + Math.cos(ang) * rad, c + Math.sin(ang) * rad); ctx.rotate(ang); ctx.beginPath(); ctx.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
  const rays = st.rays || 34;
  for (let k = 0; k < rays; k++) {
    const a0 = (k / rays) * Math.PI * 2 + (r() - 0.5) * 0.15, w0 = (1.2 + r() * 2.8) * mm;
    let rad = 52 * mm;
    while (rad < 150 * mm) {
      const t = rad / (150 * mm), len = (3 + t * 14 + r() * 8) * mm, wid = w0 * (0.6 + t * 1.6) * (0.5 + r());
      drop(a0 + (r() - 0.5) * 0.06, rad + len, len, wid);
      rad += len * 2 + (1 + r() * 7) * mm;
    }
  }
  for (let k = 0; k < (st.drops || 260); k++) {
    const ang = r() * Math.PI * 2, t = Math.pow(r(), 0.7), rad = (54 + t * 94) * mm;
    drop(ang, rad, (1 + t * 7 * r()) * mm, (0.6 + r() * 2.2) * mm);
  }
}

function grooveTextures() {
  const N = 2048, c = document.createElement('canvas'); c.width = c.height = N;
  const r = document.createElement('canvas'); r.width = r.height = N;
  const x = c.getContext('2d'), y = r.getContext('2d'), pxmm = N / 300;
  x.fillStyle = '#808080'; x.fillRect(0, 0, N, N); y.fillStyle = '#5a5a5a'; y.fillRect(0, 0, N, N);
  const gaps = [72, 91, 109, 127];
  for (let mm = 60; mm <= 146; mm += 0.3) {
    if (gaps.some(gp => Math.abs(mm - gp) < 0.9)) continue;
    const rad = mm * pxmm;
    x.strokeStyle = (Math.round(mm / 0.3) % 2) ? '#9a9a9a' : '#6a6a6a'; x.lineWidth = 1.2;
    x.beginPath(); x.arc(N / 2, N / 2, rad, 0, Math.PI * 2); x.stroke();
    y.strokeStyle = '#8a8a8a'; y.lineWidth = 1.4; y.beginPath(); y.arc(N / 2, N / 2, rad, 0, Math.PI * 2); y.stroke();
  }
  const bump = new THREE.CanvasTexture(c), rough = new THREE.CanvasTexture(r);
  for (const t of [bump, rough]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; }
  return { bump, rough };
}

export function buildModel(cfg, geo, assets) {
  const M = cfg.materials, pr = M.printRoughness;
  const std = (o) => new THREE.MeshStandardMaterial({ metalness: 0, ...o });
  const board = std({ color: M.board, roughness: 0.9 }), cavity = std({ color: M.cavity, roughness: 0.95 });
  const spineInnerMat = std({ color: M.spineInner || M.spine, roughness: 0.85 });
  const paper = std({ color: M.sleevePaper, roughness: M.sleeveRoughness });
  const { T, tb, tp, h, ws, s12, s23 } = geo;
  const pickables = [];
  const tag = (o, data) => { o.traverse(m => { if (m.isMesh) { m.userData.pick = data; pickables.push(m); } }); return o; };
  const panelNames = ['1', '2', '3'];

  const root = new THREE.Group(); root.scale.setScalar(cfg.sceneUnitsPerMm); root.name = 'TrifoldRoot';
  const rig = new THREE.Group(); rig.name = 'TrifoldRig'; root.add(rig);
  const printMat = (id, meta, rough = pr) => std({ map: assets.register(id, meta), roughness: rough });

  const panels = [], pockets = [];
  function buildPocket(k, x0, x1) {
    const g = new THREE.Group(); g.name = PANEL_IDS[k];
    const n = k + 1, dims = `${fmt(ws[k])} × ${fmt(h)} мм`;
    const outer = printMat(`jacket.p${n}.outer`, { kind: 'panel', num: n, side: 'outer', aspect: ws[k] / h, title: `${S_panel} ${panelNames[k]}`, sideLabel: S_outer, note: notes[`jacket.p${n}.outer`], dims, pano: panoMeta('outer', k) });
    const inner = printMat(`jacket.p${n}.inner`, { kind: 'panel', num: n, side: 'inner', aspect: ws[k] / h, title: `${S_panel} ${panelNames[k]}`, sideLabel: S_inner, dims, pano: panoMeta('inner', k) });
    const d = geo.exits[k];
    const exitEdge = d[0] < -0.5 ? 'x0' : d[0] > 0.5 ? 'x1' : d[1] > 0.5 ? 'y1' : 'y0';
    const nc = cfg.pocketNotch, notch = nc && nc.panels.includes(PANEL_IDS[k]) && exitEdge[0] === 'x' ? { edge: exitEdge, r: nc.height / 2 } : null;
    const b = { x0, x1, y0: -h / 2, y1: h / 2 };
    g.add(slab(rect(x0, -h / 2, x1, h / 2), b, -tb, tb, cavity, board, outer));
    g.add(slab(rect(x0, -h / 2, x1, h / 2, notch), b, -T, tb, inner, board, cavity));
    const ih = T - 2 * tb, zc = -T / 2, w = x1 - x0, xc = (x0 + x1) / 2;
    if (exitEdge !== 'y1') g.add(box(w, tb, ih, xc, h / 2 - tb / 2, zc, board));
    if (exitEdge !== 'y0') g.add(box(w, tb, ih, xc, -h / 2 + tb / 2, zc, board));
    if (exitEdge !== 'x0') g.add(box(tb, h - 2 * tb, ih, x0 + tb / 2, 0, zc, board));
    if (exitEdge !== 'x1') g.add(box(tb, h - 2 * tb, ih, x1 - tb / 2, 0, zc, board));
    tag(g, { type: 'panel', k });
    const anchor = new THREE.Group(); anchor.name = `${PANEL_IDS[k]}_pocket`; anchor.position.set(xc, 0, zc); g.add(anchor);
    panels[k] = g; pockets[k] = anchor;
    return g;
  }
  const W3 = ws[0] + s12 + ws[1] + s23 + ws[2];
  const panoX = [[0, ws[0] / W3], [(ws[0] + s12) / W3, (ws[0] + s12 + ws[1]) / W3], [(W3 - ws[2]) / W3, 1]];
  function panoMeta(set, k) {
    // зовнішній бік: P1→P2→P3 зліва направо; внутрішній (огляд з −Z): P3→P2→P1
    const [a, b] = set === 'outer' ? panoX[k] : [1 - panoX[k][1], 1 - panoX[k][0]];
    return { set, x0: a, x1: b, joinA: set === 'outer' ? panoX[1][0] : 1 - panoX[1][1], joinB: set === 'outer' ? panoX[1][1] : 1 - panoX[1][0], order: set === 'outer' ? ['1', '2', '3'] : ['3', '2', '1'] };
  }

  const p2 = buildPocket(1, -ws[1] / 2, ws[1] / 2); p2.position.z = T / 2; rig.add(p2);
  const spineMat = (id) => std({ map: assets.register(id, { kind: 'spine', optional: true, fill: M.spine, aspect: 0.03 }), roughness: pr });
  const hA12 = new THREE.Group(), hB12 = new THREE.Group(), hA23 = new THREE.Group(), hB23 = new THREE.Group();
  hA12.position.x = -ws[1] / 2; p2.add(hA12);
  const sp12 = slab(rect(-s12, -h / 2, 0, h / 2), { x0: -s12, x1: 0, y0: -h / 2, y1: h / 2 }, -tb, tb, spineInnerMat, spineInnerMat, spineMat('spine.h12.outer'));
  hA12.add(tag(sp12, { type: 'panel', k: 1 }));
  hB12.position.x = -s12; hA12.add(hB12); hB12.add(buildPocket(0, -ws[0], 0));
  hA23.position.x = ws[1] / 2; p2.add(hA23);
  const sp23 = slab(rect(0, -h / 2, s23, h / 2), { x0: 0, x1: s23, y0: -h / 2, y1: h / 2 }, -tb, tb, spineInnerMat, spineInnerMat, spineMat('spine.h23.outer'));
  hA23.add(tag(sp23, { type: 'panel', k: 1 }));
  hB23.position.x = s23; hA23.add(hB23); hB23.add(buildPocket(2, 0, ws[2]));

  // конверти
  const sleeves = [], records = [];
  const grooves = grooveTextures();
  const V = M.vinyl;
  const vinylMat = (id, tex) => {
    const m = new THREE.MeshPhysicalMaterial({ color: tex ? '#ffffff' : V.color, map: tex || null, roughness: V.roughness, metalness: 0, clearcoat: V.clearcoat, clearcoatRoughness: V.clearcoatRoughness,
      bumpMap: grooves.bump, bumpScale: V.grooveBump, roughnessMap: grooves.rough, transparent: V.opacity < 1, opacity: V.opacity });
    if (assets.m.optional && assets.m.optional[id] && assets.m.optional[id].src) m.map = assets.register(id, { kind: 'vinyl', optional: true, fill: '#ffffff', aspect: 1 });
    return m;
  };
  const styles = M.vinylStyles || [];
  const labelR = cfg.labelDiameter / 2, holeR = cfg.centerHoleDiameter / 2, RT = cfg.recordThickness;
  const dn = assets.m.displayNames || {};
  geo.pairPanel.forEach((k, i) => {
    const n = i + 1, { sw, sh, sleeveT } = geo;
    const sg = new THREE.Group(); sg.name = `S${n}`;
    const front = printMat(`sleeve.${n}.front`, { kind: 'sleeve', num: n, side: 'front', aspect: sw / sh, title: `${S_sleeve} ${n}`, sideLabel: S_front, dims: `${sw} × ${sh} мм` }, M.sleeveRoughness);
    const back = printMat(`sleeve.${n}.back`, { kind: 'sleeve', num: n, side: 'back', aspect: sw / sh, title: `${S_sleeve} ${n}`, sideLabel: S_back, dims: `${sw} × ${sh} мм` }, M.sleeveRoughness);
    const b = { x0: -sw / 2, x1: sw / 2, y0: -sh / 2, y1: sh / 2 };
    sg.add(slab(rect(-sw / 2, -sh / 2, sw / 2, sh / 2), b, -sleeveT / 2, tp, front, paper, paper));
    sg.add(slab(rect(-sw / 2, -sh / 2, sw / 2, sh / 2), b, sleeveT / 2 - tp, tp, paper, paper, back));
    const ih = sleeveT - 2 * tp;
    sg.add(box(tp, sh, ih, -sw / 2 + tp / 2, 0, 0, paper), box(tp, sh, ih, sw / 2 - tp / 2, 0, 0, paper), box(sw - 2 * tp, tp, ih, 0, -sh / 2 + tp / 2, 0, paper));
    tag(sg, { type: 'sleeve', i });
    root.add(sg); sleeves.push(sg);

    const rg = new THREE.Group(); rg.name = `R${n}`;
    const shape = new THREE.Shape(); shape.absarc(0, 0, geo.R, 0, Math.PI * 2, false);
    // вініл — кільце від етикетки до краю; етикетка — окрема вставка тієї ж товщини, урівень із поверхнею (без накладених площин, тож нічого не просвічує)
    const hole = new THREE.Path(); hole.absarc(0, 0, labelR + 0.05, 0, Math.PI * 2, true); shape.holes.push(hole);
    // кольоровий вініл: процедурна маса, одна для обох боків (бік −Z дзеркально, щоб візерунок збігався наскрізь)
    const st = styles[i];
    const vt = st ? vinylTexture(st) : null, vtNeg = vt ? vt.clone() : null;
    if (vtNeg) { vtNeg.wrapS = THREE.RepeatWrapping; vtNeg.repeat.x = -1; vtNeg.offset.x = 1; vtNeg.needsUpdate = true; }
    const vinylEdge = std({ color: st ? st.base : V.color, roughness: 0.45 });
    const disc = slab(shape, { x0: -geo.R, x1: geo.R, y0: -geo.R, y1: geo.R }, -RT / 2, RT, vinylMat(`record.${n}.vinylA`, vtNeg), vinylEdge, vinylMat(`record.${n}.vinylB`, vt), 96);
    rg.add(disc);
    const lm = (id, side) => printMat(id, { kind: 'label', num: n, side, aspect: 1, sideLabel: `${S_side} ${dn[id] || side}` }, M.labelRoughness);
    const ls = new THREE.Shape(); ls.absarc(0, 0, labelR, 0, Math.PI * 2, false);
    const lh = new THREE.Path(); lh.absarc(0, 0, holeR, 0, Math.PI * 2, true); ls.holes.push(lh);
    rg.add(slab(ls, { x0: -labelR, x1: labelR, y0: -labelR, y1: labelR }, -RT / 2 + 0.01, RT - 0.02, lm(`record.${n}.labelA`, 'A'), std({ color: '#1a1a1b', roughness: 0.8 }), lm(`record.${n}.labelB`, 'B'), 64));
    tag(rg, { type: 'record', i });
    root.add(rg); records.push(rg);
  });

  // налагодження: осі згинів
  const debug = new THREE.Group(); debug.visible = false;
  const axisLine = (color) => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -h / 2 - 30, 0), new THREE.Vector3(0, h / 2 + 30, 0)]); return new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false })); };
  const axes = [[hA12, '#ff9a3c'], [hB12, '#ff9a3c'], [hA23, '#3cc7ff'], [hB23, '#3cc7ff']].map(([hn, c]) => { const l = axisLine(c); l.renderOrder = 10; hn.add(l); return l; });
  const ax = new THREE.AxesHelper(200); ax.material.depthTest = false; ax.renderOrder = 10; debug.add(ax);
  root.add(debug);

  const smooth = u => u * u * (3 - 2 * u);
  const c01 = v => Math.max(0, Math.min(1, v));
  const bb = cfg.neighborBendDeg * Math.PI / 180;
  const split = cfg.hingeSplit;
  function applyRig(open, bend) {
    const first = cfg.openOrder[0];
    const u = { [first]: c01(open / 0.5), [cfg.openOrder[1]]: c01((open - 0.5) / 0.5) };
    const f1 = Math.PI * (1 - smooth(u.P1)), f3 = Math.PI * (1 - smooth(u.P3));
    hA12.rotation.y = -f1 * split.H12[0] + bend[0] * bb / 2;
    hB12.rotation.y = -f1 * split.H12[1] + bend[0] * bb / 2;
    hA23.rotation.y = f3 * split.H23[0] - bend[2] * bb / 2;
    hB23.rotation.y = f3 * split.H23[1] - bend[2] * bb / 2;
  }
  return { root, rig, panels, pockets, sleeves, records, pickables, debug, axes, applyRig };
}

// підписи заглушок (імпортуються з STRINGS у viewer і передаються сюди)
let S_panel = 'Панель', S_outer = 'зовнішня сторона', S_inner = 'внутрішня сторона', S_sleeve = 'Конверт', S_front = 'перший бік', S_back = 'другий бік', S_side = 'Сторона', notes = {};
export function setStrings(ph) { S_panel = ph.panel; S_outer = ph.outer; S_inner = ph.inner; S_sleeve = ph.sleeve; S_front = ph.front; S_back = ph.back; S_side = ph.side; notes = ph.notes || {}; }
