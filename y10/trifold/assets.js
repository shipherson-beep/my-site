// AssetManifest / менеджер ресурсів: кожен слот має власну CanvasTexture, яка ніколи не замінюється —
// оновлюється лише її зображення, тому підміна файлу не чіпає геометрію, матеріали чи стан сцени.
import * as THREE from 'https://esm.sh/three@0.170.0';
import { STRINGS } from './strings.js';

const FONT = "'Golos Text', system-ui, sans-serif";
const S = STRINGS.ph;

export class AssetManager {
  constructor(manifest, baseUrl, opts) {
    this.m = manifest; this.base = baseUrl; this.o = opts; // {anisotropy, baseSize, labelSize, detailSize, onChange}
    this.slots = new Map(); this.pano = false;
  }
  // meta: {kind:'panel'|'sleeve'|'label'|'spine'|'vinyl', aspect (w/h), title, side, note, optional, pano:{set, x0, x1}}
  register(id, meta) {
    const def = (this.m.slots && this.m.slots[id]) || (this.m.optional && this.m.optional[id]) || null;
    const slot = { id, meta, def, status: def && def.src ? 'loading' : (meta.optional ? 'default' : 'placeholder'), img: null, warning: '', detail: false };
    slot.texture = new THREE.CanvasTexture(document.createElement('canvas'));
    slot.texture.colorSpace = THREE.SRGBColorSpace;
    slot.texture.anisotropy = this.o.anisotropy;
    this.slots.set(id, slot);
    this._draw(slot);
    if (def && def.src) this._load(slot, this.base + (this.m.basePath || '') + def.src);
    return slot.texture;
  }
  has(id) { const s = this.slots.get(id); return !!(s && (s.status === 'loaded')); }
  _size(slot) {
    const big = slot.detail ? this.o.detailSize : (slot.meta.kind === 'label' ? this.o.labelSize : this.o.baseSize);
    const a = slot.meta.aspect || 1;
    return a >= 1 ? [big, Math.round(big / a)] : [Math.round(big * a), big];
  }
  _load(slot, url) {
    slot.status = 'loading'; this._changed();
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      slot.img = img; slot.status = 'loaded';
      const ia = img.naturalWidth / img.naturalHeight, sa = slot.meta.aspect || 1;
      slot.warning = slot.def && slot.def.fit !== 'stretch' && Math.abs(ia - sa) / sa > 0.02
        ? `Пропорції ${ia.toFixed(3)} ≠ поверхні ${sa.toFixed(3)} — режим ${slot.def.fit || 'contain'}` : '';
      this._draw(slot); this._changed();
    };
    img.onerror = () => { slot.img = null; slot.status = 'error'; this._draw(slot); this._changed(); };
    img.src = url;
  }
  setSource(id, url) { const s = this.slots.get(id); if (s) this._load(s, url); }
  setDetail(ids, on) {
    for (const s of this.slots.values()) {
      const want = on && ids.includes(s.id) && s.status === 'loaded';
      if (s.detail !== want) { s.detail = want; this._draw(s); }
    }
  }
  setPanorama(on) { this.pano = on; for (const s of this.slots.values()) if (s.meta.pano) this._draw(s); this._changed(); }
  redrawAll() { for (const s of this.slots.values()) this._draw(s); }
  _changed() { this.o.onChange && this.o.onChange(); }

  _draw(slot) {
    const [W, H] = this._size(slot);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    if (this.pano && slot.meta.pano) drawPanoSlice(ctx, W, H, slot.meta.pano);
    else if (slot.status === 'loaded' && slot.img) drawImageFit(ctx, W, H, slot.img, slot.def || {});
    else if (slot.meta.optional) { ctx.fillStyle = slot.meta.fill || '#777'; ctx.fillRect(0, 0, W, H); }
    else drawPlaceholder(ctx, W, H, slot);
    slot.texture.image = cv; slot.texture.needsUpdate = true;
    slot.thumb = null;
  }
  thumb(id) {
    const s = this.slots.get(id); if (!s) return '';
    if (!s.thumb) {
      const src = s.texture.image, t = document.createElement('canvas'), a = src.width / src.height;
      t.width = a >= 1 ? 96 : Math.round(96 * a); t.height = a >= 1 ? Math.round(96 / a) : 96;
      t.getContext('2d').drawImage(src, 0, 0, t.width, t.height); s.thumb = t.toDataURL('image/png');
    }
    return s.thumb;
  }
  list(filter) {
    return [...this.slots.values()].filter(s => filter ? filter(s) : !s.meta.optional).map(s => ({
      id: s.id, file: s.def ? s.def.file : '', status: s.status, warning: s.warning, optional: !!s.meta.optional
    }));
  }
}

function drawImageFit(ctx, W, H, img, d) {
  ctx.fillStyle = d.fill || '#8a8986'; ctx.fillRect(0, 0, W, H);
  const rot = ((d.rotation || 0) % 360 + 360) % 360, swap = rot === 90 || rot === 270;
  const iw = swap ? img.naturalHeight : img.naturalWidth, ih = swap ? img.naturalWidth : img.naturalHeight;
  let sx = W / iw, sy = H / ih;
  if (d.fit === 'cover') sx = sy = Math.max(sx, sy); else if (d.fit !== 'stretch') sx = sy = Math.min(sx, sy);
  const sc = d.scale || 1, off = d.offset || [0, 0];
  ctx.save();
  ctx.translate(W / 2 + off[0] * W, H / 2 - off[1] * H);
  ctx.rotate(rot * Math.PI / 180);
  if (d.mirror) ctx.scale(-1, 1);
  const dw = (swap ? ih * sy : iw * sx) * sc, dh = (swap ? iw * sx : ih * sy) * sc;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

const TONES = { 1: ['#7f7c77', '#b6b2aa'], 2: ['#787d80', '#adb2b4'], 3: ['#807a83', '#b3adb5'] };

function drawPlaceholder(ctx, W, H, slot) {
  const m = slot.meta, u = Math.min(W, H) / 100;
  if (m.kind === 'label') return drawLabelPh(ctx, W, H, slot);
  const tone = TONES[m.num] || TONES[1];
  ctx.fillStyle = m.side === 'inner' || m.side === 'back' ? tone[1] : tone[0];
  if (m.kind === 'sleeve') ctx.fillStyle = m.side === 'back' ? '#c9c6bf' : '#a9a69f';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(20,20,20,0.14)'; ctx.lineWidth = Math.max(1, u * 0.15);
  for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(W * i / 10, 0); ctx.lineTo(W * i / 10, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, H * i / 10); ctx.lineTo(W, H * i / 10); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(20,20,20,0.5)'; ctx.lineWidth = u * 0.6; ctx.strokeRect(u * 3, u * 3, W - u * 6, H - u * 6);
  // несиметрична позначка лівого верхнього кута
  ctx.fillStyle = '#1d1d1f'; ctx.beginPath(); ctx.moveTo(u * 3, u * 3); ctx.lineTo(u * 19, u * 3); ctx.lineTo(u * 3, u * 19); ctx.closePath(); ctx.fill();
  ctx.font = `600 ${u * 3.2}px ${FONT}`; ctx.textBaseline = 'top'; ctx.fillStyle = '#1d1d1f'; ctx.fillText(`${S.corner} ◤`, u * 21, u * 5);
  // стрілка «верх»
  ctx.beginPath(); ctx.moveTo(W / 2, u * 7); ctx.lineTo(W / 2 + u * 6, u * 15); ctx.lineTo(W / 2 - u * 6, u * 15); ctx.closePath(); ctx.fill();
  ctx.fillRect(W / 2 - u * 1.6, u * 15, u * 3.2, u * 9);
  ctx.textAlign = 'center'; ctx.font = `600 ${u * 3.6}px ${FONT}`; ctx.fillText(S.top, W / 2, u * 26);
  if (m.kind === 'sleeve') { ctx.font = `500 ${u * 2.8}px ${FONT}`; ctx.fillText(`${S.opening} ↑`, W / 2, u * 31); }
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${u * 16}px ${FONT}`; ctx.fillText(m.title, W / 2, H * 0.5);
  ctx.font = `500 ${u * 5.2}px ${FONT}`; ctx.fillText(m.sideLabel, W / 2, H * 0.5 + u * 13);
  if (m.note) { ctx.font = `400 ${u * 3.6}px ${FONT}`; ctx.fillText(m.note, W / 2, H * 0.5 + u * 20); }
  ctx.font = `400 ${u * 2.8}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${slot.id} · ${slot.def ? slot.def.file : ''}`, W - u * 6, H - u * 9);
  if (m.dims) ctx.fillText(m.dims, W - u * 6, H - u * 5.5);
  if (slot.status === 'error') { ctx.textAlign = 'left'; ctx.fillStyle = '#7a1f1f'; ctx.fillText(S.missing, u * 6, H - u * 5.5); }
}

function drawLabelPh(ctx, W, H, slot) {
  const m = slot.meta, u = W / 100;
  ctx.fillStyle = '#8a8986'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = m.side === 'B' ? '#c2beb6' : '#d6d2c9';
  ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,20,0.4)'; ctx.lineWidth = u * 0.6; ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - u * 3, 0, Math.PI * 2); ctx.stroke();
  // клин-позначка у верхньому лівому секторі
  ctx.fillStyle = '#1d1d1f'; ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, W / 2 - u * 3, Math.PI * 1.12, Math.PI * 1.3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d6d2c9'; ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1d1d1f';
  ctx.beginPath(); ctx.moveTo(W / 2, u * 9); ctx.lineTo(W / 2 + u * 5, u * 16); ctx.lineTo(W / 2 - u * 5, u * 16); ctx.closePath(); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${u * 4.5}px ${FONT}`; ctx.fillText(S.top, W / 2, u * 20);
  ctx.font = `600 ${u * 9}px ${FONT}`; ctx.fillText(`${S.record} ${m.num}`, W / 2, H / 2 - u * 14);
  ctx.font = `700 ${u * 15}px ${FONT}`; ctx.fillText(`${m.sideLabel}`, W / 2, H / 2 + u * 15);
  ctx.font = `400 ${u * 3.6}px ui-monospace, Menlo, monospace`; ctx.fillText(slot.id, W / 2, H / 2 + u * 30);
}

function drawPanoSlice(ctx, W, H, p) {
  // одне зображення через три панелі: x0..x1 — частка спільної ширини
  const span = p.x1 - p.x0, toX = gx => (gx - p.x0) / span * W;
  ctx.fillStyle = p.set === 'outer' ? '#8f8b84' : '#b8b4ac'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  for (let k = 0; k <= 60; k++) { const x = toX(k / 60); if (x < -2 || x > W + 2) continue; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  ctx.strokeStyle = '#1d1d1f'; ctx.lineWidth = H * 0.012;
  ctx.beginPath(); ctx.moveTo(toX(0), H * 0.92); ctx.lineTo(toX(1), H * 0.08); ctx.stroke();
  ctx.beginPath(); ctx.arc(toX(p.joinA), H / 2, H * 0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(toX(p.joinB), H / 2, H * 0.18, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#1d1d1f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${H * 0.16}px ${FONT}`;
  const word = p.set === 'outer' ? 'ЗОВНІ →' : 'ВСЕРЕДИНІ →';
  ctx.fillText(word, toX(0.5), H * 0.78);
  ['1', '2', '3'].forEach((t, k) => ctx.fillText(p.order[k], toX((k + 0.5) / 3), H * 0.25));
}
