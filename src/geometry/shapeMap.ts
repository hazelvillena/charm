import { QuadSphere } from './quadSphere';
import { Profile, SideCurve } from './profile';
import { Outline } from '../params/outline';
import { SideProfile } from '../params/side';
import { CORE, seatRadius } from '../params/core';
import { PoissonInflator } from './inflate';

// ---- tunable constants (tune by eye) ----
export const FRONT_EXPONENT = 2.3;      // pillow roll-off on the front (2 = ellipsoid, higher = fuller)
export const BACK_EXPONENT_BASE = 2.0;
export const BACK_EXPONENT_FLAT = 2.6;  // added at backFlat = 1
export const MIN_RADIUS = 0.6;          // mm clamp for the inner shell
export const MAX_SHRINK_FACTOR = 2.5;   // clamp on wall/cos(alpha)
export const TIP_SHARPEN = 0.1;         // counters a little Catmull-Clark shrink at outline peaks (feet, lobes); peaks only. Kept small: sharper tips fail the tightest-radius rule
export const PLATEAU_BLEND_MM = 12;     // distance over which the side profile takes over outside the puck plateau
export const CORE_LIFT = 0.7;           // fraction of the core's dome height the casing front rises around it (curvature carry-over)
export const CORE_LIFT_REACH = 8;       // mm beyond the seat rim over which that pillow fades out
export const EDGE_WIDTH = 7.5;            // mm: the surface always rolls off over at least this distance from the outline, so narrow spots (between the legs) never fall off a cliff
export const EDGE_SAMPLES = 180;        // outline polyline resolution for the edge-distance field
export const TIP_SPAN = 0.2;            // radians either side used to find "local average"
export const SEAT_BLEND = 6;            // mm over which the flat core seat blends back into the body (Poisson model)

/** 'poisson' = smooth, shape-adaptive membrane inflation (default). 'legacy' = the earlier radial pillow, kept for comparison. */
export let inflationMode: 'poisson' | 'legacy' = 'poisson';
export const setInflationMode = (m: 'poisson' | 'legacy') => { inflationMode = m; };
const sharedInflator = new PoissonInflator();
export type MapOptions = { inflator?: PoissonInflator; iterations?: number };

export type ShapeParams = { depth: number; belly: number; backFlat: number; plateau: number; corePlateau?: boolean; wall: number; side: SideProfile };

export type ShapeInfo = {
  shiftY: number;      // distance from the body bottom to the puck center C
  yMin: number; yMax: number; // pre-shift y range (used to evaluate the side profile consistently for the inner shell)
  zFront: number;      // nominal front half depth (mm)
  zBack: number;       // nominal back half depth (mm)
  ok: boolean;
};

export type Forced = { shiftY: number; yMin: number; yMax: number };

const smooth01 = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export function frontBackDepth(p: Pick<ShapeParams, 'depth' | 'belly'>) {
  const zf = p.depth * (0.45 + 0.2 * p.belly);
  return { zf, zb: p.depth - zf };
}

/**
 * Writes cage vertex positions (mm, body stands on y=0, front=+Z) into `out`.
 * inset > 0 builds the inner shell (offset by `inset`) for the hollow; pass `forced` (the outer's ShapeInfo)
 * so both shells share the same shift and side-profile heights.
 */
export function mapShape(qs: QuadSphere, outline: Outline, p: ShapeParams, out: Float32Array, inset = 0, forced?: Forced, opts: MapOptions = {}): ShapeInfo {
  const prof = new Profile(outline);
  const sf = new SideCurve(p.side.front, p.side.frontT, p.side.smooth ?? 1), sb = new SideCurve(p.side.back, p.side.backT, p.side.smooth ?? 1);
  const { zf, zb } = frontBackDepth(p);
  const nf = FRONT_EXPONENT;
  const nb = BACK_EXPONENT_BASE + BACK_EXPONENT_FLAT * p.backFlat;
  const seatOn = p.corePlateau !== false; // optional: flat seat + curvature carry-over around the core
  const plateauR = seatOn ? p.plateau * (CORE.puckDiameter / 2 + CORE.puckClearance + p.wall) : 0;
  const V = qs.vertCount;
  const rhoA = new Float32Array(V), rEffA = new Float32Array(V), outA = new Float32Array(V), rmmA = new Float32Array(V); // outA: mm beyond the plateau edge
  let yMin = Infinity, yMax = -Infinity;
  // the outline radius at an angle (with tip sharpening and, for the inner shell, the wall inset)
  const radiusAt = (phi: number) => {
    const { r: r0, dr } = prof.eval(phi);
    const avg = 0.5 * (prof.radius(phi - TIP_SPAN) + prof.radius(phi + TIP_SPAN));
    let R = r0 + TIP_SHARPEN * Math.max(0, r0 - avg);
    if (inset > 0) {
      const alpha = Math.atan2(Math.abs(dr), r0);
      R = Math.max(MIN_RADIUS, R - Math.min(MAX_SHRINK_FACTOR * inset, inset / Math.cos(alpha)));
    }
    return R;
  };
  const poisson = inflationMode === 'poisson';
  const field = poisson ? (opts.inflator ?? sharedInflator).solve(radiusAt, opts.iterations ?? 400) : null;
  // outline polyline for the distance-to-edge field (legacy model only)
  const ox = new Float32Array(EDGE_SAMPLES + 1), oy = new Float32Array(EDGE_SAMPLES + 1);
  if (!poisson) for (let k = 0; k <= EDGE_SAMPLES; k++) { const a = (k / EDGE_SAMPLES) * Math.PI * 2, r = radiusAt(a); ox[k] = r * Math.cos(a); oy[k] = r * Math.sin(a); }
  const distToOutline = (x: number, y: number) => {
    let best = Infinity;
    for (let k = 0; k < EDGE_SAMPLES; k++) {
      const ax = ox[k], ay = oy[k], bx = ox[k + 1] - ax, by = oy[k + 1] - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by || 1)));
      const dx = x - (ax + bx * t), dy = y - (ay + by * t), d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  };
  const edgeA = new Float32Array(V);
  // pass 1: in-plane position
  for (let i = 0; i < V; i++) {
    const px = qs.unit[i * 3], py = qs.unit[i * 3 + 1];
    const rho = Math.min(1, Math.hypot(px, py));
    const phi = Math.atan2(py, px);
    const R = radiusAt(phi);
    const rmm = rho * R;
    const x = rmm * Math.cos(phi), y = rmm * Math.sin(phi);
    const rp = Math.min(plateauR, 0.85 * R);
    rhoA[i] = rho;
    rEffA[i] = rmm <= rp ? 0 : (rmm - rp) / Math.max(1e-6, R - rp);
    outA[i] = Math.max(0, rmm - rp); rmmA[i] = rmm;
    if (!poisson) { const d = distToOutline(x, y), t = Math.min(1, d / EDGE_WIDTH); edgeA[i] = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))); } // legacy: quarter-circle roll-off of constant width
    out[i * 3] = x; out[i * 3 + 1] = y;
    if (y < yMin) yMin = y; if (y > yMax) yMax = y;
  }
  const y0 = forced ? forced.yMin : yMin, y1 = forced ? forced.yMax : yMax, span = Math.max(1e-6, y1 - y0);
  // pass 2: depth, shaped by the side profile at this height.
  // The puck plateau stays flat: inside it the front uses the side-profile value at the puck's height.
  const ync = (0 - y0) / span, kc = sf.eval(ync);
  if (field) field.normalizeAt(0, 0, 0.8); // thickness is measured against the membrane height at the Core
  const hnC = field ? field.height(0, 0) : 0;
  for (let i = 0; i < V; i++) {
    const front = qs.unit[i * 3 + 2] >= 0;
    const yn = (out[i * 3 + 1] - y0) / span;
    let shape: number;
    if (field) {
      // smooth membrane height; flatten the Core seat, but never lift where the surface is already near the outline
      const hn = field.height(out[i * 3], out[i * 3 + 1]);
      shape = Math.pow(hn, front ? 2 / nf : 2 / nb);
      if (front && seatOn && hnC > 0) {
        const plat = Math.pow(hnC, 2 / nf), m = 1 - smooth01((rmmA[i] - plateauR) / SEAT_BLEND), eg = smooth01((hn / hnC - 0.3) / 0.45);
        if (plat > shape) shape += (plat - shape) * m * eg;
      }
      if (Math.abs(qs.unit[i * 3 + 2]) < 1e-6) shape = 0; // the shared equator ring sits exactly on the split plane
    } else {
      const n = front ? nf : nb, rr = front ? rEffA[i] : rhoA[i];
      // legacy: the proportional pillow and a constant-width edge compete (smooth max of deficits)
      const pillow = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, rr), n)), 1 / n);
      shape = Math.max(0, 1 - Math.pow(Math.pow(1 - pillow, 8) + Math.pow(1 - edgeA[i], 8), 1 / 8));
    }
    let k: number, dk: number;
    if (front) {
      const w = smooth01(outA[i] / PLATEAU_BLEND_MM);
      k = kc + (sf.eval(yn) - kc) * w; dk = sf.deriv(yn) * w;
    } else { k = sb.eval(yn); dk = sb.deriv(yn); }
    const nominal = (front ? zf : zb) * k;
    // inner shell: offset along the surface normal, so steep side-profile slopes need extra inset in z
    const slope = ((front ? zf : zb) * Math.abs(dk) / span) * shape;
    const insetZ = inset > 0 ? Math.min(MAX_SHRINK_FACTOR * inset, inset * Math.sqrt(1 + slope * slope)) : 0;
    const ext = Math.max(0.5, nominal - insetZ);
    // the core's pillow carries into the casing: a soft lift around the seat that fades out (front only)
    const reach = seatRadius() + p.wall + CORE_LIFT_REACH;
    const lift = seatOn && front && rmmA[i] < reach ? CORE_LIFT * CORE.domeHeight * Math.pow(1 - (rmmA[i] / reach) ** 2, 2) : 0;
    out[i * 3 + 2] = front ? ext * shape + lift : -ext * shape;
  }
  const shiftY = forced ? forced.shiftY : -yMin;
  for (let i = 0; i < V; i++) out[i * 3 + 1] += shiftY;
  let ok = true;
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) { ok = false; break; }
  return { shiftY, yMin: y0, yMax: y1, zFront: zf, zBack: zb, ok };
}
