import { OUTLINE_MAX_RADIUS, OUTLINE_MIN_GAP_DEG, outlineMinRadius } from './core';

/**
 * Outline in polar form around the Core center C (the origin of the shape frame).
 * 4 to 12 control points on the right half, from bottom (-90 deg) to top (+90 deg), mirrored to the left.
 * R(phi) is single-valued, so the outline can never fold or self-intersect: valid by construction.
 * `smooth` blends between straight segments (0, like degree 1) and a smooth cubic curve (1).
 */
export type Outline = { phi: number[]; r: number[]; smooth: number }; // phi in radians ascending -pi/2..pi/2; r in mm

export const OUTLINE_MIN_POINTS = 4;
export const OUTLINE_MAX_POINTS = 12;
const DEG = Math.PI / 180;

export const cloneOutline = (o: Outline): Outline => ({ phi: [...o.phi], r: [...o.r], smooth: o.smooth ?? 1 });

export function makeOutline(anglesDeg: number[], radii: number[], smooth = 1): Outline {
  return { phi: anglesDeg.map((a) => a * DEG), r: [...radii], smooth };
}

/** Full ring (mirrored), ascending angle starting at -pi/2. 2n - 2 points for n right-half points. */
export function ringOf(o: Outline): { a: number[]; r: number[] } {
  const n = o.phi.length;
  const a: number[] = [], r: number[] = [];
  for (let i = 0; i < n; i++) { a.push(o.phi[i]); r.push(o.r[i]); }
  for (let i = n - 2; i >= 1; i--) { a.push(Math.PI - o.phi[i]); r.push(o.r[i]); }
  return { a, r };
}

export function isOutlineValid(o: Outline): boolean {
  if (!o || !Array.isArray(o.phi) || !Array.isArray(o.r) || o.phi.length !== o.r.length) return false;
  const n = o.phi.length;
  if (n < OUTLINE_MIN_POINTS || n > OUTLINE_MAX_POINTS) return false;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(o.phi[i]) || !Number.isFinite(o.r[i])) return false;
    if (i > 0 && !(o.phi[i] > o.phi[i - 1])) return false;
  }
  return o.smooth === undefined || Number.isFinite(o.smooth);
}

/** Clamp an outline into hard limits (angles ordered with min gap, radii within range, smooth 0..1). */
export function clampOutline(o: Outline, wall: number): Outline {
  const out = cloneOutline(o);
  const n = out.phi.length, gap = OUTLINE_MIN_GAP_DEG * DEG;
  const rMin = outlineMinRadius(wall);
  out.phi[0] = -Math.PI / 2;
  out.phi[n - 1] = Math.PI / 2;
  for (let i = 1; i < n - 1; i++) {
    const lo = out.phi[i - 1] + gap;
    const hi = Math.PI / 2 - gap * (n - 1 - i);
    out.phi[i] = Math.min(Math.max(out.phi[i], lo), hi);
  }
  for (let i = 0; i < n; i++) out.r[i] = Math.min(Math.max(out.r[i], rMin), OUTLINE_MAX_RADIUS);
  out.smooth = Math.min(1, Math.max(0, Number.isFinite(out.smooth) ? out.smooth : 1));
  return out;
}

/** Same-length linear blend. For different point counts use blendOutlines (outlineEdit.ts). */
export function lerpOutline(a: Outline, b: Outline, t: number): Outline {
  const o = cloneOutline(a);
  for (let i = 0; i < o.phi.length; i++) {
    o.phi[i] = a.phi[i] + (b.phi[i] - a.phi[i]) * t;
    o.r[i] = a.r[i] + (b.r[i] - a.r[i]) * t;
  }
  o.smooth = (a.smooth ?? 1) + ((b.smooth ?? 1) - (a.smooth ?? 1)) * t;
  return o;
}
