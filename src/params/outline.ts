import { OUTLINE_MAX_RADIUS, OUTLINE_MIN_GAP_DEG, outlineMinRadius } from './core';

/**
 * Outline in polar form around the Core center C (the origin of the shape frame).
 * 4 to 24 control points on the right half, from bottom (-90 deg) to top (+90 deg), mirrored to the left, unless the outline
 * carries its own `left` half (not mirrored): then the left side has its own 4 to 24 points, measured the same way (mirrored angle),
 * and the two axis points (bottom and top) are shared.
 * R(phi) is single-valued, so the outline can never fold or self-intersect: valid by construction.
 * `smooth` blends between straight segments (0, like degree 1) and a smooth cubic curve (1).
 */
export type Half = { phi: number[]; r: number[] };
export type Outline = { phi: number[]; r: number[]; smooth: number; left?: Half }; // phi in radians ascending -pi/2..pi/2; r in mm

export const OUTLINE_MIN_POINTS = 4;
export const OUTLINE_MAX_POINTS = 24; // per side: enough to articulate a tight corner (a tip needs points a few degrees apart)
const DEG = Math.PI / 180;

export const cloneOutline = (o: Outline): Outline => ({ phi: [...o.phi], r: [...o.r], smooth: o.smooth ?? 1, ...(o.left ? { left: { phi: [...o.left.phi], r: [...o.left.r] } } : {}) });
export const isMirrored = (o: Outline) => !o.left;
/** the left half as points (the right half again when mirrored) */
export const leftOf = (o: Outline): Half => o.left ?? { phi: o.phi, r: o.r };
/** the same shape with an explicit left half (a copy of the right), ready to edit independently */
export const unmirror = (o: Outline): Outline => { const c = cloneOutline(o); c.left = { phi: [...o.phi], r: [...o.r] }; return c; };
/** the same shape mirrored again: the right half wins */
export const mirrorOf = (o: Outline): Outline => { const c = cloneOutline(o); delete c.left; return c; };

export function makeOutline(anglesDeg: number[], radii: number[], smooth = 1): Outline {
  return { phi: anglesDeg.map((a) => a * DEG), r: [...radii], smooth };
}

/** Full ring (mirrored), ascending angle starting at -pi/2. 2n - 2 points for n right-half points. */
export function ringOf(o: Outline): { a: number[]; r: number[] } {
  const n = o.phi.length, L = leftOf(o), m = L.phi.length;
  const a: number[] = [], r: number[] = [];
  for (let i = 0; i < n; i++) { a.push(o.phi[i]); r.push(o.r[i]); }
  for (let i = m - 2; i >= 1; i--) { a.push(Math.PI - L.phi[i]); r.push(L.r[i]); }
  return { a, r };
}

function isHalfValid(h: Half): boolean {
  if (!h || !Array.isArray(h.phi) || !Array.isArray(h.r) || h.phi.length !== h.r.length) return false;
  const n = h.phi.length;
  if (n < OUTLINE_MIN_POINTS || n > OUTLINE_MAX_POINTS) return false;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(h.phi[i]) || !Number.isFinite(h.r[i])) return false;
    if (i > 0 && !(h.phi[i] > h.phi[i - 1])) return false;
  }
  return true;
}
export function isOutlineValid(o: Outline): boolean {
  if (!o || !isHalfValid(o)) return false;
  if (o.left !== undefined && !isHalfValid(o.left)) return false;
  return o.smooth === undefined || Number.isFinite(o.smooth);
}

/** Clamp an outline into hard limits (angles ordered with min gap, radii within range, smooth 0..1). */
export function clampOutline(o: Outline, wall: number): Outline {
  const out = cloneOutline(o);
  const gap = OUTLINE_MIN_GAP_DEG * DEG, rMin = outlineMinRadius(wall);
  const clampHalf = (h: Half) => {
    const n = h.phi.length;
    h.phi[0] = -Math.PI / 2;
    h.phi[n - 1] = Math.PI / 2;
    for (let i = 1; i < n - 1; i++) {
      const lo = h.phi[i - 1] + gap;
      const hi = Math.PI / 2 - gap * (n - 1 - i);
      h.phi[i] = Math.min(Math.max(h.phi[i], lo), hi);
    }
    for (let i = 0; i < n; i++) h.r[i] = Math.min(Math.max(h.r[i], rMin), OUTLINE_MAX_RADIUS);
  };
  clampHalf(out);
  if (out.left) { clampHalf(out.left); const m = out.left.r.length, n = out.r.length; out.left.r[0] = out.r[0]; out.left.r[m - 1] = out.r[n - 1]; } // the axis points are shared
  out.smooth = Math.min(1, Math.max(0, Number.isFinite(out.smooth) ? out.smooth : 1));
  return out;
}

/** Same-length linear blend. For different point counts use blendOutlines (outlineEdit.ts). */
export function lerpOutline(a: Outline, b: Outline, t: number): Outline {
  if (a.left || b.left) { // each half on its own (the caller guarantees the same point counts, see blendOutlines)
    const A = unmirror(a), B = unmirror(b), o = lerpOutline(mirrorOf(A), mirrorOf(B), t);
    const l = (x: number, y: number) => x + (y - x) * t;
    o.left = { phi: A.left!.phi.map((v, i) => l(v, B.left!.phi[i])), r: A.left!.r.map((v, i) => l(v, B.left!.r[i])) };
    return o;
  }
  const o = cloneOutline(a);
  for (let i = 0; i < o.phi.length; i++) {
    o.phi[i] = a.phi[i] + (b.phi[i] - a.phi[i]) * t;
    o.r[i] = a.r[i] + (b.r[i] - a.r[i]) * t;
  }
  o.smooth = (a.smooth ?? 1) + ((b.smooth ?? 1) - (a.smooth ?? 1)) * t;
  return o;
}
