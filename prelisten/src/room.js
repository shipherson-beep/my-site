// 3D Environment — 90s bedroom corner, desk, lamp, lighting, environment reflections.
import * as THREE from 'three';

function mesh(geo, mat, name, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = cast; m.receiveShadow = recv; return m; }
function rod(a, b, r, mat, name) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 16), mat, name);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

export function createRoom(scene, renderer, tex) {
  const g = new THREE.Group(); g.name = 'room'; scene.add(g);
  const WALL_Z = -0.32;

  // desk
  tex.wood.map.wrapS = tex.wood.map.wrapT = THREE.RepeatWrapping;
  const deskMat = new THREE.MeshStandardMaterial({ name: 'desk_wood', map: tex.wood.map, roughnessMap: tex.wood.rough, roughness: 1, metalness: 0 });
  const desk = mesh(new THREE.BoxGeometry(1.6, 0.03, 0.66), deskMat, 'desk', false, true);
  desk.position.set(0, -0.015, WALL_Z + 0.33); desk.userData.tag = 'desk'; g.add(desk);
  const edge = mesh(new THREE.BoxGeometry(1.6, 0.012, 0.012), new THREE.MeshStandardMaterial({ name: 'desk_edge', color: 0x3a2214, roughness: 0.6 }), 'desk_edge', false, true);
  edge.position.set(0, -0.006, WALL_Z + 0.66); g.add(edge);

  // walls
  tex.wallpaper.repeat.set(7, 5);
  const wallMat = new THREE.MeshStandardMaterial({ name: 'wallpaper', map: tex.wallpaper, roughness: 0.92 });
  const back = mesh(new THREE.PlaneGeometry(2.4, 1.6), wallMat, 'wall_back', false, true); back.position.set(0, 0.5, WALL_Z); g.add(back);
  const sideMat = wallMat.clone(); sideMat.map = tex.wallpaper.clone(); sideMat.map.repeat.set(3, 5); sideMat.map.needsUpdate = true;
  const left = mesh(new THREE.PlaneGeometry(1.2, 1.6), sideMat, 'wall_left', false, true); left.rotation.y = Math.PI / 2; left.position.set(-0.85, 0.5, WALL_Z + 0.6); g.add(left);
  const skirt = mesh(new THREE.BoxGeometry(2.4, 0.06, 0.01), new THREE.MeshStandardMaterial({ name: 'skirting', color: 0x4a3423, roughness: 0.7 }), 'skirting', false); skirt.position.set(0, -0.72, WALL_Z + 0.005); g.add(skirt);
  const floor = mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ name: 'floor', color: 0x2a1c14, roughness: 0.8 }), 'floor', false, true); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.75; g.add(floor);

  // window (night) with curtains
  const frameMat = new THREE.MeshStandardMaterial({ name: 'window_frame', color: 0xcfc4ae, roughness: 0.6 });
  const wx = 0.52, wy = 0.48, ww = 0.46, wh = 0.56;
  const glassCan = document.createElement('canvas'); glassCan.width = 64; glassCan.height = 256;
  const gx = glassCan.getContext('2d'), grd = gx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#060a16'); grd.addColorStop(0.65, '#122038'); grd.addColorStop(1, '#3a2a28');
  gx.fillStyle = grd; gx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 9; i++) { gx.fillStyle = `rgba(255,${180 + Math.random() * 50},110,${0.5 + Math.random() * 0.4})`; gx.fillRect(Math.random() * 60, 190 + Math.random() * 50, 2, 3); }
  const glassTex = new THREE.CanvasTexture(glassCan); glassTex.colorSpace = THREE.SRGBColorSpace;
  const glass = mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ name: 'window_night', map: glassTex, color: 0x9aa6c2 }), 'window_glass', false, false);
  glass.position.set(wx, wy, WALL_Z + 0.002); g.add(glass);
  const fb = (w, h, x, y) => { const m = mesh(new THREE.BoxGeometry(w, h, 0.03), frameMat, 'window_frame'); m.position.set(x, y, WALL_Z + 0.015); g.add(m); };
  fb(ww + 0.06, 0.03, wx, wy - wh / 2 - 0.015); fb(ww + 0.06, 0.03, wx, wy + wh / 2 + 0.015);
  fb(0.03, wh, wx - ww / 2 - 0.015, wy); fb(0.03, wh, wx + ww / 2 + 0.015, wy); fb(0.02, wh, wx, wy); fb(ww, 0.02, wx, wy + 0.08);
  const curtMat = new THREE.MeshStandardMaterial({ name: 'curtain', color: 0x7a4a2a, roughness: 0.95, side: THREE.DoubleSide });
  for (const [cx, cw] of [[wx - ww / 2 - 0.02, 0.16], [wx + ww / 2 + 0.03, 0.14]]) {
    const geo = new THREE.PlaneGeometry(cw, 0.95, 40, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 110) * 0.012 + 0.012);
    geo.computeVertexNormals();
    const c = mesh(geo, curtMat, 'curtain'); c.position.set(cx, wy + 0.08, WALL_Z + 0.04); g.add(c);
  }

  // desk lamp
  const target = new THREE.Vector3(0.0, 0, 0.04);
  const bulbPos = new THREE.Vector3(-0.08, 0.64, -0.02); // light source above, out of frame

  // lights
  const spot = new THREE.SpotLight(0xffc796, 2.5, 0, 0.72, 0.85, 2);
  spot.name = 'lamp_light'; spot.position.copy(bulbPos); spot.target.position.copy(target);
  spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.camera.near = 0.03; spot.shadow.camera.far = 2.5;
  spot.shadow.bias = -0.0002; spot.shadow.normalBias = 0.0015; spot.shadow.radius = 4;
  g.add(spot, spot.target);
  const bounce = new THREE.PointLight(0xff9f5a, 0.25, 1.6, 2); bounce.position.set(-0.05, 0.3, 0.05); g.add(bounce);
  const wallWash = new THREE.PointLight(0xffaa66, 0.35, 1.2, 2); wallWash.position.set(0.05, 0.55, -0.14);
  const cabFill = new THREE.PointLight(0xffc48a, 0.09, 0.8, 2); cabFill.name = 'cabinet_fill'; cabFill.position.set(-0.36, 0.43, 0.02); g.add(cabFill); g.add(wallWash);
  const hemi = new THREE.HemisphereLight(0x46587a, 0x2a1a10, 0.28); g.add(hemi);
  const moon = new THREE.DirectionalLight(0x7f95c8, 0.35); moon.position.set(0.6, 0.7, -0.6); g.add(moon);
  const fill = new THREE.PointLight(0xffcf9a, 0.12, 1.2, 2); fill.position.set(0.08, 0.36, 0.42); g.add(fill);

  // environment reflections (procedural room)
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshBasicMaterial({ color: 0x3a2618, side: THREE.BackSide })));
  const eb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 9, 5) })); eb.position.set(-0.8, 1.0, -0.4); envScene.add(eb);
  const ew = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.32, 0.55), side: THREE.DoubleSide })); ew.position.set(1.0, 0.8, -1.9); envScene.add(ew);
  const ec = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.1, 0.8), side: THREE.DoubleSide })); ec.position.set(0, 1.45, 0); ec.rotation.x = Math.PI / 2; envScene.add(ec);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.03).texture;
  scene.environmentIntensity = 0.45;

  // dust motes drifting in the lamp beam
  const N = 260, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = Math.random(), p = bulbPos.clone().lerp(target, t);
    const s = 0.02 + t * 0.18;
    pos[i * 3] = p.x + (Math.random() - .5) * s; pos[i * 3 + 1] = p.y + (Math.random() - .5) * s + 0.02; pos[i * 3 + 2] = p.z + (Math.random() - .5) * s;
    seed[i] = Math.random() * 100;
  }
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dc = document.createElement('canvas'); dc.width = dc.height = 32; const dx = dc.getContext('2d');
  const rg = dx.createRadialGradient(16, 16, 0, 16, 16, 16); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); dx.fillStyle = rg; dx.fillRect(0, 0, 32, 32);
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ name: 'dust', size: 0.0016, map: new THREE.CanvasTexture(dc), color: 0xffd9a8, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.name = 'dust'; g.add(dust);
  const base = pos.slice();
  const update = (time) => {
    for (let i = 0; i < N; i++) {
      const s = seed[i];
      pos[i * 3] = base[i * 3] + Math.sin(time * 0.11 + s) * 0.012;
      pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * 0.07 + s * 1.7) * 0.015;
      pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(time * 0.09 + s * 0.6) * 0.012;
    }
    dGeo.attributes.position.needsUpdate = true;
  };
  return { group: g, desk, update };
}
