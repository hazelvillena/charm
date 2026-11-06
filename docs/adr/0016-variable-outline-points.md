# 0016: Variable outline points with a smoothness control
Status: accepted (2026-11-05)

## Context
A fixed 7-point outline was too coarse for some shapes and too rigid; handles were visually heavy. Hazel asked for control over the number of points, like degree control on a curve.

## Decision
The outline has 4 to 12 points per side. Click the curve to add a point, double-click a point to remove it, or use the +/- stepper (adds in the biggest gap, removes the least important point). A **smoothness** value blends straight segments (like degree 1) with the smooth cubic (like degree 3). Handles are small, mirrored points are faint dots. The base cage resolution rises from N = 8 to N = 10 so more points stay faithful (feet tips now within about 0.1 mm of the reference). Presets animate between outlines with different point counts via a common resampling.

## Consequences
- Accept takes about 0.75 s instead of 0.5 s.
- Freehand drawing uses the same representation: a fidelity versus smoothing slider chooses point count and smoothing (see ADR 0011), with a review step before Generate.
