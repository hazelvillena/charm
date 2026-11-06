/**
 * Poisson (membrane) inflation: the smooth, shape-adaptive way to turn a flat outline into body heights.
 *
 * Solve  -laplacian(u) = 1  inside the outline with u = 0 on it (an inflated membrane), then height ~ sqrt(u).
 * - A disk gives an exact ellipsoid; narrow parts (legs, necks, necks between legs) get thinner by themselves.
 * - u is smooth EVERYWHERE inside, including across the medial axis. A distance-field "pillow" has a crease there
 *   (a pyramid ridge on a triangle); a pillow scaled by the local outline radius creases along corner directions.
 *   The Poisson solution has neither, so any outline inflates to a fair, soft body. (Not class-A: it is a concept
 *   surface that is smooth and adaptive; class-A refinement stays a manual stage in Rhino.)
 * - The outline only needs to be star-shaped around the origin (a radius function of angle), which is what the
 *   whole system uses. Pure TypeScript, no DOM, no three.js: reusable in workers, Node and other tools.
 *
 * Numerics: regular grid, 5-point Laplacian with Shortley-Weller cut-cell weights at the boundary (accurate edges),
 * SOR iteration, optional warm start from the previous solution (cheap incremental updates while dragging).
 */
export type InflateOptions = { cell?: number; omega?: number };

export class PoissonField {
  constructor(
    readonly ox: number, readonly oy: number, readonly cell: number, readonly nx: number, readonly ny: number,
    readonly u: Float32Array, readonly umax: number, public norm: number,
  ) {}

  /** bilinear sample of u (outside nodes hold linearly extrapolated negatives, so the zero crossing is the outline) */
  sample(x: number, y: number): number {
    const fx = (x - this.ox) / this.cell, fy = (y - this.oy) / this.cell, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= this.nx - 1 || j >= this.ny - 1) return 0;
    const tx = fx - i, ty = fy - j, k = j * this.nx + i, u = this.u;
    return (u[k] * (1 - tx) + u[k + 1] * tx) * (1 - ty) + (u[k + this.nx] * (1 - tx) + u[k + this.nx + 1] * tx) * ty;
  }

  /** membrane height, 0 on the outline and ~1 where u equals `norm` (default: its maximum); clamped to [0, 1.2] */
  height(x: number, y: number): number {
    const v = this.sample(x, y);
    return v <= 0 ? 0 : Math.min(1.2, Math.sqrt(v / this.norm));
  }

  /** use the value of u at (x, y) as the "full height" reference, but never less than `floor` of the maximum */
  normalizeAt(x: number, y: number, floor = 0.8) { this.norm = Math.max(1e-9, Math.max(this.sample(x, y), floor * this.umax)); return this; }
}

const TWO_PI = Math.PI * 2;

export class PoissonInflator {
  private prev: PoissonField | null = null;
  readonly cell: number; private omega: number;
  constructor(opts: InflateOptions = {}) { this.cell = opts.cell ?? 1.0; this.omega = opts.omega ?? 1.8; }

  /** forget the warm start (use when switching to an unrelated shape) */
  reset() { this.prev = null; }

  /**
   * radius(phi): the star-shaped outline around the origin. iterations: max SOR sweeps (stops early when converged).
   * With a warm start, a handful of sweeps follows a slowly changing outline closely.
   */
  solve(radius: (phi: number) => number, iterations = 400, tol = 5e-4): PoissonField {
    const c = this.cell, NT = 720;
    const tab = new Float32Array(NT + 2);
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (let k = 0; k <= NT; k++) {
      const a = (k / NT) * TWO_PI, r = Math.max(0.05, radius(a)); tab[k] = r;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
    tab[NT + 1] = tab[1];
    const R = (x: number, y: number) => {
      let a = Math.atan2(y, x); if (a < 0) a += TWO_PI;
      const f = (a / TWO_PI) * NT, i = Math.floor(f), t = f - i;
      return tab[i] * (1 - t) + tab[i + 1] * t;
    };
    const inside = (x: number, y: number) => x * x + y * y < (R(x, y) ** 2);
    const nx = Math.ceil((xmax - xmin) / c) + 6, ny = Math.ceil((ymax - ymin) / c) + 6;
    const ox = xmin - 3 * c, oy = ymin - 3 * c, N = nx * ny;
    const inn = new Uint8Array(N);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) inn[j * nx + i] = inside(ox + i * c, oy + j * c) ? 1 : 0;

    // Shortley-Weller weights: neighbours outside the outline sit at the fraction theta of a cell where u = 0
    const wL = new Float32Array(N), wR = new Float32Array(N), wD = new Float32Array(N), wU = new Float32Array(N), diag = new Float32Array(N);
    const tL = new Float32Array(N), tR = new Float32Array(N), tD = new Float32Array(N), tU = new Float32Array(N);
    const theta = (x: number, y: number, dx: number, dy: number) => {
      if (inside(x + dx * c, y + dy * c)) return 1;
      let lo = 0, hi = 1;
      for (let it = 0; it < 9; it++) { const m = (lo + hi) / 2; if (inside(x + dx * c * m, y + dy * c * m)) lo = m; else hi = m; }
      return Math.max(0.04, (lo + hi) / 2);
    };
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i; if (!inn[k]) continue;
      const x = ox + i * c, y = oy + j * c;
      const tl = theta(x, y, -1, 0), tr = theta(x, y, 1, 0), td = theta(x, y, 0, -1), tu = theta(x, y, 0, 1);
      tL[k] = tl; tR[k] = tr; tD[k] = td; tU[k] = tu;
      const cc = c * c;
      wL[k] = 2 / (cc * tl * (tl + tr)); wR[k] = 2 / (cc * tr * (tl + tr)); wD[k] = 2 / (cc * td * (td + tu)); wU[k] = 2 / (cc * tu * (td + tu));
      diag[k] = wL[k] + wR[k] + wD[k] + wU[k];
    }

    // initial guess: previous solution (warm start) or the disk solution
    const u = new Float32Array(N), prev = this.prev;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!inn[k]) continue;
      const x = ox + i * c, y = oy + j * c;
      u[k] = prev ? Math.max(0, prev.sample(x, y)) : Math.max(0, (R(x, y) ** 2 - x * x - y * y) / 4);
      if (u[k] <= 0) u[k] = 1e-3;
    }

    // SOR sweeps
    const w = this.omega;
    let umaxNow = 0; for (let k = 0; k < N; k++) if (u[k] > umaxNow) umaxNow = u[k];
    for (let it = 0; it < iterations; it++) {
      let maxd = 0;
      for (let j = 1; j < ny - 1; j++) {
        const row = j * nx;
        for (let i = 1; i < nx - 1; i++) {
          const k = row + i; if (!inn[k]) continue;
          const nu = (1 + wL[k] * u[k - 1] + wR[k] * u[k + 1] + wD[k] * u[k - nx] + wU[k] * u[k + nx]) / diag[k];
          const d = (nu - u[k]) * w; u[k] += d; const ad = d < 0 ? -d : d; if (ad > maxd) maxd = ad;
        }
      }
      if (maxd < tol * umaxNow * 0.01 && it > 2) break;
    }

    // ghost values just outside the outline: linear extrapolation, so interpolation crosses zero exactly on the outline
    const g = new Float32Array(u);
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i; if (inn[k]) continue;
      let acc = 0, n = 0;
      if (inn[k + 1]) { acc += u[k + 1] * (1 - 1 / tL[k + 1]); n++; }
      if (inn[k - 1]) { acc += u[k - 1] * (1 - 1 / tR[k - 1]); n++; }
      if (inn[k + nx]) { acc += u[k + nx] * (1 - 1 / tD[k + nx]); n++; }
      if (inn[k - nx]) { acc += u[k - nx] * (1 - 1 / tU[k - nx]); n++; }
      if (n) g[k] = acc / n;
    }
    let umax = 0; for (let k = 0; k < N; k++) if (inn[k] && u[k] > umax) umax = u[k];
    const field = new PoissonField(ox, oy, c, nx, ny, g, Math.max(umax, 1e-9), Math.max(umax, 1e-9));
    this.prev = field;
    return field;
  }
}
