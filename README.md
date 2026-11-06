# Charmer Lab

A browser tool for shaping a **Charmer**: draw a flat outline, get a soft SubD character body, keep the hardware fixed, and turn the accepted form into a buildable casing, spec and export.

> Concept and prefab preview tool. Not class-A surfacing, not production-ready. Hardware dimensions are placeholders (labeled TBD in the UI).

## What it does
1. **Outline editor**: drag mirrored points around the puck keep-out circle. Presets: Ghost (fitted from the original Charmer), Blob, Star, Cloud, Drop.
2. **Live SubD**: the outline inflates to a quad cage; Catmull-Clark smooths it live. Toggle smooth / cage / both.
3. **Live checks**: puck fit, wall thickness (with heatmap), loop nook. Red when the form breaks the hardware.
4. **Accept**: builds hollow front and back shells (manifold-3d), puck seat, magnet pockets, notch, loop; exploded view and spec card.
5. **Export**: cage OBJ (quads, for Rhino SubD), smooth OBJ, STL shells, spec JSON, share link.

## Run
```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # static dist/, works offline
npm run preview    # serve dist/ at http://127.0.0.1:4173 (use this for the demo)
npm test           # geometry invariants, 1000-case sweep, accept pipeline, import rules
npm run verify     # typecheck + tests + build
```

## Repo map
```
src/params     schema, outline, presets, locked core dims
src/geometry   quad sphere, profile, shape map, Catmull-Clark, features, solids   (no DOM/scene)
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
- [docs/CONTEXT.md](docs/CONTEXT.md): living context, read first
- [docs/PLAN.md](docs/PLAN.md): milestones and status
- [docs/adr/](docs/adr/README.md): architecture decisions
- [docs/DEMO.md](docs/DEMO.md): demo script

## Conventions
Units are millimeters, front is +Z, up is +Y. Geometry layers never import DOM or scene code (enforced by a test). Core dims live only in `src/params/core.ts`.
