# 0024 · 3D print prototype export

Status: accepted · 2026-11-10

## Context
The shells, Core and magnets existed as separate STLs for production intent, but nothing joined the two halves and the parts were not laid out for a desktop printer. Prototype material for now: PLA or ABS on FDM (final material not chosen).

## Decision
`STL · 3D print` builds a separate, print-only casing (`buildCasing({ print: true })`); the preview and every other export are unchanged.
- **Joint:** a rim band (wall + 1.6 mm) around the seam holds a half-lap: the front shell's inner half reaches 2 mm into a rebate in the back shell's inner half, 0.2 mm play. Both shells print dome-up, seam face down, with no overhanging tongue. The lap is on the front so the back shell's seam face is what lies on the plate.
- **Closing:** one pair of 5×2 mm disc magnets per spot (pocket 5.2 mm, 2.1 mm deep, flush at the seam), two spots left and right at the height with most room, outside the rim band, Core seat and notch. Four magnets in all. If a shape leaves no room, the lap alone closes it.
- **Core:** seat keeps the 0.3 mm radial clearance; the print includes a Core fit dummy at true puck size so the snug fit is tested before real hardware. The Core's own magnets are 5×2 mm now (were 6×2).
- **Eyes:** engraved 0.6 mm into the front shell (not separate parts).
- **Strap tunnel:** part of every shape, not an option (the old Loop toggle, the ring and the protruding flap are gone). Two 4 × 3.2 mm slot openings, 7 mm apart, on the back near the top, joined by a 3.2 mm channel inside under a 2.5 mm bar, so a thin cord goes in one opening, out the other and is knotted. Nothing sticks out. A solid column from the back surface to the seam holds it (made by filling the cavity, like the rim band), so the back shell prints from the plate up with no overhang: the slots are vertical and the channel's roof bridges only the 3 mm bar. Placement is a rule: on the centre line, as high as the bar, channel and a 1.5 mm floor fit in the back shell, with the back surface present at the openings and clear of the Core seat when the seat reaches the back shell (`findStrap`). If a shape has no room, the sanity check turns red. Tested by sending a cord path through the built back shell for every shape.
- **Layout:** front shell, back shell (turned over) and Core dummy in a row on z = 0, 8 mm apart, in one STL. Magnets are bought parts and not exported.

## Watertight by construction (all exports)
Bambu Studio first flagged a non-manifold edge. Cause: added material (rim band, bosses, loop lug) was fused to the outer surface, where faces coincide and leave sliver edges. Now extra material is made by filling the empty inside before the hollow is cut (so nothing is fused to the outer face), the lap is kept inside the cavity at its full height, and rim features keep out of the seat cup. The same loop-lug change applies to the normal casing. `src/geometry/meshHealth.ts` (weld by position, every edge in exactly two oppositely wound triangles) is a regression test over every shape, with and without loop, plain and print, and a guard at export time that warns if any STL part would need repair.

## Limits
Tolerances (`src/params/print.ts`) are a first guess for FDM and need one fit-test print; Core and magnet dimensions are still placeholders. The ceiling inside each shell and the free-standing seat walls on the back shell may need light supports. No snap hooks: printed hooks crack in PLA.
