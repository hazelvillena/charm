// 3D-PRINT PROTOTYPE JOINT (global). Tolerances are for desktop FDM in PLA or ABS; tune after a first fit test print.
export const PRINT = {
  rimExtra: 2.4,        // mm of extra material inside the wall around the seam (the rim band is wall + this)
  lapInset: 0.25,       // the lap stops this far short of the band's inner face (a flush face makes sliver edges)
  lapHeight: 2.0,       // how far the back shell's inner half-lap reaches into the front shell
  lapClearance: 0.2,    // mm of play in the half-lap joint (radial and axial)
  // snap bead on the front shell's lap and its groove in the back shell, sized for a 0.4 mm nozzle (Bambu Lab): the bead is one line wide (0.4) and built
  // as a 45-degree staircase in 0.2 mm layers (so it prints without supports and each step is a real layer); it starts `start` above the lap's tip, which lies on the plate.
  // The groove is the bead grown by `play` (0.2 = one layer / half a line). Bead interference with the rebate wall = depth - lapClearance.
  snap: { depth: 0.4, layer: 0.2, height: 0.8, start: 0.4, play: 0.2, minWall: 1.4 },
  engraveDepth: 0.6,    // eyes are engraved this deep into the front shell
  tidy: 0.01,           // mm: sliver edges and near-coplanar facets are merged within this before export
  gap: 8,               // mm between parts on the plate
};
