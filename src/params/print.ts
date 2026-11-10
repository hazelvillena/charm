// 3D-PRINT PROTOTYPE JOINT (global). Tolerances are for desktop FDM in PLA or ABS; tune after a first fit test print.
export const PRINT = {
  rimExtra: 1.6,        // mm of extra material inside the wall around the seam (the rim band is wall + this)
  lapInset: 0.25,       // the lap stops this far short of the band's inner face (a flush face makes sliver edges)
  lapHeight: 2.0,       // how far the back shell's inner half-lap reaches into the front shell
  lapClearance: 0.2,    // mm of play in the half-lap joint (radial and axial)
  rimMagnet: { diameter: 5, thickness: 2, clearance: 0.1, boss: 0.8, margin: 1.4 }, // closure magnets in the rim: 5x2 mm discs, one pair per spot (pocket = diameter + 2 * clearance)
  engraveDepth: 0.6,    // eyes are engraved this deep into the front shell
  tidy: 0.01,           // mm: sliver edges and near-coplanar facets are merged within this before export
  gap: 8,               // mm between parts on the plate
};
