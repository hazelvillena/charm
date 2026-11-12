// HARDWARE INTERFACE (global: shared by every iteration). Values are PLACEHOLDERS (TBD) until real dims arrive.
// The Core's shape params (diameter, thickness, dome, edge radius) and the magnet gap are editable in the UI via setCore().
export const REFERENCE_SCALE = 1.78; // charmerv1.obj file units -> mm (puck ~60% of belly width)

export const CORE = {
  puckDiameter: 25.4,   // 1 inch, TBD
  puckDepth: 8,         // core thickness = seat depth, TBD
  puckClearance: 0.3,   // radial, TBD
  domeHeight: 1.6,      // pillowed top: how far the dome rises above the flat top plane
  edgeRadius: 2.4,      // rounded top edge of the core
  magnet: { diameter: 5, thickness: 2, count: 2, spacing: 14, gap: 1.0 }, // gap = plastic floor between magnet and core, TBD
  notch: { width: 3, depth: 1.5 },   // fingernail release at the bottom of the seat, TBD
  // strap tunnel on the back: two slot openings joined by a channel inside, so a cord goes in one and out the other and is knotted (mm; sized for a printed prototype, TBD)
  strap: { spacing: 7, openingWidth: 4, openingHeight: 3.2, channelHeight: 3.2, bar: 2.5, floor: 1.5, padMargin: 2.5, rimMargin: 3 },
};

export type CoreKey = 'puckDiameter' | 'puckDepth' | 'domeHeight' | 'edgeRadius' | 'magnetGap';
export const CORE_RANGES: Record<CoreKey, { label: string; min: number; max: number; step: number }> = {
  puckDiameter: { label: 'Core diameter', min: 20, max: 34, step: 0.1 },
  puckDepth: { label: 'Core thickness', min: 5, max: 12, step: 0.5 },
  domeHeight: { label: 'Dome height', min: 0, max: 3, step: 0.1 },
  edgeRadius: { label: 'Edge radius', min: 0.5, max: 4, step: 0.1 },
  magnetGap: { label: 'Magnet gap', min: 0.6, max: 2, step: 0.1 },
};
const DEFAULTS = { puckDiameter: 25.4, puckDepth: 8, domeHeight: 1.6, edgeRadius: 2.4, magnetGap: 1.0 };

export const getCore = (k: CoreKey): number => (k === 'magnetGap' ? CORE.magnet.gap : CORE[k]);
export function setCore(patch: Partial<Record<CoreKey, number>>) {
  for (const [k, v] of Object.entries(patch) as [CoreKey, number][]) {
    const r = CORE_RANGES[k]; if (!r || !Number.isFinite(v)) continue;
    const c = Math.min(r.max, Math.max(r.min, v));
    if (k === 'magnetGap') CORE.magnet.gap = c; else CORE[k] = c;
  }
  // the dome edge radius can never exceed what the core can hold
  CORE.edgeRadius = Math.min(CORE.edgeRadius, CORE.puckDiameter / 2 - 1, CORE.puckDepth - 0.5);
}
export const resetCore = () => setCore(DEFAULTS);

export const OUTLINE_MARGIN = 1.5; // mm of extra material beyond puck + clearance + wall
export const OUTLINE_MAX_RADIUS = 60;
export const OUTLINE_MIN_GAP_DEG = 2.5; // closest two outline points may sit (small, so tips and corners can be tight)

export const puckRadius = () => CORE.puckDiameter / 2;
export const seatRadius = () => CORE.puckDiameter / 2 + CORE.puckClearance;
export const outlineMinRadius = (wall: number) => seatRadius() + wall + OUTLINE_MARGIN;
/** floor of plastic around the magnets: the gap in front of them, the magnet, and a back lip */
export const floorThickness = () => CORE.magnet.gap + CORE.magnet.thickness + 0.8;
