# 0023 · NURBS STEP export of the outer body

Status: accepted · 2026-11-06

## Context
The STEP export is faceted (thousands of flat faces), which Creo and Rhino import as a heavy, non-editable body. The body is a Catmull-Clark SubD, whose limit surface is smooth and NURBS-compatible, but the app only ever produced polygons.

## Decision
- `src/geometry/nurbs.ts`: the exact limit position of every vertex of the subdivided cage (Halstead stencil), sampled on a grid inside each cage quad; each quad becomes one bicubic NURBS patch that interpolates those exact limit samples. Neighbouring patches share identical boundary samples, so the surface has no gaps and no T-junctions.
- `src/io/exportNurbs.ts`: writes them as STEP AP214 `B_SPLINE_SURFACE_WITH_KNOTS` faces, joined by shared `B_SPLINE_CURVE` edges into one closed `MANIFOLD_SOLID_BREP`. Level 2 sampling gives 600 patches, about 1.8 MB.
- Export menu: `STEP · NURBS` (the outer body, not hollow: shell and edit it in Creo or Rhino). The faceted `STEP · Solids` stays for the hollow casing with Core, magnets and eyes.

## Verified
Read back through OpenCascade in the tests: one solid of 600 B-spline faces, volume within 0.06% of the SubD, patches pass through their samples exactly and sit within 0.013 mm of a twice-denser sampling of the true surface, shared edges identical to 1e-9. Not yet opened in Creo or Rhino themselves.

## Limits
Only the outer form is NURBS. Cutting the hollow, seat and pockets needs a CAD kernel (OpenCascade WASM), so those stay faceted.
