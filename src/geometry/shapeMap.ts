import { QuadSphere } from './quadSphere';
import { Profile } from './profile';
import { Outline } from '../params/outline';
import { CORE } from '../params/core';

// ---- tunable constants (tune by eye) ----
export const FRONT_EXPONENT = 2.3;      // pillow roll-off on the front (2 = ellipsoid, higher = fuller)
export const BACK_EXPONENT_BASE = 2.0;
export const BACK_EXPONENT_FLAT = 2.6;  // added at backFlat = 1
export const MIN_RADIUS = 0.6;          // mm clamp for the inner shell
export const MAX_SHRINK_FACTOR = 2.5;   // clamp on wall/cos(alpha)

export type ShapeParams = { depth: number; belly: number; backFlat: number; plateau: number; wall: number };

export type ShapeInfo = {
  shiftY: number;      // distance from the body bottom to the puck center C
  zFront: number;      // front half depth (mm)
  zBack: number;       // back half depth (mm)
  ok: boolean;
};

export function frontBackDepth(p: ShapeParams) {
  const zf = p.depth * (0.45 + 0.2 * p.belly);
  return { zf, zb: p.depth - zf };
}

/**
 * Writes cage vertex positions (mm, body stands on y=0, front=+Z) into `out`.
 * inset > 0 builds the inner shell (offset by `inset`) for the hollow.
 */
export function mapShape(qs: QuadSphere, outline: Outline, p: ShapeParams, out: Float32Array, inset = 0, forcedShiftY?: number): ShapeInfo {
  const prof = new Profile(outline);
  const { zf, zb } = frontBackDepth(p);
  const nf = FRONT_EXPONENT;
  const nb = BACK_EXPONENT_BASE + BACK_EXPONENT_FLAT * p.backFlat;
  const plateauR = p.plateau * (CORE.puckDiameter / 2 + CORE.puckClearance + p.wall);
  const zfi = Math.max(0.5, zf - inset), zbi = Math.max(0.5, zb - inset);
  const V = qs.vertCount;
  let minY = Infinity;
  for (let i = 0; i < V; i++) {
    const px = qs.unit[i * 3], py = qs.unit[i * 3 + 1], pz = qs.unit[i * 3 + 2];
    const rho = Math.min(1, Math.hypot(px, py));
    const phi = Math.atan2(py, px);
    const { r: R0, dr } = prof.eval(phi);
    let R = R0;
    if (inset > 0) {
      const alpha = Math.atan2(Math.abs(dr), R0);
      R = Math.max(MIN_RADIUS, R0 - Math.min(MAX_SHRINK_FACTOR * inset, inset / Math.cos(alpha)));
    }
    const rmm = rho * R;
    const x = rmm * Math.cos(phi), y = rmm * Math.sin(phi);
    // radial remap for the plateau: flat inside plateauR, pillow roll-off outside
    const rp = Math.min(plateauR, 0.85 * R);
    const rEff = rmm <= rp ? 0 : (rmm - rp) / Math.max(1e-6, R - rp);
    const front = pz >= 0;
    const n = front ? nf : nb;
    const prof01 = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, rEff), n)), 1 / n);
    // back is not plateau-remapped (flatness handled by exponent)
    const prof01b = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, rho), n)), 1 / n);
    const z = front ? zfi * prof01 : -zbi * prof01b;
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    if (y < minY) minY = y;
  }
  const shiftY = forcedShiftY ?? -minY;
  for (let i = 0; i < V; i++) out[i * 3 + 1] += shiftY;
  let ok = true;
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) { ok = false; break; }
  return { shiftY, zFront: zf, zBack: zb, ok };
}
