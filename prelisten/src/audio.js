// Audio Engine — track playback from an exact tape position + synthesized foley.
export class AudioEngine {
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = null;
    this.buffer = null;
    this.duration = 240;
    this.playing = false;
    this.offset = 0;
    this.startAt = 0;
    this.src = null;
    this.samples = {};
  }

  async loadTrack(onStatus) {
    const url = this.cfg.audio.track;
    if (url) {
      try {
        onStatus?.('track');
        const ab = url === 'packed' ? await unpack() : await (async () => { const res = await fetch(url); if (!res.ok) throw new Error(res.status); return res.arrayBuffer(); })();
        const dec = new OfflineAudioContext(2, 1, 44100);
        this.buffer = await dec.decodeAudioData(ab);
        this.duration = this.buffer.duration;
        return;
      } catch (e) { console.warn('Track failed to load, using placeholder', e); }
    }
    onStatus?.('synth');
    this.buffer = await synthTrack(240);
    this.duration = this.buffer.duration;
  }

  async loadSamples() {
    const s = this.cfg.sounds || {};
    const dec = new OfflineAudioContext(2, 1, 44100);
    await Promise.all(Object.entries(s).filter(([, u]) => u).map(async ([k, u]) => {
      try { const ab = await (await fetch(u)).arrayBuffer(); this.samples[k] = await dec.decodeAudioData(ab); }
      catch (e) { console.warn('sound failed', k, u); }
    }));
  }

  ensure() {
    if (!this.ctx) {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = ctx.createGain(); this.master.connect(ctx.destination);
      this.music = ctx.createGain(); this.music.gain.value = this.cfg.audio.volume; this.music.connect(this.master);
      this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._startAmbience();
      this._startWindLoop();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ---------- music ----------
  play(fromSec, delay = 0.12) {
    if (!this.ctx || !this.buffer) return;
    this.stopSource();
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + 0.06);
    src.connect(g).connect(this.music);
    src.start(t0, Math.min(fromSec, this.duration - 0.01));
    this.src = src; this.srcGain = g;
    this.offset = fromSec; this.startAt = t0; this.playing = true;
    this.ambGain.gain.setTargetAtTime(this.cfg.audio.ambience * 0.25, ctx.currentTime, 0.4);
  }
  position() {
    if (!this.playing) return this.offset;
    return Math.min(this.duration, this.offset + Math.max(0, this.ctx.currentTime - this.startAt));
  }
  stop() {
    const p = this.position();
    this.stopSource();
    this.playing = false; this.offset = p;
    if (this.ctx) this.ambGain.gain.setTargetAtTime(this.cfg.audio.ambience, this.ctx.currentTime, 0.8);
    return p;
  }
  stopSource() {
    if (this.src) {
      const t = this.ctx.currentTime;
      try { this.srcGain.gain.setTargetAtTime(0, t, 0.015); this.src.stop(t + 0.08); } catch (e) {}
      this.src = null;
    }
  }

  // ---------- continuous layers ----------
  _startAmbience() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } }
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0;
    this.ambGain.gain.setTargetAtTime(this.cfg.audio.ambience, ctx.currentTime, 1.5);
    src.connect(lp).connect(this.ambGain).connect(this.master); src.start();
    const hum = ctx.createOscillator(); hum.frequency.value = 100; const hg = ctx.createGain(); hg.gain.value = 0.0016;
    hum.connect(hg).connect(this.ambGain); hum.start();
    // occasional distant car
    const car = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime;
      const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.linearRampToValueAtTime(700, t + 3); f.frequency.linearRampToValueAtTime(220, t + 7);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 3); g.gain.linearRampToValueAtTime(0, t + 7.5);
      n.connect(f).connect(g).connect(this.ambGain); n.start(t); n.stop(t + 8);
      setTimeout(car, 18000 + Math.random() * 30000);
    };
    setTimeout(car, 9000);
  }
  _startWindLoop() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.8;
    const lo = ctx.createBufferSource(); lo.buffer = this.noise; lo.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.windBP = bp;
    n.connect(bp).connect(this.windGain); lo.connect(lp).connect(this.windGain);
    this.windGain.connect(this.sfx); n.start(); lo.start();
    this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0;
    const mo = ctx.createOscillator(); mo.type = 'sawtooth'; mo.frequency.value = 92; this.motorOsc = mo;
    const mlp = ctx.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 260;
    const hiss = ctx.createBufferSource(); hiss.buffer = this.noise; hiss.loop = true;
    const hbp = ctx.createBiquadFilter(); hbp.type = 'highpass'; hbp.frequency.value = 5000;
    const hg = ctx.createGain(); hg.gain.value = 0.25;
    mo.connect(mlp).connect(this.motorGain); hiss.connect(hbp).connect(hg).connect(this.motorGain);
    this.motorGain.connect(this.sfx); mo.start(); hiss.start();
  }
  setWind(speed) { // rad/s of the hub
    if (!this.ctx) return;
    const a = Math.min(1, Math.abs(speed) / 14);
    this.windGain.gain.setTargetAtTime(a * 0.09, this.ctx.currentTime, 0.05);
    this.windBP.frequency.setTargetAtTime(1500 + a * 1800, this.ctx.currentTime, 0.05);
  }
  motor(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on) { this.motorOsc.frequency.setValueAtTime(40, t); this.motorOsc.frequency.linearRampToValueAtTime(92, t + 0.25); this.motorGain.gain.setTargetAtTime(0.012, t, 0.08); }
    else { this.motorOsc.frequency.linearRampToValueAtTime(30, t + 0.3); this.motorGain.gain.setTargetAtTime(0, t, 0.08); }
  }

  // ---------- foley ----------
  _burst(t, dur, f, q, gain, type = 'bandpass') {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(this.sfx); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  _tone(t, dur, f, f2, gain, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  }
  sound(name, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay + 0.005;
    const smp = this.samples[name];
    if (smp) { const s = this.ctx.createBufferSource(); s.buffer = smp; s.connect(this.sfx); s.start(t); return; }
    const B = (dt, ...a) => this._burst(t + dt, ...a), T = (dt, ...a) => this._tone(t + dt, ...a);
    const r = Math.random;
    switch (name) {
      case 'caseOpen': B(0, .012, 2600, 1.4, .5); B(.004, .05, 900, 5, .22); T(.01, .08, 2100, 1500, .03, 'triangle'); B(.09, .02, 1800, 2, .12); break;
      case 'caseClose': B(0, .01, 3200, 1.2, .6); B(.006, .05, 1000, 4, .3); T(0, .05, 240, 150, .1); break;
      case 'cassetteOut': for (let i = 0; i < 3; i++) B(i * .035 + r() * .01, .012, 2500 + r() * 1500, 2, .18); B(.02, .16, 1400, .7, .05); break;
      case 'cassetteIn': B(0, .015, 2200, 1, .45); T(0, .05, 420, 300, .12); B(.03, .01, 3000, 2, .15); break;
      case 'cassetteDown': B(0, .02, 1600, 1, .35); T(0, .06, 300, 180, .12); break;
      case 'pencilPick': B(0, .015, 1200, 2, .2); T(0, .04, 700, 500, .06, 'triangle'); break;
      case 'pencilDown': T(0, .05, 900, 600, .14, 'triangle'); B(0, .008, 4000, 2, .2); T(.07, .04, 1100, 800, .06, 'triangle'); break;
      case 'pencilTap': T(0, .035, 1150, 820, .22, 'triangle'); B(0, .006, 5200, 2, .25); T(.002, .07, 520, 440, .1); break;
      case 'pencilOut': B(0, .05, 1800, 1.5, .08); T(0, .03, 900, 700, .05, 'triangle'); break;
      case 'windTick': B(0, .006, 3200 + r() * 1400, 3, .05 + r() * .03); break;
      case 'strain': T(0, .09, 150, 90, .22); B(0, .025, 700, 2, .2); break;
      case 'playerOpen': B(0, .01, 2400, 1.5, .5); T(.005, .18, 320, 170, .09, 'triangle'); for (let i = 0; i < 3; i++) B(.04 + i * .03, .01, 2600, 3, .1 / (i + 1)); break;
      case 'playerClose': B(0, .012, 2800, 1.2, .55); T(0, .05, 200, 140, .2); B(.02, .01, 4000, 3, .15); break;
      case 'cassetteInsert': B(0, .014, 2000, 1, .45); T(0, .045, 380, 260, .14); B(.04, .012, 2800, 2, .2); break;
      case 'keyDown': B(0, .01, 1900, 1.2, .45); B(.028, .014, 1200, 2, .32); T(.028, .04, 260, 180, .08); break;
      case 'keyUp': B(0, .012, 1500, 1.2, .35); T(0, .05, 240, 160, .1); break;
      case 'cabinetOpen': B(0, .02, 900, 2, .3); T(.01, .35, 210, 160, .03, 'triangle'); T(.05, .3, 330, 290, .015, 'sawtooth'); B(.02, .25, 500, .6, .04); break;
      case 'cabinetClose': B(0, .03, 320, 1, .5); T(0, .09, 110, 70, .25); B(.012, .015, 2200, 2, .15); break;
      case 'casePick': B(0, .01, 2600, 1.5, .3); B(.02, .008, 3400, 2, .12); break;
      case 'casePlace': B(0, .012, 1800, 1.2, .4); T(0, .04, 340, 240, .1); B(.015, .008, 2800, 2, .12); break;
      case 'heavyPick': B(0, .02, 900, 1, .25); T(0, .05, 180, 140, .08); break;
      case 'heavyPlace': B(0, .03, 600, 1, .45); T(0, .08, 140, 90, .25); B(.01, .01, 2400, 2, .12); break;
      case 'deny': B(0, .008, 1700, 1.5, .25); B(.05, .008, 1500, 1.5, .18); break;
    }
  }
}

// Packed track: shuffled, reversed, keystream-masked chunks (no playable file on the server).
const _P = ['1d2mlz', 'bpdv9k', 'm1p3x5', 'we0ckq', '16qbl8b', '1h2mtvw', '1rey2jh'];
async function unpack() {
  const parts = await Promise.all(_P.map(async (n, i) => {
    const b = new Uint8Array(await (await fetch(`assets/audio/t/${n}.dat`)).arrayBuffer());
    let s = (0x5EED1994 ^ Math.imul(i + 1, 0x9E3779B9)) >>> 0 || 1;
    const o = new Uint8Array(b.length);
    for (let j = 0; j < b.length; j++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; o[b.length - 1 - j] = b[j] ^ (s & 255); }
    return o;
  }));
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let off = 0; for (const p of parts) { out.set(p, off); off += p.length; }
  return out.buffer;
}

// Placeholder track (only if no track file is configured).
async function synthTrack(duration) {
  const sr = 32000, ctx = new OfflineAudioContext(2, Math.floor(duration * sr), sr);
  const out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination);
  const bpm = 82, beat = 60 / bpm, bar = beat * 4, bars = Math.floor(duration / bar);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const prog = [[50, 57, 60, 64, 69], [55, 59, 62, 65, 69], [48, 55, 59, 64, 67], [45, 52, 55, 60, 64]];
  for (let b = 0; b < bars; b++) {
    const t = b * bar, ch = prog[b % 4];
    ch.forEach(m => { const o = ctx.createOscillator(); o.frequency.value = mtof(m); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .01); g.gain.exponentialRampToValueAtTime(.005, t + bar); o.connect(g).connect(out); o.start(t); o.stop(t + bar); });
    if (b >= 4) for (let k = 0; k < 4; k++) { const tk = t + k * beat; const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, tk); o.frequency.exponentialRampToValueAtTime(45, tk + .25); const g = ctx.createGain(); g.gain.setValueAtTime(k % 2 ? 0 : .5, tk); g.gain.exponentialRampToValueAtTime(.001, tk + .3); o.connect(g).connect(out); o.start(tk); o.stop(tk + .3); }
  }
  return ctx.startRendering();
}
