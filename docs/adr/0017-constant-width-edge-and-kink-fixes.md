# 0017: Constant-width edge roll-off, curved-by-default drawings (kink fixes)
Status: accepted, partly superseded by 0019 (2026-11-05)

## Context
Hazel noticed kinks: between the Ghost's legs the surface had a sharp V with a crease running up toward the core, unlike the reference's smooth arch; drawn outlines also looked angular. Measurements showed:
- The **outline** at the valley matched the reference within 0.4 mm (ours was actually the rounder arch), so the outline was not the problem.
- The **inflation** was: the pillow roll-off was proportional to the local outline radius, and the core seat is held flat out to ~13.9 mm, but the body edge at the valley is only 16.8 mm from the core. The whole surface had to drop within a **2.9 mm** band at the valley versus 7.7 mm at the sides, which is a cliff.
- For **drawn** outlines: smoothness defaulted to 0.78 (partly straight segments), the straight-segment blend made the top and bottom meet in a crease, and hand jitter survived at high fidelity.

## Decision
- Add a **distance-to-outline** edge profile: a quarter-circle roll-off of constant width (`EDGE_WIDTH` = 7.5 mm), combined with the proportional pillow by a smooth max of their deficits (p-norm 8), so the wider roll-off wins. Broad areas keep their pillow; narrow spots get at least 7.5 mm of rounding. 7.5 mm is the widest value that still keeps the Ghost's core seat enclosed (9 mm exposes it) and passes the tightest-radius rule.
- The straight-segment part of smoothness is eased into the two axis points so mirrored halves never crease.
- Freehand fits use a Gaussian pre-smooth (strength follows the fidelity slider), stay curved (smoothness 0.88 to 1), and reset the side profile to neutral because the old one was tailored to the previous shape.

## Consequences
- The valley is visibly smoother and no longer shows a crease; other presets are essentially unchanged.
- The seat and the crotch edge compete for the same 3 mm of material: widening the roll-off beyond about 8 mm exposes the core seat there. This is a real design constraint, not a bug.
- The Ghost side-profile fit was recomputed (worst error 1.6 mm).
