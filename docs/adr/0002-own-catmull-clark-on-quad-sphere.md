# 0002: Own Catmull-Clark on a welded quad sphere
Status: accepted (2026-11-05)

## Context
We need the low-poly quad cage as data (OBJ export for Rhino SubD) and live smoothing at 60 fps. Loop-subdivision libraries are triangle-only. An OpenSubdiv WASM package exists (TOST license) but adds a dependency and hides the cage.

## Decision
Implement Catmull-Clark ourselves (`geometry/catmullClark.ts`) with per-level cached topology tables; a slider tick only recomputes positions. Base cage: equiangular welded cube-sphere, N = 8 (384 quads), +Z face center is a vertex (puck lands on a regular grid). Level 2 while dragging, level 3 on release.

## Consequences
- Cage is first-class data; export is trivial.
- Subdivision shrinks sharp lobes slightly versus the drawn outline (accepted).
- OpenSubdiv-WASM remains the fallback if our implementation proves insufficient.
