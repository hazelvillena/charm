import { Outline, OUTLINE_MAX_POINTS, OUTLINE_MIN_POINTS, cloneOutline, clampOutline, lerpOutline, makeOutline } from './outline';
import { Profile } from '../geometry/profile';
import { OUTLINE_MIN_GAP_DEG } from './core';
import { fitOutlineFromStroke } from './fitOutline';

const DEG = Math.PI / 180;
const GAP = OUTLINE_MIN_GAP_DEG * DEG;

/** Insert a control point at angle phi (right half) on the current curve. Returns the new outline and its index, or null. */
export function insertPoint(o: Outline, phi: number, wall: number): { outline: Outline; index: number } | null {
  const n = o.phi.length;
  if (n >= OUTLINE_MAX_POINTS) return null;
  let i = 0; while (i < n - 1 && o.phi[i + 1] < phi) i++;      // segment [i, i+1] contains phi
  if (phi - o.phi[i] < GAP || o.phi[i + 1] - phi < GAP) return null;
  const r = new Profile(o).radius(phi);
  const out = cloneOutline(o);
  out.phi.splice(i + 1, 0, phi); out.r.splice(i + 1, 0, r);
  return { outline: clampOutline(out, wall), index: i + 1 };
}

/** Remove an interior control point (the two axis points stay). */
export function removePoint(o: Outline, index: number, wall: number): Outline | null {
  const n = o.phi.length;
  if (n <= OUTLINE_MIN_POINTS || index <= 0 || index >= n - 1) return null;
  const out = cloneOutline(o);
  out.phi.splice(index, 1); out.r.splice(index, 1);
  return clampOutline(out, wall);
}

/** Add one point where the gap between neighbours is largest (the "+" button). */
export function addPointAuto(o: Outline, wall: number): Outline | null {
  let best = 0, gap = -1;
  for (let i = 0; i < o.phi.length - 1; i++) { const g = o.phi[i + 1] - o.phi[i]; if (g > gap) { gap = g; best = i; } }
  return insertPoint(o, (o.phi[best] + o.phi[best + 1]) / 2, wall)?.outline ?? null;
}

/** Remove the interior point that matters least for the curve shape (the "-" button). */
export function removePointAuto(o: Outline, wall: number): Outline | null {
  if (o.phi.length <= OUTLINE_MIN_POINTS) return null;
  let best = -1, cost = Infinity;
  for (let i = 1; i < o.phi.length - 1; i++) {
    const without = removePoint(o, i, wall); if (!without) continue;
    const a = new Profile(o), b = new Profile(without);
    let worst = 0; for (let k = -90; k <= 90; k += 3) worst = Math.max(worst, Math.abs(a.radius(k * DEG) - b.radius(k * DEG)));
    if (worst < cost) { cost = worst; best = i; }
  }
  return best < 0 ? null : removePoint(o, best, wall);
}

/** Blend two outlines even when they have different point counts (resampled to a common 11-point grid in between). */
export function blendOutlines(a: Outline, b: Outline, t: number): Outline {
  if (t <= 0) return cloneOutline(a);
  if (t >= 1) return cloneOutline(b);
  if (a.phi.length === b.phi.length) return lerpOutline(a, b, t);
  const pa = new Profile(a), pb = new Profile(b), angles: number[] = [], radii: number[] = [];
  for (let i = 0; i < 11; i++) { const d = -90 + i * 18; angles.push(d); radii.push(pa.radius(d * DEG) * (1 - t) + pb.radius(d * DEG) * t); }
  return makeOutline(angles, radii, (a.smooth ?? 1) * (1 - t) + (b.smooth ?? 1) * t);
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
  const fit = fitOutlineFromStroke(stroke, wall, { fidelity: Math.min(1, Math.max(0, (n - 4) / 7)) });
  if (!fit || fit.grew) return null;
  return { ...fit.outline, smooth: outline.smooth };
}
