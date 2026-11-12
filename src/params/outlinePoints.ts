import { Outline, OUTLINE_MAX_POINTS, OUTLINE_MIN_POINTS, clampOutline, makeOutline } from './outline';
import { OUTLINE_MIN_GAP_DEG } from './core';

const DEG = Math.PI / 180;
const GAP = OUTLINE_MIN_GAP_DEG * DEG;
type Pt = { phi: number; r: number };

export type PointsFit = { outline: Outline; grew: boolean; points: number; dropped: number };

/** radius of a closed ring of (angle, radius) pairs at an angle, linearly between the neighbours either side (angles in radians, any order) */
function ringAt(ring: Pt[], theta: number): number {
  const TWO = Math.PI * 2, w = (a: number) => ((a % TWO) + TWO) % TWO;
  const pts = ring.map((p) => ({ a: w(p.phi), r: p.r })).sort((x, y) => x.a - y.a), t = w(theta);
  let lo = pts[pts.length - 1], hi = pts[0];
  for (let i = 0; i < pts.length; i++) { if (pts[i].a <= t) lo = pts[i]; if (pts[i].a > t) { hi = pts[i]; break; } if (i === pts.length - 1) hi = pts[0]; }
  const span = w(hi.a - lo.a) || TWO, f = w(t - lo.a) / span;
  return lo.r + (hi.r - lo.r) * f;
}

/**
 * Builds an outline whose control points ARE the clicked points: every point is turned into an angle and a radius around the Core, so the
 * curve passes through it (the shape is traced point by point, like a Rhino interpolated curve).
 * mirror = true: the points fold onto the right half and the left follows. Otherwise points with x >= 0 shape the right side and the others the left.
 * The two axis points (straight up and down from the Core) are not clicked: their radius is read off the curve between the points either side.
 * Returns null when the points do not go around the Core (a gap of more than about 160 degrees).
 */
export function outlineFromPoints(points: [number, number][], wall: number, mirror: boolean, smooth = 1): PointsFit | null {
  const src = points.filter(([x, y]) => Math.hypot(x, y) > 1e-6);
  const ring: Pt[] = src.map(([x, y]) => ({ phi: Math.atan2(y, mirror ? Math.abs(x) : x), r: Math.hypot(x, y) }));
  // for the mirrored case the ring is the right half and its reflection, so coverage and axis radii are read from both
  const full: Pt[] = mirror ? ring.flatMap((p) => [p, { phi: Math.PI - p.phi, r: p.r }]) : ring;
  if (full.length < 3) return null;
  const angles = full.map((p) => ((p.phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
  let maxGap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i++) maxGap = Math.max(maxGap, angles[i] - angles[i - 1]);
  if (maxGap > 160 * DEG) return null;

  // a point placed (nearly) straight above or below the Core IS that axis point's radius; otherwise it is read off the curve between the points either side
  const axis = (theta: number) => {
    let best: Pt | null = null, bd = GAP * 0.9; const TWO = Math.PI * 2;
    for (const p of full) { const d = Math.abs((((p.phi - theta) % TWO) + 3 * Math.PI) % TWO - Math.PI); if (d < bd) { bd = d; best = p; } }
    return best ? best.r : ringAt(full, theta);
  };
  const top = axis(Math.PI / 2), bottom = axis(-Math.PI / 2);
  let dropped = 0;
  // one half's interior points: ascending, kept clear of each other and of the axis points, at least 2 and at most OUTLINE_MAX_POINTS - 2
  const half = (pts: Pt[]): Pt[] => {
    const own = pts.filter((p) => Math.abs(p.phi) < Math.PI / 2 - GAP * 0.9).sort((a, b) => a.phi - b.phi);
    const kept: Pt[] = [];
    for (const p of own) { if (kept.length && p.phi - kept[kept.length - 1].phi < GAP) { dropped++; continue; } kept.push(p); }
    while (kept.length > OUTLINE_MAX_POINTS - 2) { // too many: drop the one closest to its neighbour
      let best = 0, gap = Infinity; for (let i = 0; i < kept.length; i++) { const g = (kept[i + 1]?.phi ?? Math.PI / 2) - (kept[i - 1]?.phi ?? -Math.PI / 2); if (g < gap) { gap = g; best = i; } }
      kept.splice(best, 1); dropped++;
    }
    return kept;
  };
  // the curve this side is read from when the clicks are too few to make a half (each side needs 4 points with the two axis points)
  const fill = (kept: Pt[], reading: Pt[], toTheta: (phi: number) => number) => {
    const all = [{ phi: -Math.PI / 2, r: bottom }, ...kept, { phi: Math.PI / 2, r: top }];
    while (all.length < OUTLINE_MIN_POINTS) {
      let best = 0, gap = -1; for (let i = 0; i < all.length - 1; i++) { const g = all[i + 1].phi - all[i].phi; if (g > gap) { gap = g; best = i; } }
      const phi = (all[best].phi + all[best + 1].phi) / 2;
      all.splice(best + 1, 0, { phi, r: ringAt(reading, toTheta(phi)) });
    }
    return all;
  };
  const right = fill(half(mirror ? ring : ring.filter((_, i) => src[i][0] >= 0)), full, (phi) => phi);
  let left: Pt[] | null = null;
  if (!mirror) {
    const leftPts = src.filter(([x]) => x < 0).map(([x, y]) => ({ phi: Math.atan2(y, -x), r: Math.hypot(x, y) }));
    left = fill(half(leftPts), full, (phi) => Math.PI - phi);
  }
  const out = makeOutline([], [], smooth);
  out.curve = 'c2'; // clicked points are joined by the smooth curve
  out.phi = right.map((p) => p.phi); out.r = right.map((p) => p.r);
  if (left) out.left = { phi: left.map((p) => p.phi), r: left.map((p) => p.r) };
  const radii = [...out.r, ...(out.left?.r ?? [])];
  const clamped = clampOutline(out, wall);
  const grew = [...clamped.r, ...(clamped.left?.r ?? [])].some((r, i) => r > radii[i] + 0.05);
  return { outline: clamped, grew, points: out.phi.length + (out.left ? out.left.phi.length - 2 : 0), dropped };
}
