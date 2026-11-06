/**
 * Poche: how a cut face is drawn in the Section view (technical-drawing style). One token set for every part, so the
 * hatching reads the same everywhere. Spacing is in model millimetres; `line` is the line width as a fraction of the spacing.
 */
export type PocheHatch = { angle: number; spacing: number; line: number; outline: number; cross?: boolean };
export const POCHE = {
  paper: '#ffffff',   // the cut face between the lines
  hatch: '#7d8396',   // hatch lines: a soft slate, lighter than the ink
  ink: '#2a2d3a',     // the heavy outline on the cut edge
  shell: { angle: 45, spacing: 0.55, line: 0.2, outline: 0.3 } as PocheHatch,
  core: { angle: 135, spacing: 0.8, line: 0.18, outline: 0.18 } as PocheHatch,
  magnet: { angle: 45, spacing: 0.5, line: 0.18, outline: 0.18, cross: true } as PocheHatch,
};
