# 0001: Shape is a mirrored polar outline, not lobe sliders
Status: accepted (2026-11-05)

## Context
HANDOFF.md specified lobe sliders (count, depth, sharpness, arc...). Hazel wants to draw a flat shape and have it inflate into a soft body, for both the Charmer and abstract shapes.

## Decision
The shape input is a closed outline stored in **polar form** around the puck center C: 7 control points on the right half (-90 to +90 deg), mirrored left. `R(phi)` is a periodic monotone cubic Hermite spline. Inflation turns the outline into a pillow-shaped quad cage. Presets are saved outlines.

## Consequences
- `R(phi)` is single-valued, so outlines cannot fold or self-intersect: valid by construction.
- Limit: outlines must be star-shaped from C (no deep C-shaped notches). Revisit with a different mesher if needed.
- Puck keep-out is a hard constraint: `R >= seatRadius + wall + margin`, enforced on drag.
- Lobe sliders are removed; the Ghost preset is fitted from `charmerv1` (`scripts/fitReference.mjs`).
