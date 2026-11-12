import { Outline, clampOutline, makeOutline } from './outline';
import { Profile } from '../geometry/profile';
import { OUTLINE_MIN_GAP_DEG } from './core';

const DEG = Math.PI / 180;
export type StrokeFit = { outline: Outline; maxErrorMm: number; coverage: number; grew: boolean; points: number };
export type FitOptions = { fidelity?: number; mirror?: boolean; curve?: 'c2' }; // 0 = smooth / approximate (few points, heavy smoothing), 1 = faithful (many points, none)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Turns a freehand closed-ish stroke (points in mm, y up, origin = puck center) into the same 7-point mirrored
 * outline the editor uses. Star-shaped interpretation: for each angle, the outermost point of the stroke.
 * Returns null if the stroke does not go around the puck enough to define a shape.
 */
export function fitOutlineFromStroke(stroke: [number, number][], wall: number, opts: FitOptions = {}): StrokeFit | null {
  if (stroke.length < 8) return null;
  const fid = Math.min(1, Math.max(0, opts.fidelity ?? 0.55));
  // densify so thin strokes still cover every angle they pass through
  const pts: [number, number][] = [];
  for (let i = 0; i < stroke.length; i++) {
    const a = stroke[i], b = stroke[(i + 1) % stroke.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4));
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const raw = new Array<number>(360).fill(NaN);
  for (const [x, y] of pts) {
    const r = Math.hypot(x, y);
    if (r < 1e-6) continue;
    const bin = ((Math.round(Math.atan2(y, x) / DEG) % 360) + 360) % 360;
    if (!(raw[bin] >= r)) raw[bin] = r;
  }
  const filled = raw.filter((v) => Number.isFinite(v)).length;
  const coverage = filled / 360;
  if (coverage < 0.55) return null; // the stroke does not go around the puck
  // fill gaps by circular linear interpolation
  const R = [...raw];
  for (let i = 0; i < 360; i++) {
    if (Number.isFinite(R[i])) continue;
    let lo = 1, hi = 1;
    while (!Number.isFinite(raw[(i - lo + 360) % 360])) lo++;
    while (!Number.isFinite(raw[(i + hi) % 360])) hi++;
    const a = raw[(i - lo + 360) % 360], b = raw[(i + hi) % 360];
    R[i] = a + ((b - a) * lo) / (lo + hi);
  }
  // light smoothing (circular moving average, 5 bins) (then mirror-symmetrized about the vertical axis unless `mirror` is off)
  // gaussian smoothing (circular): hand jitter is removed unless fidelity is turned all the way up
  const sigma = lerp(6, 1.6, fid), rad = Math.ceil(sigma * 3), wts: number[] = [];
  for (let k = -rad; k <= rad; k++) wts.push(Math.exp(-0.5 * (k / sigma) ** 2));
  const wsum = wts.reduce((a, b) => a + b, 0);
  const sm = R.map((_, i) => { let acc = 0; for (let k = -rad; k <= rad; k++) acc += R[(i + k + 360) % 360] * wts[k + rad]; return acc / wsum; });
  const at = (deg: number) => sm[((Math.round(deg) % 360) + 360) % 360];
  const mirror = opts.mirror !== false;
  // per side, as a function of the right-half angle: mirrored = the two sides averaged, otherwise each side on its own (the left mirrored back)
  const sideR = (deg: number) => (mirror ? 0.5 * (at(deg) + at(180 - deg)) : at(deg));
  const sideL = (deg: number) => (mirror ? sideR(deg) : at(180 - deg));

  // greedy choice of right-half angles (incl. -90 and 90) that minimizes the worst deviation, for one side
  const cand: number[] = []; for (let a = -87.5; a <= 87.5; a += 2.5) cand.push(a);
  const target = Math.round(lerp(4, 18, fid));
  const fitHalf = (f: (deg: number) => number) => {
    const fitFor = (angles: number[]) => {
      const prof = new Profile({ ...makeOutline(angles, angles.map(f)), ...(opts.curve ? { curve: opts.curve } : {}) });
      let worst = 0, at2 = 0;
      for (let a = -90; a <= 90; a++) { const e = Math.abs(prof.radius(a * DEG) - f(a)); if (e > worst) { worst = e; at2 = a; } }
      return { worst, at: at2 };
    };
    let angles = [-90, 90];
    while (angles.length < target) {
      const { at: worstAt } = fitFor(angles);
      let best: number | null = null, bd = Infinity;
      for (const c of cand) {
        if (angles.some((a) => Math.abs(a - c) < OUTLINE_MIN_GAP_DEG)) continue;
        const d = Math.abs(c - worstAt); if (d < bd) { bd = d; best = c; }
      }
      if (best === null) break;
      angles = [...angles, best].sort((a, b) => a - b);
    }
    return { angles, radii: angles.map(f) };
  };
  const RH = fitHalf(sideR), Lh = mirror ? RH : fitHalf(sideL);
  let outline = makeOutline(RH.angles, RH.radii, opts.curve ? 1 : 1 - 0.12 * fid);
  if (opts.curve) outline.curve = opts.curve;
  if (!mirror) {
    const top = 0.5 * (RH.radii[RH.radii.length - 1] + Lh.radii[Lh.radii.length - 1]), bottom = 0.5 * (RH.radii[0] + Lh.radii[0]); // the axis points are shared
    outline.r[0] = bottom; outline.r[outline.r.length - 1] = top;
    const lr = [...Lh.radii]; lr[0] = bottom; lr[lr.length - 1] = top;
    outline.left = { phi: Lh.angles.map((a) => a * DEG), r: lr };
  }
  outline = clampOutline(outline, wall);
  const grew = outline.r.some((r, i) => r > RH.radii[i] + 0.05) || (!!outline.left && outline.left.r.some((r, i) => r > Lh.radii[i] + 0.05));
  const prof = new Profile(outline);
  let worst = 0; for (let a = -90; a <= 90; a++) { worst = Math.max(worst, Math.abs(prof.radius(a * DEG) - sideR(a))); if (!mirror) worst = Math.max(worst, Math.abs(prof.radius((180 - a) * DEG) - sideL(a))); }
  return { outline, maxErrorMm: worst, coverage, grew, points: RH.angles.length + (mirror ? 0 : Lh.angles.length - 2) };
}
