# Charmer Lab: Engineering Handoff

Read this whole file before writing code. Then read `docs/README.md` for the short version of the plan.

---

## 1. What we are building

A browser tool where a small team live tweaks the **identity** of a Charmer (a small character shell that holds an AI puck), then hits **Accept** to generate a **coherent, buildable casing** around a fixed hardware core.

Core idea: **identity varies, the hardware interface does not.** Every form the sliders produce must still fit the puck, magnets, notch and attachment nook, and the tool must show live when it doesn't.

### Product context
- Charmers: a collectible charm with a coin-sized AI core you pop off and wear. Shells are interchangeable character bodies.
- Reference silhouettes: soft abstract characters (blob, 6-bump star, hex, drop with a top point, 4-point star, 4-bump cloud, rounded triangle) and the original "ghost" Charmer: pear body, two dot eyes, round puck on the belly, three soft legs at the bottom, loop on top.
- Look: glossy, soft, subD character. Not mechanical.

### Who uses it
- Demo audience: technical design reviewers. They know NURBS, class-A surfacing and hardware. Do not overclaim. This is a concept and prefabrication tool, not class-A output.
- Real users after the demo: the founders and teammates brainstorming shapes together.

### Deadline
- **v0 must run reliably for a live screen-share demo on Nov 6, 2026.**
- Reliability beats features. A slider must never crash the app or produce a broken mesh. If an operation fails, keep the last valid state and show a message.

---

## 2. Pipeline (and how to talk about it)

1. **Parameters** drive a low-poly **quad control cage**.
2. The cage is smoothed live with **Catmull-Clark subdivision** in the browser. Toggle **cage / smooth** (like pressing Tab in Rhino SubD).
3. **Accept** freezes the identity and builds solids: hollow shell, puck cavity, magnet pockets, attachment nook, split into front and back shells.
4. Show an **exploded view** and a **spec card**.
5. **Export**: cage OBJ (quads, opens in Rhino as SubD), smooth mesh OBJ and STL, spec JSON.
6. Downstream, outside this app: Rhino `ToSubD` then `ToNURBS`, then STEP. Class-A surfacing is a separate stage.

---

## 3. Tech stack (decided)

| Need | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript (strict) | fast dev, easy static deploy |
| 3D | three.js | display, materials, exporters |
| Subdivision | **our own Catmull-Clark** on a quad half-edge or face-list mesh | we need the cage as data for export; Loop subdivision libraries are triangle-only |
| Solids / booleans / volume | **manifold-3d** (WASM) | robust booleans, `volume()`, plane split/trim |
| Ray queries (wall thickness, inside tests) | **three-mesh-bvh** | fast raycasts on the smooth mesh |
| Labels in exploded view | three `CSS2DRenderer` | crisp HTML labels |
| UI | plain DOM + CSS, generated from the param schema | no framework, no lil-gui look |
| Tweening | small custom lerp or `@tweenjs/tween.js` | exploded view animation |

Do not add React or a state library for v0. Keep modules framework-free so the geometry core can be reused (Node, workers, Rhino.Compute bridge later).

Units: **millimeters everywhere.** 1 three.js unit = 1 mm.

### Vite note for manifold-3d
manifold-3d ships WASM. Init it once, async, before Accept is enabled:
```ts
import Module from 'manifold-3d';
const wasm = await Module(); wasm.setup();
```
If Vite pre-bundling breaks it, add `optimizeDeps: { exclude: ['manifold-3d'] }`.

---

## 4. Repo structure

```
charm/
  docs/
    README.md          short plan + checklist
    HANDOFF.md         this file
  src/
    main.ts            boot: scene, ui, store, wiring
    store.ts           single source of truth: params, mode, accepted result
    params/
      schema.ts        typed param definitions (ranges, defaults, groups, units)
      presets.ts       ghost, blob, star, cloud (+ more later)
      core.ts          locked hardware dims (puck, magnets, notch, loop)
    geometry/
      quadSphere.ts    base cage topology (all quads)
      shapeMap.ts      maps base cage vertices to the character shape from params
      catmullClark.ts  subdivision on quad mesh, n levels
      mesh.ts          QuadMesh type + helpers (to BufferGeometry, normals)
      features.ts      eyes, puck seat, loop placement on the surface
      solids.ts        Accept pipeline with manifold: hollow, cut, split
    checks/
      fit.ts           puck fit
      wall.ts          wall thickness sampling + heatmap colors
      nook.ts          material around attachment
    spec/
      spec.ts          dims, volume, weight, min wall, cage stats
      materials.ts     densities
    io/
      exportObj.ts     cage OBJ (quads), smooth OBJ
      exportStl.ts     shells STL (binary)
      exportSpec.ts    spec JSON
      share.ts         params <-> URL hash
    scene/
      scene.ts         renderer, camera, controls, environment
      materials.ts     glossy shell, puck, cage wireframe, heatmap
      exploded.ts      exploded view layout + animation + labels
    ui/
      panel.ts         param groups generated from schema
      presets.ts       preset chips
      toolbar.ts       view toggles, accept, export
      specCard.ts      right-side spec card
      toast.ts         errors and warnings
    styles.css
  index.html
  package.json
  tsconfig.json
  vite.config.ts
```

Rule: `geometry/`, `checks/`, `spec/`, `params/` must not import three.js scene or DOM code. They may use plain math types (or three's `Vector3` only). This keeps the core reusable and testable.

---

## 5. Parameters

All params live in `params/schema.ts` as data. The UI is generated from this.

```ts
export type ParamDef = {
  id: string; label: string; group: GroupId;
  kind: 'range' | 'int' | 'enum';
  min?: number; max?: number; step?: number;
  options?: string[];
  default: number | string;
  unit?: 'mm' | '' | 'deg';
  hint?: string;
};
```

### Group 1: Silhouette (front view, XY plane)
| id | label | kind | min | max | default | unit | meaning |
|---|---|---|---|---|---|---|---|
| height | Height | range | 45 | 75 | 58 | mm | overall Y |
| width | Width | range | 35 | 65 | 46 | mm | overall X |
| taper | Taper | range | -1 | 1 | 0.35 | | + wider at bottom (pear), - wider at top |
| lobeCount | Lobes | int | 0 | 6 | 3 | | number of bumps or legs |
| lobeAmp | Lobe depth | range | 0 | 0.45 | 0.18 | | radial amplitude as fraction of radius |
| lobeSharp | Lobe sharpness | range | 0 | 1 | 0.3 | | 0 soft cosine bumps, 1 pointed |
| lobeArc | Lobe spread | range | 60 | 360 | 120 | deg | arc the lobes occupy. 360 = all around (star, cloud). 120 centered at bottom = legs |
| lobeRotate | Lobe rotation | range | -180 | 180 | 0 | deg | rotate the lobe arc; 180 puts it on top |
| tip | Top point | range | 0 | 1 | 0 | | pulls the top into a point (drop shape) |

### Group 2: Body volume (depth, Z)
| id | label | min | max | default | unit |
|---|---|---|---|---|---|
| depth | Depth | 18 | 30 | 22 | mm |
| belly | Belly bulge | 0 | 1 | 0.5 | |
| backFlat | Back flatness | 0 | 1 | 0.6 | |

### Group 3: Head and face
| id | label | kind | min | max | default | unit |
|---|---|---|---|---|---|---|
| headRound | Head roundness | range | 0 | 1 | 0.6 | |
| eyeSize | Eye size | range | 1.5 | 5 | 2.6 | mm |
| eyeSpacing | Eye spacing | range | 4 | 16 | 8 | mm |
| eyeHeight | Eye height | range | 0.55 | 0.9 | 0.74 | | fraction of height from bottom |
| eyeType | Eye type | enum | | | inset | | inset, raised, flush |

### Group 4: Core interface (LOCKED, shown read-only with a lock icon)
In `params/core.ts`. All values are **placeholders until real dims arrive**. Keep them in one object so they are trivial to update.
```ts
export const CORE = {
  puckDiameter: 28,   // TBD
  puckDepth: 8,       // TBD
  puckClearance: 0.3, // radial, TBD
  puckCenterY: 0.38,  // fraction of height from bottom, adjustable later
  magnet: { diameter: 6, thickness: 2, count: 2, spacing: 16 }, // TBD
  notch: { width: 3, depth: 1.5 },   // TBD, at bottom of puck seat for fingernail release
  loop: { holeWidth: 3, holeLength: 7, boss: 2.2 } // TBD (a rounded thread slot)
};
```

### Group 5: Attachment
| id | label | kind | default |
|---|---|---|---|
| nookPos | Nook position | enum | top (top, top-left, top-right) |

### Group 6: Manufacturing
| id | label | kind | min | max | default | unit |
|---|---|---|---|---|---|---|
| wall | Wall thickness | range | 1.2 | 2.5 | 1.6 | mm |
| splitZ | Split line | range | -0.5 | 0.5 | 0 | | fraction of depth, 0 = middle |
| material | Material | enum | | | PC | | PC, ABS, Silicone, Zinc |

Densities (g/cm3) in `spec/materials.ts`: PC 1.20, ABS 1.04, Silicone 1.10, Zinc (die cast) 6.6.

### Presets (`params/presets.ts`)
Partial param objects merged over defaults.
- **Ghost** (the original Charmer): lobeCount 3, lobeArc 120, lobeRotate 0, lobeAmp 0.2, taper 0.35, tip 0
- **Blob**: lobeCount 0, taper 0.1, width 50, height 50
- **Star**: lobeCount 6, lobeArc 360, lobeAmp 0.22, lobeSharp 0.35, width 54, height 54, taper 0
- **Cloud**: lobeCount 4, lobeArc 360, lobeAmp 0.12, lobeSharp 0, taper 0
- Later: **Drop** (tip 0.8, lobeCount 0), **Pebble Tri** (lobeCount 3, lobeArc 360, lobeRotate 180)

Switching presets should **animate** params over ~300 ms (lerp numeric params), which looks great in the demo.

---

## 6. Geometry: how the shape is made

### 6.1 Base cage topology: quad sphere
Start from a cube, each face subdivided into `N x N` quads (start with N = 6, so 24 quads around the equator, 216 quads total). Normalize each vertex to the unit sphere. Result: all quads, no poles, watertight, 8 valence-3 vertices. Build it once; only positions change with params.

Store as:
```ts
type QuadMesh = { positions: Float32Array; faces: Uint32Array /* 4 per face */ };
```
Weld shared cube edge vertices so the mesh is a closed manifold.

Orient the cube so the puck lands near the **center of the front face (+Z)**. That puts a regular quad grid where the puck seat goes.

### 6.2 Shape mapping (`shapeMap.ts`)
For each unit-sphere vertex `p = (px, py, pz)`:

1. Front-view angle `phi = atan2(py, px)`. In-plane magnitude `rho = sqrt(px^2 + py^2)`.
2. Silhouette radius `R(phi)`:
   - Base ellipse: radii `a = width/2`, `b = height/2`.
   - Lobes: `L(phi) = 1 + lobeAmp * lobeWave(phi)`.
     - `lobeWave`: map `phi` into the lobe arc (centered at `-90deg + lobeRotate`, i.e. bottom by default). Outside the arc, wave = 0 with a smooth falloff (smoothstep over ~15 deg). Inside, `w = cos(lobeCount * t * PI)` style wave over the arc, then sharpen: `sign(w) * |w|^(1 - 0.8*lobeSharp)`. Keep only positive bumps for legs (`max(w,0)` blended) so legs stick out rather than notch in.
     - lobeCount 0 means `L = 1`.
   - Taper: multiply x by `1 + taper * (-y_norm) * 0.5` where `y_norm` in [-1, 1] (wider at bottom when taper > 0).
   - Tip: near the top (`phi` close to 90deg), pull radius outward and narrow x: `R *= 1 + tip * 0.35 * bump(phi, 90deg, 25deg)`.
   - Head roundness: blend the top half between ellipse and superellipse exponent (`n = 2 + 2*(1 - headRound)`) for a flatter or rounder crown.
3. In-plane position: `x = rho * R_x(phi) * cos(phi)`, `y = rho * R_y(phi) * sin(phi)`. Recenter so the bottom of the body is at y = 0 (the character stands on its legs).
4. Depth (Z):
   - Front (`pz > 0`): `z = pz * depth/2 * (1 + 0.25*belly)`, with extra belly bulge weighted toward the puck center Y.
   - Back (`pz < 0`): superellipse flattening: `z = -depth/2 * |pz|^(1 / (1 + 3*backFlat))`. Higher backFlat gives a flatter back that sits against a bag.
5. Clamp: no NaNs, no zero-area faces. If R < 3 mm anywhere, clamp.

This is a starting formula. Tune by eye against the reference silhouettes. Keep every tunable constant at the top of `shapeMap.ts`.

### 6.3 Catmull-Clark (`catmullClark.ts`)
- Input: closed quad mesh. Output: quad mesh. Implement standard face points, edge points, vertex points.
- Levels: **2 while dragging, 3 on release and for Accept.**
- Precompute topology tables per level once (they don't change); only recompute positions each frame. This is the key performance trick: build index arrays for face, edge and vertex point stencils at startup, then each slider tick is just weighted sums.
- Unit test: a cube subdivided 4 times should approach a rounded cube, vertex count = expected formula, mesh stays closed (every edge shared by exactly 2 faces).

### 6.4 Features on the surface (`features.ts`)
For v0, eyes and the puck are separate meshes placed on the smooth surface, not cage edits.
- **Surface query**: raycast from the front (`-Z` direction) at a given (x, y) onto the smooth mesh using three-mesh-bvh. Returns point + normal.
- **Eyes**: two small ellipsoids (aspect 1 : 1.35 vertical) at `(±eyeSpacing/2, eyeHeight*height)`, oriented to the surface normal.
  - inset: sunk 40% into the surface, dark glossy material.
  - raised: sit 30% proud.
  - flush: dark disk decal-like, 5% proud.
- **Puck preview**: a cylinder (puckDiameter, puckDepth) seated at `puckCenterY`, aligned to the surface normal, front face slightly proud, with an emissive ring (warm white) to match the renders.
- **Loop / nook**: small torus at the top surface point (or offset for top-left/right), aligned to the normal.

### 6.5 Accept pipeline (`solids.ts`, manifold-3d)
Run on Accept. Show a short "Building casing" state. Target < 1.5 s.

1. Outer solid: level-3 smooth mesh, triangulated, to `Manifold`.
2. Inner solid: **regenerate the shape with params shrunk by the wall**: `width - 2*wall`, `height - 2*wall`, `depth - 2*wall`, lobeAmp slightly reduced. This is more robust than a normal offset, which self-intersects at sharp lobes. Check the result with the wall check (section 7). If manifold rejects it, fall back to the outer only and warn.
3. Shell = outer minus inner.
4. Puck seat: subtract a cylinder of `puckDiameter + 2*clearance`, depth `puckDepth`, at the puck position along the surface normal. Leave `wall` of material behind it.
5. Magnets: subtract `count` pockets behind the puck seat, `spacing` apart horizontally.
6. Notch: subtract a small box at the bottom edge of the puck seat.
7. Nook: union a boss at the top, then subtract the loop hole through it (front to back).
8. Split: cut with plane `z = splitZ * depth` into **front shell** and **back shell** (`trimByPlane` twice, or `splitByPlane`).
9. Eyes: inset type subtracts small ellipsoids from the front shell; raised unions them.
10. Compute volumes with `manifold.volume()` (mm3).

If any step throws, catch it, keep previous valid result, show the step name in a toast.

---

## 7. Live checks (`checks/`)

Run on slider release (not every drag frame), debounced 150 ms. Show results as pills in the toolbar: green ok, red fail with the number.

- **Puck fit** (`fit.ts`): sample 24 points on the puck seat rim (diameter + 2*clearance + 2*wall) and the seat floor depth. Each must be inside the outer mesh (BVH point-in-mesh by ray parity, or raycast along -normal). Also check body depth at puck center >= puckDepth + wall. Fail message: "Puck needs 3.2 mm more width" style.
- **Wall thickness** (`wall.ts`): sample ~600 outer vertices, cast ray along the inward normal, distance to inner mesh. Report min. Optional **heatmap** view: vertex colors from red (< wall * 0.8) to the shell color (>= wall). This visually links to the bend-angle heatmaps in the Flux project.
- **Nook** (`nook.ts`): material around loop hole >= `CORE.loop.boss`. Check local thickness at the nook point front to back >= holeDiameter + 2*boss.

Invalid states: the shell tint shifts slightly red and the Accept button shows a warning, but **Accept is still allowed** (design reviews need to see failures too). The spec card lists failing checks.

---

## 8. Spec card (`spec/spec.ts`)

Shown on the right after Accept. Also exported as JSON.
- Name: preset name + short hash of params (e.g. `Ghost-3f9a`)
- Overall dims W x H x D (mm), from bounding box
- Outer volume, shell volume (cm3)
- Weight estimate (g) = shell volume x density for chosen material
- Wall thickness: target and measured min
- Split line Z
- Core: puck diameter, depth, clearance; magnets; notch; loop
- Checks: puck fit, wall, nook (pass/fail)
- Cage: vertex and face count; subdivision level
- Params snapshot

---

## 9. Views and UI

### Layout (desktop, 1440 wide is the demo size)
- **Left panel (320 px)**: param groups, collapsible, Silhouette open by default. Core group read-only with lock icon.
- **Top center**: preset chips (Ghost, Blob, Star, Cloud).
- **Center**: viewport.
- **Bottom toolbar**: view toggles (Smooth / Cage / Both, Heatmap), check pills, **Accept** button, Export menu.
- **Right panel (300 px)**: spec card, appears after Accept, slides in.

### Modes
- **Explore** (default): live sliders, smooth shell, eyes, puck preview, loop.
- **Accepted**: sliders dim (an "Edit" button returns to Explore). Viewport animates to an **exploded view**: back shell, magnets, puck, front shell spaced along Z, camera orbits to a 3/4 view. Labels via CSS2D: "Front shell", "Back shell", "AI core", "Magnets", "Loop". Toggle "Assembled / Exploded".

### Rendering
- Background: near-white `#F6F6F4`, soft contact shadow under the character.
- Shell material: `MeshPhysicalMaterial`, clearcoat 1, roughness 0.25, color from a small palette (lavender `#C9C3F2`, sky `#A9C4F5`, butter `#F4D35E`, blush `#F6C1B5`, cream `#F3EEE3`, chrome via metalness 1). Add a color swatch row in the panel (not a param, a view option).
- Environment: three `RoomEnvironment` through PMREM for nice reflections.
- Cage view: dark thin wireframe + small vertex dots, drawn over a 30% opacity shell.
- Camera: perspective, fov 30, orbit controls, damping on, initial 3/4 front view.

### Style
Match the portfolio: white space, black text, one blue accent `#3D5AFE`-ish periwinkle (tune to taste), small labels in boxes with thin borders, dashed outlines for grouped areas, Inter or system sans, 12 to 13 px UI text. No heavy shadows, no gradients on UI.

---

## 10. Import and export (`io/`)

- **Cage OBJ**: write `v` lines and `f a b c d` quads (1-indexed). Must open in Rhino, then `ToSubD` gives the same smooth shape. **Test this round trip before the demo.**
- **Smooth OBJ**: level-3 mesh with normals.
- **Shells STL**: binary STL, one file per part (front, back) or a zip. Use three's `STLExporter` on meshes built from manifold output.
- **Spec JSON**: the spec card data.
- **Share link**: serialize params to the URL hash (`#p=` base64 JSON). Loading a URL restores the identity. Cheap and very useful for teammates.
- **Import (later)**: quad OBJ cage as the starting cage (skip shape mapping, allow scaling); dense meshes only as a gray reference ghost.

---

## 11. Milestones, in priority order

Time estimates assume one focused agent. **Stop and stabilize at any cut line if time runs out.**

1. **Setup** (20 min): Vite + TS + three + manifold-3d + three-mesh-bvh. Scene, orbit, environment, background. Commit.
2. **Cage + subdivision** (60 min): quad sphere, Catmull-Clark with cached stencils, shape mapping with silhouette + volume params. Cage / smooth toggle.
3. **UI from schema** (40 min): panel, sliders, presets with animated transitions. Debounce nothing during drag; geometry must keep up at level 2.
   **Cut line A: this alone is a working demo.**
4. **Features** (40 min): eyes, puck preview with glow ring, loop.
5. **Checks** (40 min): puck fit + wall thickness pills, heatmap toggle.
   **Cut line B.**
6. **Accept** (60 min): manifold pipeline, split, exploded view with labels, spec card.
7. **Export** (30 min): cage OBJ, STL, spec JSON, share link.
   **Cut line C: full v0.**
8. **Polish** (as time allows): color swatches, camera moves, loading states, empty states.

---

## 12. Acceptance criteria for v0

- [ ] Every slider from min to max, and every preset, produces a valid closed mesh with no console errors.
- [ ] Dragging any slider stays at 60 fps on a recent MacBook (level 2 while dragging).
- [ ] Cage toggle clearly shows the low-poly quad cage over the smooth shell.
- [ ] Ghost preset reads clearly as the original Charmer.
- [ ] Checks turn red when the body is too small for the puck (test: width 35, depth 18).
- [ ] Accept completes in under 2 s and shows front shell, back shell, puck, magnets exploded with labels.
- [ ] Spec card numbers are plausible (weight of a PC ghost shell should land roughly in the 8 to 20 g range).
- [ ] Cage OBJ opens in Rhino and `ToSubD` matches the browser shape.
- [ ] Share link round trip restores the exact identity.
- [ ] A failure in Accept never breaks Explore mode.

---

## 13. Gotchas

- Keep topology fixed per subdivision level; never rebuild index buffers during drag. Update the position attribute and call `computeVertexNormals()` (or compute normals from the limit surface if time allows).
- Quad sphere seams: weld duplicate vertices on cube edges or Catmull-Clark will tear.
- Shape mapping near `phi` discontinuity (`atan2` wraps at ±180): make lobe functions periodic so there is no visible seam.
- manifold-3d needs strictly manifold, non self-intersecting input. Validate before converting; on failure, show a toast, not a crash.
- three-mesh-bvh: rebuild or `refit()` the BVH after geometry updates before raycasting.
- Don't run checks or manifold during drag. Only on release.
- Do not claim class-A or production readiness anywhere in the UI. Use words like "concept casing" and "prefab preview".
- Placeholder core dims are labeled TBD in the UI so nobody mistakes them for real hardware.

---

## 14. Open questions (owner: Hazel)

1. Real dims: puck diameter and depth, clearance, magnet size and positions, notch size, loop hole.
2. Puck position on the body: fixed belly center, or a locked-but-adjustable Y?
3. Should legs be cage features (extruded quads, more Rhino-like) in a later version, instead of lobes in the silhouette function?
4. Accent color for the tool UI.

---

## 15. Definition of done for the agent

- Code committed in small, labeled commits per milestone.
- `npm run dev` starts it; `npm run build` produces a static `dist/` deployable anywhere.
- `docs/README.md` checklist updated to reflect what shipped.
- A short `docs/DEMO.md` with the 3 to 5 minute demo script: preset tour, slider to an extreme to show a failing check, fix it, Accept, exploded view, spec card, export cage, mention the Rhino round trip.
