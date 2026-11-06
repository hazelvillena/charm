# Charmer Lab: Build Plan (living doc)

Status: **v0 BUILT (M0 to M6 done, M7 polish in progress).** Update the checkboxes and the Log (bottom) as work proceeds.
Companion docs: [HANDOFF.md](HANDOFF.md) (original spec), [README.md](README.md) (short version).
Where this plan and HANDOFF.md disagree, **this plan wins** (see "Changes from HANDOFF").

Demo: **Nov 6, 2026**, screen share, technical design interview.

## 0. Goals and priorities

The demo must show that Hazel can:
1. Turn design intent into a parametric system.
2. Hold real hardware constraints while the form changes.
3. Bridge design and engineering: form, casing, spec, export.
4. Work in an industry pipeline: SubD in the browser, Rhino for NURBS and STEP.

Priorities, in order: **(1) reliability** (no crash, no broken mesh, smooth sliders), **(2) beautiful and simple** (periwinkle on white, portfolio feel), **(3) reusable** (geometry core has no UI or scene code).

## 1. Decisions (settled with Hazel)

| Topic | Decision |
|---|---|
| Hero input | **2D outline editor**: about 12 mirrored, draggable points. The outline inflates into a soft SubD body. Lobe sliders from HANDOFF are **dropped**. |
| Drawing | Drag points only. No freehand in v0. |
| Remaining sliders | Depth, belly, back flatness, plateau (flat area around the puck), wall, split line, material. Plus view options (color swatches). |
| Presets | Saved outlines: Ghost (fitted from charmerv1), plus generic abstract starters (Blob, Star, Cloud, Drop). The Grokbot icons were only an example of the idea (draw a flat shape, get a body); we do **not** copy them. Switching animates about 300 ms. |
| Puck | Fixed at belly center (`puckCenterY` in core). Not user-adjustable. |
| Core dims | Placeholders, labeled TBD in the UI, all in one object (`params/core.ts`). **Puck default: 1 inch = 25.4 mm diameter.** |
| Puck opening | Not modeled in the reference. The tool generates it from `CORE` on Accept (boolean), and as a preview mesh in Explore. |
| Cut lines | Commit to **B**, go for **C** if time. A alone is a working demo. |
| Accent | Periwinkle on white. Default `#5B6CFF` (single CSS variable `--accent`, tune later). |
| Rhino | Not available to test. Cage OBJ follows standard quad OBJ. Demo wording: "designed to open as SubD in Rhino, round trip not yet verified". We verify the file ourselves (see M6). |

## 2. What the reference OBJ told us (`charmerv1.obj`, inspected)

Path: `~/Library/CloudStorage/GoogleDrive-hazelnvillena@gmail.com/My Drive/maker/bubas/charmerv1.obj` (14.6 MB).

- 3 objects, all quads, no triangles: `object_1` and `object_2` (the eyes, 23,040 quads each, open domes) and `object_3` (the body, layer `Layer_01`, material `Paint`, 9,728 quads).
- **Body is a closed, watertight, genus-0 quad mesh.** After welding duplicate-position vertices: 9,730 verts, every edge shared by exactly 2 faces, Euler characteristic 2. It is a dense regular quad mesh, not a coarse control cage.
- Body bbox in file units: **23.75 W x 35.34 H x 20.10 D**. Front faces **+Z**, as in the HANDOFF. Widest near y = 0 (the belly). Narrow rounded head, about 5.3 wide at the very top. Depth/width is about 0.85, much chunkier than the HANDOFF default of 22/46 = 0.48.
- Eyes: about 0.73 W x 1.15 H x 0.52 D each, centers about 2.56 apart, at about 84% of body height. As ratios: eye width about 3% of body width, aspect about 1:1.57, spacing about 11% of body width.
- **Scale is unknown.** A 25.4 mm (1 inch) placeholder puck cannot fit in a 23.75 wide body, so the file is not at real size. Policy: one constant `REFERENCE_SCALE`. Default **1.78**, which makes belly width about 42 mm so the 25.4 mm puck sits at about 60% of body width (as in the portfolio photos). That gives about 63 H x 36 D. Revisit when real dims arrive.
- Consequences: widen the depth range to about 16 to 42 mm. Make eye defaults ratio-based. Extract the body into a lean reference file (about 1 MB) instead of shipping the 14.6 MB original.

## 3. Architecture

```
src/
  main.ts                boot, wiring
  store.ts               single source of truth (params, outline, mode, accepted result)
  params/
    schema.ts            sliders as data (UI generated from it)
    outline.ts           Outline type, constraints, polar<->xy, serialize
    presets.ts           preset outlines (+ presets.generated.ts from the fit script)
    core.ts              LOCKED hardware dims (TBD placeholders)
  geometry/              NO DOM, NO scene code
    quadSphere.ts        welded cube-sphere cage topology (N=6, 216 quads), built once
    profile.ts           outline -> R(phi) table (periodic monotone Hermite on radius vs angle)
    shapeMap.ts          cage verts -> body (outline + inflate profile + plateau), `inset` arg for the inner shell
    catmullClark.ts      cached stencils per level, position-only update per frame
    mesh.ts              QuadMesh helpers, triangulate, welded closure check
    features.ts          eyes, puck seat, loop placement
    solids.ts            Accept pipeline (manifold-3d)
    kernel.ts            thin interface over manifold so it is swappable/testable
  checks/                fit.ts, wall.ts, nook.ts      (no DOM)
  spec/                  spec.ts, materials.ts         (no DOM)
  io/                    exportObj.ts, exportStl.ts, exportSpec.ts, share.ts, importObj.ts
  scene/                 scene.ts, materials.ts, exploded.ts, referenceGhost.ts
  ui/                    outlineEditor.ts (SVG), panel.ts, presets.ts, toolbar.ts, specCard.ts, toast.ts
  styles.css
scripts/
  extractReference.mjs   charmerv1.obj -> reference/charmer-body.obj (body only, welded) + reference/charmer-meta.json
  fitReference.ts        silhouette + depth profile of the reference -> presets.generated.ts
reference/               charmer-body.obj, charmer-meta.json   (original 14.6 MB file NOT committed)
tests/                   vitest, headless
```

Import rule (enforced by a test that greps imports): `geometry/ checks/ spec/ params/ io/` never use `document`, `window`, or three scene/controls/renderer imports. They may use three's data classes (`BufferGeometry`, `Vector3`) where needed (three-mesh-bvh).

Units: **mm, 1 three unit = 1 mm.** Front is +Z, up is +Y, body stands on y = 0.

## 4. Shape model (replaces HANDOFF section 6.2)

**Outline (reliable by construction).** The outline is stored in **polar form** around the puck center `C = (0, puckCenterY * height)`. It is 12 control points `(phi_i, R_i)`: 7 on the right half from bottom (-90 deg) to top (+90 deg), mirrored to the left. The two on the axis only move in radius. Because the outline is a single-valued function `R(phi)`, it can never self-intersect or fold.
- `R(phi)` is a **periodic cubic Hermite spline with Fritsch-Carlson monotone tangent limiting**. No overshoot, so no bulges or dips between points.
- Hard constraints, enforced when dragging and when loading presets or share links: `R_i >= R_min = puckRadius + clearance + wall + margin`. Angle gap between neighbors >= 8 deg. `R_i <= R_max`. This is the "hold the hardware constraint" story: points cannot enter the puck keep-out circle.
- Star-shaped limit: every outline point must be visible from `C`. This covers the ghost and abstract blobby shapes such as blobs, stars, clouds and drops. Deep C-shaped notches are out of scope for v0.

**Inflate.** For each unit-sphere cage vertex `p`: `phi = atan2(py, px)`, `rho = hypot(px, py)`.
- In-plane: `xy = C + rho * R(phi) * (cos phi, sin phi)`. Then shift so the lowest point is at y = 0.
- Depth: superellipse pillow `z = side * (depth/2) * (1 - rho^n)^(1/n)`, `n` from `backFlat` on the back (`n` up to about 4) and from `belly` on the front. This gives soft edges all around.
- **Plateau:** blend the front toward a flat plane inside a disc of radius `puckRadius + wall`, so the puck opening cuts a flat seat instead of a steep curve. Every constant sits at the top of `shapeMap.ts`.
- Clamp for safety: no NaN, minimum radius, minimum edge length.
- `inset` argument shrinks `R` by `wall` and depth by `2*wall` to build the inner shell (more robust than a normal offset, which self-intersects at thin parts). The measured wall check reports the true minimum.

## 5. Reliability strategy (the real work)

1. **Invariants, tested headless in Node (vitest).** For every preset and for 1,000+ random in-range parameter and outline combinations: no NaN; welded and closed (every edge shared by exactly 2 faces); Euler characteristic 2; no flipped faces (all signed volumes positive, outward normals); no near-zero-area faces; manifold-3d accepts the level-3 triangulated mesh and `volume() > 0`.
2. **Never mutate the live state with something unvalidated.** Compute the candidate; validate; swap in only if valid. Otherwise keep the last valid state and show a toast (never a console error spiral).
3. **Fixed topology.** Index buffers are built once per level. A slider tick only updates positions and normals.
4. **Drag at level 2, release at level 3.** Checks and manifold only on release (debounced 150 ms), never during drag.
5. **Accept is isolated.** Any failure in a step leaves Explore untouched and names the failing step in the toast. Eyes on Accept are separate meshes (no boolean) by default, because ellipsoid-minus-smooth-mesh booleans are the most fragile step. Boolean-inset eyes is a stretch goal behind a try/catch.
6. **WASM hygiene.** One `withManifold()` helper tracks and `.delete()`s every Manifold, so repeated Accepts do not leak.
7. **Demo runs from the production build** (`npm run build && npx vite preview`), offline, no CDN, no HMR. Backup screen recording made at M7.
8. **`npm run verify`** = typecheck + vitest (invariants and sweep) + build. Run before every milestone commit.

## 6. Milestones

Estimates assume one focused agent; the cumulative column shows when each cut line lands. **At any cut line, stop and stabilize if time runs out.** Freeze new features about 3 hours before the demo.

| # | Milestone | Est. | Exit criteria (all must pass before the commit) |
|---|---|---|---|
| M0 | **Setup and reference** | 0.5 h | Vite + TS strict + three + manifold-3d + three-mesh-bvh + vitest. `npm run dev` shows an empty lit scene on `#F6F6F4`. `scripts/extractReference.mjs` writes `reference/charmer-body.obj` + `charmer-meta.json` (bbox, eye ratios). `.claude/launch.json` for the preview. Initial commit includes `docs/`. |
| M1 | **Core geometry** | 1.5 h | quadSphere, profile, shapeMap, catmullClark (cached stencils). Cage and smooth meshes render with the cage/smooth/both toggle. Unit tests: cube x4 subdivision vertex count and closure, welded closure, no NaN. Hard-coded outline already reads as a Charmer. |
| M2 | **Outline editor + UI** | 1.5 h | SVG editor: 12 points, mirror, keep-out circle, reference-ghost toggle, clamped drags. Slider panel generated from schema. Preset chips with 300 ms animation. Share link in URL hash. `fitReference.ts` produces the Ghost outline from charmerv1; Ghost reads as the original Charmer. 60 fps drag. **Cut line A.** |
| M3 | **Features** | 0.7 h | Eyes (ratio-based defaults from the reference), puck preview with warm emissive ring, loop/nook torus, color swatches, soft contact shadow. |
| M4 | **Checks** | 0.7 h | Puck fit, wall thickness (with heatmap), nook, as pills. Red when width 35 / depth 18 style extremes break fit. Accept stays allowed when red. **Cut line B.** |
| M5 | **Accept** | 1.3 h | Manifold pipeline: hollow, puck seat, magnet pockets, notch, nook and loop hole, split into front and back shell. Exploded view with CSS2D labels, assembled/exploded toggle, spec card. Under 2 s. Failure keeps Explore intact. |
| M6 | **Export** | 0.5 h | Cage OBJ (quads), smooth OBJ, STL per shell, spec JSON, share-link round trip. Self-verify: re-import the cage OBJ with our own `importObj.ts` and assert quads-only, closed, outward normals, vertex count matches the cage. **Cut line C.** |
| M7 | **Polish and demo** | 1.0 h | Loading and empty states, camera moves, README checklist updated, `docs/DEMO.md` script (preset tour, drag an outline point into trouble, fix it, Accept, exploded view, spec card, export cage, Rhino talking point), backup screen recording, `npm run verify` green. |

Cumulative: A about 3.5 h, B about 5 h, C about 7 h, full about 7.7 h.

## 7. Acceptance criteria for v0 (from HANDOFF section 12, adapted)

- [ ] Every slider min to max, every preset, and 1,000 random outlines produce a valid closed mesh, no console errors.
- [ ] Dragging an outline point or a slider holds 60 fps on a recent MacBook (level 2 while dragging).
- [ ] Outline points cannot be dragged into the puck keep-out zone.
- [ ] Cage toggle clearly shows the low-poly quad cage over the smooth shell.
- [ ] Ghost preset (fitted from charmerv1) reads as the original Charmer.
- [ ] Checks turn red when the body is too small for the puck.
- [ ] Accept under 2 s; front shell, back shell, puck and magnets shown exploded with labels.
- [ ] Spec card weight for a PC ghost shell lands roughly in the 8 to 20 g range (re-check after the scale policy; report honestly if not).
- [ ] Cage OBJ passes our own re-import checks; Rhino `ToSubD` marked **unverified** in the UI and the demo script.
- [ ] Share link round trip restores the exact identity.
- [ ] A failure in Accept never breaks Explore mode.
- [ ] Geometry layers contain no DOM or scene imports (enforced by test).

## 8. Risks and fallbacks

| Risk | Mitigation / fallback |
|---|---|
| manifold-3d fails to load under Vite | `optimizeDeps.exclude`; test early in M0; Accept is cut line C, so A and B survive. |
| Thin legs make the inner shell or wall check fail | Wall check reports red but still allows Accept; manifold failure falls back to a toast and last valid state. |
| Reference scale wrong | Single `REFERENCE_SCALE` plus `core.ts`; changing either re-flows everything. |
| Catmull-Clark too slow at level 3 | Level 3 only on release; stencil cache; fall back to level 2 for display if a frame exceeds budget. |
| Rhino round trip unverified | Our own re-import test; honest wording in UI and demo. |
| Time runs short | Stop at the nearest cut line; polish and demo script take priority over the next feature. |
| Eyes boolean fragile | Eyes stay separate meshes in v0. |

## 9. Assumptions (change here if wrong)

- `REFERENCE_SCALE = 1.78`, so belly width is about 42 mm (puck about 60% of body width).
- Depth slider range 16 to 42 mm.
- Puck diameter 25.4 mm (1 inch), depth 8, clearance 0.3, magnets 2 x 6x2 at 16 mm spacing, notch 3 x 1.5, loop hole 4 with 3 boss. All TBD.
- Accent `#5B6CFF`; Inter or system sans, 12 to 13 px UI text; no gradients or heavy shadows on UI.
- Target: Chrome on macOS at 1440 x 900.

## 10. Changes from HANDOFF

1. Lobe sliders replaced by the polar outline editor (sections 1 and 4).
2. Shape defined by `R(phi)` from the outline instead of the lobe formula; depth profile gets a plateau.
3. Body reference is the user's charmerv1 body (closed quad mesh), used for the ghost overlay and to fit the Ghost preset.
4. Depth range widened; eye defaults are ratios.
5. Eyes are separate meshes on Accept (no boolean) in v0.
6. Rhino round trip is called "unverified" until tested.

## 11. Definition of done

- Small labeled commits per milestone, `npm run verify` green on each.
- `npm run dev` runs it; `npm run build` produces a static `dist/` that works offline.
- `docs/README.md` checklist and this file's checkboxes reflect what shipped.
- `docs/DEMO.md` with a 3 to 5 minute script; backup screen recording saved.

## 12. Progress checklist

- [x] M0 Setup and reference
- [x] M1 Core geometry
- [x] M2 Outline editor + UI (cut line A)
- [x] M3 Features
- [x] M4 Checks (cut line B)
- [x] M5 Accept
- [x] M6 Export (cut line C)
- [~] M7 Polish and demo (DEMO.md, README, ADRs done; backup recording and Rhino test are Hazel's)

## 13. Log

- 2026-11-05: Plan written. Reference OBJ inspected (findings in section 2). Nothing built yet.
- 2026-11-05: Puck default set to 1 inch (25.4 mm); `REFERENCE_SCALE` 1.94 -> 1.78. Presets are generic abstract starters, not Grokbot copies.
- 2026-11-05: Built M0 to M6 end to end. 18 tests green (invariants, 1000-case sweep, Accept on every preset, STL, share link, OBJ round trip, architecture rule). Production build verified in a browser: Accept 0.5 to 0.6 s, drag frame time about 8 ms median. Found and fixed: wall check silently passing (inner geometry index bug) and now fails when unmeasurable; loop turned black in heatmap (own material); setPointerCapture made fail-safe.
- 2026-11-05: Not done / not verifiable here: backup screen recording, Rhino ToSubD round trip, real core dims, boolean-inset eyes (ADR 0007).
