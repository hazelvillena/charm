import { Outline, makeOutline } from './outline';
import { Params, defaultParams } from './schema';
import { GHOST_FIT } from './presets.generated';

export type Preset = { id: string; name: string; outline: Outline; params: Partial<Params> };

const A7 = [-90, -60, -30, 0, 30, 60, 90];

export const PRESETS: Preset[] = [
  {
    id: 'ghost', name: 'Ghost',
    outline: makeOutline([...GHOST_FIT.anglesDeg], [...GHOST_FIT.radii]),
    params: {
      depth: GHOST_FIT.depth, belly: GHOST_FIT.belly, backFlat: 0.2, plateau: 0.7,
      eyeSize: Math.max(1, GHOST_FIT.eyeSize), eyeSpacing: GHOST_FIT.eyeSpacing, eyeHeight: GHOST_FIT.eyeHeight,
    },
  },
  { id: 'blob', name: 'Blob', outline: makeOutline(A7, [26, 25.5, 25, 25, 25.5, 26.5, 28]), params: { depth: 30, eyeHeight: 0.74 } },
  { id: 'star', name: 'Star', outline: makeOutline(A7, [30, 21, 29, 21, 29, 21, 30]), params: { depth: 28, eyeHeight: 0.62 } },
  { id: 'cloud', name: 'Cloud', outline: makeOutline([-90, -68, -45, 0, 45, 68, 90], [22.5, 26.5, 29, 23, 29, 26.5, 22.5]), params: { depth: 30, eyeHeight: 0.66 } },
  { id: 'drop', name: 'Drop', outline: makeOutline(A7, [24, 24.5, 23.5, 23, 24.5, 30, 45]), params: { depth: 30, eyeHeight: 0.8 } },
];

export function presetParams(p: Preset): Params {
  return { ...defaultParams(), ...p.params } as Params;
}

export const GHOST_SILHOUETTE: readonly number[] = GHOST_FIT.silhouette; // R every 2.5deg, -90..90
export const GHOST_Z_EQ = GHOST_FIT.zEq;
