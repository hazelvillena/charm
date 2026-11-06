import { OUTLINE_MAX_RADIUS, OUTLINE_MIN_GAP_DEG, outlineMinRadius } from './core';

/**
 * Outline in polar form around the puck center C (the origin of the shape frame).
 * 7 control points on the right half, from bottom (-90 deg) to top (+90 deg),
 * mirrored to the left. R(phi) is single-valued, so the outline can never fold
 * or self-intersect: reliable by construction.
 */
export type Outline = { phi: number[]; r: number[] }; // phi in radians, ascending -pi/2..pi/2; r in mm

export const OUTLINE_POINTS = 7;
const DEG = Math.PI / 180;

export const cloneOutline = (o: Outline): Outline => ({ phi: [...o.phi], r: [...o.r] });

export function makeOutline(anglesDeg: number[], radii: number[]): Outline {
  return { phi: anglesDeg.map((a) => a * DEG), r: [...radii] };
}

/** Full ring of 12 points, ascending angle starting at -pi/2. */
export function ringOf(o: Outline): { a: number[]; r: number[] } {
  const a: number[] = [], r: number[] = [];
  for (let i = 0; i < OUTLINE_POINTS; i++) { a.push(o.phi[i]); r.push(o.r[i]); }
  for (let i = OUTLINE_POINTS - 2; i >= 1; i--) { a.push(Math.PI - o.phi[i]); r.push(o.r[i]); }
  return { a, r };
}

export function isOutlineValid(o: Outline): boolean {
  if (!o || o.phi.length !== OUTLINE_POINTS || o.r.length !== OUTLINE_POINTS) return false;
  for (let i = 0; i < OUTLINE_POINTS; i++) {
    if (!Number.isFinite(o.phi[i]) || !Number.isFinite(o.r[i])) return false;
  }
  return true;
}

/** Clamp an outline into hard limits (angles ordered with min gap, radii within range). */
export function clampOutline(o: Outline, wall: number): Outline {
  const out = cloneOutline(o);
  const gap = OUTLINE_MIN_GAP_DEG * DEG;
  const rMin = outlineMinRadius(wall);
  out.phi[0] = -Math.PI / 2;
  out.phi[OUTLINE_POINTS - 1] = Math.PI / 2;
  for (let i = 1; i < OUTLINE_POINTS - 1; i++) {
    const lo = out.phi[i - 1] + gap;
    const hi = Math.PI / 2 - gap * (OUTLINE_POINTS - 1 - i);
    out.phi[i] = Math.min(Math.max(out.phi[i], lo), hi);
  }
  for (let i = 0; i < OUTLINE_POINTS; i++) out.r[i] = Math.min(Math.max(out.r[i], rMin), OUTLINE_MAX_RADIUS);
  return out;
}

export function lerpOutline(a: Outline, b: Outline, t: number): Outline {
  const o = cloneOutline(a);
  for (let i = 0; i < OUTLINE_POINTS; i++) {
    o.phi[i] = a.phi[i] + (b.phi[i] - a.phi[i]) * t;
    o.r[i] = a.r[i] + (b.r[i] - a.r[i]) * t;
  }
  return o;
}
