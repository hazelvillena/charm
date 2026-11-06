// LOCKED hardware interface. All values are PLACEHOLDERS (TBD) until real dims arrive.
// Change them here only; everything downstream re-flows.
export const REFERENCE_SCALE = 1.78; // charmerv1.obj file units -> mm (puck ~60% of belly width)

export const CORE = {
  puckDiameter: 25.4, // 1 inch, TBD
  puckDepth: 8, // TBD
  puckClearance: 0.3, // radial, TBD
  magnet: { diameter: 6, thickness: 2, count: 2, spacing: 14 }, // TBD
  notch: { width: 3, depth: 1.5 }, // TBD, fingernail release at the bottom of the seat
  loop: { holeDiameter: 4, boss: 3, minThickness: 3 }, // TBD
} as const;

export const OUTLINE_MARGIN = 1.5; // mm of extra material beyond puck + clearance + wall
export const OUTLINE_MAX_RADIUS = 60;
export const OUTLINE_MIN_GAP_DEG = 8;

export const puckRadius = () => CORE.puckDiameter / 2;
export const seatRadius = () => CORE.puckDiameter / 2 + CORE.puckClearance;
export const outlineMinRadius = (wall: number) => seatRadius() + wall + OUTLINE_MARGIN;
export const floorThickness = () => CORE.magnet.thickness + 1.2;
