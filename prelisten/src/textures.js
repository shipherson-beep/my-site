// Asset textures: loads configured files, otherwise generates placeholders (canvas).
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function noise2(seed) {
  const r = rng(seed), N = 256, p = new Float32Array(N * N);
  for (let i = 0; i < p.length; i++) p[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const X0 = xi & 255, X1 = (xi + 1) & 255, Y0 = (yi & 255) * N, Y1 = ((yi + 1) & 255) * N;
    const a = p[Y0 + X0], b = p[Y0 + X1], c = p[Y1 + X0], d = p[Y1 + X1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const fbm = (n, x, y, o) => { let a = 0, amp = .5, f = 1; for (let i = 0; i < o; i++) { a += amp * n(x * f, y * f); f *= 2; amp *= .5; } return a; };
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
export function toTex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
async function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }

// Fit an image file into a canvas of given aspect ("contain" on a fill colour) or stretch.
async function fileTex(url, w, h, mode, fill, rot = 0) {
  if (!url) return null;
  try {
    const img = await loadImg(url);
    const [c, x] = mk(w, h);
    x.fillStyle = fill || '#000'; x.fillRect(0, 0, w, h);
    const turned = Math.abs(rot) % 180 === 90, iw = turned ? img.height : img.width, ih = turned ? img.width : img.height;
    x.save(); x.translate(w / 2, h / 2); x.rotate(rot * Math.PI / 180);
    if (mode === 'contain' || mode === 'cover') {
      const s = (mode === 'cover' ? Math.max : Math.min)(w / iw, h / ih), dw = img.width * s, dh = img.height * s;
      x.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else { const dw = turned ? h : w, dh = turned ? w : h; x.drawImage(img, -dw / 2, -dh / 2, dw, dh); }
    x.restore();
    return toTex(c);
  } catch (e) { console.warn('texture failed', url); return null; }
}

const RED = '#ec2a2a', INK = '#0b0909';
const SANS = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const HAND = '"Caveat", cursive';

function grain(x, w, h, amt = .05, seed = 3) {
  const r = rng(seed);
  for (let i = 0; i < w * h / 60; i++) { const v = r() < .5 ? 0 : 255; x.fillStyle = `rgba(${v},${v},${v},${r() * amt})`; x.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
}

function placeholderSticker(side, meta) {
  const w = 1000, h = 483, [c, x] = mk(w, h);
  x.fillStyle = INK; x.fillRect(0, 0, w, h);
  x.fillStyle = RED; x.font = `700 92px ${SANS}`; x.textAlign = 'center'; x.fillText(meta.title, w / 2, 120);
  x.font = `600 120px ${SANS}`; x.textAlign = 'left'; x.fillText(side, 40, 330);
  x.font = `500 26px ${MONO}`; x.textAlign = 'center'; x.fillText(`${meta.subtitle} · ${meta.artist}`, w / 2, 452);
  grain(x, w, h, .08);
  return toTex(c);
}
function placeholderInside(meta) { // inner face of J-card (tracklist)
  const w = 1024, h = 642, [c, x] = mk(w, h);
  x.fillStyle = '#ece4d3'; x.fillRect(0, 0, w, h); grain(x, w, h, .05, 9);
  x.strokeStyle = 'rgba(70,90,140,.28)'; x.lineWidth = 2;
  for (let y = 150; y < h - 30; y += 52) { x.beginPath(); x.moveTo(40, y); x.lineTo(w - 40, y); x.stroke(); }
  x.fillStyle = INK; x.font = `600 30px ${MONO}`; x.fillText('A', 60, 100); x.fillText('B', w / 2 + 30, 100);
  x.fillStyle = '#1d2a52'; x.font = `56px ${HAND}`;
  x.fillText(meta.title.toLowerCase(), 110, 140);
  x.font = `44px ${HAND}`; x.fillText('— для тебе, перемотай', 110, 345);
  x.fillText('олівцем, як колись', 110, 397);
  x.fillStyle = RED; x.font = `600 24px ${MONO}`; x.fillText(`${meta.subtitle} by ${meta.artist}`, 60, h - 40);
  return toTex(c);
}
function placeholderBack(meta) {
  const w = 1024, h = 642, [c, x] = mk(w, h);
  x.fillStyle = INK; x.fillRect(0, 0, w, h);
  x.fillStyle = RED; x.font = `700 64px ${SANS}`; x.fillText(meta.title, 60, 130);
  x.font = `500 26px ${MONO}`; x.fillStyle = '#b9b1a4';
  ['TYPE I · NORMAL POSITION · 120µs EQ', 'SIDE A / SIDE B', `${meta.subtitle.toUpperCase()} — ${meta.artist.toUpperCase()}`].forEach((s, i) => x.fillText(s, 60, 210 + i * 44));
  grain(x, w, h, .07, 11);
  return toTex(c);
}
function placeholderSpine(meta) {
  const w = 1024, h = 126, [c, x] = mk(w, h);
  x.fillStyle = INK; x.fillRect(0, 0, w, h);
  x.fillStyle = RED; x.font = `700 58px ${SANS}`; x.textBaseline = 'middle'; x.fillText(meta.title, 40, h / 2 + 3);
  x.font = `500 26px ${MONO}`; x.textAlign = 'right'; x.fillText(meta.artist, w - 40, h / 2 + 2);
  return toTex(c);
}

function wood() {
  const w = 1024, h = 512, [c, x] = mk(w, h), [rc, rx] = mk(w, h);
  const id = x.createImageData(w, h), rd = rx.createImageData(w, h), n = noise2(7), n2 = noise2(19);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const u = i / w, v = j / h;
    const warp = fbm(n, u * 2.5, v * 9, 4) * 2.4;
    const g = v * 26 + warp * 2.6 + Math.sin(u * 3.1) * .5;
    const ring = Math.pow(Math.abs(Math.sin(g * Math.PI)), .45);
    const fine = n2(u * 700, v * 30) * .6 + n2(u * 1500, v * 70) * .4;
    let t = ring * .55 + fine * .28 + fbm(n2, u * 6, v * 1.5, 3) * .35;
    t = Math.min(1, Math.max(0, t));
    const k = (j * w + i) * 4;
    id.data[k] = 52 + t * 66; id.data[k + 1] = 33 + t * 44; id.data[k + 2] = 21 + t * 28; id.data[k + 3] = 255;
    const rr = 150 + (1 - t) * 40 + fine * 20; rd.data[k] = rd.data[k + 1] = rd.data[k + 2] = rr; rd.data[k + 3] = 255;
  }
  x.putImageData(id, 0, 0); rx.putImageData(rd, 0, 0);
  const r = rng(5);
  for (let i = 0; i < 90; i++) { // scratches
    const sx = r() * w, sy = r() * h, a = (r() - .5) * .6, l = 20 + r() * 120;
    x.strokeStyle = `rgba(230,190,150,${.04 + r() * .06})`; x.lineWidth = .7; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke();
    rx.strokeStyle = 'rgba(255,255,255,.35)'; rx.lineWidth = 1; rx.beginPath(); rx.moveTo(sx, sy); rx.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); rx.stroke();
  }
  // mug ring stain
  x.strokeStyle = 'rgba(40,20,8,.16)'; x.lineWidth = 5; x.beginPath(); x.arc(w * .79, h * .2, 34, 0.3, Math.PI * 1.85); x.stroke();
  const map = toTex(c), rough = toTex(rc, false);
  return { map, rough };
}

function wallpaper() {
  const s = 512, [c, x] = mk(s, s);
  x.fillStyle = '#8e7d62'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#857459' : '#94836a'; x.fillRect(i * 64, 0, 64, s); }
  x.fillStyle = 'rgba(110,40,30,.35)'; for (let i = 0; i < 8; i++) x.fillRect(i * 64 + 31, 0, 2, s);
  x.fillStyle = 'rgba(232,214,180,.22)';
  for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) {
    const cx = i * 128 + (r % 2) * 64 + 32 + 32, cy = r * 128 + 64;
    x.save(); x.translate(cx % s, cy); x.rotate(Math.PI / 4); x.fillRect(-7, -7, 14, 14); x.restore();
  }
  grain(x, s, s, .06, 21);
  const t = toTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function poster(meta) {
  const w = 600, h = 860, [c, x] = mk(w, h);
  x.fillStyle = '#e7dcc7'; x.fillRect(0, 0, w, h);
  x.fillStyle = INK; x.fillRect(36, 36, w - 72, h * .62);
  x.fillStyle = RED; x.beginPath(); x.arc(w / 2, h * .36, 150, 0, Math.PI * 2); x.fill();
  x.fillStyle = INK; x.font = `700 78px ${SANS}`; x.fillText('КОНЦЕРТ', 40, h * .62 + 120);
  x.font = `500 26px ${MONO}`; x.fillText('ПАЛАЦ КУЛЬТУРИ · СУБОТА · 19:00', 42, h * .62 + 170);
  x.fillText('ВХІД ВІЛЬНИЙ', 42, h * .62 + 210);
  grain(x, w, h, .1, 31);
  x.fillStyle = 'rgba(120,90,50,.12)'; x.fillRect(0, 0, w, h);
  return toTex(c);
}

function pack() {
  const s = 256, [c, x] = mk(s, s), id = x.createImageData(s, s), r = rng(4), bands = [];
  for (let i = 0; i < 140; i++) bands.push(r());
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const dx = i - s / 2, dy = j - s / 2, rr = Math.hypot(dx, dy) / (s / 2), a = Math.atan2(dy, dx);
    const b = bands[Math.min(139, Math.floor(rr * 139))];
    const sheen = .5 + .5 * Math.cos(a * 2);
    const v = 42 + b * 22 + sheen * 22 + (Math.cos(a * 1 + rr * 9) * 6);
    const k = (j * s + i) * 4; id.data[k] = v * 1.05; id.data[k + 1] = v * .72; id.data[k + 2] = v * .52; id.data[k + 3] = 255;
  }
  x.putImageData(id, 0, 0); return toTex(c);
}

function brushed() {
  const w = 512, h = 512, [c, x] = mk(w, h), r = rng(8);
  x.fillStyle = '#a6a196'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2200; i++) { const y = r() * h, v = 120 + r() * 120; x.strokeStyle = `rgba(${v},${v - 4},${v - 12},${.08 + r() * .12})`; x.lineWidth = r() * 1.2; x.beginPath(); x.moveTo(r() * w - 100, y); x.lineTo(r() * w + 200, y); x.stroke(); }
  return toTex(c);
}
function scratches(seed = 2) {
  const s = 512, [c, x] = mk(s, s), r = rng(seed);
  x.fillStyle = 'rgb(18,18,18)'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 140; i++) { const sx = r() * s, sy = r() * s, a = r() * Math.PI, l = 8 + r() * 70, v = 60 + r() * 90; x.strokeStyle = `rgb(${v},${v},${v})`; x.lineWidth = .5 + r() * .8; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke(); }
  for (let i = 0; i < 6; i++) { const g = x.createRadialGradient(r() * s, r() * s, 0, r() * s, r() * s, 60); g.addColorStop(0, 'rgba(70,70,70,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); }
  return toTex(c, false);
}
function pencil() {
  const w = 192, h = 1024, [c, x] = mk(w, h), r = rng(12);
  x.fillStyle = '#d9a32c'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(${i % 2 ? 255 : 120},${i % 2 ? 220 : 80},40,.08)`; x.fillRect(i * 32, 0, 32, h); }
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(90,60,20,${r() * .15})`; x.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 6); }

  return toTex(c);
}
function playerPrint() {
  const w = 1024, h = 128, [c, x] = mk(w, h);
  x.clearRect(0, 0, w, h);
  x.fillStyle = 'rgba(30,26,22,.85)'; x.font = `600 46px ${SANS}`; x.textBaseline = 'middle'; x.fillText('ОРБІТА', 20, 64);
  x.font = `500 26px ${MONO}`; x.fillText('КП-7  STEREO CASSETTE PLAYER · AUTO STOP', 230, 66);
  return toTex(c);
}

// ---------- collection ----------
const COND = '"IBM Plex Sans Condensed", "IBM Plex Sans", Arial, sans-serif';
const PAL = [['#1b1b1d', '#e9e2d2'], ['#6e2a20', '#f0e6d6'], ['#d8d2c4', '#1a1a1a'], ['#2f3b46', '#e8e0cf'], ['#4a4f2e', '#efe8d6'], ['#b08530', '#1a1612'], ['#55595f', '#f1ece2'], ['#a8a297', '#161616'], ['#3a2233', '#eadfd0'], ['#203a33', '#e9e2d2'], ['#c9c2b2', '#3a1a14'], ['#141414', '#c8c0b0']];
function fitText(x, s, font, maxW, size) { let f = size; x.font = font.replace('{s}', f); while (x.measureText(s).width > maxW && f > 8) { f -= 2; x.font = font.replace('{s}', f); } return f; }
function wear(x, w, h, seed) { const r = rng(seed); for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(255,255,255,${r() * 0.07})`; x.lineWidth = 0.6 + r(); x.beginPath(); const sx = r() * w, sy = r() * h; x.moveTo(sx, sy); x.lineTo(sx + (r() - .5) * 120, sy + (r() - .5) * 30); x.stroke(); } x.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; x.fillRect(0, 0, w, 6); x.fillRect(0, h - 6, w, 6); }
function landscapeFromPortrait(pc, w, h, rot) { const [c, x] = mk(w, h); x.save(); x.translate(w / 2, h / 2); x.rotate(rot * Math.PI / 180); const s = Math.max(w / pc.height, h / pc.width); x.drawImage(pc, -pc.width * s / 2, -pc.height * s / 2, pc.width * s, pc.height * s); x.restore(); return toTex(c); }
function phPanel(al, i, back) {
  const [bg, fg] = PAL[i % PAL.length], w = 640, h = 1004, [c, x] = mk(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h); grain(x, w, h, .07, 40 + i);
  x.fillStyle = fg; x.textBaseline = 'alphabetic';
  if (!back) {
    const f = fitText(x, al.artist.toUpperCase(), `700 {s}px ${COND}`, w - 96, 92); x.fillText(al.artist.toUpperCase(), 48, 70 + f);
    x.font = `500 44px ${SANS}`; const words = al.album.split(' '); let line = '', y = 70 + f + 76;
    for (const wd of words) { const tl = line ? line + ' ' + wd : wd; if (x.measureText(tl).width > w - 96) { x.fillText(line, 48, y); y += 54; line = wd; } else line = tl; } x.fillText(line, 48, y);
    x.font = `500 26px ${MONO}`; x.fillText(String(al.year), 48, h - 56);
  } else {
    x.font = `600 30px ${COND}`; x.fillText(al.artist.toUpperCase(), 48, 90); x.font = `500 26px ${SANS}`; x.fillText(al.album, 48, 130);
    x.font = `500 22px ${MONO}`; x.fillText(String(al.year), 48, h - 56);
  }
  wear(x, w, h, 90 + i);
  return c;
}
function phSpine(al, i) {
  const [bg, fg] = PAL[i % PAL.length], w = 1024, h = 146, [c, x] = mk(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h); grain(x, w, h, .06, 70 + i);
  x.fillStyle = fg; x.textBaseline = 'middle';
  const yr = String(al.year); x.font = `500 34px ${MONO}`; const yw = x.measureText(yr).width; x.fillText(yr, w - 36 - yw, h / 2 + 2);
  const s = `${al.artist.toUpperCase()}  ·  ${al.album.toUpperCase()}`; fitText(x, s, `700 {s}px ${COND}`, w - 110 - yw, 70); x.fillText(s, 36, h / 2 + 3);
  wear(x, w, h, 120 + i);
  return toTex(c);
}
function phLabel(al, side, i) {
  const w = 1000, h = 483, [c, x] = mk(w, h);
  x.fillStyle = '#e9e3d4'; x.fillRect(0, 0, w, h); grain(x, w, h, .05, 200 + i);
  x.fillStyle = '#1a1a1a'; x.font = `700 64px ${COND}`; x.fillText(side, 46, 250);
  x.textAlign = 'center'; fitText(x, al.artist.toUpperCase(), `700 {s}px ${COND}`, w - 140, 58); x.fillText(al.artist.toUpperCase(), w / 2, 86);
  fitText(x, al.album, `500 {s}px ${SANS}`, w - 140, 38); x.fillText(al.album, w / 2, 140);
  x.font = `500 24px ${MONO}`; x.fillText(String(al.year), w / 2, 450);
  return toTex(c);
}
export async function collectionTextures(al, i, dir, plainCol = '#0b0a09') {
  const f = k => al.files?.[k] ? `${dir}/${al.id}/${al.files[k]}` : null;
  const [front, back, spine, inside, sideA, sideB] = await Promise.all([
    fileTex(f('front'), 1024, 626, 'cover', '#111', 90), fileTex(f('back'), 1024, 626, 'cover', '#111', 90),
    fileTex(f('spine'), 1024, 146, 'stretch'), fileTex(f('inside'), 1024, 626, 'cover', '#111', 90),
    fileTex(f('sideA'), 1000, 483, 'stretch'), fileTex(f('sideB'), 1000, 483, 'stretch'),
  ]);
  return {
    coverFront: front || landscapeFromPortrait(phPanel(al, i, false), 1024, 626, 90),
    coverBack: back || plain(plainCol), spine: spine || plain(plainCol), jCard: inside || plain(plainCol),
    sideA: sideA || plain('#e4ddcc'), sideB: sideB || plain('#e4ddcc'),
  };
}

function plain(col = '#000') { const [c, x] = mk(16, 16); x.fillStyle = col; x.fillRect(0, 0, 16, 16); return toTex(c); }
export function counterCanvas() { const [c, x] = mk(256, 72); return { c, x, tex: toTex(c) }; }

export async function buildTextures(cfg) {
  const T = cfg.textures, M = cfg.meta;
  const [sideA, sideB, coverFront, coverBack, jCard, spine] = await Promise.all([
    fileTex(T.sideA, 1000, 483, 'stretch'),
    fileTex(T.sideB, 1000, 483, 'stretch'),
    fileTex(T.coverFront, 1024, 642, 'cover', T.coverFill, T.coverRotate || 0),
    fileTex(T.coverBack, 1024, 642, 'cover', T.coverFill),
    fileTex(T.jCard, 1024, 642, 'cover', T.coverFill),
    fileTex(T.spine, 1024, 126, 'contain', T.coverFill),
  ]);
  return {
    sideA: sideA || placeholderSticker('A', M),
    sideB: sideB || placeholderSticker('B', M),
    coverFront: coverFront || placeholderBack(M),
    coverBack: coverBack || plain(T.coverFill),
    jCard: jCard || plain(T.coverFill),
    spine: spine || plain(T.coverFill),
    wood: wood(), wallpaper: wallpaper(), poster: poster(M), pack: pack(), brushed: brushed(),
    scratches: scratches(2), scratches2: scratches(6), pencil: pencil(), playerPrint: playerPrint(),
  };
}
