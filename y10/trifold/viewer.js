// Сцена, CameraController, активні точки, DebugView і склеювання з InteractionController.
import * as THREE from 'https://esm.sh/three@0.170.0';
import { OrbitControls } from 'https://esm.sh/three@0.170.0/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'https://esm.sh/three@0.170.0/examples/jsm/environments/RoomEnvironment.js';
import { derive, buildModel, setStrings } from './model.js';
import { AssetManager } from './assets.js';
import { Controller, runSelfTests } from './controller.js';
import { STRINGS } from './strings.js';

const V3 = THREE.Vector3;

export async function createViewer({ host, hotspotLayer, baseUrl, onState }) {
  const [cfg, manifest] = await Promise.all([
    fetch(baseUrl + 'config.json').then(r => r.json()),
    fetch(baseUrl + 'manifest.json').then(r => r.json())
  ]);
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) { onState({ error: STRINGS.noWebgl }); return null; }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, cfg.render.maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  // друк має виглядати як вихідний файл: без тонового стискання, рівне м'яке світло (сумарна освітленість лиця ≈ 1)
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = !!cfg.render.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const cv = renderer.domElement;
  cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  host.appendChild(cv);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2b2c2e');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  scene.add(new THREE.AmbientLight('#ffffff', 0.85));
  const key = new THREE.DirectionalLight('#ffffff', 1.0); key.position.set(-1.1, 1.9, -1.7);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: 0.2, far: 6 });
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.0008; key.shadow.radius = 3;
  const fill = new THREE.DirectionalLight('#ffffff', 0.95); fill.position.set(1.4, 0.9, 1.7);
  scene.add(key, fill);

  let dirty = true, uiDirty = true;
  const assets = new AssetManager(manifest, baseUrl, {
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    baseSize: cfg.render.baseTextureSize, labelSize: cfg.render.labelTextureSize, detailSize: cfg.render.detailTextureSize,
    onChange: () => { dirty = true; uiDirty = true; }
  });
  setStrings(STRINGS.ph);
  const geo = derive(cfg);
  const model = buildModel(cfg, geo, assets);
  scene.add(model.root);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { assets.redrawAll(); dirty = true; });

  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctrlOpts = { pairPanel: geo.pairPanel, neighbor: geo.neighbor, own: geo.own, durations: cfg.durations, reducedMotion: reduced };
  const ctrl = new Controller(ctrlOpts);
  const C = ctrl.c;

  // ---------- камера ----------
  const camera = new THREE.PerspectiveCamera(cfg.camera.fov, 1, 0.04, 20);
  const controls = new OrbitControls(camera, cv);
  controls.enableDamping = true; controls.dampingFactor = 0.09; controls.rotateSpeed = 0.75; controls.zoomSpeed = 0.9;
  controls.screenSpacePanning = true; controls.minPolarAngle = 0.08; controls.maxPolarAngle = Math.PI - 0.08;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  const cam = { mode: 'overview', k: 1, type: null, i: 0, zoom: 1, pan: new V3(), desiredDir: new V3(...cfg.camera.startDir).normalize(), snap: true, userUntil: 0 };
  camera.position.set(0, 0, -1); controls.target.set(0, 0, 0);
  let interacted = false;
  controls.addEventListener('start', () => { cam.userUntil = Infinity; cam.desiredDir = null; markInteract(); });
  controls.addEventListener('end', () => { cam.userUntil = performance.now() + 700; });
  function markInteract() { if (!interacted) { interacted = true; uiDirty = true; } }

  const box = new THREE.Box3(), tmpBox = new THREE.Box3(), center = new V3();
  function contentBox(out) {
    out.makeEmpty();
    if (cam.mode === 'object') return out.setFromObject(cam.type === 'sleeve' ? model.sleeves[cam.i] : model.records[cam.i]);
    if (cam.mode === 'panel') { for (const m of model.pickables) if (m.userData.pick.type === 'panel' && m.userData.pick.k === cam.k) out.expandByObject(m); return out; }
    out.expandByObject(model.rig);
    C.pairs.forEach((p, i) => { if (p.sp > 0) out.expandByObject(model.sleeves[i]); if (p.rp > 0) out.expandByObject(model.records[i]); });
    return out;
  }
  const _r = new V3(), _u = new V3(), _f = new V3(), _c = new V3();
  function fitDistance(b, dir) {
    _f.copy(dir).negate(); _r.crossVectors(_f, new V3(0, 1, 0)); if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0); _r.normalize(); _u.crossVectors(_r, _f);
    const vf = THREE.MathUtils.degToRad(camera.fov), tv = Math.tan(vf / 2), th = tv * camera.aspect;
    b.getCenter(center); let d = 0.05;
    for (let k = 0; k < 8; k++) {
      _c.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).sub(center);
      const dz = _c.dot(dir); d = Math.max(d, dz + Math.abs(_c.dot(_r)) / th, dz + Math.abs(_c.dot(_u)) / tv);
    }
    return d * cfg.camera.margin;
  }
  const offs = new V3(), curDir = new V3(), wantT = new V3();
  function updateCamera(dt) {
    contentBox(box); if (box.isEmpty()) return;
    const k = cam.snap ? 1 : 1 - Math.exp(-dt * 5);
    offs.subVectors(camera.position, controls.target); let dist = offs.length(); curDir.copy(offs).normalize();
    if (cam.desiredDir) { curDir.lerp(cam.desiredDir, k).normalize(); if (curDir.angleTo(cam.desiredDir) < 0.002) cam.desiredDir = null; }
    const fit = fitDistance(box, curDir);
    box.getCenter(center);
    wantT.copy(center).add(cam.pan);
    controls.target.lerp(wantT, k);
    dist = cam.snap ? fit * cam.zoom : dist + (fit * cam.zoom - dist) * k;
    camera.position.copy(controls.target).addScaledVector(curDir, dist);
    cam.snap = false;
    controls.update();
    // не пускати камеру всередину картону / платівки
    const geoBox = tmpBox.copy(box).expandByObject(model.rig).expandByScalar(0.006);
    offs.subVectors(camera.position, controls.target); let d2 = offs.length(); curDir.copy(offs).normalize();
    for (let n = 0; n < 40 && geoBox.containsPoint(camera.position); n++) { d2 *= 1.08; camera.position.copy(controls.target).addScaledVector(curDir, d2); }
    if (performance.now() < cam.userUntil) {
      cam.zoom = THREE.MathUtils.clamp(d2 / fit, cfg.camera.minZoom, cfg.camera.maxZoom);
      cam.pan.subVectors(controls.target, center);
      const half = box.getSize(new V3()).multiplyScalar(0.5); cam.pan.clamp(half.negate(), box.getSize(new V3()).multiplyScalar(0.5));
    }
  }
  function toOverview(resetZoom = true) {
    cam.mode = 'overview'; controls.enableRotate = true; if (resetZoom) { cam.zoom = 1; cam.pan.set(0, 0, 0); } cam.userUntil = 0;
    assets.setDetail([], false);
  }

  // ---------- пози предметів (від базових станів) ----------
  const rootInv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _t = new THREE.Matrix4();
  const pos = new V3(), quat = new THREE.Quaternion(), scl = new V3(), qU = new THREE.Quaternion(), qF = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  const Y = new V3(0, 1, 0), W0 = new V3(), W1 = new V3(), W2 = new V3(), W3 = new V3();
  const L = cfg.layout;
  const bez2 = (a, b, c, s, out) => out.set(0, 0, 0).addScaledVector(a, (1 - s) * (1 - s)).addScaledVector(b, 2 * s * (1 - s)).addScaledVector(c, s * s);
  const bez3 = (a, b, c, d, s, out) => { const u = 1 - s; return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * s * u * u).addScaledVector(c, 3 * s * s * u).addScaledVector(d, s * s * s); };
  function exitPoint(k, out) {
    const d = geo.exits[k];
    _m.multiplyMatrices(rootInv, model.pockets[k].matrixWorld);
    return out.set(d[0] * geo.slide[k], d[1] * geo.slide[k], 0).applyMatrix4(_m);
  }
  function applyExtra(obj, insp, pitch, yaw, flip) {
    pos.z -= insp * L.inspectForward;
    qU.setFromEuler(eul.set(pitch, yaw, 0)); qF.setFromAxisAngle(Y, Math.PI * flip);
    obj.position.copy(pos); obj.quaternion.copy(quat).multiply(qU).multiply(qF);
    obj.updateMatrix(); obj.updateMatrixWorld(true);
  }
  function poseAll() {
    model.applyRig(C.open, C.bend);
    model.root.updateMatrixWorld(true);
    rootInv.copy(model.root.matrixWorld).invert();
    geo.pairPanel.forEach((k, i) => {
      const P = C.pairs[i], s = model.sleeves[i], d = geo.exits[k], disp = geo.display[i];
      if (P.sp <= 1) {
        _m.multiplyMatrices(rootInv, model.pockets[k].matrixWorld);
        _t.makeTranslation(d[0] * geo.slide[k] * P.sp, d[1] * geo.slide[k] * P.sp, 0);
        _m.multiply(_t).decompose(pos, quat, scl);
      } else {
        exitPoint(k, W0); W1.copy(W0); W1.z -= L.forwardZ * 1.15; W2.set(...disp.sleeve);
        bez2(W0, W1, W2, P.sp - 1, pos); quat.identity();
      }
      applyExtra(s, P.si, P.spitch, P.syaw, P.sf);
      const r = model.records[i];
      if (P.rp <= 1) {
        _t.makeTranslation(0, geo.recExit * P.rp, 0); _m.copy(s.matrix).multiply(_t).decompose(pos, quat, scl);
      } else {
        W0.set(...disp.sleeve); W0.y += geo.recExit; W3.set(...disp.record);
        W1.copy(W0); W1.z -= L.recordPassZ; W2.copy(W3); W2.z -= L.recordPassZ;
        bez3(W0, W1, W2, W3, P.rp - 1, pos); quat.identity();
      }
      applyExtra(r, P.ri, P.rpitch, P.ryaw, P.rf);
      // платівка всередині конверта в кишені повністю закрита — не рендеримо, щоб її краї не просвічували крізь тонкі стінки
      r.visible = !(P.sp === 0 && P.rp === 0);
    });
  }

  // ---------- активні точки ----------
  const hot = [];
  geo.pairPanel.forEach((k, i) => {
    for (const kind of ['sleeveOut', 'recordOut']) {
      const b = document.createElement('button');
      const label = STRINGS.hotspot[kind](i + 1);
      b.type = 'button'; b.setAttribute('aria-label', label); b.title = label;
      b.style.cssText = 'position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:0;padding:0;background:transparent;cursor:pointer;display:none;pointer-events:auto;align-items:center;justify-content:center';
      const dot = document.createElement('span');
      dot.style.cssText = 'width:22px;height:22px;border-radius:50%;background:#ece9e3;border:2px solid #1f2022;box-shadow:0 1px 8px rgba(0,0,0,0.45);display:block';
      b.appendChild(dot);
      b.addEventListener('click', e => { e.stopPropagation(); api[kind === 'sleeveOut' ? 'sleeveOutAt' : 'recordOutAt'](i); });
      hotspotLayer.appendChild(b);
      hot.push({ el: b, kind, i, k, shown: false });
    }
  });
  const ray = new THREE.Raycaster(), hp = new V3(), proj = new V3();
  function updateHotspots() {
    const W = cv.clientWidth, H = cv.clientHeight, idle = !ctrl.step && !ctrl.plan(true);
    const flat = Math.abs(C.open - 1) < 1e-6 && C.bend.every(b => b === 0);
    for (const h of hot) {
      const P = C.pairs[h.i], G = ctrl.g.pairs[h.i];
      let show = idle && cam.mode !== 'object';
      if (h.kind === 'sleeveOut') { show = show && flat && P.sp === 0 && G.sl === 0; if (show) { const d = geo.exits[h.k]; model.pockets[h.k].localToWorld(hp.set(d[0] * geo.ws[h.k] / 2, d[1] * geo.h / 2, 0)); } }
      else { show = show && P.sp === 2 && P.rp === 0 && P.si === 0 && G.rec === 0; if (show) model.sleeves[h.i].localToWorld(hp.set(0, geo.sh / 2, 0)); }
      if (show) {
        proj.copy(hp).project(camera);
        show = proj.z < 1 && Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1;
        if (show) {
          const dist = camera.position.distanceTo(hp);
          ray.set(camera.position, hp.clone().sub(camera.position).normalize()); ray.far = dist;
          const hit = ray.intersectObjects(model.pickables, false)[0];
          if (hit && hit.distance < dist - 0.004) {
            const pk = hit.object.userData.pick;
            const own = h.kind === 'sleeveOut' ? (pk.type === 'panel' && pk.k === h.k) || (pk.type === 'sleeve' && pk.i === h.i) : (pk.type === 'sleeve' || pk.type === 'record') && pk.i === h.i;
            if (!own) show = false;
          }
        }
      }
      if (show) { h.el.style.transform = `translate(${(proj.x + 1) / 2 * W}px, ${(1 - proj.y) / 2 * H}px)`; }
      if (show !== h.shown) { h.el.style.display = show ? 'flex' : 'none'; h.shown = show; }
    }
  }

  // ---------- вибір, огляд, перетягування предмета ----------
  let active = { type: 'panel', i: 0 };
  const isTouch = e => e.pointerType === 'touch';
  let down = null;
  cv.addEventListener('pointerdown', e => { markInteract(); down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, touch: isTouch(e), moved: false, id: e.pointerId }; });
  cv.addEventListener('pointermove', e => {
    if (!down || e.pointerId !== down.id) return;
    const th = down.touch ? cfg.interaction.touchDragThresholdPx : cfg.interaction.dragThresholdPx;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > th) down.moved = true;
    if (cam.mode === 'object' && down.moved) {
      const P = C.pairs[cam.i], ready = cam.type === 'sleeve' ? P.si === 1 : P.ri === 1;
      if (ready && !ctrl.step) {
        const yawK = cam.type === 'sleeve' ? 'syaw' : 'ryaw', pK = cam.type === 'sleeve' ? 'spitch' : 'rpitch';
        P[yawK] += (e.clientX - down.lx) * 0.01; P[pK] = THREE.MathUtils.clamp(P[pK] + (e.clientY - down.ly) * 0.01, -1.3, 1.3); dirty = true;
      }
    }
    down.lx = e.clientX; down.ly = e.clientY;
  });
  cv.addEventListener('pointerup', e => {
    if (!down || e.pointerId !== down.id) return;
    const wasClick = !down.moved; down = null;
    if (!wasClick) return;
    const rect = cv.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); ray.far = Infinity;
    const hit = ray.intersectObjects(model.pickables, false)[0];
    if (!hit) { if (cam.mode !== 'overview') api.overview(); return; }
    const pk = hit.object.userData.pick;
    if (pk.type === 'panel') {
      if (cam.mode === 'panel' && cam.k === pk.k) { api.overview(); return; }
      active = { type: 'panel', i: geo.pairPanel.indexOf(pk.k) };
    } else {
      if (cam.mode === 'object' && cam.type === pk.type && cam.i === pk.i) { active = { type: pk.type, i: pk.i }; api.flip(); return; }
      active = { type: pk.type, i: pk.i };
    }
    api.inspect();
  });
  cv.addEventListener('wheel', markInteract, { passive: true });

  // ---------- налагодження ----------
  let debug = false, pano = false, tests = null;
  const boxHelpers = [...model.sleeves, ...model.records].map(o => { const b = new THREE.BoxHelper(o, '#7cff8a'); b.visible = false; scene.add(b); return b; });
  function setDebug(on) { debug = on; model.debug.visible = on; for (const a of model.axes) a.visible = on; for (const b of boxHelpers) b.visible = on; dirty = uiDirty = true; }
  setDebug(false);

  // ---------- цикл ----------
  let last = performance.now(), raf = 0, lost = false, lastUi = '', slowFrames = 0;
  const lastCam = new THREE.Matrix4();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (lost) return;
    const moving = ctrl.tick(dt);
    poseAll();
    updateCamera(dt);
    camera.updateMatrixWorld();
    const camMoved = !lastCam.equals(camera.matrixWorld); lastCam.copy(camera.matrixWorld);
    if (moving || camMoved || dirty) {
      if (debug) for (const b of boxHelpers) b.update();
      updateHotspots();
      const t0 = performance.now();
      renderer.render(scene, camera);
      const ft = performance.now() - t0 + dt * 0; dirty = false;
      if (dt > 0.034 && pixelRatio > 1) { if (++slowFrames > 45) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); slowFrames = 0; } } else slowFrames = Math.max(0, slowFrames - 1);
      void ft;
    } else if (uiDirty) updateHotspots();
    emitUi(moving);
  }
  function emitUi() {
    const i = active.i, G = ctrl.g.pairs[i];
    const busy = !!ctrl.step || !!ctrl.plan(true);
    const sk = ctrl.step ? ctrl.step.kind : null;
    const sliderDisabled = busy && sk !== 'open' && sk !== 'close' && (ctrl.phase === 'returning' || ctrl.phase === 'resetting');
    const flipTarget = flipTargetOf();
    const ui = {
      ready: true, lost, interacted,
      open: Math.round(C.open * 1000) / 1000,
      slider: sliderDisabled ? ctrl.g.open : Math.round(C.open * 1000) / 1000,
      sliderDisabled, busy, phase: ctrl.phase,
      phaseLabel: busy && sk ? (STRINGS.phase[sk] || '') : '',
      pair: i, activeType: active.type, sleeveOut: G.sl === 2, recordOut: G.rec === 2,
      canFlip: !!flipTarget, inspecting: cam.mode !== 'overview',
      debug, pano
    };
    if (debug) {
      ui.report = geo.report;
      ui.slots = assets.list().map(s => ({ ...s, thumb: assets.thumb(s.id) }));
      ui.violations = ctrl.violations();
      ui.state = `open ${C.open.toFixed(3)} · bend [${C.bend.map(b => b.toFixed(2)).join(', ')}] · крок ${sk || '—'} · фаза ${ctrl.phase}\n` +
        C.pairs.map((p, n) => `S${n + 1}/R${n + 1}  sp ${p.sp.toFixed(2)}  rp ${p.rp.toFixed(2)}  sf ${p.sf.toFixed(2)}  rf ${p.rf.toFixed(2)}  si ${p.si.toFixed(2)}  ri ${p.ri.toFixed(2)}`).join('\n') +
        `\nкамера: ${cam.mode}${cam.mode === 'object' ? ' ' + cam.type + ' ' + (cam.i + 1) : ''} · zoom ${cam.zoom.toFixed(2)}`;
      ui.tests = tests;
      ui.geo = `T панелі ${geo.T.toFixed(2)} мм · порожнина ${geo.cavity.toFixed(2)} мм · конверт ${geo.sleeveT.toFixed(2)} мм · H12 ${geo.s12.toFixed(2)} мм · H23 ${geo.s23.toFixed(2)} мм`;
    }
    const s = JSON.stringify(ui);
    if (s !== lastUi || uiDirty) { lastUi = s; uiDirty = false; onState(ui); }
  }
  function flipTargetOf() {
    const i = active.i, G = ctrl.g.pairs[i];
    if (active.type === 'record' && G.rec === 2) return { type: 'record', i };
    if (active.type === 'sleeve' && G.sl === 2 && G.rec === 0) return { type: 'sleeve', i };
    if (G.rec === 2) return { type: 'record', i };
    if (G.sl === 2) return { type: 'sleeve', i };
    return null;
  }

  const ro = new ResizeObserver(() => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  });
  ro.observe(host);
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; uiDirty = true; emitUi(); });
  cv.addEventListener('webglcontextrestored', () => { lost = false; dirty = uiDirty = true; });
  raf = requestAnimationFrame(t => { last = t; frame(t); });

  // ---------- API для інтерфейсу ----------
  const stateCmd = (fn, keepView) => { fn(); if (!keepView) toOverview(); dirty = uiDirty = true; };
  const api = {
    open: () => stateCmd(() => ctrl.open()),
    close: () => stateCmd(() => ctrl.close()),
    setOpen: v => { ctrl.setOpen(v, true); if (cam.mode !== 'overview') toOverview(); uiDirty = true; },
    selectPair: i => { const G = ctrl.g.pairs[i]; active = { type: G.rec === 2 ? 'record' : G.sl === 2 ? 'sleeve' : 'panel', i }; uiDirty = true; },
    toggleSleeve: () => { const i = active.i; if (ctrl.g.pairs[i].sl === 2) { stateCmd(() => ctrl.sleeveIn(i)); active = { type: 'panel', i }; } else { stateCmd(() => ctrl.sleeveOut(i)); active = { type: 'sleeve', i }; } },
    toggleRecord: () => { const i = active.i; if (ctrl.g.pairs[i].rec === 2) { stateCmd(() => ctrl.recordIn(i)); active = { type: 'sleeve', i }; } else { stateCmd(() => ctrl.recordOut(i)); active = { type: 'record', i }; } },
    sleeveOutAt: i => { active = { type: 'sleeve', i }; stateCmd(() => ctrl.sleeveOut(i)); },
    recordOutAt: i => { active = { type: 'record', i }; stateCmd(() => ctrl.recordOut(i)); },
    flip: () => { const t = flipTargetOf(); if (t) { active = t; ctrl.flip(t.type, t.i); uiDirty = true; } },
    inspect: () => {
      const i = active.i, G = ctrl.g.pairs[i];
      let t = null;
      if (active.type === 'record' && G.rec === 2) t = 'record';
      else if (active.type === 'sleeve' && G.sl === 2 && G.rec === 0) t = 'sleeve';
      if (t && ctrl.inspect(t, i)) {
        cam.mode = 'object'; cam.type = t; cam.i = i; cam.zoom = 1; cam.pan.set(0, 0, 0); controls.enableRotate = false;
        const n = i + 1; assets.setDetail(t === 'sleeve' ? [`sleeve.${n}.front`, `sleeve.${n}.back`] : [`record.${n}.labelA`, `record.${n}.labelB`], true);
        offs.subVectors(camera.position, controls.target).normalize(); cam.desiredDir = new V3(offs.x * 0.3, 0.1, -1).normalize();
      } else {
        ctrl.uninspect(); controls.enableRotate = true;
        cam.mode = 'panel'; cam.k = geo.pairPanel[i]; cam.zoom = 1; cam.pan.set(0, 0, 0);
        const n = new V3(0, 0, 1).transformDirection(model.panels[cam.k].matrixWorld);
        offs.subVectors(camera.position, controls.target).normalize();
        cam.desiredDir = n.multiplyScalar(Math.sign(offs.dot(n)) || 1).add(new V3(0, 0.06, 0)).normalize();
        const n1 = cam.k + 1; assets.setDetail([`jacket.p${n1}.outer`, `jacket.p${n1}.inner`], true);
      }
      cam.userUntil = 0; uiDirty = true;
    },
    overview: () => { ctrl.uninspect(); toOverview(); uiDirty = true; },
    returnAll: () => { stateCmd(() => ctrl.returnAll()); active = { type: 'panel', i: active.i }; },
    extractAll: () => { stateCmd(() => { for (let i = 0; i < ctrl.n; i++) ctrl.recordOut(i); }); active = { type: 'record', i: active.i }; },
    reset: () => { stateCmd(() => ctrl.reset()); active = { type: 'panel', i: 0 }; cam.desiredDir = new V3(...cfg.camera.startDir).normalize(); },
    viewFront: () => { cam.desiredDir = new V3(...cfg.camera.frontDir).normalize(); cam.userUntil = 0; },
    viewBack: () => { cam.desiredDir = new V3(...cfg.camera.backDir).normalize(); cam.userUntil = 0; },
    zoom: f => { cam.zoom = THREE.MathUtils.clamp(cam.zoom * f, cfg.camera.minZoom, cfg.camera.maxZoom); cam.userUntil = 0; markInteract(); },
    rotate: sgn => {
      markInteract();
      if (cam.mode === 'object') { const P = C.pairs[cam.i]; if (!ctrl.step) { if (cam.type === 'sleeve') P.syaw += sgn * Math.PI / 6; else P.ryaw += sgn * Math.PI / 6; dirty = true; } return; }
      const base = cam.desiredDir ? cam.desiredDir.clone() : offs.subVectors(camera.position, controls.target).normalize().clone();
      cam.desiredDir = base.applyAxisAngle(Y, sgn * Math.PI / 6); cam.userUntil = 0;
    },
    setDebug: on => setDebug(on),
    setPanorama: on => { pano = on; assets.setPanorama(on); uiDirty = true; },
    runTests: () => { tests = runSelfTests(() => new Controller(ctrlOpts)); uiDirty = true; },
    setSlotFile: (id, file) => { if (file) assets.setSource(id, URL.createObjectURL(file)); },
    dispose: () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); cv.remove(); hotspotLayer.innerHTML = ''; }
  };
  // службовий доступ для налагодження: знімок кадру та прямий доступ до стану
  window.__trifold = { api, ctrl, geo, light: { key, fill, scene }, snap: () => { renderer.render(scene, camera); return cv.toDataURL('image/jpeg', 0.85); } };
  return api;
}
