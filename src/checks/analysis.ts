import { CheckResult } from './fit';

import { curvatureRadii } from '../geometry/curvature';
export { curvatureRadii };

/** Mold draft per vertex in degrees. The front half pulls toward +Z, the back half toward -Z, split at splitZ. Negative = undercut. */
export function draftAngles(pos: ArrayLike<number>, nor: ArrayLike<number>, splitZ: number): Float32Array {
  const n = pos.length / 3, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const nz = nor[i * 3 + 2], toward = pos[i * 3 + 2] >= splitZ ? nz : -nz;
    out[i] = (Math.asin(Math.max(-1, Math.min(1, toward))) * 180) / Math.PI;
  }
  return out;
}

export const UNDERCUT_DEG = -0.75;   // below this a surface faces against the pull
export const DRAFT_MIN_DEG = 1;      // typical minimum draft on molded faces (parting line aside)

const worstAt = (vals: ArrayLike<number>, pos?: ArrayLike<number>) => { if (!pos) return undefined; let k = 0; for (let i = 1; i < vals.length; i++) if (vals[i] < vals[k]) k = i; return { x: pos[k * 3], y: pos[k * 3 + 1], z: pos[k * 3 + 2] }; };

export function checkDraft(draft: Float32Array, splitZ: number, pos?: ArrayLike<number>): CheckResult {
  let under = 0, low = 0;
  for (const d of draft) { if (d < UNDERCUT_DEG) under++; else if (d < DRAFT_MIN_DEG) low++; }
  const pu = (100 * under) / draft.length, pl = (100 * low) / draft.length;
  const ok = pu < 1;
  return {
    id: 'draft', ok, label: 'Moldable',
    detail: ok ? 'No undercuts: both halves release straight out of the mold' : `${pu.toFixed(1)}% of the surface faces against the mold pull`,
    fix: ok ? undefined : 'Move the split line or soften the profile here', at: ok ? undefined : worstAt(draft, pos),
  };
}

export function checkRadius(radii: Float32Array, wall: number, pos?: ArrayLike<number>): CheckResult {
  let min = Infinity; for (const r of radii) if (r < min) min = r;
  const need = 1.5 * wall;
  return min >= need
    ? { id: 'radius', ok: true, label: 'Curve radius', detail: `Sharpest curve ${min.toFixed(1)} mm radius (aim for ${need.toFixed(1)} mm or more so it molds cleanly)` }
    : { id: 'radius', ok: false, label: 'Curve radius', detail: `Sharpest curve ${min.toFixed(1)} mm radius; under ${need.toFixed(1)} mm it can show sink marks or chip`, fix: `Round this corner to ${need.toFixed(1)} mm or more`, at: worstAt(radii, pos) };
}
