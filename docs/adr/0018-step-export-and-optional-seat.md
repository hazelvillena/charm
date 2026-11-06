# 0018: STEP export (faceted B-rep) and an optional flat core seat
Status: accepted (2026-11-05)

## Context
The goal is to pass the casing to Rhino or Creo. STEP was listed as "later". True NURBS STEP would need a B-rep kernel in the browser (OpenCascade.js, tens of MB) and cannot come from a subdivision mesh anyway. Separately, Hazel wanted the flat seat and curvature carry-over around the core to be optional.

## Decision
- **STEP export** of the built shells as a **faceted B-rep**: each triangle is a planar `ADVANCED_FACE` of a `MANIFOLD_SOLID_BREP` with shared `EDGE_CURVE`s (AP214, millimetres). Shells are simplified within 0.08 mm first (manifold `simplify`), giving roughly 14k to 17k facets and 10 to 12 MB. It imports as a solid body for reference, mass properties and assembly; it is **not NURBS**. For true surfaces: cage OBJ, then Rhino `ToSubD` then `ToNURBS`.
- The first attempt used the compact `FACETED_BREP` + `POLY_LOOP` form; **OpenCascade accepted the file but produced no solids**. We now round-trip every STEP through `occt-import-js` (dev dependency) in the tests and assert two solids, the same facet count and the same bounding box (within 0.01 mm), for the Blob and the Ghost.
- **Flat core seat** is a per-iteration toggle (`corePlateau`, default on). Off = pure pillow body: no flat seat and no core curvature carry-over. Core fit may then fail honestly because the surface falls away from the core.

## Consequences
- STEP works offline with no heavy dependency; the limitation (faceted) is stated in the UI and the toast.
- Behavior of other CAD tools (Creo, Rhino) is inferred from OpenCascade's reading and the standard entity form; not tested in those products.
