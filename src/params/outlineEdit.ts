import { Outline, Half, OUTLINE_MAX_POINTS, OUTLINE_MIN_POINTS, cloneOutline, clampOutline, lerpOutline, makeOutline, leftOf, unmirror } from './outline';
import { Profile } from '../geometry/profile';
import { OUTLINE_MIN_GAP_DEG } from './core';
import { fitOutlineFromStroke } from './fitOutline';

const DEG = Math.PI / 180;
const GAP = OUTLINE_MIN_GAP_DEG * DEG;

export type Side = 'R' | 'L';
/** the half a side refers to (always the right half when the outline is mirrored) */
const halfOf = (o: Outline, side: Side): Half => (side === 'L' && o.left ? o.left : o);
/** the curve's radius at a point angle of one side (left angles are mirrored) */
const radiusAt = (prof: Profile, phi: number, side: Side, o: Outline) => prof.radius(side === 'L' && o.left ? Math.PI - phi : phi);

/** Insert a control point at angle phi on one side (the right half unless the outline has its own left) on the current curve. Returns the new outline and its index, or null. */
export function insertPoint(o: Outline, phi: number, wall: number, side: Side = 'R'): { outline: Outline; index: number } | null {
  const h = halfOf(o, side), n = h.phi.length;
  if (n >= OUTLINE_MAX_POINTS) return null;
  let i = 0; while (i < n - 1 && h.phi[i + 1] < phi) i++;      // segment [i, i+1] contains phi
  if (phi - h.phi[i] < GAP || h.phi[i + 1] - phi < GAP) return null;
  const r = radiusAt(new Profile(o), phi, side, o);
  const out = cloneOutline(o), oh = halfOf(out, side);
  oh.phi.splice(i + 1, 0, phi); oh.r.splice(i + 1, 0, r);
  return { outline: clampOutline(out, wall), index: i + 1 };
}

/** Remove an interior control point (the two axis points stay). */
export function removePoint(o: Outline, index: number, wall: number, side: Side = 'R'): Outline | null {
  const h = halfOf(o, side), n = h.phi.length;
  if (n <= OUTLINE_MIN_POINTS || index <= 0 || index >= n - 1) return null;
  const out = cloneOutline(o), oh = halfOf(out, side);
  oh.phi.splice(index, 1); oh.r.splice(index, 1);
  return clampOutline(out, wall);
}

/** Add one point where the gap between neighbours is largest (the "+" button); one on each side when the halves are independent. */
export function addPointAuto(o: Outline, wall: number): Outline | null {
  const one = (cur: Outline, side: Side): Outline | null => {
    const h = halfOf(cur, side); let best = 0, gap = -1;
    for (let i = 0; i < h.phi.length - 1; i++) { const g = h.phi[i + 1] - h.phi[i]; if (g > gap) { gap = g; best = i; } }
    return insertPoint(cur, (h.phi[best] + h.phi[best + 1]) / 2, wall, side)?.outline ?? null;
  };
  const r = one(o, 'R'); if (!r || !o.left) return r;
  return one(r, 'L') ?? r;
}

/** Remove the interior point that matters least for the curve shape (the "-" button); one from each side when the halves are independent. */
export function removePointAuto(o: Outline, wall: number): Outline | null {
  const one = (cur: Outline, side: Side): Outline | null => {
    const h = halfOf(cur, side); if (h.phi.length <= OUTLINE_MIN_POINTS) return null;
    let best = -1, cost = Infinity;
    for (let i = 1; i < h.phi.length - 1; i++) {
      const without = removePoint(cur, i, wall, side); if (!without) continue;
      const a = new Profile(cur), b = new Profile(without);
      let worst = 0; for (let k = -90; k <= 90; k += 3) { const ang = (side === 'L' && cur.left ? 180 - k : k) * DEG; worst = Math.max(worst, Math.abs(a.radius(ang) - b.radius(ang))); }
      if (worst < cost) { cost = worst; best = i; }
    }
    return best < 0 ? null : removePoint(cur, best, wall, side);
  };
  const r = one(o, 'R'); if (!r || !o.left) return r;
  return one(r, 'L') ?? r;
}

/** Blend two outlines even when they have different point counts (resampled to a common 11-point grid in between). */
export function blendOutlines(a: Outline, b: Outline, t: number): Outline {
  if (t <= 0) return cloneOutline(a);
  if (t >= 1) return cloneOutline(b);
  const same = a.phi.length === b.phi.length && leftOf(a).phi.length === leftOf(b).phi.length && a.curve === b.curve;
  if (same) return lerpOutline(a, b, t);
  const pa = new Profile(a), pb = new Profile(b), angles: number[] = [], radii: number[] = [], radiiL: number[] = [];
  const N = a.curve || b.curve ? 24 : 11, dd = 180 / (N - 1); // a smooth curve needs a finer grid to look the same in between
  for (let i = 0; i < N; i++) {
    const d = -90 + i * dd; angles.push(d);
    radii.push(pa.radius(d * DEG) * (1 - t) + pb.radius(d * DEG) * t);
    radiiL.push(pa.radius((180 - d) * DEG) * (1 - t) + pb.radius((180 - d) * DEG) * t);
  }
  const out = makeOutline(angles, radii, (a.smooth ?? 1) * (1 - t) + (b.smooth ?? 1) * t);
  if (a.left || b.left) { radiiL[0] = radii[0]; radiiL[N - 1] = radii[N - 1]; out.left = { phi: [...out.phi], r: radiiL }; }
  if (b.curve) out.curve = 'c2';
  return out;
}

/**
 * Move the Core up (dy > 0) or down inside the body: the shape stays put, the outline is re-expressed around the new
 * Core center and refitted with the same point count and smoothness. Returns null when the move would leave the Core
 * without room (the outline would have to grow to clear it).
 */
export function recenterOutline(outline: Outline, dy: number, wall: number): Outline | null {
  const prof = new Profile(outline), stroke: [number, number][] = [], N = 240;
  for (let i = 0; i < N; i++) {
    const phi = -Math.PI / 2 + (i / N) * Math.PI * 2, r = prof.radius(phi);
    stroke.push([r * Math.cos(phi), r * Math.sin(phi) - dy]); // the body moves down relative to the Core when the Core moves up
  }
  const n = outline.phi.length;
  const fit = fitOutlineFromStroke(stroke, wall, { fidelity: Math.min(1, Math.max(0, (n - 4) / 7)), mirror: !outline.left, curve: outline.curve });
  if (!fit || fit.grew) return null;
  return { ...fit.outline, smooth: outline.smooth };
}
