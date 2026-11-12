/**
 * The smooth outline curve: a closed cubic spline through the outline points in the flat front view (chord-length parameter, continuous
 * slope AND bend, so a long edge forms one clean arc instead of a lump at every point), then read off as R(phi) on a uniform angle grid.
 * `s` (0..1) blends towards the straight-segment polygon, like the Smooth slider always did.
 */
const TWO_PI = Math.PI * 2;
export const SMOOTH_GRID = 1440; // 0.25 degrees

/** second derivatives of the periodic cubic spline through y at parameters t (n points, period T) */
function periodicM(t: number[], T: number, y: number[]): number[] {
  const n = y.length, h = (i: number) => (i === n - 1 ? T - t[n - 1] : t[i + 1] - t[i]);
  const A: number[][] = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n, hp = h(p), hi = h(i);
    A[i][p] += hp; A[i][i] += 2 * (hp + hi); A[i][q] += hi;
    A[i][n] = 6 * ((y[q] - y[i]) / hi - (y[i] - y[p]) / hp);
  }
  for (let c = 0; c < n; c++) { // Gaussian elimination, partial pivoting (n is at most a few dozen)
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / d; if (f) for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  const M = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let acc = A[r][n]; for (let k = r + 1; k < n; k++) acc -= A[r][k] * M[k]; M[r] = acc / (A[r][r] || 1e-12); }
  return M;
}

/** polar samples (angle unwrapped ascending from the first point, radius) of a dense closed path: keeps the outermost radius if the path doubles back */
function toPolar(path: [number, number][], a0: number): { a: number[]; r: number[] } {
  const a: number[] = [], r: number[] = []; let prev = a0 - 1e-9;
  for (const [x, y] of path) {
    let ang = Math.atan2(y, x); while (ang < prev - Math.PI) ang += TWO_PI; while (ang > prev + Math.PI) ang -= TWO_PI;
    if (ang <= prev) continue; // not star-shaped here: skip the doubling-back stretch
    prev = ang; a.push(ang); r.push(Math.hypot(x, y));
  }
  return { a, r };
}
/** resample polar samples (ascending angle, one turn) onto the uniform grid that starts at -pi/2 */
function toGrid(p: { a: number[]; r: number[] }, a0: number): Float64Array {
  const n = SMOOTH_GRID, out = new Float64Array(n), m = p.a.length; let j = 0;
  for (let k = 0; k < n; k++) {
    let ang = -Math.PI / 2 + (k / n) * TWO_PI; while (ang < a0) ang += TWO_PI; while (ang >= a0 + TWO_PI) ang -= TWO_PI;
    while (j < m - 1 && p.a[j + 1] <= ang) j++;
    const a1 = p.a[j], r1 = p.r[j], a2 = j < m - 1 ? p.a[j + 1] : p.a[0] + TWO_PI, r2 = j < m - 1 ? p.r[j + 1] : p.r[0];
    const f = a2 > a1 ? Math.min(1, Math.max(0, (ang - a1) / (a2 - a1))) : 0;
    out[k] = r1 + (r2 - r1) * f;
  }
  return out;
}

export function smoothRing(angles: number[], radii: number[], s: number): { n: number; r: Float64Array } {
  const n = angles.length, X = angles.map((a, i) => radii[i] * Math.cos(a)), Y = angles.map((a, i) => radii[i] * Math.sin(a));
  const t: number[] = [0]; for (let i = 1; i < n; i++) t.push(t[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]) || 1e-6);
  const T = t[n - 1] + (Math.hypot(X[0] - X[n - 1], Y[0] - Y[n - 1]) || 1e-6);
  const Mx = periodicM(t, T, X), My = periodicM(t, T, Y);
  const spline: [number, number][] = [], poly: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, h = i === n - 1 ? T - t[n - 1] : t[i + 1] - t[i], steps = Math.max(6, Math.ceil(h / 0.25));
    for (let k = 0; k < steps; k++) {
      const u = k / steps, a = 1 - u, b = u;
      const ev = (v: number[], M: number[]) => a * v[i] + b * v[j] + ((a * a * a - a) * M[i] + (b * b * b - b) * M[j]) * h * h / 6;
      spline.push([ev(X, Mx), ev(Y, My)]);
      poly.push([X[i] + (X[j] - X[i]) * u, Y[i] + (Y[j] - Y[i]) * u]);
    }
  }
  const a0 = angles[0], gs = toGrid(toPolar(spline, a0), a0);
  if (s >= 1) return { n: SMOOTH_GRID, r: gs };
  const gp = toGrid(toPolar(poly, a0), a0), out = new Float64Array(SMOOTH_GRID);
  for (let k = 0; k < SMOOTH_GRID; k++) out[k] = s * gs[k] + (1 - s) * gp[k];
  return { n: SMOOTH_GRID, r: out };
}
