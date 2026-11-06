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
  private s: number; // smoothness 0..1: straight segments -> smooth cubic
  private nHalf: number; // right-half point count: ring indices 0 and nHalf-1 are the axis points

  constructor(outline: Outline) {
    this.s = Math.min(1, Math.max(0, outline.smooth ?? 1));
    this.nHalf = outline.phi.length;
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
    const rc = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
    const drc = ((6 * t2 - 6 * t) * y0 + (3 * t2 - 4 * t + 1) * m0 + (-6 * t2 + 6 * t) * y1 + (3 * t2 - 2 * t) * m1) / h;
    const s = this.s;
    if (s >= 1) return { r: rc, dr: drc };
    // the straight-segment part is eased into the two axis points so the mirrored halves never meet in a crease
    const nh = this.nHalf, axisStart = k === 0 || k === nh - 1, axisEnd = k === nh - 2 || k === n - 1;
    let tl = t, dtl = 1;
    if (axisStart && !axisEnd) { tl = t * t; dtl = 2 * t; } else if (axisEnd && !axisStart) { tl = 1 - (1 - t) * (1 - t); dtl = 2 * (1 - t); }
    const rl = y0 + (y1 - y0) * tl, drl = ((y1 - y0) * dtl) / h;
    return { r: s * rc + (1 - s) * rl, dr: s * drc + (1 - s) * drl };
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

/**
 * 1D curve on t in [0,1] through values at heights `ts` (evenly spaced when omitted): the side profile.
 * smooth = 1 is a natural cubic spline: the smoothest curve through the points (continuous slope AND curvature, no kinks);
 * smooth = 0 is straight segments. Points can sit at any height.
 */
export class SideCurve {
  private M: number[]; private ts: number[];
  constructor(private v: number[], ts?: number[], private smooth = 1) {
    const n = v.length;
    this.ts = ts && ts.length === n ? ts : v.map((_, i) => i / (n - 1));
    const t = this.ts, h = (i: number) => t[i + 1] - t[i], M = new Array<number>(n).fill(0);
    if (n > 2) { // natural spline: second derivative is 0 at both ends; solve the tridiagonal system for the rest
      const a: number[] = [], d: number[] = [], c: number[] = [], r: number[] = [];
      for (let i = 1; i < n - 1; i++) { a.push(h(i - 1)); d.push(2 * (h(i - 1) + h(i))); c.push(h(i)); r.push(6 * ((v[i + 1] - v[i]) / h(i) - (v[i] - v[i - 1]) / h(i - 1))); }
      for (let i = 1; i < d.length; i++) { const w = a[i] / d[i - 1]; d[i] -= w * c[i - 1]; r[i] -= w * r[i - 1]; }
      const x = new Array<number>(d.length);
      x[d.length - 1] = r[d.length - 1] / d[d.length - 1];
      for (let i = d.length - 2; i >= 0; i--) x[i] = (r[i] - c[i] * x[i + 1]) / d[i];
      for (let i = 0; i < x.length; i++) M[i + 1] = x[i];
    }
    this.M = M;
  }
  private seg(t: number) {
    const n = this.v.length, c = Math.min(1, Math.max(0, t)); let i = 0;
    while (i < n - 2 && c > this.ts[i + 1]) i++;
    return { i, h: this.ts[i + 1] - this.ts[i], c };
  }
  /** derivative with respect to t */
  deriv(t: number): number {
    const { i, h, c } = this.seg(t), t0 = this.ts[i], t1 = this.ts[i + 1], v = this.v, M = this.M, s = this.smooth;
    const spline = -M[i] * (t1 - c) ** 2 / (2 * h) + M[i + 1] * (c - t0) ** 2 / (2 * h) - (v[i] / h - M[i] * h / 6) + (v[i + 1] / h - M[i + 1] * h / 6);
    return s * spline + (1 - s) * ((v[i + 1] - v[i]) / h);
  }
  eval(t: number): number {
    const { i, h, c } = this.seg(t), t0 = this.ts[i], t1 = this.ts[i + 1], v = this.v, M = this.M, s = this.smooth;
    const spline = M[i] * (t1 - c) ** 3 / (6 * h) + M[i + 1] * (c - t0) ** 3 / (6 * h) + (v[i] / h - M[i] * h / 6) * (t1 - c) + (v[i + 1] / h - M[i + 1] * h / 6) * (c - t0);
    return Math.min(2, Math.max(0.15, s * spline + (1 - s) * (v[i] + (v[i + 1] - v[i]) * ((c - t0) / h)))); // a spline can overshoot a little between points; keep it sane
  }
}
