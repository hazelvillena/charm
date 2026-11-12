# Clayground

A browser tool for shaping a **Charmer**: draw a flat outline, get a soft SubD character body, keep the hardware fixed, and turn the accepted form into a buildable casing, spec and export.

> Concept and prefab preview tool. Not class-A surfacing, not production-ready. Hardware dimensions are placeholders (labeled TBD in the UI).

## What it does
**Inputs (left)**
1. **Shape**: drag mirrored outline points around the puck keep-out circle, or **Draw** a freehand outline that fits into the same points. Presets: Ghost (fitted from the original Charmer), Blob, Star, Cloud, Drop.
2. **Side profile**: drag the back and front curves (back bulge, forward-leaning head).
3. **Body, face, manufacturing** sliders, **Material** (PC/ABS, Silicone, Metal; finishes follow the material) with a color picker, and the **Core** (global: diameter, thickness, dome, edge radius, magnet gap).

**Outputs (right, live)**
4. Metric tiles (size, estimated weight, volume, split), and **checks** (core fit, magnet gap, wall, mold draft, tightest radius, loop) that go red with the exact reason. On the stage: **Shaded / Ghost / Section / Cage** views, an **Analyze** menu (mold draft, curvature, zebra, wall) and the mold **split line**.
   A **Library** of saved, named iterations stays live when global parameters (core, wall, material, split) change.
5. **Build casing**: hollow front and back shells (manifold-3d), core seat, magnets sealed behind a thin floor, notch, loop, then an exploded diagram with numbered leader tags.
6. **Export** (bottom of the right panel): cage OBJ (quads, for Rhino SubD), smooth OBJ, STL shells, **STL · 3D print** (both shells and a Core fit dummy laid flat, with a snap-fit half-lap seam, magnet pockets in the Core dummy and engraved eyes; ADR 0024), **STEP** (faceted solid for Creo/Rhino, not NURBS), spec JSON. Permalink button top right.

## Run
```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # static dist/ (app + design/styleguide.html), works offline
npm run preview    # serve dist/ at http://127.0.0.1:4173 (use this for the demo)
npm test           # geometry invariants, 1000-case sweep, accept pipeline, import rules
npm run verify     # typecheck + tests + build
```

## Repo map
```
src/params     schema, outline, presets, locked core dims
src/geometry   Poisson inflation, quad sphere, profile, shape map, Catmull-Clark, solids (no DOM/scene). See src/geometry/README.md
src/checks     fit, wall, nook                                                     (no DOM/scene)
src/spec       dims, volume, weight                                                (no DOM/scene)
src/io         OBJ/STL/spec export, share link, OBJ import                         (no DOM/scene)
src/scene      three.js scene, materials, exploded view, reference ghost
src/ui         outline editor, panel, toolbar, spec card, toast
scripts        extractReference.mjs, fitReference.mjs
reference      charmer-body.obj, charmer-meta.json
docs           CONTEXT.md (start here), PLAN.md, HANDOFF.md, adr/, DEMO.md
```

## Docs
- [design/README.md](design/README.md): design system (open `/design/styleguide.html` in dev)
- [docs/CONTEXT.md](docs/CONTEXT.md): living context, read first
- [docs/PLAN.md](docs/PLAN.md): milestones and status
- [docs/adr/](docs/adr/README.md): architecture decisions
- [docs/DEMO.md](docs/DEMO.md): demo script

## Conventions
Units are millimeters, front is +Z, up is +Y. Geometry layers never import DOM or scene code (enforced by a test). Core dims live only in `src/params/core.ts`.

## Deploying (Cloudflare)
`wrangler.jsonc` makes this a static-assets deploy: Cloudflare runs `npm run build` and uploads `dist/`. In the Cloudflare project set the build command to `npm run build` and the deploy command to `npx wrangler deploy`. The app sits behind a soft password page (`src/gate.ts`, hash only, loads the app after unlock); it keeps casual visitors out but is not real security.
