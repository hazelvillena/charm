# Clayground: Living Context

**Read this first when picking the project up.** Keep it short and current. Update it in the same commit as any change that alters what is true here.
Last updated: 2026-11-05 (v0.2: analysis, library, core).

## What this is
A browser tool to shape a Charmer (interchangeable character shell around a fixed AI puck): drag a mirrored 2D outline, it inflates into a SubD body, live checks hold the hardware constraints, Accept builds hollow front/back shells with an exploded view and spec card, then export cage OBJ / STL / spec JSON.
Demo: **Nov 6, 2026**, screen share, technical design interview.

## Where things are
- Plan and status checklist: [PLAN.md](PLAN.md) (milestones M0 to M7, cut lines A/B/C)
- Decisions: [adr/](adr/README.md)
- Original spec (superseded where PLAN.md says so): [HANDOFF.md](HANDOFF.md)
- Run/build/test: root [README.md](../README.md)
- Reference model: `reference/charmer-body.obj` (+ meta). Original `charmerv1.obj` stays on Hazel's Drive.

## Current state
See the checklist in PLAN.md section 12 and the Log below. **v0 is built end to end** (outline editor, SubD, checks, Accept, exploded view, spec card, export, share link). Remaining: backup recording, Rhino round-trip test, real core dims. See PLAN.md section 12.

## Key facts to not rediscover
- **Library = source of truth** (ADR 0020): starred items are the pill at the top; presets are library items; Save appears after edits; the two drawing pads can expand into the left half of the canvas.
- Copy is deliberately terse; checks use plain designer language; "Manufacturing" is called **Shell**.
- **Body = Poisson (membrane) inflation** of the outline (`src/geometry/inflate.ts`, ADR 0019); inner shell = clamped normal offset (uniform wall). Geometry library overview: [src/geometry/README.md](../src/geometry/README.md).
- Messages are plain text (notes inline, status captions above the toolbar); never boxed chips.
- **Core** (was AI puck): global, domed with rounded edge, magnets behind a 1 mm floor (ADR 0012). Global params = Core, wall, material, split; everything else is per-iteration (ADR 0015).
- Materials drive finishes and weight (ADR 0013). Views: Shaded/Ghost/Section/Cage; Analyze menu: draft, curvature, zebra, wall (ADR 0014).
- Outline: 4 to 12 points per side + smoothness; cage N = 10 (ADR 0016). Draw: Points (click-placed, the curve passes through them) or Freehand (review step with fidelity/smoothing). Eyes have their own position and can be dragged on the canvas.
- Product name: **Clayground**. UI/material styling lives in `design/` only (ADR 0009).
- Shape = outline (polar; mirrored, or independent halves with Mirror off, ADR 0025) + **side profile** (ADR 0010). Ghost values are fitted from the reference; the puck plateau is flat by design.
- Layout: inputs left, live outputs right; below 1180 px outputs is a drawer, below 700 px both are drawers (no clipped controls).
- Units mm, front +Z, up +Y, body stands on y = 0. Puck center C is the polar origin.
- Core dims are placeholders (puck 1 inch). `REFERENCE_SCALE = 1.78`.
- Presets: Ghost (fitted from reference via `node scripts/fitReference.mjs`, regenerates `src/params/presets.generated.ts`), Blob, Star, Cloud, Drop.
- Rhino round trip unverified (ADR 0008).

## Maintenance rules
1. New or changed decision -> new/superseding ADR + index line + Log line below.
2. Finished milestone -> tick PLAN.md section 12, add a Log line.
3. Changed run commands or structure -> update root README.md.
4. Never leave the plan describing something that is no longer true.

## Log
- 2026-11-05: Plan written; core geometry (quad sphere, profile, Catmull-Clark, shape map), presets, fit script, tests (incl. 1000-case sweep) done. ADRs 0001 to 0008 recorded.
- 2026-11-05: v0 built and verified (tests, production build, browser). DEMO.md written. See PLAN.md Log for bugs found and fixed.
- 2026-11-05: v0.1: renamed to Clayground; design/ folder (ADR 0009); side profile + fit (ADR 0010); freehand draw (ADR 0011); inputs/outputs layout with live outputs; finishes + color picker + split-line shader; responsive drawers. Fixed: Accept hidden off-screen on narrow panes; split line now visible in Explore.
- 2026-11-05: v0.2: Ghost/Section views, Analyze menu, designer checks (magnet gap, mold draft, tightest radius), materials-drive-finishes (fixes the dead material toggle), Core params + dome + magnets behind a thin floor, variable outline points + smoothness, draw review, library with live global updates, named iterations, metric tiles, leader-line diagram tags, side profile flipped (front left). ADRs 0012 to 0016.
- 2026-11-05: v0.3: fixed the valley crease (constant-width edge roll-off, ADR 0017); drawings stay curved and reset the side profile; Section is now real solids with ink poche (core seat walls, floor, magnet pockets), magnets stacked vertically on the centre line; Analyze is a floating layers icon on the canvas; Export is a dropdown with a format picker; permalink button top right; no monospace typeface anywhere; default look is frost blue-gray.
- 2026-11-05: v0.4: STEP export (faceted B-rep, verified through OpenCascade, ADR 0018); Export moved to the bottom of the outputs panel; both side panels collapse at every width; dashed hairline parting line; gray core halo; smooth result silhouette overlay in the outline editor; optional flat core seat toggle.
- 2026-11-05: v0.5: Poisson inflation replaces the radial pillow (fixes the Triangle's corner creases), inner shell as a normal offset, TIP_SHARPEN 0.1, Triangle replaces Cloud (true rounded triangle), library seeded with 8 smooth starter shapes that pass every check, panels dock and push the canvas (one icon per panel), simple boxed exploded labels restored, messages as plain text, library thumbnails framed by width. ADR 0019.
- 2026-11-05: v0.6: library-driven pill with star/unstar, Save control, expandable sketch dock, side pad follows the body, aligned top row, compact copy, plain-language checks, minimal export list, trimmed outputs, eyes kept clear of the core. ADR 0020.

## 2026-11-05 · Clayground pass
Renamed to Clayground. One top bar; zoomable pads with on-canvas controls; free side-profile points (ADR 0021); core drag; checks with a one-line fix and a marker; library items carry their own material and show the Core; loop off by default; hatched-poche section; STEP export kept as a format row (needs a built casing). 86 tests pass.

## 2026-11-06 · Pad component and complete exports
Charmer rename; shared Pad component (ADR 0022); side profile points editable (4–10); plain sanity check with an i per row; STEP/STL/OBJ carry shells, Core, magnets and eyes; turntable; Clover is a default favourite. 89 tests pass.

## 2026-11-06 · Polish pass
Self-hosted Instrument Sans; Lucide icons; unroll component (spin once, options roll out, toolbar pinned so the eye never moves); undo/redo; eyes two/one/none; canvases resizable with Original and Reset along the bottom; side pad draws the true side silhouette and the side curve is a natural spline; Core top is one smooth dome; section prepared before the view switches; poche tokens (design/poche.ts). 91 tests pass.

## 2026-11-06 · NURBS STEP
Export has a STEP · NURBS row: the outer body as 600 bicubic B-spline patches (ADR 0023), verified through OpenCascade. The hollow casing stays faceted.

## 2026-11-06 · Side canvas true to the 3D body
The side pad now draws the body's real silhouette in true millimetres (exact edge-sampled projection, lightly smoothed) with the points on the outline; dragging aims the body's reach at the pointer. The flat core seat is off by default (Charmer gets a little more front depth low down and Arch a lower flat base so both still pass Core fit without it). Pads always keep their whole drawing area in view.

Export has an STL · 3D print row (ADR 0024): half-lap seam with a snap bead and groove, magnet pockets in the Core dummy, engraved eyes, a Core fit dummy, parts laid flat in one STL. The Loop toggle and flap are gone: every shape has a strap tunnel on the back (two slot openings joined by an inner channel, for a knotted cord), nothing protruding. 116 tests pass.

## 2026-11-11 · Print joint, free eyes, drawing and the sketchbook shapes
- **3D print** (ADR 0024): the closure is a snap fit: a nozzle-sized bead (one 0.4 mm line wide, a 0.2 mm layer staircase) on the front lap clicks into a groove in the back shell; no rim magnets; the Core dummy has the magnet pockets; both shells print seam face down (closed-side-down was tried and dropped: a dome on a few mm² needs supports under the outside); the rebate is cut only where the lap fits the cavity (feet and tips stay a flat band).
- **Outline editing** (ADR 0025): Draw has Points (click-placed, the curve passes through them) and Freehand; a Mirror toggle gives each side its own points; up to 24 points a side, 2.5° apart; Cmd/Ctrl/Alt-click or -drag selects several points; hover the curve to see where a click adds a point. Eyes have their own position (`eyeX`, height) and drag on the canvas.
- **Smooth curve** (ADR 0025): a closed cubic spline in the flat view replaces the lumpy polar curve for new drawings (`outline.curve = 'c2'`); older outlines are unchanged; a "Smooth curve" toggle switches any shape. **Width / Height** (Body volume, true mm of the built body) resize the outline's points; the canvas Reference picker overlays the original, the saved version or any library iteration; the canvas can be dragged as tall as you like.
- **Starters**: Blob10 (kept from the deployed app), Shuriken, Slate (a sleeker Tile) and Tile, traced from `docs/sketches/shuriken-tile.jpg`; Shuriken, Slate and Tile start in the pill. Library versions 14–17 add them to existing libraries. 161 tests pass.
- **Strap**: two plain vertical holes through the back wall (the cord runs inside the hollow shell), replacing the internal channel whose bridge sagged in print; placement needs a back within 30° of facing back and 8 mm of hollow behind it (ADR 0024). The Reference picker also shows on the side canvas (the chosen iteration's side silhouette).
