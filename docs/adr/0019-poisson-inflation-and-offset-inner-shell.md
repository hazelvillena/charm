# 0019: Poisson inflation for the body; the inner shell is a normal offset
Status: accepted (2026-11-05)

## Context
The Triangle exposed a structural flaw: zebra stripes folded along the corner directions. The pillow height was a function of the point's fraction of the LOCAL outline radius, so wherever the radius changes quickly (corners, valleys) the roll-off width changed quickly and the surface creased. A distance-field pillow has the opposite flaw: a crease along the medial axis (a pyramid ridge on a triangle). Patching with a constant-width edge (ADR 0017) helped the Ghost's valley but not the general case.

## Decision
- Inflate with **Poisson (membrane) inflation** (`geometry/inflate.ts`): solve `-laplacian(u) = 1` inside the star-shaped outline with `u = 0` on it, height ~ `sqrt(u)`. It is smooth everywhere (no medial-axis ridge, no corner creases), adapts to any outline, and gives an exact ellipsoid for a disk. Numerics: regular grid, Shortley-Weller cut-cell boundaries, SOR with a warm start from the previous solution (`live` = 30 sweeps, `final` = up to 500 with early exit). Cost is a few milliseconds; dragging stays at about 8 ms per frame.
- Thickness is normalized against the membrane height at the Core, so `depth` still means thickness at the Core.
- The flat core seat is a smooth blend (lifts the surface to the Core's level inside the seat radius, never where the surface is already near the outline).
- The **inner shell is now the outer surface offset inward along its normals** by the wall, clamped to 85% of the local radius of curvature so it cannot fold. This replaced regenerating the inner shape from shrunk parameters, which could not track the outer exactly at the seat blend (walls dropped to 1.1 mm). Walls are now uniform by construction (min 1.60 mm on the presets).
- The earlier radial pillow stays behind `setInflationMode('legacy')` for A/B tests only.

## Consequences
- Measured smoother than the legacy model on the Ghost, Star and Triangle (neighbouring-normal angle, p98), mirror-symmetric, and every preset and starter passes all checks.
- `TIP_SHARPEN` had to drop to 0.1 so the Ghost's feet pass the tightest-radius rule; feet are about 0.7 mm (2%) shorter than the reference.
- This is still a concept surface: smooth and adaptive, not class-A. Class-A refinement stays a manual Rhino stage.
- Supersedes the constant-width edge solution of ADR 0017 and the "regenerate inner from shrunk parameters" part of ADR 0003.
