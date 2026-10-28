// Interaction Controller + main loop.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { TapeModel } from './tape.js';
import { AudioEngine } from './audio.js';
import { buildTextures, counterCanvas, collectionTextures } from './textures.js';
import { createCassette, createCase, createPencil, createPlayer, createCabinet, createMiniCassette, casePlastic, CAS, CAB } from './models.js';
import { createRoom } from './room.js';

const DEBUG = CONFIG.debug || new URLSearchParams(location.search).has('debug');
const TXT = {
  uk: {
    loading: 'Готуємо кімнату…', track: 'Завантажуємо запис…', synth: 'Записуємо тимчасовий трек…', enter: 'Клацніть, щоб увійти',
    start: 'Відкрийте кейс із касетою', inspect: 'Тягніть, щоб роздивитися касету · олівець — на столі',
    approach: 'Піднесіть олівець до лівої котушки й клацніть', wind: 'Затисніть і ведіть по колу за годинниковою · клацніть ще раз — вийняти олівець',
    toPlayer: 'Тепер — плеєр праворуч', needCassette: 'Спершу дістаньте касету', lidOpen: 'Закрийте кришку плеєра',
    noCassette: 'У плеєрі немає касети', stopFirst: 'Спершу натисніть Stop', endOfTape: 'Кінець плівки', limit: 'Плівка закінчилась',
  },
  en: {
    loading: 'Setting up the room…', track: 'Loading the recording…', synth: 'Recording a placeholder track…', enter: 'Click to enter',
    start: 'Open the cassette case', inspect: 'Drag to look the cassette over · the pencil is on the desk',
    approach: 'Bring the pencil to the left reel and click', wind: 'Hold and circle clockwise · click again to pull the pencil out',
    toPlayer: 'Now the player, on the right', needCassette: 'Take the cassette out first', lidOpen: 'Close the player lid',
    noCassette: 'There is no cassette in the player', stopFirst: 'Press Stop first', endOfTape: 'End of tape', limit: 'End of tape',
  },
};
const t = k => (TXT[CONFIG.lang] || TXT.uk)[k] ?? TXT.uk[k];

// ---------- DOM ----------
const canvas = document.getElementById('scene');
const loadingEl = document.getElementById('loading'), loadingTxt = document.getElementById('loading-text');
const hintEl = document.getElementById('hint'), debugEl = document.getElementById('debug');
const setLoading = s => { loadingTxt.textContent = s; };

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x060403);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.004, 10);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- helpers ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const QE = (x, y, z, o = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o));
const FLAT = QE(-Math.PI / 2, 0, 0);
const ALONG_Z = QE(0, -Math.PI / 2, 0); // pencil +X → +Z
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

class Movable {
  constructor(obj) { this.obj = obj; this.t = 1; this.fromP = V(0, 0, 0); this.fromQ = new THREE.Quaternion(); this.target = null; }
  go(target, { dur = 0.7, arc = 0, follow = 0, onDone = null } = {}) {
    this.fromP.copy(this.obj.position); this.fromQ.copy(this.obj.quaternion);
    Object.assign(this, { target, dur, arc, follow, onDone }); this.t = dur > 0 ? 0 : 1;
  }
  update(dt) {
    if (!this.target) return;
    const tg = this.target();
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur); const e = ease(this.t);
      this.obj.position.lerpVectors(this.fromP, tg.p, e); this.obj.position.y += Math.sin(Math.PI * e) * this.arc;
      this.obj.quaternion.slerpQuaternions(this.fromQ, tg.q, e);
      if (this.t >= 1 && this.onDone) { const f = this.onDone; this.onDone = null; f(); }
    } else if (this.follow > 0) {
      const k = 1 - Math.exp(-dt * this.follow); this.obj.position.lerp(tg.p, k); this.obj.quaternion.slerp(tg.q, k);
    } else { this.obj.position.copy(tg.p); this.obj.quaternion.copy(tg.q); }
  }
  get moving() { return this.t < 1; }
}

// ---------- hints ----------
const shown = new Set(); let hintKey = null, hintTimer = 0;
const HINTS = false; // on-screen hints disabled
function hint(key, { once = true, dur = 0 } = {}) {
  if (!HINTS) return;
  if (once && shown.has(key)) return; shown.add(key);
  hintKey = key; hintEl.textContent = t(key); hintEl.classList.add('on');
  clearTimeout(hintTimer); if (dur) hintTimer = setTimeout(() => clearHint(key), dur);
}
function clearHint(key) { if (!key || hintKey === key) { hintEl.classList.remove('on'); hintKey = null; } }

// ---------- grain ----------
(function grain() {
  const el = document.getElementById('grain'), frames = [];
  for (let f = 0; f < 4; f++) { const c = document.createElement('canvas'); c.width = c.height = 200; const x = c.getContext('2d'), d = x.createImageData(200, 200); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } x.putImageData(d, 0, 0); frames.push(`url(${c.toDataURL()})`); }
  let i = 0; setInterval(() => { el.style.backgroundImage = frames[i++ % 4]; el.style.backgroundPosition = `${Math.random() * 200}px ${Math.random() * 200}px`; }, 70);
})();

async function fontsReady() {
  try { await Promise.race([Promise.all(['700 40px "IBM Plex Sans"', '500 20px "IBM Plex Mono"', '40px Caveat', '700 40px "IBM Plex Sans Condensed"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
}

// =====================================================================
async function init() {
  setLoading(t('loading'));
  await fontsReady();
  const tex = await buildTextures(CONFIG);
  tex.counter = counterCanvas();
  const room = createRoom(scene, renderer, tex);
  const audio = new AudioEngine(CONFIG);
  await audio.loadTrack(s => setLoading(t(s)));
  audio.loadSamples();
  const tape = new TapeModel({ duration: audio.duration, ...CONFIG.tape });
  tape.setPos(CONFIG.tape.startAtEnd === false ? 0 : audio.duration); // starts fully played — rewind to hear it from the top

  const cassette = createCassette(tex, CONFIG.tape);
  const caseObj = createCase(tex);
  const pencil = createPencil(tex);
  const player = createPlayer(tex);
  const cabinet = createCabinet(tex);
  scene.add(cassette, caseObj, pencil, player, cabinet);
  cabinet.position.set(-0.36, 0, -0.32 + CAB.D / 2 + 0.004);
  cabinet.updateMatrixWorld(true);
  const slotWorld = s => ({ p: s.p.clone().applyMatrix4(cabinet.matrixWorld), q: cabinet.quaternion.clone().multiply(s.q) });

  // ---------- collection (cabinet) ----------
  const COL = CONFIG.collection || { albums: [] }, albums = COL.albums;
  const plastics = [0, 1, 2].map(v => casePlastic(tex, v));
  const colTex = await Promise.all(albums.map((al, i) => collectionTextures(al, i, COL.dir, COL.plainColor)));
  const slots = cabinet.userData.slots.cases, fSlot = COL.featuredSlot ?? 7;
  const order = albums.map((_, i) => i); { let s = 11; for (let i = order.length - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [order[i], order[j]] = [order[j], order[i]]; } }
  const items = [], colObjs = [];
  const slotsW = slots.map(slotWorld), shelfOf = si => (slots[si].p.y > CAB.feet + CAB.shelfY ? 0 : 1);
  const caseItem = { id: 'featured', kind: 'case', featured: true, obj: caseObj, slot: fSlot, home: slotsW[fSlot], loc: 'cabinet', desk: null };
  items.push(caseItem);
  let ai = 0;
  slots.forEach((s, si) => {
    if (si === fSlot) return;
    const idx = order[ai++]; if (idx === undefined) return;
    const al = albums[idx], tx = colTex[idx];
    const obj = createCase({ ...tex, ...tx }, { plastic: plastics[idx % 3], tag: 'colCase', lidTag: 'colCase' });
    const mini = createMiniCassette(tex, tx.sideA, tx.sideB, idx, ((idx * 37) % 100) / 100);
    mini.position.copy(obj.userData.cassetteLocal); mini.quaternion.copy(FLAT); obj.add(mini);
    scene.add(obj); colObjs.push(obj);
    const it = { id: al.id, album: al, kind: 'case', featured: false, obj, slot: si, home: slotsW[si], loc: 'cabinet', desk: null, lid: { a: 0, v: 0, target: 0 }, yaw0: Math.PI / 2 + (((idx * 0.137) % 0.16) - 0.08) };
    obj.userData.item = it; items.push(it);
  });
  const playerItem = { id: 'player', kind: 'player', obj: player, home: slotWorld(cabinet.userData.slots.player), loc: 'cabinet', desk: null };
  const pencilItem = { id: 'pencil', kind: 'pencil', obj: pencil, home: slotWorld(cabinet.userData.slots.pencil), loc: 'cabinet', desk: null };
  pencilItem.home.p.y += pencil.userData.flatY;
  items.push(playerItem, pencilItem);
  caseObj.userData.item = caseItem; player.userData.item = playerItem; pencil.userData.item = pencilItem;
  for (const it of items) { it.obj.position.copy(it.home.p); it.obj.quaternion.copy(it.home.q); }
  scene.updateMatrixWorld(true);

  // ---------- state ----------
  const S = { carry: null, carryMode: null, cyaw: 0, cpitch: 0, hov: null, tableYaw: -0.06, caseOpen: false, cassette: 'case', pencil: 'table', side: null, snap: null, playerOpen: false, playing: false, focus: 'overview', yaw: 0, pitch: 0, lastAction: 0, idle: 0 };
  const lids = { case: { a: 0, v: 0, target: 0 }, player: { a: 0, v: 0, target: 0 } };

  // ---------- poses ----------
  const pose = () => ({ p: V(0, 0, 0), q: new THREE.Quaternion() });
  const cpo = pose(), ppo = pose();
  const casePose = () => { cpo.p.copy(caseObj.userData.cassetteLocal).applyMatrix4(caseObj.matrixWorld); cpo.q.copy(caseObj.quaternion).multiply(FLAT); return cpo; };
  const playerPose = () => { ppo.p.copy(player.userData.cassetteLocal).applyMatrix4(player.matrixWorld); ppo.q.copy(player.quaternion).multiply(FLAT); return ppo; };
  const tablePoseC = { p: V(0.0, CAS.T / 2, 0.035), q: QE(0, -0.06, 0).multiply(FLAT) };
  const tablePose = () => tablePoseC;
  const camRel = (off, rel, out) => { out.p.copy(off).applyQuaternion(camera.quaternion).add(camera.position); out.q.copy(camera.quaternion).multiply(rel); return out; };
  const hp = pose(), wp = pose();
  const handPose = () => camRel(V(0, -0.018, -0.235), QE(S.pitch - 0.22, S.yaw, 0, 'YXZ'), hp);
  const windPose = () => camRel(V(-0.035, -0.018, -0.255), QE(-0.32, 0.62, 0, 'YXZ'), wp);
  const restPose = it => it.loc === 'desk' ? it.deskPose : it.home;
  const pencilTable = () => restPose(pencilItem);

  const ray = new THREE.Raycaster(), ptr = { x: 0, y: 0, ndc: new THREE.Vector2(9, 9), moved: true };
  const plane = new THREE.Plane(), tmpV = V(0, 0, 0), lastLocal = V(0, 0, 0.016), ap = pose(), ip = pose();
  const hubX = s => s === 'L' ? -CAS.HX : CAS.HX;
  function pencilApproachPose() {
    cassette.updateMatrixWorld();
    const n = V(0, 0, 1).applyQuaternion(cassette.quaternion);
    plane.setFromNormalAndCoplanarPoint(n, cassette.localToWorld(V(0, 0, 0.014)));
    ray.setFromCamera(ptr.ndc, camera);
    if (ray.ray.intersectPlane(plane, tmpV)) lastLocal.copy(cassette.worldToLocal(tmpV.clone()));
    const lx = THREE.MathUtils.clamp(lastLocal.x, -0.075, 0.075), ly = THREE.MathUtils.clamp(lastLocal.y, -0.05, 0.05);
    S.snap = null;
    if (Math.hypot(lx - hubX('L'), ly - CAS.HY) < 0.011) S.snap = 'L'; // pencil only goes into the left (supply) reel
    const tip = S.snap ? V(hubX(S.snap), CAS.HY, 0.012) : V(lx, ly, 0.018);
    ap.p.copy(cassette.localToWorld(tip));
    ap.q.copy(cassette.quaternion).multiply(S.snap ? new THREE.Quaternion() : QE(-0.3, 0.22, 0)).multiply(ALONG_Z);
    return ap;
  }
  const wob = { amt: 0, phi: 0 };
  let rollOff = 0, insertDepth = -0.020;
  function pencilInsertedPose() {
    cassette.updateMatrixWorld();
    const tilt = new THREE.Quaternion().setFromAxisAngle(V(-Math.sin(wob.phi), Math.cos(wob.phi), 0), wob.amt);
    const lq = tilt.clone().multiply(QE(0, 0, tape.ang(S.side) + rollOff));
    const hub = V(hubX(S.side), CAS.HY, 0);
    const tipL = hub.clone().add(V(0, 0, insertDepth).applyQuaternion(tilt));
    ip.p.copy(cassette.localToWorld(tipL));
    ip.q.copy(cassette.quaternion).multiply(lq).multiply(ALONG_Z);
    return ip;
  }

  const mv = { cassette: new Movable(cassette), pencil: new Movable(pencil) };
  for (const it of items) { it.mv = it === pencilItem ? mv.pencil : new Movable(it.obj); it.mv.go(() => it.home, { dur: 0 }); }
  mv.cassette.go(casePose, { dur: 0 }); mv.pencil.go(pencilTable, { dur: 0 });

  // ---------- camera ----------
  const FOCUS = {
    overview: { p: V(0, 0.30, 0.37), l: V(0, 0.0, -0.01) },
    cabinet: { p: V(-0.24, 0.32, 0.34), l: V(-0.37, 0.16, -0.19) },
  };
  const fo = { p: V(0, 0, 0), l: V(0, 0, 0) };
  const relF = (o, a, b) => { fo.p.copy(o.position).add(a); fo.l.copy(o.position).add(b); return fo; };
  const focusOf = f => f === 'case' ? relF(caseObj, V(0.03, 0.25, 0.265), V(0.005, 0, -0.01)) : f === 'player' ? relF(player, V(-0.025, 0.25, 0.275), V(-0.005, 0.008, -0.01)) : (FOCUS[f] || FOCUS.overview);
  const handLight = new THREE.PointLight(0xffd6a8, 0.05, 0.5, 2); handLight.position.set(0.05, 0.08, 0.02); camera.add(handLight); scene.add(camera); // soft light on whatever is held
  const camP = FOCUS.overview.p.clone(), camL = FOCUS.overview.l.clone(), swipeL = V(0, 0, 0);
  camera.position.copy(camP); camera.lookAt(camL);

  // ---------- actions ----------
  const now = () => performance.now() / 1000;
  const sfx = (n, d) => audio.sound(n, d);
  function openCase() { S.caseOpen = true; lids.case.target = 1.86; sfx('caseOpen'); S.focus = 'case'; clearHint('start'); }
  function closeCase() { S.caseOpen = false; lids.case.target = 0; sfx('caseClose', 0.22); }
  function cassetteToHand(from) {
    if (S.pencil === 'held') { // pencil already in hand → straight to winding
      S.cassette = 'wind'; S.pencil = 'hand'; S.focus = 'overview';
      mv.cassette.go(windPose, { dur: 0.85, arc: 0.04 }); mv.pencil.go(pencilApproachPose, { dur: 0.5, follow: 20 });
      sfx('cassetteOut'); return;
    }
    S.yaw = 0; S.pitch = 0; S.cassette = 'hand'; S.focus = 'overview';
    mv.cassette.go(handPose, { dur: 0.85, arc: from === 'table' ? 0.03 : 0.05 });
    sfx('cassetteOut'); setTimeout(() => hint('inspect', { dur: 6000 }), 900);
  }
  function cassetteTo(where) {
    S.cassette = where;
    if (where === 'case') { mv.cassette.go(casePose, { dur: 0.85, arc: 0.04, onDone: () => sfx('cassetteIn') }); S.focus = 'case'; }
    if (where === 'table') { const sp = tableSpot(); tablePoseC.p.set(sp.x, CAS.T / 2, sp.z); tablePoseC.q.copy(QE(0, sp.yaw, 0)).multiply(FLAT); S.tableYaw = sp.yaw; mv.cassette.go(tablePose, { dur: 0.75, arc: 0.03, onDone: () => sfx('cassetteDown') }); S.focus = 'overview'; }
    if (where === 'player') { mv.cassette.go(playerPose, { dur: 0.9, arc: 0.05, onDone: () => sfx('cassetteInsert') }); S.focus = 'player'; }
    clearHint('inspect');
  }
  const hpp = pose();
  const pencilHeldPose = () => camRel(V(0.035, -0.035, -0.22), QE(0.15, 0.45, -0.55, 'YXZ'), hpp);
  function pickPencil() {
    if (S.cassette !== 'hand' && S.cassette !== 'table') { // just hold it
      S.pencil = 'held'; mv.pencil.go(pencilHeldPose, { dur: 0.7, arc: 0.04 }); sfx('pencilPick'); return;
    }
    S.cassette = 'wind'; S.pencil = 'hand'; S.focus = 'overview';
    mv.cassette.go(windPose, { dur: 0.8, arc: 0.02 });
    mv.pencil.go(pencilApproachPose, { dur: 0.75, arc: 0.05, follow: 20 });
    sfx('pencilPick'); clearHint('inspect'); setTimeout(() => S.pencil === 'hand' && hint('approach'), 600);
  }
  function returnPencil() {
    S.pencil = 'table'; S.snap = null;
    mv.pencil.go(pencilTable, { dur: 0.8, arc: 0.05, onDone: () => sfx('pencilDown') });
    if (S.cassette === 'wind') { S.cassette = 'hand'; mv.cassette.go(handPose, { dur: 0.6 }); }
    clearHint('approach'); clearHint('wind');
  }
  function insertPencil(side) {
    S.pencil = 'inserting'; S.side = side; S.snap = null;
    rollOff = -tape.ang(side); wob.amt = 0; insertDepth = -0.020;
    mv.pencil.go(pencilInsertedPose, { dur: 0.3, onDone: () => { S.pencil = 'inserted'; sfx('pencilTap'); hint('wind'); } });
    clearHint('approach');
  }
  function withdrawPencil() {
    if (S.pencil !== 'inserted') return;
    endWind(); S.pencil = 'hand';
    mv.pencil.go(pencilApproachPose, { dur: 0.28, follow: 20 }); sfx('pencilOut');
    clearHint('wind'); if (shown.has('wind')) setTimeout(() => hint('toPlayer', { dur: 4000 }), 400);
  }
  function openPlayer() { S.playerOpen = true; lids.player.target = 1.12; lids.player.v = 6; sfx('playerOpen'); S.focus = 'player'; clearHint('toPlayer'); }
  function closePlayer() { S.playerOpen = false; lids.player.target = 0; sfx('playerClose', 0.17); S.focus = 'player'; }
  const keys = player.userData.keys;
  function key(name, latch) { const k = keys[name]; k.userData.target = 1; if (!latch) setTimeout(() => { if (!(name === 'btnPlay' && S.playing)) k.userData.target = 0; }, 150); }
  function startPlay() {
    if (S.playing) return;
    if (S.cassette !== 'player') { key('btnPlay'); sfx('keyDown'); sfx('keyUp', 0.15); hint('noCassette', { once: false, dur: 2200 }); return; }
    if (S.playerOpen) { key('btnPlay'); sfx('keyDown'); sfx('keyUp', 0.15); hint('lidOpen', { once: false, dur: 2200 }); return; }
    if (tape.atEnd()) { key('btnPlay'); sfx('keyDown'); sfx('keyUp', 0.15); hint('endOfTape', { once: false, dur: 2200 }); return; }
    S.playing = true; key('btnPlay', true); sfx('keyDown'); audio.motor(true); audio.play(tape.pos, 0.14);
  }
  function stopPlay(auto) {
    if (!S.playing) return;
    tape.setPos(audio.stop()); S.playing = false; audio.motor(false);
    keys.btnPlay.userData.target = 0; sfx('keyUp', auto ? 0 : 0.05);
  }
  function pressStop() { key('btnStop'); sfx('keyDown'); stopPlay(); }
  function pressEject() {
    key('btnEject'); sfx('keyDown');
    if (S.playing) { hint('stopFirst', { once: false, dur: 2200 }); return; }
    if (!S.playerOpen) setTimeout(openPlayer, 90);
  }

  // ---------- cabinet, carrying, desk placement ----------
  const DESK = { x0: -0.78, x1: 0.78, z0: -0.315, z1: 0.325 };
  const KIND = {
    case: { hx: 0.055, hz: 0.0345, cx: 0, y: 0, off: V(0, -0.004, -0.235), iq: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, 1), V(1, 0, 0))), pick: 'casePick', place: 'casePlace' },
    player: { hx: 0.060, hz: 0.042, cx: 0, y: 0, off: V(0, -0.012, -0.26), iq: QE(Math.PI / 2 - 0.3, 0, 0), pick: 'heavyPick', place: 'heavyPlace' },
    pencil: { hx: 0.0945, hz: 0.0042, cx: 0.0945, y: pencil.userData.flatY, off: V(-0.095, -0.012, -0.25), iq: QE(0.5, 0, 0.06), pick: 'pencilPick', place: 'pencilDown' },
    cassette: { hx: 0.0505, hz: 0.0322, cx: 0, y: CAS.T / 2 },
  };
  const SNAP = { featured: { x: -0.15, z: 0.055, yaw: Math.PI / 2 + 0.08 }, player: { x: 0.165, z: 0.035, yaw: -0.12 }, pencil: { x: -0.075, z: 0.15, yaw: 0.16 } };
  const snapOf = it => SNAP[it.featured ? 'featured' : it.id];
  const defYaw = it => it.desk?.yaw ?? snapOf(it)?.yaw ?? it.yaw0 ?? Math.PI / 2;
  const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
  function obbAt(x, z, yaw, k, m = 0.003) { const u = [Math.cos(yaw), -Math.sin(yaw)], v = [Math.sin(yaw), Math.cos(yaw)]; return { c: [x + u[0] * k.cx, z + u[1] * k.cx], u, v, h: [k.hx + m, k.hz + m] }; }
  function overlap(a, b) {
    const d = [b.c[0] - a.c[0], b.c[1] - a.c[1]];
    for (const ax of [a.u, a.v, b.u, b.v]) {
      const pa = a.h[0] * Math.abs(dot2(a.u, ax)) + a.h[1] * Math.abs(dot2(a.v, ax)), pb = b.h[0] * Math.abs(dot2(b.u, ax)) + b.h[1] * Math.abs(dot2(b.v, ax));
      if (Math.abs(dot2(d, ax)) > pa + pb) return false;
    }
    return true;
  }
  function inBounds(o) { for (const s of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const x = o.c[0] + o.u[0] * o.h[0] * s[0] + o.v[0] * o.h[1] * s[1], z = o.c[1] + o.u[1] * o.h[0] * s[0] + o.v[1] * o.h[1] * s[1]; if (x < DESK.x0 || x > DESK.x1 || z < DESK.z0 || z > DESK.z1) return false; } return true; }
  const CAB_OBB = { c: [cabinet.position.x, cabinet.position.z], u: [1, 0], v: [0, 1], h: [CAB.W / 2 + 0.013, CAB.D / 2 + 0.012] };
  function obstacles(ex) {
    const o = [CAB_OBB]; if (doors.L.target > 0) o.push(DOOR_OBB);
    for (const it of items) if (it !== ex && it.loc === 'desk') o.push(obbAt(it.desk.x, it.desk.z, it.desk.yaw, KIND[it.kind], 0));
    if (S.cassette === 'table' && ex !== 'cassette') o.push(obbAt(tablePoseC.p.x, tablePoseC.p.z, S.tableYaw || 0, KIND.cassette, 0));
    return o;
  }
  function findFree(kind, ex, x, z, yaw) {
    const k = KIND[kind], obs = obstacles(ex);
    for (let r = 0; r <= 0.34; r += 0.008) {
      const n = r === 0 ? 1 : Math.max(8, Math.round(r * 220));
      for (let a = 0; a < n; a++) {
        const an = a / n * Math.PI * 2, px = x + Math.cos(an) * r, pz = z + Math.sin(an) * r, o = obbAt(px, pz, yaw, k);
        if (inBounds(o) && !obs.some(b => overlap(o, b))) return { x: px, z: pz, yaw };
      }
    }
    return null;
  }
  const deskPlane = new THREE.Plane(V(0, 1, 0), 0), tmpD = V(0, 0, 0);
  function deskHit() {
    ray.setFromCamera(ptr.ndc, camera);
    if (!ray.ray.intersectPlane(deskPlane, tmpD)) return null;
    if (tmpD.x < DESK.x0 || tmpD.x > DESK.x1 || tmpD.z < DESK.z0 || tmpD.z > DESK.z1) return null;
    return { x: tmpD.x, z: tmpD.z };
  }
  function tableSpot() {
    return findFree('cassette', 'cassette', 0, 0.035, -0.06) || { x: 0, z: 0.035, yaw: -0.06 };
  }
  function snapped(it, x, z, yaw) { const sn = snapOf(it); if (sn && Math.hypot(x - sn.x, z - sn.z) < 0.045) return { x: sn.x, z: sn.z, yaw: sn.yaw }; return { x, z, yaw }; }
  const cpz = pose();
  function carryPose() {
    const it = S.carry; if (!it) return cpz; const k = KIND[it.kind];
    if (S.carryMode === 'drag' && S.hov) { cpz.p.set(S.hov.x, k.y + 0.012, S.hov.z); cpz.q.copy(QE(0, S.hov.yaw, 0)); return cpz; }
    return camRel(k.off, QE(S.cpitch, S.cyaw, 0, 'YXZ').multiply(k.iq), cpz);
  }
  const canHandle = () => !S.carry && S.pencil === 'table' && S.cassette !== 'hand' && S.cassette !== 'wind';
  function pickItem(it) {
    if (!canHandle() || (it === playerItem && S.playing)) { sfx('deny'); return; }
    it.loc = 'carry'; S.carry = it; S.carryMode = 'pick'; S.cyaw = 0; S.cpitch = 0; S.hov = null;
    it.mv.go(carryPose, { dur: 0.75, arc: 0.02, follow: 14 });
    sfx(KIND[it.kind].pick);
  }
  function placeItem(it, x, z, yaw, dur = 0.55) {
    const k = KIND[it.kind], sn = S.carryMode !== 'drag' && snapOf(it), s0 = sn ? { ...sn } : snapped(it, x, z, yaw);
    const spot = findFree(it.kind, it, s0.x, s0.z, s0.yaw);
    if (!spot) { sfx('deny'); return false; }
    it.desk = spot; it.loc = 'desk'; it.deskPose = { p: V(spot.x, k.y, spot.z), q: QE(0, spot.yaw, 0) };
    if (S.carry === it) S.carry = null;
    it.mv.go(() => it.deskPose, { dur, arc: dur > 0.3 ? 0.03 : 0, onDone: () => sfx(k.place) });
    return true;
  }
  // nearest free case slot; shelf null = any (own slot preferred), lx = cabinet-local x of the click
  function freeSlot(it, shelf, lx) {
    const taken = new Set(items.filter(o => o !== it && o.kind === 'case' && o.loc === 'cabinet').map(o => o.slot));
    if (shelf === null && !taken.has(it.slot)) return it.slot;
    const ref = lx ?? slots[it.slot].p.x, refShelf = shelfOf(it.slot);
    let best = null, bd = 1e9;
    slots.forEach((s, si) => {
      if (taken.has(si) || (shelf !== null && shelfOf(si) !== shelf)) return;
      const d = Math.abs(s.p.x - ref) + (shelf === null && shelfOf(si) !== refShelf ? 1 : 0);
      if (d < bd) { bd = d; best = si; }
    });
    return best;
  }
  function returnHome(it, slotIdx) {
    if (it === caseItem && S.caseOpen) closeCase();
    if (it.lid && it.lid.target) { it.lid.target = 0; sfx('caseClose', 0.2); }
    if (it === playerItem && S.playerOpen) { S.playerOpen = false; lids.player.target = 0; sfx('playerClose', 0.17); }
    if (it.kind === 'case') { const si = slotIdx !== undefined ? slotIdx : freeSlot(it, null, null) ?? it.slot; it.slot = si; it.home = slotsW[si]; }
    it.loc = 'cabinet'; it.desk = null; if (S.carry === it) S.carry = null;
    it.mv.go(() => it.home, { dur: 0.85, arc: 0.03, onDone: () => sfx(KIND[it.kind].place) });
    S.focus = 'cabinet';
  }
  function carryClick(hit) {
    const it = S.carry; if (it.mv.moving) return;
    if (hit && hit.item === it) hit = pick(it); // click on the carried item = click on whatever is behind it (cabinet or desk)
    if (hit && (hit.tag === 'cabinet' || hit.tag === 'cabDoor' || hit.item?.loc === 'cabinet')) {
      if (it.kind === 'case' && hit.point && hit.tag !== 'cabDoor') {
        const lp = cabinet.worldToLocal(hit.point.clone());
        const si = freeSlot(it, lp.y > CAB.feet + CAB.shelfY + CAB.t / 2 ? 0 : 1, lp.x);
        if (si === null) { sfx('deny'); return; }
        return returnHome(it, si);
      }
      return returnHome(it);
    }
    const d = deskHit(); if (!d) return;
    const yaw = defYaw(it), k = KIND[it.kind];
    if (placeItem(it, d.x - Math.cos(yaw) * k.cx, d.z + Math.sin(yaw) * k.cx, yaw)) S.focus = 'overview';
  }
  const doors = { L: { a: 0, v: 0, target: 0 } };
  const DOOR_OBB = { c: [cabinet.position.x - CAB.W / 2 - 0.11, cabinet.position.z + 0.2], u: [1, 0], v: [0, 1], h: [0.13, 0.22] };
  function toggleDoor(side) { const d = doors[side], open = d.target === 0; d.target = open ? 1.9 : 0; sfx(open ? 'cabinetOpen' : 'cabinetClose', open ? 0 : 0.2); }
  function clickCabinet(hit) {
    const side = hit?.tag === 'cabDoor' ? hit.obj.userData.side : null;
    if (S.focus !== 'cabinet') { S.focus = 'cabinet'; if (side && doors[side].target === 0) toggleDoor(side); return; }
    if (side) toggleDoor(side);
  }
  function clickColCase(it) { const l = it.lid, open = l.target === 0; l.target = open ? 1.86 : 0; sfx(open ? 'caseOpen' : 'caseClose', open ? 0 : 0.22); }

  function clickPlayer(part) {
    if (part === 'btnPlay') return startPlay();
    if (part === 'btnStop') return pressStop();
    if (part === 'btnEject') return pressEject();
    if (S.playing) { sfx('deny'); hint('stopFirst', { once: false, dur: 2200 }); return; }
    if (!S.playerOpen) return openPlayer();
    if (S.cassette === 'hand') return cassetteTo('player');
    if (S.cassette === 'player' && part === 'cassette') return cassetteToHand('player');
    closePlayer();
  }
  function clickCase(part) {
    if (!S.caseOpen) return openCase();
    if (S.cassette === 'hand') return cassetteTo('case');
    if (S.cassette === 'case' && part !== 'caseLid') return cassetteToHand('case');
    closeCase(); S.focus = 'overview';
  }
  function clickCassette() {
    if (S.cassette === 'case') return clickCase('cassette');
    if (S.cassette === 'table') return cassetteToHand('table');
    if (S.cassette === 'player') return clickPlayer('cassette');
  }
  function handleClick(hit) {
    if (now() - S.lastAction < 0.25) return;
    S.lastAction = now(); S.idle = 0;
    if (S.carry) return carryClick(hit);
    if (S.pencil === 'inserting') return;
    if (S.pencil === 'hand') { if (S.cassette === 'wind' && S.snap) insertPencil(S.snap); else returnPencil(); return; }
    if (S.cassette === 'hand' && hit?.tag === 'cassette') hit = pick('cassette'); // click on the held cassette = click on whatever is behind it
    const tg = hit?.tag || 'void', it = hit?.item;
    if (S.pencil === 'held' && (tg === 'void' || tg === 'desk' || tg === 'pencil' || tg === 'cabinet' || tg === 'cabDoor' || tg === 'colCase' || (it && it.loc === 'cabinet'))) return returnPencil();
    if (tg === 'cabinet' || tg === 'cabDoor') return clickCabinet(hit);
    if (it && it.loc === 'cabinet') return pickItem(it);
    if (tg === 'colCase') { if (S.cassette === 'hand') return cassetteTo('table'); return pickItem(it); }
    if (tg === 'case' || tg === 'caseLid') return clickCase(tg);
    if (tg === 'cassette') return clickCassette();
    if (tg === 'pencil') return pickPencil();
    if (tg === 'player' || tg === 'playerLid' || tg.startsWith('btn')) return clickPlayer(tg);
    if (S.cassette === 'hand') return cassetteTo('table');
    S.focus = 'overview';
  }
  function back() { // right-click / Esc
    if (S.carry) { const it = S.carry; if (S.carryMode === 'drag' && it.desk) placeItem(it, it.desk.x, it.desk.z, it.desk.yaw, 0.25); else returnHome(it); return; }
    if (S.pencil === 'inserted') withdrawPencil();
    else if (S.pencil === 'hand' || S.pencil === 'held') returnPencil();
    else if (S.cassette === 'hand') cassetteTo('table');
    else if (S.focus === 'cabinet') S.focus = 'overview';
  }

  // ---------- picking ----------
  function pick(skip) {
    ray.setFromCamera(ptr.ndc, camera);
    const targets = [cassette, caseObj, player, room.desk, cabinet, ...colObjs]; if (S.pencil === 'table') targets.push(pencil);
    for (const h of ray.intersectObjects(targets, true)) {
      let o = h.object, tg = null, tobj = null, item = null;
      while (o) { if (!tg && o.userData.tag) { tg = o.userData.tag; tobj = o; } if (o.userData.item) { item = o.userData.item; break; } o = o.parent; }
      if (skip && (item === skip || (skip === 'cassette' && tg === 'cassette'))) continue;
      if (tg) {
        if (tg === 'cassette' && S.cassette === 'case') item = caseItem;
        if (tg === 'cassette' && S.cassette === 'player') item = playerItem;
        return { tag: tg, obj: tobj, item, point: h.point };
      }
    }
    return null;
  }
  const rootOf = tg => ({ cassette, case: caseObj, caseLid: caseObj, pencil, player, playerLid: player, btnPlay: player, btnStop: player, btnEject: player })[tg];
  const hl = new Map([[cassette, 0], [caseObj, 0], [pencil, 0], [player, 0]]);
  let hover = null;

  // ---------- winding gesture ----------
  const W = { active: false, cx: 0, cy: 0, last: 0, pending: 0, hist: [], tick: 0, speed: 0, strainT: 0 };
  function hubScreen() { const p = cassette.localToWorld(V(hubX(S.side), CAS.HY, 0)).project(camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; }
  function beginWind(x, y) {
    const [hx, hy] = hubScreen();
    Object.assign(W, { active: true, cx: hx, cy: hy, hist: [] });
    W.last = Math.atan2(-(y - W.cy), x - W.cx);
    canvas.style.cursor = 'grabbing';
  }
  function moveWind(x, y) {
    const tNow = performance.now();
    W.hist.push([x, y, tNow]); while (W.hist.length && tNow - W.hist[0][2] > 450) W.hist.shift();
    if (W.hist.length > 6) {
      let mx = 0, my = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const [a, b] of W.hist) { mx += a; my += b; minx = Math.min(minx, a); maxx = Math.max(maxx, a); miny = Math.min(miny, b); maxy = Math.max(maxy, b); }
      if (maxx - minx > 24 && maxy - miny > 24) { mx /= W.hist.length; my /= W.hist.length; W.cx += (mx - W.cx) * 0.12; W.cy += (my - W.cy) * 0.12; }
    }
    const dx = x - W.cx, dy = y - W.cy;
    const a = Math.atan2(-dy, dx);
    if (Math.hypot(dx, dy) < 10) { W.last = a; return; }
    const d = wrap(a - W.last); W.last = a;
    if (Math.abs(d) < 1.1) W.pending = THREE.MathUtils.clamp(W.pending + d, -Math.PI, Math.PI);
    wob.phi = a;
  }
  function endWind() { W.active = false; W.pending = 0; canvas.style.cursor = ''; }

  // ---------- input ----------
  const swipe = { dx: 0 }, STRIP = ['cabinet', 'overview', 'player'];
  const look = { on: false, zone: 0, t: 0, fired: false, nx: 0 }; // mouse: edge-dwell look
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') look.on = false; });
  function swipeTo(dir) { // dir −1 = look left (cabinet), +1 = look right (player)
    const i = STRIP.indexOf(S.focus === 'case' ? 'overview' : S.focus); let j = THREE.MathUtils.clamp((i < 0 ? 1 : i) + dir, 0, 2);
    if (STRIP[j] === 'player' && playerItem.loc !== 'desk' && playerItem.loc !== 'carry') j = 1;
    if (STRIP[j] !== S.focus) { S.focus = STRIP[j]; S.lastAction = now(); S.idle = 0; }
  }
  const drag = { on: false, mode: null, x: 0, y: 0, sx: 0, sy: 0, moved: false };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    audio.ensure(); revealDone();
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (e.button === 2) { back(); return; }
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    Object.assign(drag, { on: true, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, mode: null, t0: performance.now() });
    if (S.pencil === 'inserted') { drag.mode = 'wind'; beginWind(e.clientX, e.clientY); return; }
    drag.mode = e.pointerType === 'mouse' ? null : 'swipe';
    if (S.carry) { if (S.carryMode === 'pick' && !S.carry.mv.moving && pick()?.item === S.carry) drag.mode = 'cinspect'; return; }
    if (S.cassette === 'hand' && !mv.cassette.moving) { const h = pick(); if (h?.tag === 'cassette') drag.mode = 'inspect'; return; }
    if (canHandle()) {
      const h = pick(), it = h?.item;
      if (it && it.loc === 'desk' && !(it === playerItem && S.playing) && !it.mv.moving) {
        const d = deskHit(); drag.mode = 'move'; drag.item = it; drag.off = d ? { x: it.desk.x - d.x, z: it.desk.z - d.z } : { x: 0, z: 0 };
      }
    }
  });
  canvas.addEventListener('pointermove', e => {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ptr.moved = true;
    if (e.pointerType === 'mouse') look.on = true;
    if (!drag.on) return;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
    if (drag.mode === 'wind') moveWind(e.clientX, e.clientY);
    if (drag.mode === 'swipe' && drag.moved) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) > Math.min(36, innerWidth * 0.045) && Math.abs(dx) > Math.abs(dy) * 0.9) { swipeTo(dx > 0 ? -1 : 1); drag.mode = 'swiped'; swipe.dx = 0; }
      else swipe.dx = dx;
    }
    if (drag.mode === 'cinspect' && drag.moved) {
      S.cyaw += (e.clientX - drag.x) * 0.011; S.cpitch = THREE.MathUtils.clamp(S.cpitch + (e.clientY - drag.y) * 0.011, -1.4, 1.4); canvas.style.cursor = 'grabbing';
    }
    if (drag.mode === 'move' && drag.moved) {
      const it = drag.item;
      if (!S.carry) { it.loc = 'carry'; S.carry = it; S.carryMode = 'drag'; S.hov = { ...it.desk }; it.mv.go(carryPose, { dur: 0.12, follow: 24 }); sfx(KIND[it.kind].pick); canvas.style.cursor = 'grabbing'; }
      const d = deskHit();
      if (d) { const s0 = snapped(it, d.x + drag.off.x, d.z + drag.off.z, it.desk.yaw); const sp = findFree(it.kind, it, s0.x, s0.z, s0.yaw); if (sp) S.hov = sp; }
    }
    if (drag.mode === 'inspect' && drag.moved) {
      S.yaw += (e.clientX - drag.x) * 0.011; S.pitch = THREE.MathUtils.clamp(S.pitch + (e.clientY - drag.y) * 0.011, -1.3, 1.3);
      canvas.style.cursor = 'grabbing'; clearHint('inspect');
    }
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const up = e => {
    if (!drag.on) return; drag.on = false;
    if (drag.mode === 'swiped') { swipe.dx = 0; return; }
    if (drag.mode === 'swipe') { const dx = e ? e.clientX - drag.sx : 0, dy = e ? e.clientY - drag.sy : 0; swipe.dx = 0; if (Math.abs(dx) > Math.min(70, innerWidth * 0.08) && Math.abs(dx) > Math.abs(dy) * 1.2) { swipeTo(dx > 0 ? -1 : 1); return; } }
    if (drag.mode === 'wind') { endWind(); if (e && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 12 && performance.now() - drag.t0 < 350) withdrawPencil(); return; }
    canvas.style.cursor = '';
    if (drag.mode === 'move' && S.carry === drag.item && S.carryMode === 'drag') { const h = S.hov || drag.item.desk; placeItem(drag.item, h.x, h.z, h.yaw, 0.16); S.lastAction = now(); return; }
    if (!drag.moved) handleClick(pick());
  };
  canvas.addEventListener('pointerup', up);
  const cancel = () => { drag.on = false; swipe.dx = 0; endWind(); if (S.carry && S.carryMode === 'drag') { const it = S.carry, h = S.hov || it.desk; placeItem(it, h.x, h.z, h.yaw, 0.16); } };
  canvas.addEventListener('pointercancel', cancel);
  addEventListener('blur', cancel);
  addEventListener('keydown', e => { if (e.key === 'Escape') back(); });

  // ---------- counter ----------
  let counterStr = '';
  function drawCounter(s) {
    const { x, c, tex: ct } = tex.counter;
    x.fillStyle = '#0c0a09'; x.fillRect(0, 0, c.width, c.height);
    x.font = '500 46px "IBM Plex Mono", monospace'; x.textBaseline = 'middle'; x.textAlign = 'center';
    [...s].forEach((ch, i) => { const cx = 34 + i * 47; if (ch !== ':') { x.fillStyle = '#1f1b18'; x.fillRect(cx - 19, 8, 38, 56); } x.fillStyle = '#e8dcc4'; x.fillText(ch, cx, 38); });
    ct.needsUpdate = true;
  }
  const fmt = sec => { const s = Math.floor(sec); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  // ---------- loop ----------
  let lastT = performance.now(), time = 0, prevHubAng = 0;
  function frame() {
    const tn = performance.now(), dt = Math.min(0.05, Math.max(0.0001, (tn - lastT) / 1000)); lastT = tn; time += dt;

    // playback → tape
    if (S.playing) { const p = audio.position(); tape.setPos(p); if (p >= audio.duration - 0.02) { tape.setPos(audio.duration); stopPlay(true); } }

    // winding → tape
    if (S.pencil === 'inserted') {
      const maxStep = CONFIG.tape.maxTurnsPerSecond * Math.PI * 2 * dt;
      const step = THREE.MathUtils.clamp(W.pending, -maxStep, maxStep);
      W.pending -= step;
      if (!W.active) W.pending *= Math.exp(-dt * 10);
      const applied = tape.driveHub(S.side, step);
      const slack = S.side === 'L' ? step > 0 : step < 0; // turning a hub the "push" way only pays out slack
      if (slack) W.pending = 0;
      else if (Math.abs(step) > 1e-4 && Math.abs(applied) < Math.abs(step) * 0.3) {
        W.pending = 0;
        if (time - W.strainT > 0.6) { W.strainT = time; sfx('strain'); hint('limit', { once: false, dur: 1500 }); }
      }
      const sp = applied / dt; W.speed += (sp - W.speed) * Math.min(1, dt * 12);
      audio.setWind(W.speed);
      const ang = tape.ang(S.side);
      if (Math.floor(ang / (Math.PI / 3)) !== Math.floor(prevHubAng / (Math.PI / 3))) sfx('windTick');
      prevHubAng = ang;
      wob.amt += ((W.active ? Math.min(0.07, Math.abs(W.speed) * 0.006) : 0) - wob.amt) * Math.min(1, dt * 6);
      if (W.active && Math.abs(applied) > 0) clearHint('wind');
    } else { audio.setWind(0); W.speed = 0; prevHubAng = S.side ? tape.ang(S.side) : 0; }

    // lids (springs)
    for (const [k, l] of Object.entries(lids)) {
      const st = k === 'player' ? 120 : 70, dm = k === 'player' ? 11 : 13;
      l.v += ((l.target - l.a) * st - l.v * dm) * dt; l.a += l.v * dt;
      if (l.a < 0) { l.a = 0; l.v = Math.abs(l.v) * 0.15; }
    }
    caseObj.userData.lid.rotation.x = -lids.case.a;
    for (const it of items) if (it.lid) { const l = it.lid; l.v += ((l.target - l.a) * 70 - l.v * 13) * dt; l.a += l.v * dt; if (l.a < 0) { l.a = 0; l.v = Math.abs(l.v) * 0.15; } it.obj.userData.lid.rotation.x = -l.a; }
    for (const [s, d] of Object.entries(doors)) { d.v += ((d.target - d.a) * 55 - d.v * 10) * dt; d.a += d.v * dt; if (d.a < 0) { d.a = 0; d.v = 0; } cabinet.userData.doors[s].rotation.y = s === 'L' ? -d.a : d.a; }
    player.userData.lid.rotation.x = -lids.player.a;
    for (const k of Object.values(keys)) { k.userData.press += (k.userData.target - k.userData.press) * Math.min(1, dt * 30); k.position.z = k.userData.rest.z - k.userData.press * 0.0032; }
    player.userData.led.emissiveIntensity += ((S.playing ? 3 : 0) - player.userData.led.emissiveIntensity) * Math.min(1, dt * 10);

    // camera
    const lookOK = look.on && !drag.on && S.cassette !== 'wind' && S.pencil !== 'inserted' && S.pencil !== 'hand' && S.pencil !== 'inserting';
    if (lookOK) {
      const nx = ptr.x / innerWidth * 2 - 1, z = nx < -0.84 ? -1 : nx > 0.84 ? 1 : 0;
      if (z !== look.zone) { look.zone = z; look.t = 0; look.fired = false; }
      else if (z && !look.fired && (look.t += dt) > 0.22) { look.fired = true; swipeTo(z); }
    }
    look.nx += ((lookOK ? THREE.MathUtils.clamp(ptr.x / innerWidth * 2 - 1, -1, 1) : 0) - look.nx) * (1 - Math.exp(-dt * 3));
    const F = focusOf(S.focus), kc = 1 - Math.exp(-dt * 2.2);
    swipeL.copy(F.l); swipeL.x -= THREE.MathUtils.clamp(swipe.dx, -200, 200) * 0.00035; swipeL.x += look.nx * 0.022; swipeL.y -= (ptr.y / innerHeight - 0.5) * (lookOK ? 0.012 : 0);
    camP.lerp(F.p, kc); camL.lerp(swipeL, swipe.dx ? 1 - Math.exp(-dt * 8) : kc);
    camera.position.copy(camP); camera.position.y += Math.sin(time * 0.5) * 0.0008; camera.position.x += Math.sin(time * 0.31) * 0.0008;
    camera.lookAt(camL); camera.updateMatrixWorld();

    // objects
    for (const it of items) if (it !== pencilItem) it.mv.update(dt);
    caseObj.updateMatrixWorld(); player.updateMatrixWorld();
    mv.cassette.update(dt); cassette.updateMatrixWorld();
    mv.pencil.update(dt);
    cassette.userData.update(tape);
    for (const s of ['L', 'R']) {
      const g = cassette.userData.glows[s];
      g.material.opacity += (((S.pencil === 'hand' && S.snap === s) ? 0.75 : 0) - g.material.opacity) * Math.min(1, dt * 12);
      player.userData.spindles[s].rotation.y = S.cassette === 'player' ? tape.ang(s) : player.userData.spindles[s].rotation.y;
    }

    // hover
    if (ptr.moved && !drag.on) {
      ptr.moved = false;
      if (S.pencil === 'inserted') { hover = null; canvas.style.cursor = 'grab'; }
      else if (S.pencil === 'hand') { hover = null; canvas.style.cursor = S.snap ? 'pointer' : 'default'; }
      else if (S.carry) { hover = null; const h = pick(); canvas.style.cursor = S.carryMode === 'drag' ? 'grabbing' : h?.item === S.carry ? 'grab' : 'pointer'; }
      else {
        const h = pick(); let root = h ? rootOf(h.tag) : null;
        const rItem = h?.item || root?.userData.item;
        if (rItem && rItem.loc !== 'desk') root = null; // nothing glows inside the cabinet
        if (root === cassette && S.cassette === 'hand') { canvas.style.cursor = 'grab'; root = null; }
        else canvas.style.cursor = (root || h?.tag === 'cabinet' || h?.tag === 'cabDoor' || h?.tag === 'colCase' || rItem) ? 'pointer' : (S.cassette === 'hand' ? 'pointer' : 'default');
        hover = root;
      }
    }
    for (const [root, v] of hl) {
      const tv = root === hover ? 1 : 0, nv = v + (tv - v) * Math.min(1, dt * 8); hl.set(root, nv);
      for (const m of root.userData.mats) m.emissive.setRGB(0.07 * nv, 0.045 * nv, 0.02 * nv);
    }

    // idle hint
    S.idle += dt; if (S.idle > 7 && !S.caseOpen && S.cassette === 'case') hint('start');

    room.update(time);
    if (DEBUG) debugEl.textContent = `pos ${tape.pos.toFixed(2)}s / ${audio.duration.toFixed(1)}s · rL ${(tape.rL() * 1000).toFixed(1)}mm rR ${(tape.rR() * 1000).toFixed(1)}mm · ${S.cassette}/${S.pencil}${S.playing ? ' ▶' : ''} · carry ${S.carry?.id || '-'} · focus ${S.focus}`;
    renderer.render(scene, camera);
    schedule();
  }
  // rAF with a timer fallback (rAF can be paused in hidden/background frames)
  let pending = false;
  function schedule() {
    if (pending) return; pending = true;
    let done = false;
    const run = () => { if (done) return; done = true; pending = false; frame(); };
    requestAnimationFrame(run); setTimeout(run, 120);
  }
  frame();
  if (DEBUG) { debugEl.style.display = 'block'; window.__dbg = { S, tape, audio, handleClick, insertPencil, pickPencil, camera, ptr, scene, items, pickItem, placeItem, returnHome, toggleDoor, caseItem, playerItem, pencilItem };
    window.__snap = (w = 924) => { renderer.render(scene, camera); const k = document.createElement('canvas'); k.width = w; k.height = Math.round(w * innerHeight / innerWidth); k.getContext('2d').drawImage(canvas, 0, 0, k.width, k.height); let im = document.getElementById('snap'); if (!im) { im = document.createElement('img'); im.id = 'snap'; im.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:50;pointer-events:none'; document.body.appendChild(im); } im.src = k.toDataURL('image/jpeg', 0.85); };
    window.__unsnap = () => document.getElementById('snap')?.remove();
    window.__grad = (W = 360, x0 = 0, y0 = 0, x1 = 1, y1 = 1) => { // capture-friendly pixel dump (rows of hard-stop gradients)
      renderer.render(scene, camera);
      const ar = (innerHeight * (y1 - y0)) / (innerWidth * (x1 - x0)), H = Math.round(W * ar);
      const k = document.createElement('canvas'); k.width = W; k.height = H; const x = k.getContext('2d');
      x.drawImage(canvas, canvas.width * x0, canvas.height * y0, canvas.width * (x1 - x0), canvas.height * (y1 - y0), 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data; let el = document.getElementById('snapg'); if (el) el.remove();
      el = document.createElement('div'); el.id = 'snapg'; el.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;pointer-events:none';
      for (let j = 0; j < H; j++) { const st = []; for (let i = 0; i < W; i++) { const o = (j * W + i) * 4; st.push(`rgb(${d[o]},${d[o + 1]},${d[o + 2]}) ${(i / W * 100).toFixed(3)}% ${((i + 1) / W * 100).toFixed(3)}%`); } const r = document.createElement('div'); r.style.cssText = `flex:1;background:linear-gradient(to right,${st.join(',')})`; el.appendChild(r); }
      document.body.appendChild(el);
    }; }

  setLoading('');
  loadingEl.classList.add('ready');
  setTimeout(revealDone, 600);
}
let revealed = false;
function revealDone() { if (revealed) return; revealed = true; loadingEl.classList.add('gone'); }

init().catch(e => { console.error(e); window.__fail ? window.__fail('Помилка: ' + e.message) : setLoading('Помилка: ' + e.message); });
