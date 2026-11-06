# Geometry library (`src/geometry`, plus `src/params`, `src/checks`, `src/io`)

Pure TypeScript, no DOM and no scene code (a test enforces it). It can run in the browser, a worker, Node or a CLI,
and it is what you reuse for any other shape experiment. Units are millimetres.

## Pipeline: from an outline to a buildable casing
1. **Outline** (`params/outline.ts`, `geometry/profile.ts`): a mirrored polar outline around the core, 4 to 12 points per
   side with a smoothness blend. Single-valued R(phi), so it can never fold. Freehand strokes fit into it (`params/fitOutline.ts`).
2. **Inflate** (`geometry/inflate.ts`): **Poisson (membrane) inflation**. Solve `-laplacian(u) = 1` inside the outline with
   `u = 0` on it, height ~ `sqrt(u)`. Smooth everywhere including across the medial axis, adapts to any star-shaped
   outline (narrow parts thin out by themselves), exact ellipsoid for a disk. Shortley-Weller edges, SOR solve with a
   warm start (a few sweeps follow a drag, a full solve on release). This replaced the radial pillow that creased on
   corners and valleys (ADR 0019).
3. **Shape map** (`geometry/shapeMap.ts`): places the quad-sphere cage in the plane (outline radius) and sets depth from
   the membrane, shaped by front/back depth, back flatness, the side profile (`params/side.ts`), the optional flat core
   seat and the core's curvature carry-over.
4. **Subdivide** (`geometry/catmullClark.ts`): cached-topology Catmull-Clark (levels 2 to 3) from the cage.
5. **Inner shell** (`geometry/engine.ts: innerSurface`): the outer surface offset inward along its normals by the wall,
   clamped by local curvature so it never folds. Uniform wall by construction.
6. **Solids** (`geometry/solids.ts`, manifold-3d): hollow, core seat cup, magnet pockets behind a thin floor, notch,
   loop, split into front and back shells. Also cuts a section with true cut faces.
7. **Export** (`io/`): quad cage OBJ, smooth OBJ, STL, faceted STEP (round-tripped through OpenCascade in the tests),
   spec JSON.

## Analysis (reusable, pure arrays)
`geometry/curvature.ts` (local radius), `checks/analysis.ts` (mold draft against the split pull, tightest radius),
`geometry/section.ts` (plane section), `checks/*` (core fit, wall, magnet gap, loop).

## Reusing it
```ts
const engine = new ShapeEngine();                       // topology + warm-started inflators
const cage = new Float32Array(engine.qs.vertCount * 3);
const info = engine.buildCage(outline, params, cage, 'final');   // 'live' while dragging
const outer = new Float32Array(engine.smoothVertCount(3) * 3); engine.smoothInto(cage, 3, outer);
const inner = new Float32Array(outer.length); engine.innerSurface(outer, 3, params.wall, inner);
```
`PoissonInflator` also works on its own for any star-shaped outline: `new PoissonInflator().solve(phi => R(phi))`.
`setInflationMode('legacy')` restores the earlier radial pillow, only for A/B comparison in tests.
