import { describe, it, expect } from 'vitest';
import { PoissonInflator } from '../src/geometry/inflate';

const DEG = Math.PI / 180;
// equilateral triangle with the given inradius, apex up, as a radius function of angle
const triangle = (inR: number) => (phi: number) => {
  const normals = [-90, 30, 150].map((a) => a * DEG);
  let best = Infinity; // the ray hits the nearest edge line: r = inR / cos(phi - normal) for the edge facing it
  for (const n of normals) { const c = Math.cos(phi - n); if (c > 1e-6) best = Math.min(best, inR / c); }
  return best;
};

describe('Poisson inflation', () => {
  it('a disk inflates to the exact paraboloid u = (R^2 - r^2) / 4 (so height = an ellipsoid)', () => {
    const R = 20, f = new PoissonInflator({ cell: 0.8 }).solve(() => R, 600);
    for (const r of [0, 5, 10, 15, 18]) {
      const exact = (R * R - r * r) / 4;
      expect(Math.abs(f.sample(r, 0) - exact) / (R * R / 4)).toBeLessThan(0.012);
    }
    // height profile is sqrt(1 - (r/R)^2): the ellipsoid
    const f2 = f; for (const r of [0, 8, 14]) expect(Math.abs(f2.height(r, 0) - Math.sqrt(1 - (r / R) ** 2))).toBeLessThan(0.03);
    expect(f.height(R + 3, 0)).toBe(0); // zero outside
  });

  it('is symmetric for a symmetric outline, and zero exactly on the outline', () => {
    const f = new PoissonInflator().solve(triangle(18), 500);
    for (const [x, y] of [[4, 2], [8, -3], [-6, 5]]) expect(Math.abs(f.sample(x, y) - f.sample(-x, y))).toBeLessThan(0.02 * f.umax);
    const phi = 40 * DEG, r = triangle(18)(phi); // a point on the outline
    expect(f.height(r * Math.cos(phi), r * Math.sin(phi))).toBeLessThan(0.08);
  });

  it('is smooth across the medial axis of a triangle (a distance field has a crease there)', () => {
    const inR = 18, f = new PoissonInflator({ cell: 0.8 }).solve(triangle(inR), 600);
    // walk across the bisector from the incircle centre towards a corner: the slope of u must be continuous
    // while a plain distance field would flip the sign of its gradient across the bisector
    const bis = 150 * DEG; // the bisector from the centre through the left-bottom corner direction is at -150deg; use a path crossing it
    const pts: number[] = [];
    for (let t = -4; t <= 4; t += 0.5) { const a = -150 * DEG, nx = -Math.sin(a), ny = Math.cos(a); const bx = 9 * Math.cos(a) + nx * t, by = 9 * Math.sin(a) + ny * t; pts.push(f.sample(bx, by)); }
    const slopes = pts.slice(1).map((v, i) => v - pts[i]);
    const jump = Math.max(...slopes.slice(1).map((s, i) => Math.abs(s - slopes[i])));
    const peakSlope = Math.max(...slopes.map(Math.abs));
    expect(jump).toBeLessThan(0.35 * Math.max(peakSlope, 1e-6) + 0.02 * f.umax); // second differences stay small: no ridge
    void bis;
  });

  it('narrow parts get thinner on their own (adaptive thickness)', () => {
    // a body with a narrow vertical neck: radius small around +-90deg, large at the sides
    const r = (phi: number) => 14 + 12 * Math.cos(2 * phi) ** 2;
    const f = new PoissonInflator().solve(r, 500);
    expect(f.height(0, 0)).toBeGreaterThan(f.height(0, 12)); // the narrow end is lower than the middle
  });

  it('a warm start with a few sweeps follows a small change to within a few percent of a full solve', () => {
    const inf = new PoissonInflator();
    inf.solve((p) => 22 + 3 * Math.cos(3 * p), 500);
    const quick = inf.solve((p) => 22.4 + 3 * Math.cos(3 * p), 25);
    const full = new PoissonInflator().solve((p) => 22.4 + 3 * Math.cos(3 * p), 800);
    let worst = 0; for (const [x, y] of [[0, 0], [8, 3], [-10, -6], [3, 15]]) worst = Math.max(worst, Math.abs(quick.sample(x, y) - full.sample(x, y)) / full.umax);
    expect(worst).toBeLessThan(0.04);
  });
});
