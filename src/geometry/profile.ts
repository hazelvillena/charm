import { Outline, ringOf } from '../params/outline';

const TWO_PI = Math.PI * 2;

/**
 * R(phi): periodic cubic Hermite spline on the mirrored 12-point ring with
 * harmonic-mean (monotone) tangents. No overshoot, C1 continuous.
 */
export class Profile {
  private a: number[];
  private r: number[];
  private m: number[];
  private n: number;

  constructor(outline: Outline) {
    const ring = ringOf(outline);
    this.a = ring.a; this.r = ring.r; this.n = ring.a.length;
    const n = this.n;
    const h = (k: number) => (k === n - 1 ? this.a[0] + TWO_PI - this.a[n - 1] : this.a[k + 1] - this.a[k]);
    const d = (k: number) => (this.r[(k + 1) % n] - this.r[k]) / h(k);
    this.m = new Array(n).fill(0);
    for (let k = 0; k < n; k++) {
      const d0 = d((k + n - 1) % n), d1 = d(k);
      this.m[k] = d0 * d1 <= 0 ? 0 : (2 * d0 * d1) / (d0 + d1);
    }
  }

  /** returns radius and dR/dphi */
  eval(phi: number): { r: number; dr: number } {
    const a0 = this.a[0], n = this.n;
    let p = (phi - a0) % TWO_PI; if (p < 0) p += TWO_PI;
    p += a0;
    let k = n - 1;
    for (let i = 0; i < n - 1; i++) if (p < this.a[i + 1]) { k = i; break; }
    const ak = this.a[k];
    const ak1 = k === n - 1 ? a0 + TWO_PI : this.a[k + 1];
    const h = ak1 - ak;
    const t = (p - ak) / h;
    const k1 = (k + 1) % n;
    const y0 = this.r[k], y1 = this.r[k1], m0 = this.m[k] * h, m1 = this.m[k1] * h;
    const t2 = t * t, t3 = t2 * t;
    const r = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
    const dr = ((6 * t2 - 6 * t) * y0 + (3 * t2 - 4 * t + 1) * m0 + (-6 * t2 + 6 * t) * y1 + (3 * t2 - 2 * t) * m1) / h;
    return { r, dr };
  }

  radius(phi: number): number { return this.eval(phi).r; }

  /** minimum radius over the whole outline (sampled) */
  minRadius(samples = 360): { r: number; phi: number } {
    let best = Infinity, bp = 0;
    for (let i = 0; i < samples; i++) {
      const phi = -Math.PI / 2 + (i / samples) * TWO_PI;
      const r = this.radius(phi);
      if (r < best) { best = r; bp = phi; }
    }
    return { r: best, phi: bp };
  }
}
