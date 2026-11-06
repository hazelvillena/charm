import { MATERIALS } from '../../design/finishes';
export const DENSITY_G_CM3: Record<string, number> = Object.fromEntries(MATERIALS.map((m) => [m.id, m.densityGcm3]));
