import { SideCurve } from '../geometry/profile';

/**
 * Side profile: how far the body extends toward the back and front at different heights.
 * Each side is a list of points (multipliers of the nominal depth) at heights 0..1 (bottom to top); 1 = nominal.
 * Captures things the outline cannot: a forward-leaning head, a back bulge ("butt").
 * Points can be added, removed and moved to any height; omitted heights mean evenly spaced.
 */
export const SIDE_N = 7; // the default number of points per side
export const SIDE_MIN_POINTS = 4;
export const SIDE_MAX_POINTS = 10;
export const SIDE_MIN = 0.3;
export const SIDE_MAX = 1.6;
export const SIDE_MIN_T_GAP = 0.05;
/** `backT` / `frontT` (optional) are the heights (0..1, bottom to top) of those points; omitted = evenly spaced. */
export type SideProfile = { back: number[]; front: number[]; backT?: number[]; frontT?: number[]; smooth?: number }; // smooth: kept for old links; the curve is always smooth
export type SideWhich = 'back' | 'front';
export const uniformT = (n: number = SIDE_N): number[] => Array.from({ length: n }, (_, i) => i / (n - 1));

export const defaultSide = (): SideProfile => ({ back: Array(SIDE_N).fill(1), front: Array(SIDE_N).fill(1), smooth: 1 });
export const cloneSide = (s: SideProfile): SideProfile => ({ back: [...s.back], front: [...s.front], smooth: s.smooth ?? 1, ...(s.backT ? { backT: [...s.backT] } : {}), ...(s.frontT ? { frontT: [...s.frontT] } : {}) });

const validCount = (n: number) => n >= SIDE_MIN_POINTS && n <= SIDE_MAX_POINTS;
const clampArr = (a: any): number[] | null =>
  Array.isArray(a) && validCount(a.length) && a.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? a.map((x: number) => Math.min(SIDE_MAX, Math.max(SIDE_MIN, x))) : null;
const clampT = (a: any, n: number): number[] | undefined => {
  if (!Array.isArray(a) || a.length !== n || !a.every((x) => typeof x === 'number' && Number.isFinite(x))) return undefined;
  const t = a.map((x: number) => Math.min(1, Math.max(0, x))); t[0] = 0; t[n - 1] = 1;
  for (let i = 1; i < n - 1; i++) t[i] = Math.min(Math.max(t[i], t[i - 1] + SIDE_MIN_T_GAP), 1 - SIDE_MIN_T_GAP * (n - 1 - i));
  return t;
};

/** Repairs untrusted input (share links): always returns a valid profile. */
export function clampSide(raw: any): SideProfile {
  const d = defaultSide(), back = clampArr(raw?.back) ?? d.back, front = clampArr(raw?.front) ?? d.front;
  const bt = clampT(raw?.backT, back.length), ft = clampT(raw?.frontT, front.length);
  return { back, front, smooth: 1, ...(bt ? { backT: bt } : {}), ...(ft ? { frontT: ft } : {}) };
}

/** the heights of one side's points */
export const sideTs = (s: SideProfile, which: SideWhich): number[] => (which === 'back' ? s.backT : s.frontT) ?? uniformT(s[which].length);

/** points are re-sampled onto a common grid when two profiles differ in how many points they have */
function lerpSideOne(av: number[], at: number[], bv: number[], bt: number[], t: number) {
  const same = av.length === bv.length && at.every((x, i) => Math.abs(x - bt[i]) < 1e-9);
  if (same) return { v: av.map((x, i) => x + (bv[i] - x) * t), t: at };
  const n = Math.max(av.length, bv.length), ca = new SideCurve(av, at), cb = new SideCurve(bv, bt), u = uniformT(n);
  return { v: u.map((x) => ca.eval(x) + (cb.eval(x) - ca.eval(x)) * t), t: u };
}
export function lerpSide(a: SideProfile, b: SideProfile, t: number): SideProfile {
  const back = lerpSideOne(a.back, sideTs(a, 'back'), b.back, sideTs(b, 'back'), t), front = lerpSideOne(a.front, sideTs(a, 'front'), b.front, sideTs(b, 'front'), t);
  const even = (x: number[]) => x.every((v, i) => Math.abs(v - i / (x.length - 1)) < 1e-9);
  return { back: back.v, front: front.v, smooth: 1, ...(even(back.t) ? {} : { backT: back.t }), ...(even(front.t) ? {} : { frontT: front.t }) };
}

const withSide = (s: SideProfile, which: SideWhich, v: number[], ts: number[]): SideProfile => {
  const o = cloneSide(s); o[which] = v;
  const k = which === 'back' ? 'backT' : 'frontT';
  if (ts.every((x, i) => Math.abs(x - i / (ts.length - 1)) < 1e-9)) delete o[k]; else o[k] = ts;
  return o;
};

/** insert a point at a height (default: the middle of the largest gap), taking the value the curve already has there */
export function addSidePoint(s: SideProfile, which: SideWhich, at?: number): SideProfile | null {
  const v = s[which], ts = sideTs(s, which);
  if (v.length >= SIDE_MAX_POINTS) return null;
  let t = at;
  if (t === undefined) { let gi = 0; for (let i = 1; i < ts.length - 1 + 1; i++) if (ts[i] - ts[i - 1] > ts[gi + 1] - ts[gi]) gi = i - 1; t = (ts[gi] + ts[gi + 1]) / 2; }
  let k = ts.findIndex((x) => x > t!); if (k <= 0) return null;
  if (t - ts[k - 1] < SIDE_MIN_T_GAP || ts[k] - t < SIDE_MIN_T_GAP) return null;
  const val = Math.min(SIDE_MAX, Math.max(SIDE_MIN, new SideCurve(v, ts).eval(t)));
  const nv = [...v], nt = [...ts]; nv.splice(k, 0, val); nt.splice(k, 0, t);
  return withSide(s, which, nv, nt);
}

/** remove one interior point (not the bottom or top one) */
export function removeSidePoint(s: SideProfile, which: SideWhich, index: number): SideProfile | null {
  const v = s[which], ts = sideTs(s, which);
  if (v.length <= SIDE_MIN_POINTS || index <= 0 || index >= v.length - 1) return null;
  const nv = [...v], nt = [...ts]; nv.splice(index, 1); nt.splice(index, 1);
  return withSide(s, which, nv, nt);
}

/** remove the interior point that the rest of the curve describes best (it moves the shape least) */
export function removeSidePointAuto(s: SideProfile, which: SideWhich): SideProfile | null {
  const v = s[which], ts = sideTs(s, which); let best = -1, bd = Infinity;
  for (let i = 1; i < v.length - 1; i++) {
    const f = (ts[i] - ts[i - 1]) / (ts[i + 1] - ts[i - 1]), d = Math.abs(v[i] - (v[i - 1] + (v[i + 1] - v[i - 1]) * f));
    if (d < bd) { bd = d; best = i; }
  }
  return best < 0 ? null : removeSidePoint(s, which, best);
}
