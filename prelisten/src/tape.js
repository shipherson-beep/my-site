// Tape Simulation — single source of truth for tape position.
// Tape wound on a hub forms an Archimedean spiral: r(θ) = r0 + kθ/2, with k = thickness/π.
// So one turn moves 2πr of tape — less near an empty hub, more on a full pack.
export class TapeModel {
  constructor({ duration, speed, hubRadius, fullPackRadius, rewindScale = 1 }) {
    this.D = duration;
    this.v = speed;
    this.L = duration * speed;
    this.r0 = hubRadius;
    this.rF = fullPackRadius;
    this.k = (fullPackRadius ** 2 - hubRadius ** 2) / this.L; // = thickness/π
    this.scale = rewindScale;
    this.l = 0; // metres of tape on the take-up (right) reel
  }
  get pos() { return this.l / this.v; }
  setPos(sec) { this.l = Math.min(this.L, Math.max(0, sec * this.v)); }
  rL() { return Math.sqrt(this.r0 ** 2 + this.k * (this.L - this.l)); }
  rR() { return Math.sqrt(this.r0 ** 2 + this.k * this.l); }
  // reel angles are pure functions of tape position, seen from side A: forward = counter-clockwise,
  // rewind = clockwise. Angles are CCW-positive (three.js rotation.z).
  angL() { return 2 * (this.rF - this.rL()) / this.k; }
  angR() { return 2 * (this.rR() - this.r0) / this.k; }
  ang(side) { return side === 'L' ? this.angL() : this.angR(); }
  atStart() { return this.l <= 1e-7; }
  atEnd() { return this.l >= this.L - 1e-7; }
  // Turn one hub by dθ (CCW-positive, seen from side A). Returns the angle actually applied (stops at the ends).
  // A hub can only pull tape onto itself: L only CW (rewind), R only CCW (forward); the other way just pays out slack.
  driveHub(side, dθ) {
    if (side === 'L' ? dθ > 0 : dθ < 0) return 0;
    const d = dθ * this.scale, k = this.k, r0 = this.r0;
    if (side === 'R') {
      const r = this.rR();
      const rn = Math.min(this.rF, Math.max(r0, r + k * d / 2));
      this.l = Math.min(this.L, Math.max(0, (rn * rn - r0 * r0) / k));
      return (2 * (rn - r) / k) / this.scale;
    } else {
      const r = this.rL();
      const rn = Math.min(this.rF, Math.max(r0, r - k * d / 2));
      this.l = Math.min(this.L, Math.max(0, this.L - (rn * rn - r0 * r0) / k));
      return -(2 * (rn - r) / k) / this.scale;
    }
  }
}
