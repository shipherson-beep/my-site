// InteractionController: зберігає ціль (намір користувача) і поточний стан; щокадру планує ОДИН наступний безпечний крок.
// Позиції предметів обчислюються з цих параметрів від базових станів — похибка не накопичується.
// sp: конверт 0 = у кишені, 1 = вийшов з кишені, 2 = у позиції розкладання. rp: платівка 0 = у конверті, 1 = вийшла, 2 = розкладена.
// sf/rf: перевертання 0..1; si/ri: підняття для огляду 0..1; *yaw/*pitch: поворот рукою під час огляду.
const EPS = 1e-4;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = v => Math.max(0, Math.min(1, v));

function smoothDamp(cur, target, st, smoothTime, maxSpeed, dt) {
  smoothTime = Math.max(1e-4, smoothTime);
  const omega = 2 / smoothTime, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const maxChange = maxSpeed * smoothTime;
  let change = Math.max(-maxChange, Math.min(maxChange, cur - target));
  const t2 = cur - change;
  const temp = (st.v + omega * change) * dt;
  st.v = (st.v - omega * temp) * exp;
  let out = t2 + (change + temp) * exp;
  if ((target - cur > 0) === (out > target)) { out = target; st.v = 0; }
  return out;
}

export class Controller {
  // opts: { pairPanel:[k..], neighbor:[flapIndex|null..], own:[flapIndex|null..], durations, reducedMotion }
  constructor(opts) {
    this.o = opts; this.n = opts.pairPanel.length; this.ver = 0;
    this.c = { open: 0, bend: [0, 0, 0], pairs: [] };
    for (let i = 0; i < this.n; i++) this.c.pairs.push({ sp: 0, rp: 0, sf: 0, rf: 0, si: 0, ri: 0, syaw: 0, spitch: 0, ryaw: 0, rpitch: 0 });
    this.openV = { v: 0 };
    this.step = null; this.resetting = false;
    this._goalInit();
  }
  _goalInit() {
    this.g = { open: 0, fast: false, inspect: null, pairs: [] };
    for (let i = 0; i < this.n; i++) this.g.pairs.push({ sl: 0, rec: 0, sf: 0, rf: 0 });
  }
  get dm() { return this.o.reducedMotion ? (this.o.durations.reducedMotionFactor || 0.3) : 1; }
  get busy() { return !!this.step || !!this.plan(true); }

  // ---------- команди (зберігається лише остання ціль) ----------
  _allIn() { for (const p of this.g.pairs) { p.sl = 0; p.rec = 0; p.sf = 0; p.rf = 0; } }
  _norm() {
    const g = this.g;
    for (const p of g.pairs) {
      if (p.rec === 2) p.sl = 2;
      if (p.sl === 0) { p.rec = 0; p.sf = 0; }
      if (p.rec === 0) p.rf = 0;
    }
    if (g.pairs.some(p => p.sl === 2)) g.open = 1;
    if (g.inspect) {
      const p = g.pairs[g.inspect.i];
      const ok = g.inspect.type === 'sleeve' ? p.sl === 2 && p.rec === 0 : p.rec === 2;
      if (!ok) g.inspect = null;
    }
    this.ver++;
  }
  setOpen(v, fromSlider) {
    v = clamp01(v); this.resetting = false;
    if (v < 1 - EPS) { this._allIn(); this.g.inspect = null; }
    this.g.open = v; this.g.fast = !!fromSlider; this._norm();
  }
  open() { this.setOpen(1); }
  close() { this.resetting = false; this.g.inspect = null; this._allIn(); this.g.open = 0; this.g.fast = false; this._norm(); }
  reset() { this.close(); this.resetting = true; }
  returnAll() { this.resetting = false; this.g.inspect = null; this._allIn(); this.g.open = 1; this.g.fast = false; this._norm(); }
  sleeveOut(i) { this.resetting = false; this.g.inspect = null; this.g.fast = false; this.g.pairs[i].sl = 2; this._norm(); }
  sleeveIn(i) { this.resetting = false; this.g.inspect = null; this.g.pairs[i].sl = 0; this._norm(); }
  recordOut(i) { this.resetting = false; this.g.inspect = null; this.g.fast = false; const p = this.g.pairs[i]; p.sl = 2; p.rec = 2; p.sf = 0; this._norm(); }
  recordIn(i) { this.resetting = false; this.g.inspect = null; this.g.pairs[i].rec = 0; this._norm(); }
  flip(type, i) {
    const p = this.g.pairs[i];
    if (type === 'sleeve' && p.sl === 2 && p.rec === 0) p.sf = p.sf ? 0 : 1;
    if (type === 'record' && p.rec === 2) p.rf = p.rf ? 0 : 1;
    this._norm();
  }
  inspect(type, i) { this.g.inspect = { type, i }; this._norm(); return !!this.g.inspect; }
  uninspect() { this.g.inspect = null; this._norm(); }

  // ---------- планування ----------
  _tw(kind, items, dur) {
    return { kind, dur: Math.max(0.05, dur * this.dm), t: 0, items: items.map(([obj, key, to]) => ({ obj, key, from: obj[key], to })) };
  }
  _segDur(from, to, slide, move) { return Math.min(from, to) >= 1 ? move : slide; }

  plan(dry) {
    const C = this.c, G = this.g, D = this.o.durations, n = this.n;
    const nb = this.o.neighbor, own = this.o.own;
    const bendTo = (k, v) => this._tw(v > 0 ? 'bend' : 'unbend', [[C.bend, k, v]], D.bend);
    // A. предмети в дорозі завершують рух
    for (let i = 0; i < n; i++) {
      const P = C.pairs[i], Gp = G.pairs[i];
      if (P.rp > 0 && P.rp < 2) {
        const to = Gp.rec === 2 ? 2 : 0;
        return this._tw(to > P.rp ? 'recordOut' : 'recordIn', [[P, 'rp', to]], this._segDur(P.rp, to, D.slide, D.move));
      }
    }
    for (let i = 0; i < n; i++) {
      const P = C.pairs[i], Gp = G.pairs[i];
      if (P.sp > 0 && P.sp < 2) {
        if (nb[i] != null && C.bend[nb[i]] < 1) return bendTo(nb[i], 1);
        if (own[i] != null && C.bend[own[i]] > 0) return bendTo(own[i], 0);
        const to = Gp.sl === 2 ? 2 : 0;
        return this._tw(to > P.sp ? 'sleeveOut' : 'sleeveIn', [[P, 'sp', to]], this._segDur(P.sp, to, D.slide, D.move));
      }
    }
    // B. зняти огляд / ручний поворот з предметів, які більше не оглядаються
    for (let i = 0; i < n; i++) {
      const P = C.pairs[i], ins = G.inspect && G.inspect.i === i ? G.inspect.type : null;
      if (ins !== 'sleeve') {
        if (P.syaw || P.spitch) return this._tw('unrotate', [[P, 'syaw', 0], [P, 'spitch', 0]], D.unrotate);
        if (P.si > 0) return this._tw('uninspect', [[P, 'si', 0]], D.inspect);
      }
      if (ins !== 'record') {
        if (P.ryaw || P.rpitch) return this._tw('unrotate', [[P, 'ryaw', 0], [P, 'rpitch', 0]], D.unrotate);
        if (P.ri > 0) return this._tw('uninspect', [[P, 'ri', 0]], D.inspect);
      }
    }
    // C. повернення платівок
    for (let i = 0; i < n; i++) {
      const P = C.pairs[i], Gp = G.pairs[i];
      if (P.rp === 2 && Gp.rec === 0) {
        if (P.rf > 0) return this._tw('flip', [[P, 'rf', 0]], D.flip);
        if (P.sf > 0) return this._tw('flip', [[P, 'sf', 0]], D.flip);
        return this._tw('recordIn', [[P, 'rp', 1]], D.move);
      }
    }
    // D. повернення конвертів
    for (let i = 0; i < n; i++) {
      const P = C.pairs[i], Gp = G.pairs[i];
      if (P.sp === 2 && Gp.sl === 0 && P.rp === 0) {
        if (P.sf > 0) return this._tw('flip', [[P, 'sf', 0]], D.flip);
        if (own[i] != null && C.bend[own[i]] > 0) return bendTo(own[i], 0);
        if (nb[i] != null && C.bend[nb[i]] < 1) return bendTo(nb[i], 1);
        return this._tw('sleeveIn', [[P, 'sp', 1]], D.move);
      }
    }
    // E. розкриття / закриття — лише коли всі конверти в кишенях
    const allIn = C.pairs.every(p => p.sp === 0);
    if (allIn && Math.abs(C.open - G.open) > EPS) {
      for (let k = 0; k < 3; k++) if (C.bend[k] > 0) return bendTo(k, 0);
      return { kind: G.open > C.open ? 'open' : 'close', spring: true };
    }
    // F. виймання конвертів
    for (let i = 0; i < n; i++) {
      const P = C.pairs[i], Gp = G.pairs[i];
      if (P.sp === 0 && Gp.sl === 2) {
        if (own[i] != null && C.bend[own[i]] > 0) return bendTo(own[i], 0);
        if (nb[i] != null && C.bend[nb[i]] < 1) return bendTo(nb[i], 1);
        return this._tw('sleeveOut', [[P, 'sp', 1]], D.slide);
      }
    }
    // G. повернути відведену стулку
    for (let k = 0; k < 3; k++) if (C.bend[k] > 0) return bendTo(k, 0);
    // H. виймання платівок
    for (let i = 0; i < n; i++) {
      const P = C.pairs[i], Gp = G.pairs[i];
      if (P.sp === 2 && P.rp === 0 && Gp.rec === 2) {
        if (P.sf > 0) return this._tw('flip', [[P, 'sf', 0]], D.flip);
        return this._tw('recordOut', [[P, 'rp', 1]], D.slide);
      }
    }
    // I. перевертання
    for (let i = 0; i < n; i++) {
      const P = C.pairs[i], Gp = G.pairs[i];
      if (P.sp === 2 && P.rp === 0 && P.sf !== Gp.sf) return this._tw('flip', [[P, 'sf', Gp.sf]], D.flip);
      if (P.rp === 2 && P.rf !== Gp.rf) return this._tw('flip', [[P, 'rf', Gp.rf]], D.flip);
    }
    // J. підняти предмет для огляду
    if (G.inspect) {
      const P = C.pairs[G.inspect.i];
      if (G.inspect.type === 'sleeve' && P.sp === 2 && P.si < 1) return this._tw('inspect', [[P, 'si', 1]], D.inspect);
      if (G.inspect.type === 'record' && P.rp === 2 && P.ri < 1) return this._tw('inspect', [[P, 'ri', 1]], D.inspect);
    }
    return null;
  }

  tick(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (!this.step) this.step = this.plan();
    const s = this.step;
    if (!s) { this.resetting = false; return false; }
    if (s.spring) {
      const C = this.c, G = this.g, D = this.o.durations;
      if (!C.pairs.every(p => p.sp === 0)) { this.step = null; return true; }
      const fast = G.fast;
      const maxSpeed = (fast ? 2.2 : 0.5 / D.flap) / this.dm;
      const st = (fast ? 0.1 : 0.22) * this.dm;
      C.open = smoothDamp(C.open, G.open, this.openV, st, maxSpeed, dt);
      s.kind = G.open > C.open ? 'open' : 'close';
      if (Math.abs(C.open - G.open) < EPS) { C.open = G.open; this.openV.v = 0; this.step = null; }
    } else {
      s.t += dt / s.dur;
      const e = ease(Math.min(1, s.t));
      for (const it of s.items) it.obj[it.key] = it.from + (it.to - it.from) * e;
      if (s.t >= 1) { for (const it of s.items) it.obj[it.key] = it.to; this.step = null; }
    }
    this.ver++;
    return true;
  }

  get phase() {
    const s = this.step || this.plan(true);
    if (!s) return 'idle';
    if (this.resetting) return 'resetting';
    if (s.kind === 'open') return 'opening';
    if (s.kind === 'close') return 'closing';
    if (/Out|bend$|^inspect/.test(s.kind) && s.kind !== 'unbend') return 'extracting';
    return 'returning';
  }
  get stepKind() { return this.step ? this.step.kind : null; }

  // ---------- правила стану (для тестів і налагодження) ----------
  violations() {
    const C = this.c, v = [], o = this.o;
    const isOpen = Math.abs(C.open - 1) < 1e-6;
    C.pairs.forEach((P, i) => {
      if (P.sp > 0 && !isOpen) v.push(`S${i + 1} поза кишенею при неповному розкритті`);
      if (P.rp > 0 && P.sp !== 2) v.push(`R${i + 1} поза конвертом, коли конверт не розкладено`);
      const transit = P.sp > 0 && P.sp < 2;
      if (transit && o.neighbor[i] != null && C.bend[o.neighbor[i]] !== 1) v.push(`S${i + 1} рухається без відведення сусідньої стулки`);
      if (transit && o.own[i] != null && C.bend[o.own[i]] !== 0) v.push(`S${i + 1} рухається з відведеної стулки`);
      if (P.sf > 0 && P.sp !== 2) v.push(`S${i + 1} перевертається не в позиції огляду`);
      if (P.rf > 0 && P.rp !== 2) v.push(`R${i + 1} перевертається не в позиції огляду`);
      if (P.rp > 0 && P.rp < 2 && (P.sf || P.si || P.syaw || P.spitch)) v.push(`R${i + 1} виходить із повернутого конверта`);
      if (P.si > 0 && (P.sp !== 2 || (P.rp > 0 && P.rp < 2))) v.push(`S${i + 1} піднято для огляду не з позиції розкладання`);
    });
    C.bend.forEach((b, k) => { if (b > 0 && !isOpen) v.push(`Стулка ${k + 1} відведена при неповному розкритті`); });
    return v;
  }
  settledAtZero() {
    const C = this.c;
    return C.open === 0 && C.bend.every(b => b === 0) && C.pairs.every(p => Object.values(p).every(x => x === 0));
  }
}

// Автоматичні перевірки залежностей і переривань.
export function runSelfTests(makeController) {
  const results = [];
  const test = (name, fn) => { try { const r = fn(); results.push({ name, ok: r === true, info: r === true ? '' : String(r) }); } catch (e) { results.push({ name, ok: false, info: e.message }); } };
  const run = (c, maxTicks = 20000, check = true) => {
    for (let t = 0; t < maxTicks; t++) {
      const active = c.tick(1 / 60);
      if (check) { const v = c.violations(); if (v.length) throw new Error(v[0]); }
      if (!active && !c.plan(true)) return t;
    }
    throw new Error('не дійшло до стабільного стану');
  };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  test('Закрито → розкрито → закрито', () => { const c = makeController(); c.open(); run(c); if (c.c.open !== 1) return 'не розкрилось'; c.close(); run(c); return c.settledAtZero() || 'стан не нульовий'; });
  for (let i = 0; i < 3; i++) test(`Повний цикл пари ${i + 1} з закритого стану`, () => {
    const c = makeController(); c.recordOut(i); run(c);
    const P = c.c.pairs[i]; if (P.sp !== 2 || P.rp !== 2) return 'не вийнято';
    c.flip('record', i); run(c); if (P.rf !== 1) return 'не перевернуто';
    c.recordIn(i); run(c); if (P.rp !== 0) return 'платівка не повернулась';
    c.flip('sleeve', i); run(c); if (P.sf !== 1) return 'конверт не перевернуто';
    c.sleeveIn(i); run(c); if (P.sp !== 0) return 'конверт не повернувся';
    c.close(); run(c); return c.settledAtZero() || 'стан не нульовий';
  });
  test('Повзунок при вийнятому вмісті спочатку повертає вміст', () => {
    const c = makeController(); c.recordOut(1); c.sleeveOut(0); run(c); c.setOpen(0.3, true);
    let sawReturn = false; for (let t = 0; t < 20000; t++) { c.tick(1 / 60); if (c.phase === 'returning') sawReturn = true; if (!c.plan(true) && !c.step) break; }
    return (sawReturn && Math.abs(c.c.open - 0.3) < 1e-6 && c.c.pairs.every(p => p.sp === 0)) || 'неправильна послідовність';
  });
  test('Випадкові переривання (400 команд) без порушень', () => {
    const c = makeController();
    const cmds = [() => c.open(), () => c.close(), () => c.returnAll(), () => c.reset(), () => c.setOpen(rnd(), true),
      i => c.sleeveOut(i), i => c.sleeveIn(i), i => c.recordOut(i), i => c.recordIn(i), i => c.flip('sleeve', i), i => c.flip('record', i),
      i => c.inspect('sleeve', i), i => c.inspect('record', i), () => c.uninspect()];
    for (let k = 0; k < 400; k++) {
      cmds[Math.floor(rnd() * cmds.length)](Math.floor(rnd() * 3));
      const ticks = Math.floor(rnd() * 90);
      for (let t = 0; t < ticks; t++) { c.tick(rnd() < 0.05 ? 0.5 : 1 / 60); const v = c.violations(); if (v.length) throw new Error(v[0]); }
      if (rnd() < 0.3) { const p = c.c.pairs[Math.floor(rnd() * 3)]; if (c.g.inspect && p.si === 1) { p.syaw = rnd(); } }
    }
    c.close(); run(c); return c.settledAtZero() || 'після «Закрити» стан не нульовий';
  });
  test('10 повних циклів не накопичують похибку', () => {
    const c = makeController();
    for (let k = 0; k < 10; k++) { for (let i = 0; i < 3; i++) c.recordOut(i); run(c); c.flip('record', 2); run(c); c.close(); run(c); }
    return c.settledAtZero() || 'залишкове зміщення';
  });
  test('Повторні натискання не створюють черги', () => {
    const c = makeController(); for (let k = 0; k < 50; k++) c.sleeveOut(1); const t = run(c);
    const c2 = makeController(); c2.sleeveOut(1); const t2 = run(c2);
    return t === t2 || `${t} ≠ ${t2} кадрів`;
  });
  return results;
}
