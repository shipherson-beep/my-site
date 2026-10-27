// Cassette, Cassette Case, Pencil, Cassette Player — geometry in metres, real-world proportions.
import * as THREE from 'three';

export const CAS = { W: 0.1004, H: 0.0638, T: 0.012, HX: 0.02125, HY: 0.003 };

function rr(target, cx, cy, w, h, r) {
  const x = cx - w / 2, y = cy - h / 2;
  target.moveTo(x + r, y); target.lineTo(x + w - r, y); target.quadraticCurveTo(x + w, y, x + w, y + r);
  target.lineTo(x + w, y + h - r); target.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  target.lineTo(x + r, y + h); target.quadraticCurveTo(x, y + h, x, y + h - r);
  target.lineTo(x, y + r); target.quadraticCurveTo(x, y, x + r, y);
  return target;
}
function remapUV(g) {
  g.computeBoundingBox(); const b = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  uv.needsUpdate = true; return g;
}
function mesh(geo, mat, name, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = cast; m.receiveShadow = recv; return m; }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const GC = new Map();
const G = (k, f) => { if (!GC.has(k)) GC.set(k, f()); return GC.get(k); };
function shellGeometry() {
  return G('cas_shell', () => {
    const { W, H, T, HX, HY } = CAS, bs = 0.0005;
    const s = rr(new THREE.Shape(), 0, 0, W - 2 * bs, H - 2 * bs, 0.003);
    for (const sx of [-1, 1]) { const p = new THREE.Path(); p.absarc(sx * HX, HY, 0.0072, 0, Math.PI * 2, true); s.holes.push(p); }
    const g = new THREE.ExtrudeGeometry(s, { depth: T - 2 * bs, bevelEnabled: true, bevelThickness: bs, bevelSize: bs, bevelSegments: 2, curveSegments: 32 });
    g.translate(0, 0, -(T - 2 * bs) / 2); return g;
  });
}
function labelGeometry() {
  return G('cas_label', () => {
    const s = rr(new THREE.Shape(), 0, 0.007, 0.087, 0.041, 0.0015);
    s.holes.push(rr(new THREE.Path(), 0, CAS.HY, 0.058, 0.021, 0.0095));
    return remapUV(new THREE.ShapeGeometry(s, 24));
  });
}
function tag(obj, t) { obj.userData.tag = t; return obj; }
function collectMats(root) { const s = new Set(); root.traverse(o => { if (o.material) [].concat(o.material).forEach(m => s.add(m)); }); return [...s].filter(m => m.emissive); }

// ===================== CASSETTE =====================
export function createCassette(tex, tapeCfg) {
  const { W, H, T, HX, HY } = CAS;
  const root = tag(new THREE.Group(), 'cassette'); root.name = 'cassette';
  const shellMat = new THREE.MeshPhysicalMaterial({ name: 'cassette_shell', color: 0xd9dfe2, transparent: true, opacity: 0.32, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const trapMat = shellMat.clone(); trapMat.name = 'cassette_trapezoid'; trapMat.opacity = 0.5; trapMat.color.set(0xc4ccd0);
  const labelA = new THREE.MeshStandardMaterial({ name: 'label_A', map: tex.sideA, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2 });
  const labelB = new THREE.MeshStandardMaterial({ name: 'label_B', map: tex.sideB, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2 });
  const hubMat = new THREE.MeshStandardMaterial({ name: 'hub', color: 0xeae5d8, roughness: 0.45 });
  const packMat = new THREE.MeshStandardMaterial({ name: 'tape_pack', color: 0x9a7a62, map: tex.pack, roughness: 0.32, metalness: 0.15 });
  const tapeMat = new THREE.MeshStandardMaterial({ name: 'tape', color: 0x3b2418, roughness: 0.3, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ name: 'screw', color: 0xb9b6ae, roughness: 0.3, metalness: 1 });
  const dark = new THREE.MeshStandardMaterial({ name: 'cassette_dark', color: 0x1a1715, roughness: 0.8 });
  const felt = new THREE.MeshStandardMaterial({ name: 'felt', color: 0xd9d0c0, roughness: 1 });

  const shellGeo = shellGeometry();
  const shell = mesh(shellGeo, shellMat, 'shell', true, false); shell.renderOrder = 2; root.add(shell);

  const trap = new THREE.Shape([new THREE.Vector2(-0.031, -H / 2 + 0.0006), new THREE.Vector2(0.031, -H / 2 + 0.0006), new THREE.Vector2(0.026, -H / 2 + 0.0105), new THREE.Vector2(-0.026, -H / 2 + 0.0105)]);
  for (const s of [1, -1]) {
    const g = new THREE.ExtrudeGeometry(trap, { depth: 0.0007, bevelEnabled: false });
    const m = mesh(g, trapMat, 'trapezoid', false, false); m.renderOrder = 3;
    if (s > 0) m.position.z = T / 2; else { m.rotation.y = Math.PI; m.position.z = -T / 2; }
    root.add(m);
  }
  // labels
  const lGeo = labelGeometry();
  const la = mesh(lGeo, labelA, 'label_side_A', false, true); la.position.z = T / 2 + 0.0002; root.add(la);
  const lb = mesh(lGeo, labelB, 'label_side_B', false, true); lb.position.z = -T / 2 - 0.0002; lb.rotation.y = Math.PI; root.add(lb);
  // screws
  const screwG = new THREE.CylinderGeometry(0.0021, 0.0021, 0.0004, 20).rotateX(Math.PI / 2), slotG = box(0.0028, 0.0005, 0.0002);
  for (const [sx, sy] of [[-0.0465, 0.0285], [0.0465, 0.0285], [-0.0465, -0.0285], [0.0465, -0.0285], [0, -0.0175]]) for (const sz of [1, -1]) {
    const s = mesh(screwG, metal, 'screw', false); s.position.set(sx, sy, sz * (T / 2 + 0.0002));
    const sl = mesh(slotG, dark, 'screw_slot', false); sl.position.set(sx, sy, sz * (T / 2 + 0.00042)); sl.rotation.z = 0.6 + sx * 20;
    root.add(s, sl);
  }
  // reels
  const r0 = tapeCfg.hubRadius;
  const hubShape = new THREE.Shape(); hubShape.absarc(0, 0, r0 - 0.0002, 0, Math.PI * 2, false);
  const pts = [], N = 6, rIn = 0.0049, rT = 0.0036, tw = 0.17;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, b = (i + 1) / N * Math.PI * 2;
    for (let s = 0; s <= 5; s++) { const q = a + tw + (b - a - 2 * tw) * s / 5; pts.push(new THREE.Vector2(Math.cos(q) * rIn, Math.sin(q) * rIn)); }
    pts.push(new THREE.Vector2(Math.cos(b - tw * .55) * rT, Math.sin(b - tw * .55) * rT), new THREE.Vector2(Math.cos(b + tw * .55) * rT, Math.sin(b + tw * .55) * rT));
  }
  const hole = new THREE.Path(); hole.setFromPoints(pts); hubShape.holes.push(hole);
  const hubGeo = new THREE.ExtrudeGeometry(hubShape, { depth: 0.0094, bevelEnabled: false, curveSegments: 36 }); hubGeo.translate(0, 0, -0.0047);
  const packGeo = new THREE.CylinderGeometry(1, 1, 0.0038, 96, 1).rotateX(Math.PI / 2);
  const reels = {}, packs = {}, glows = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -HX : HX;
    const reel = new THREE.Group(); reel.name = 'reel_' + side; reel.position.set(sx, HY, 0);
    reel.add(mesh(hubGeo, hubMat, 'hub_' + side));
    const clip = mesh(box(0.0032, 0.0014, 0.0096), dark, 'hub_clip', false); clip.position.set(0, 0.0078, 0); reel.add(clip);
    const pk = mesh(packGeo, packMat, 'tape_pack_' + side); reel.add(pk); packs[side] = pk;
    root.add(reel); reels[side] = reel;
    const gl = new THREE.Mesh(new THREE.TorusGeometry(0.0078, 0.00045, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0, depthWrite: false }));
    gl.position.set(sx, HY, T / 2 + 0.0008); root.add(gl); glows[side] = gl;
  }
  // guides, pad
  const GX = 0.0425, GY = -0.0255, GR = 0.0016;
  const rollG = new THREE.CylinderGeometry(GR, GR, 0.0046, 20).rotateX(Math.PI / 2);
  for (const s of [-1, 1]) { const g = mesh(rollG, hubMat, 'guide_roller', false); g.position.set(s * GX, GY, 0); root.add(g); }
  for (const s of [-1, 1]) { const p = mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.01, 12).rotateX(Math.PI / 2), metal, 'guide_pin', false); p.position.set(s * 0.0335, -0.0285, 0); root.add(p); }
  const spring = mesh(box(0.014, 0.0003, 0.0034), metal, 'pad_spring', false); spring.position.set(0, -0.0262, 0); root.add(spring);
  const pad = mesh(box(0.0055, 0.0016, 0.0034), felt, 'pressure_pad', false); pad.position.set(0, -0.0276, 0); root.add(pad);
  const segGeo = box(1, 1, 1);
  const seg = { L: mesh(segGeo, tapeMat, 'tape_L', false), R: mesh(segGeo, tapeMat, 'tape_R', false), B: mesh(segGeo, tapeMat, 'tape_bottom', false) };
  Object.values(seg).forEach(m => root.add(m));
  const setSeg = (m, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0); m.rotation.z = Math.atan2(dy, dx); m.scale.set(Math.hypot(dx, dy) + 0.0002, 0.00018, 0.0038); };
  const tangent = (cx, cy, r, px, py, outer) => {
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy), phi = Math.atan2(dy, dx), a = Math.acos(Math.min(1, r / d));
    const p1 = [cx + r * Math.cos(phi + a), cy + r * Math.sin(phi + a)], p2 = [cx + r * Math.cos(phi - a), cy + r * Math.sin(phi - a)];
    return outer < 0 ? (p1[0] < p2[0] ? p1 : p2) : (p1[0] > p2[0] ? p1 : p2);
  };
  setSeg(seg.B, [-GX, GY - GR], [GX, GY - GR]);

  root.userData.update = (tape) => {
    const rL = tape.rL(), rR = tape.rR();
    packs.L.scale.set(rL, rL, 1); packs.R.scale.set(rR, rR, 1);
    reels.L.rotation.z = tape.angL(); reels.R.rotation.z = tape.angR();
    const pl = [-GX - GR, GY], pr = [GX + GR, GY];
    setSeg(seg.L, tangent(-HX, HY, rL, pl[0], pl[1], -1), pl);
    setSeg(seg.R, pr, tangent(HX, HY, rR, pr[0], pr[1], 1));
  };
  root.userData.glows = glows;
  root.userData.mats = collectMats(root);
  return root;
}

// ===================== CASE =====================
// opts: { plastic, tag, lidTag } — geometry is shared between all cases
export const CASE = { W: 0.110, D: 0.069, Hb: 0.0085, Hl: 0.0085, th: 0.0012 };
export function casePlastic(tex, variant = 0) {
  return new THREE.MeshPhysicalMaterial({ name: 'case_plastic_' + variant, color: 0xf4f6f6, transparent: true, opacity: 0.06 + variant * 0.02, roughness: 1, roughnessMap: variant % 2 ? tex.scratches2 : tex.scratches, clearcoat: 0.25, clearcoatRoughness: 0.08, envMapIntensity: 0.3, depthWrite: false, side: THREE.DoubleSide });
}
export function createCase(tex, opts = {}) {
  const { W, D, Hb, Hl, th } = CASE;
  const root = tag(new THREE.Group(), opts.tag || 'case'); root.name = 'cassette_case';
  const plastic = opts.plastic || casePlastic(tex);
  const base = new THREE.Group(); base.name = 'case_base'; root.add(base);
  const add = (g, key, mk, m, x, y, z, n) => { const o = mesh(G(key, mk), m, n, true, false); o.position.set(x, y, z); o.renderOrder = 4; g.add(o); return o; };
  add(base, 'c_bot', () => box(W, th, D), plastic, 0, th / 2, 0, 'base_bottom');
  add(base, 'c_bwf', () => box(W, Hb - th, th), plastic, 0, th + (Hb - th) / 2, D / 2 - th / 2, 'base_wall_front');
  add(base, 'c_bwf', () => box(W, Hb - th, th), plastic, 0, th + (Hb - th) / 2, -D / 2 + th / 2, 'base_wall_back');
  for (const s of [-1, 1]) add(base, 'c_bws', () => box(th, Hb - th, D - 2 * th), plastic, s * (W / 2 - th / 2), th + (Hb - th) / 2, 0, 'base_wall_side');
  for (const s of [-1, 1]) add(base, 'c_post', () => new THREE.CylinderGeometry(0.0033, 0.0033, 0.0062, 20), plastic, s * CAS.HX, th + 0.0031, -CAS.HY, 'spindle_post');
  const pw = W - 2 * th - 0.002, pd = D - 2 * th - 0.002;
  const backMat = new THREE.MeshStandardMaterial({ name: 'jcard_back', map: tex.coverBack, roughness: 0.8 });
  const flap = mesh(G('c_flap', () => new THREE.PlaneGeometry(pw, pd - 0.002).rotateX(-Math.PI / 2)), backMat, 'jcard_back_flap', false, true);
  flap.position.set(0, th + 0.0003, 0); base.add(flap);
  const under = mesh(G('c_under', () => new THREE.PlaneGeometry(pw, pd - 0.002).rotateX(Math.PI / 2)), backMat, 'jcard_back_outer', false, false);
  under.position.set(0, th + 0.0001, 0); base.add(under);

  const pivot = tag(new THREE.Group(), opts.lidTag || 'caseLid'); pivot.name = 'case_lid'; pivot.position.set(0, Hb, -D / 2); root.add(pivot);
  add(pivot, 'c_top', () => box(W, th, D), plastic, 0, Hl - th / 2, D / 2, 'lid_top');
  add(pivot, 'c_lwf', () => box(W, Hl - th, th), plastic, 0, (Hl - th) / 2, D - th / 2, 'lid_wall_front');
  add(pivot, 'c_lwf', () => box(W, Hl - th, th), plastic, 0, (Hl - th) / 2, th / 2, 'lid_wall_back');
  for (const s of [-1, 1]) add(pivot, 'c_lws', () => box(th, Hl - th, D - 2 * th), plastic, s * (W / 2 - th / 2), (Hl - th) / 2, D / 2, 'lid_wall_side');
  const front = mesh(G('c_front', () => new THREE.PlaneGeometry(pw, pd).rotateX(-Math.PI / 2)), new THREE.MeshStandardMaterial({ name: 'jcard_front', map: tex.coverFront, roughness: 0.7, envMapIntensity: 0.4 }), 'jcard_front', false, true);
  front.position.set(0, Hl - th - 0.0003, D / 2); pivot.add(front);
  const inside = mesh(G('c_inside', () => new THREE.PlaneGeometry(pw, pd).rotateX(Math.PI / 2)), new THREE.MeshStandardMaterial({ name: 'jcard_inside', map: tex.jCard, roughness: 0.8 }), 'jcard_inside', false, true);
  inside.position.set(0, Hl - th - 0.0006, D / 2); pivot.add(inside);
  const SH = 0.0145;
  const spine = mesh(G('c_spine', () => new THREE.PlaneGeometry(pw, SH)), new THREE.MeshStandardMaterial({ name: 'jcard_spine', map: tex.spine, roughness: 0.6 }), 'jcard_spine', false, true);
  spine.position.set(0, Hl - th - 0.0003 - SH / 2, D - th - 0.0003); pivot.add(spine);
  for (const s of [-1, 1]) add(root, 'c_hinge', () => new THREE.CylinderGeometry(0.0013, 0.0013, 0.009, 14).rotateZ(Math.PI / 2), plastic, s * 0.045, Hb, -D / 2, 'hinge');

  root.userData.lid = pivot;
  root.userData.cassetteLocal = new THREE.Vector3(0, th + 0.0004 + CAS.T / 2, 0);
  root.userData.mats = collectMats(root);
  return root;
}

// Simplified cassette for the collection (static, shared geometry)
const SHELLS = [[0xd9dfe2, 0.32], [0x2a2a2c, 0.62], [0x141414, 0.93], [0xe6e1d6, 0.9], [0x7d6a55, 0.55]];
export function createMiniCassette(tex, labelA, labelB, variant = 0, fill = 0.5) {
  const { T, HX, HY } = CAS;
  const g = new THREE.Group(); g.name = 'collection_cassette';
  const [col, op] = SHELLS[variant % SHELLS.length];
  const shell = mesh(shellGeometry(), new THREE.MeshPhysicalMaterial({ name: 'shell_v' + variant, color: col, transparent: true, opacity: op, roughness: 0.2, clearcoat: 0.8, depthWrite: false, side: THREE.DoubleSide }), 'shell', false, false); shell.renderOrder = 2; g.add(shell);
  for (const [map, z, ry] of [[labelA, T / 2 + 0.0002, 0], [labelB, -T / 2 - 0.0002, Math.PI]]) {
    const l = mesh(labelGeometry(), new THREE.MeshStandardMaterial({ name: 'mini_label', map, roughness: 0.65 }), 'label', false, false); l.position.z = z; l.rotation.y = ry; g.add(l);
  }
  const hubMat = G('m_hubmat', () => new THREE.MeshStandardMaterial({ name: 'hub', color: 0xeae5d8, roughness: 0.45 }));
  const packMat = G('m_packmat', () => new THREE.MeshStandardMaterial({ name: 'tape_pack', color: 0x9a7a62, map: tex.pack, roughness: 0.32, metalness: 0.15 }));
  const hubG = G('m_hub', () => new THREE.CylinderGeometry(0.0108, 0.0108, 0.0094, 24).rotateX(Math.PI / 2));
  const packG = G('m_pack', () => new THREE.CylinderGeometry(1, 1, 0.0038, 48).rotateX(Math.PI / 2));
  const r0 = 0.011, rF = 0.024, rr2 = (f) => Math.sqrt(r0 * r0 + (rF * rF - r0 * r0) * f);
  for (const [s, f] of [[-1, 1 - fill], [1, fill]]) {
    const h = mesh(hubG, hubMat, 'hub', false, false); h.position.set(s * HX, HY, 0); g.add(h);
    const p = mesh(packG, packMat, 'pack', false, false); const r = rr2(f); p.scale.set(r, r, 1); p.position.set(s * HX, HY, 0); p.rotation.z = Math.random() * 6; g.add(p);
  }
  return g;
}

// ===================== CABINET =====================
// Small 90s veneer cabinet that stands on the back-left of the desk. Origin: bottom-centre.
export const CAB = { W: 0.42, H: 0.40, D: 0.22, t: 0.015, shelfY: 0.19, feet: 0.012 };
export function createCabinet(tex) {
  const { W, H, D, t, shelfY } = CAB;
  const root = tag(new THREE.Group(), 'cabinet'); root.name = 'cabinet';
  const wmap = tex.wood.map.clone(); wmap.repeat.set(0.45, 0.45); wmap.needsUpdate = true;
  const wmapV = tex.wood.map.clone(); wmapV.repeat.set(0.35, 0.6); wmapV.rotation = Math.PI / 2; wmapV.needsUpdate = true;
  const veneer = new THREE.MeshPhysicalMaterial({ name: 'cabinet_veneer', color: 0xc9a382, map: wmap, roughness: 0.5, roughnessMap: tex.wood.rough, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  const veneerV = veneer.clone(); veneerV.name = 'cabinet_veneer_door'; veneerV.map = wmapV;
  const inner = new THREE.MeshStandardMaterial({ name: 'cabinet_inner', color: 0x9a7356, map: wmap, roughness: 0.8 });
  const hb = new THREE.MeshStandardMaterial({ name: 'hardboard', color: 0x3e2c20, roughness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ name: 'brass', color: 0xc9a25a, roughness: 0.32, metalness: 1 });
  const body = new THREE.Group(); body.position.y = CAB.feet; root.add(body);
  const P = (geo, m, x, y, z, n) => { const o = mesh(geo, m, n); o.position.set(x, y, z); body.add(o); return o; };
  P(box(W, t, D), veneer, 0, t / 2, 0, 'cab_bottom');
  P(box(W + 0.02, t + 0.004, D + 0.014), veneer, 0, H + 0.002 - (t + 0.004) / 2, 0.005, 'cab_top');
  for (const s of [-1, 1]) P(box(t, H - t, D), veneer, s * (W / 2 - t / 2), t + (H - t) / 2 - 0.002, 0, 'cab_side');
  P(box(W - 2 * t, H - t, 0.004), hb, 0, t + (H - t) / 2, -D / 2 + 0.002, 'cab_back');
  P(box(W - 2 * t, t, D - 0.026), inner, 0, shelfY, -0.009, 'cab_shelf');
  for (const s of [-1, 1]) P(box(0.004, 0.006, 0.01), brass, s * (W / 2 - t - 0.002), shelfY - t / 2 - 0.003, 0.07, 'shelf_pin');
  for (const [x, z] of [[-W / 2 + 0.02, D / 2 - 0.02], [W / 2 - 0.02, D / 2 - 0.02], [-W / 2 + 0.02, -D / 2 + 0.02], [W / 2 - 0.02, -D / 2 + 0.02]]) { const f = mesh(new THREE.CylinderGeometry(0.012, 0.014, CAB.feet, 20), veneer, 'cab_foot'); f.position.set(x, CAB.feet / 2, z); root.add(f); }
  // doors
  const doors = {};
  for (const [side, s] of [['L', -1]]) { // single door, hinged on the left so it swings away from the desk
    const pivot = tag(new THREE.Group(), 'cabDoor'); pivot.name = 'cab_door_' + side; pivot.userData.side = side;
    pivot.position.set(s * W / 2, CAB.feet + H / 2, D / 2); root.add(pivot);
    const dw = W - 0.003, dh = H - 0.004;
    const leaf = mesh(box(dw, dh, 0.016), veneerV, 'door_leaf'); leaf.position.set(-s * dw / 2, 0, 0.008); pivot.add(leaf);
    const panel = mesh(box(dw - 0.07, dh - 0.07, 0.004), veneerV, 'door_panel'); panel.position.set(-s * dw / 2, 0, 0.018); pivot.add(panel);
    const mould = mesh(box(dw - 0.062, dh - 0.062, 0.002), hb, 'door_groove', false); mould.position.set(-s * dw / 2, 0, 0.0165); pivot.add(mould);
    const knob = mesh(new THREE.SphereGeometry(0.007, 20, 14), brass, 'knob'); knob.position.set(-s * (dw - 0.024), -0.07, 0.027); knob.scale.z = 0.8; pivot.add(knob);
    const neck = mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.008, 12).rotateX(Math.PI / 2), brass, 'knob_neck'); neck.position.set(-s * (dw - 0.024), -0.07, 0.02); pivot.add(neck);
    for (const y of [dh / 2 - 0.05, -dh / 2 + 0.05]) { const h = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 12), brass, 'hinge'); h.position.set(0, y, 0.001); pivot.add(h); }
    doors[side] = pivot;
  }
  // slots (cabinet-local): 12 standing (upper row), 4 lying (upper right), 4 lying (lower right), player, pencil
  const rnd = (() => { let s = 77; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const top = CAB.feet + shelfY + t / 2, bot = CAB.feet + t;
  const cases = [], BACK = -D / 2 + 0.004; // inner face of the back panel
  const STAND = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));
  for (let i = 0; i < 12; i++) { // upper shelf
    const q = STAND.clone().premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (rnd() - .5) * 0.06, (rnd() - .5) * 0.02)));
    cases.push({ p: new THREE.Vector3(-W / 2 + t + 0.003 + i * 0.0179 + rnd() * 0.0006, top + 0.0555, BACK + 0.0095 + 0.0345 + rnd() * 0.0015), q }); // pushed back, pencil hidden behind
  }
  for (let i = 0; i < 8; i++) { // lower shelf, right of the player
    const q = STAND.clone().premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (rnd() - .5) * 0.06, (rnd() - .5) * 0.02)));
    cases.push({ p: new THREE.Vector3(-0.035 + i * 0.0179 + rnd() * 0.0006, bot + 0.0555, BACK + 0.0345 + 0.0008 + rnd() * 0.0012), q });
  }
  root.userData.slots = {
    cases,
    player: { p: new THREE.Vector3(-0.115, bot, 0.022), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.06, 0)) },
    pencil: { p: new THREE.Vector3(-W / 2 + t + 0.0012, top, BACK + 0.0044), q: new THREE.Quaternion() }, // back-left corner, fully behind the upper row
  };
  root.userData.doors = doors;
  return root;
}

// ===================== PENCIL =====================
export function createPencil(tex) {
  const root = tag(new THREE.Group(), 'pencil'); root.name = 'pencil';
  const rc = 0.004, L = 0.150;
  const paint = new THREE.MeshPhysicalMaterial({ name: 'pencil_paint', map: tex.pencil, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const woodM = new THREE.MeshStandardMaterial({ name: 'pencil_wood', color: 0xd8b088, roughness: 0.85 });
  const graph = new THREE.MeshStandardMaterial({ name: 'graphite', color: 0x2a2a2c, roughness: 0.35, metalness: 0.6 });
  const ferr = new THREE.MeshStandardMaterial({ name: 'ferrule', color: 0xc8c1a8, roughness: 0.32, metalness: 1 });
  const eras = new THREE.MeshStandardMaterial({ name: 'eraser', color: 0xd8847c, roughness: 0.95 });
  const along = (g, x) => { g.rotateZ(-Math.PI / 2); g.translate(x, 0, 0); return g; };
  root.add(mesh(along(new THREE.CylinderGeometry(rc, rc, L, 6, 1).rotateY(Math.PI / 6), 0.022 + L / 2), paint, 'pencil_body'));
  root.add(mesh(along(new THREE.CylinderGeometry(rc * 0.97, 0.00095, 0.019, 28), 0.003 + 0.0095), woodM, 'pencil_cone'));
  root.add(mesh(along(new THREE.CylinderGeometry(0.00095, 0.00012, 0.003, 14), 0.0015), graph, 'pencil_tip'));
  root.add(mesh(along(new THREE.CylinderGeometry(0.00415, 0.00415, 0.010, 32), 0.177), ferr, 'ferrule'));
  for (const x of [0.174, 0.180]) root.add(mesh(along(new THREE.CylinderGeometry(0.0043, 0.0043, 0.0008, 32), x), ferr, 'ferrule_ridge'));
  root.add(mesh(along(new THREE.CylinderGeometry(0.0039, 0.0037, 0.008, 28), 0.186), eras, 'eraser'));
  root.userData.mats = collectMats(root);
  root.userData.flatY = rc * Math.cos(Math.PI / 6);
  return root;
}

// ===================== PLAYER =====================
export function createPlayer(tex) {
  const PW = 0.114, PD = 0.088, B = 0.011, F = 0.024;
  const root = tag(new THREE.Group(), 'player'); root.name = 'cassette_player';
  const body = new THREE.MeshStandardMaterial({ name: 'player_body', color: 0x2b2522, roughness: 0.5, metalness: 0.05 });
  const bodyDark = new THREE.MeshStandardMaterial({ name: 'player_well', color: 0x141110, roughness: 0.75 });
  const alu = new THREE.MeshPhysicalMaterial({ name: 'player_lid_alu', color: 0xe6dccb, map: tex.brushed, metalness: 0.7, roughness: 0.4, anisotropy: 0.6, envMapIntensity: 2.2 });
  const glass = new THREE.MeshPhysicalMaterial({ name: 'lid_window', color: 0x2a1c14, transparent: true, opacity: 0.38, roughness: 0.04, clearcoat: 1, depthWrite: false });
  const chrome = new THREE.MeshStandardMaterial({ name: 'chrome', color: 0xdedbd2, metalness: 1, roughness: 0.18 });
  const rubber = new THREE.MeshStandardMaterial({ name: 'rubber', color: 0x111111, roughness: 0.9 });
  const keyM = new THREE.MeshStandardMaterial({ name: 'key', color: 0x3a332e, roughness: 0.45 });
  const iconM = new THREE.MeshStandardMaterial({ name: 'key_icon', color: 0xe8dfcf, roughness: 0.6 });
  const iconPlay = new THREE.MeshStandardMaterial({ name: 'key_icon_play', color: 0xe2502c, roughness: 0.6 });
  const spinM = new THREE.MeshStandardMaterial({ name: 'spindle', color: 0xd9d4c8, roughness: 0.5 });

  const xz = (geo) => geo.rotateX(-Math.PI / 2); // shape XY → XZ (shape y = -z)
  const baseShape = rr(new THREE.Shape(), 0, 0, PW - 0.0016, PD - 0.0016, 0.009);
  const baseGeo = xz(new THREE.ExtrudeGeometry(baseShape, { depth: B - 0.0016, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 3, curveSegments: 16 })); baseGeo.translate(0, 0.0008, 0);
  root.add(mesh(baseGeo, body, 'player_base'));
  const frameShape = rr(new THREE.Shape(), 0, 0, PW - 0.001, PD - 0.001, 0.009);
  frameShape.holes.push(rr(new THREE.Path(), 0, 0, 0.1045, 0.0675, 0.003));
  const frameGeo = xz(new THREE.ExtrudeGeometry(frameShape, { depth: F - B - 0.001, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.0005, bevelSegments: 2, curveSegments: 16 })); frameGeo.translate(0, B + 0.0005, 0);
  root.add(mesh(frameGeo, body, 'player_frame'));
  const floor = mesh(new THREE.PlaneGeometry(0.1045, 0.0675).rotateX(-Math.PI / 2), bodyDark, 'well_floor', false, true); floor.position.y = B + 0.0001; root.add(floor);
  const spindles = {};
  for (const [s, side] of [[-1, 'L'], [1, 'R']]) {
    const g = new THREE.Group(); g.position.set(s * CAS.HX, B, -CAS.HY);
    g.add(mesh(new THREE.CylinderGeometry(0.0052, 0.0056, 0.0012, 24).translate(0, 0.0006, 0), spinM, 'spindle_table'));
    g.add(mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0075, 16).translate(0, 0.004, 0), spinM, 'spindle'));
    for (let i = 0; i < 3; i++) { const t = mesh(box(0.0011, 0.005, 0.0016), spinM, 'spindle_tooth'); const a = i / 3 * Math.PI * 2; t.position.set(Math.cos(a) * 0.003, 0.0045, Math.sin(a) * 0.003); t.rotation.y = -a; g.add(t); }
    root.add(g); spindles[side] = g;
  }
  const head = mesh(box(0.011, 0.0075, 0.0034), chrome, 'tape_head'); head.position.set(0, B + 0.0042, 0.0335); root.add(head);
  const capstan = mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.009, 10), chrome, 'capstan'); capstan.position.set(0.0335, B + 0.0045, 0.0333); root.add(capstan);
  const pinch = mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.0055, 20), rubber, 'pinch_roller'); pinch.position.set(0.0285, B + 0.004, 0.0336); root.add(pinch);

  // lid
  const lidPivot = tag(new THREE.Group(), 'playerLid'); lidPivot.name = 'player_lid'; lidPivot.position.set(0, F, -PD / 2); root.add(lidPivot);
  const lidShape = rr(new THREE.Shape(), 0, 0, PW - 0.002, PD - 0.002, 0.008);
  lidShape.holes.push(rr(new THREE.Path(), 0, 0.003, 0.07, 0.026, 0.004));
  const lidGeo = xz(new THREE.ExtrudeGeometry(lidShape, { depth: 0.0042, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 3, curveSegments: 16 }));
  lidGeo.translate(0, 0.0008, PD / 2);
  lidPivot.add(mesh(lidGeo, alu, 'lid'));
  const win = mesh(new THREE.PlaneGeometry(0.071, 0.027).rotateX(-Math.PI / 2), glass, 'lid_window', false, false); win.position.set(0, 0.0035, -0.003 + PD / 2); win.renderOrder = 5; lidPivot.add(win);

  // keys on the front edge
  const FZ = PD / 2;
  const slot = mesh(box(0.050, 0.0098, 0.001), bodyDark, 'key_slot', false); slot.position.set(0.027, 0.0175, FZ + 0.0003); root.add(slot);
  const keys = {};
  const icon = (shape, m) => { const g = new THREE.ShapeGeometry(shape); return mesh(g, m, 'key_icon', false, false); };
  const tri = (dir) => new THREE.Shape(dir === 'r' ? [new THREE.Vector2(-0.0015, -0.0017), new THREE.Vector2(0.0018, 0), new THREE.Vector2(-0.0015, 0.0017)] : [new THREE.Vector2(-0.0018, -0.0004), new THREE.Vector2(0.0018, -0.0004), new THREE.Vector2(0, 0.0016)]);
  [['btnEject', 0.012], ['btnStop', 0.027], ['btnPlay', 0.042]].forEach(([name, x]) => {
    const k = tag(new THREE.Group(), name); k.name = name;
    k.add(mesh(box(0.0128, 0.0076, 0.008), keyM, name + '_cap'));
    let ic;
    if (name === 'btnPlay') ic = icon(tri('r'), iconPlay);
    else if (name === 'btnStop') ic = icon(rr(new THREE.Shape(), 0, 0, 0.003, 0.003, 0.0003), iconM);
    else { ic = icon(tri('u'), iconM); const bar = mesh(new THREE.PlaneGeometry(0.0036, 0.0006), iconM, 'icon_bar', false, false); bar.position.set(0, -0.0013, 0.0041); k.add(bar); ic.position.y = 0.0004; }
    ic.position.z = 0.0041; k.add(ic);
    k.userData.rest = new THREE.Vector3(x, 0.0175, FZ + 0.0007);
    k.position.copy(k.userData.rest);
    k.userData.press = 0; k.userData.target = 0;
    root.add(k); keys[name] = k;
  });
  // counter + LED
  const ledMat = new THREE.MeshStandardMaterial({ name: 'led', color: 0x3a0e08, emissive: 0xff3a1a, emissiveIntensity: 0 });
  const led = mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0008, 16).rotateX(Math.PI / 2), ledMat, 'led', false, false); led.position.set(-0.006, 0.0175, FZ + 0.0005); root.add(led);
  // side details
  const wheel = mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.0035, 40).rotateZ(Math.PI / 2), rubber, 'volume_wheel'); wheel.position.set(PW / 2 - 0.0006, 0.0125, -0.018); root.add(wheel);
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; const r = mesh(box(0.0034, 0.0007, 0.0007), rubber, 'wheel_rib', false, false); r.position.set(PW / 2 - 0.0006, 0.0125 + Math.sin(a) * 0.0075, -0.018 + Math.cos(a) * 0.0075); r.rotation.x = -a; root.add(r); }
  const jack = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 20).rotateZ(Math.PI / 2), chrome, 'phones_jack', false); jack.position.set(-PW / 2 + 0.0002, 0.0125, 0.018); root.add(jack);
  const jackHole = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.0022, 16).rotateZ(Math.PI / 2), rubber, 'jack_hole', false); jackHole.position.set(-PW / 2 - 0.0001, 0.0125, 0.018); root.add(jackHole);
  const feet = new THREE.CylinderGeometry(0.004, 0.004, 0.001, 16);
  for (const [x, z] of [[-0.045, -0.033], [0.045, -0.033], [-0.045, 0.033], [0.045, 0.033]]) { const f = mesh(feet, rubber, 'foot', false, false); f.position.set(x, -0.0004, z); root.add(f); }

  root.userData.lid = lidPivot;
  root.userData.keys = keys;
  root.userData.spindles = spindles;
  root.userData.led = ledMat;
  root.userData.cassetteLocal = new THREE.Vector3(0, B + 0.0003 + CAS.T / 2, 0);
  root.userData.mats = collectMats(root).filter(m => m !== ledMat);
  return root;
}
