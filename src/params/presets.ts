import { Outline, makeOutline } from './outline';
import { Params, defaultParams } from './schema';
import { GHOST_FIT } from './presets.generated';
import { SIDE_FIT } from './side.generated';

export type Preset = { id: string; name: string; outline: Outline; params: Partial<Params> };

const A7 = [-90, -60, -30, 0, 30, 60, 90];
/** the default eye size for every shape (2.4 mm); the reference Ghost's own eyes are smaller, but this reads better */
export const DEFAULT_EYE_SIZE = 2.4;

/**
 * Equilateral triangle (apex up, flat base) with the given inradius, its corners rounded by `corner` mm:
 * the Minkowski sum of a smaller triangle and a disk, sampled as a smooth polar outline around the core.
 */
function roundedTriangle(inradius: number, corner: number): Outline {
  const D = Math.PI / 180, in0 = inradius - corner, Rc0 = 2 * in0;
  const V = [90, 210, 330].map((a) => [Rc0 * Math.cos(a * D), Rc0 * Math.sin(a * D)]);
  const seg = (p: number[], a: number[], b: number[]) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t); };
  const inside = (p: number[]) => { const s = [0, 1, 2].map((i) => { const a = V[i], b = V[(i + 1) % 3]; return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); }); return s.every((x) => x >= 0) || s.every((x) => x <= 0); };
  const dist = (p: number[]) => (inside(p) ? 0 : Math.min(seg(p, V[0], V[1]), seg(p, V[1], V[2]), seg(p, V[2], V[0])));
  const radius = (deg: number) => { const u = [Math.cos(deg * D), Math.sin(deg * D)]; let lo = 0, hi = 80; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (dist([u[0] * m, u[1] * m]) < corner) lo = m; else hi = m; } return (lo + hi) / 2; };
  const angles = [-90, -70, -52, -40, -30, -20, 0, 30, 56, 76, 90];
  return makeOutline(angles, angles.map((a) => +radius(a).toFixed(2)));
}

export const PRESETS: Preset[] = [
  {
    id: 'ghost', name: 'Charmer',
    outline: makeOutline([...GHOST_FIT.anglesDeg], [...GHOST_FIT.radii]),
    params: {
      depth: GHOST_FIT.depth, belly: GHOST_FIT.belly, backFlat: 0.2, plateau: 0.95,
      eyeSize: DEFAULT_EYE_SIZE, eyeSpacing: GHOST_FIT.eyeSpacing, eyeHeight: GHOST_FIT.eyeHeight,
      side: { back: [...SIDE_FIT.back], front: [...SIDE_FIT.front] },
    },
  },
  { id: 'blob', name: 'Blob', outline: makeOutline(A7, [26, 25.5, 25, 25, 25.5, 26.5, 28]), params: { depth: 30, eyeHeight: 0.74 } },
  { id: 'star', name: 'Star', outline: makeOutline(A7, [30, 21, 29, 21, 29, 21, 30]), params: { depth: 28, eyeHeight: 0.62 } },
  // soft equilateral triangle: apex up, flat base, true rounded corners (see roundedTriangle)
  { id: 'triangle', name: 'Triangle', outline: roundedTriangle(18, 7), params: { depth: 28, eyeHeight: 0.64 } },
  { id: 'drop', name: 'Drop', outline: makeOutline(A7, [24, 24.5, 23.5, 23, 24.5, 30, 45]), params: { depth: 30, eyeHeight: 0.8 } },
];

export function presetParams(p: Preset): Params {
  return { ...defaultParams(), ...p.params } as Params;
}

export const GHOST_SILHOUETTE: readonly number[] = GHOST_FIT.silhouette; // R every 2.5deg, -90..90
export const GHOST_Z_EQ = GHOST_FIT.zEq;
