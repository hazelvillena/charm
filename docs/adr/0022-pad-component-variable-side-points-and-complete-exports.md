# 0022 · One Pad component, editable side points, a plain sanity check, complete exports

Status: accepted · 2026-11-06

## Context
The two drawing pads were separate hand-built editors with hardcoded styling, the side profile had a fixed 7 points, the check list read as more technical than the tool is, library cards turned red together, and exports carried only the body or the shells (no Core, magnets or eyes).

## Decision
- **Pad** (`src/ui/pad.ts`, `design/pad.css`, `--pad-*` tokens): one reusable canvas element (stage, zoom and pan, top bar above the drawing, corner tools, bottom overlay, interactive points with a wide hit target and a clear selected ring). The front outline and the side profile are both built on it, so a new canvas needs no new styling.
- **Side profile points are editable**: each side has 4 to 10 points at any height (`addSidePoint`, `removeSidePoint`, `removeSidePointAuto`; profiles with different counts blend by resampling). The side curve is always smooth; the smoothness slider is gone from the side pad.
- **One expand control** on the Canvas section, drag handles for the dock width and the height split, and a revert on each pad that returns to how the iteration was when loaded or last saved.
- **Sanity check, in plain words**: Core fit, Wall, Moldable, and Loop when there is one. Magnet hold and Curve radius are no longer in the list (placeholder rule and rule of thumb); the curvature layer remains. Each row has an i with a short, non-technical explanation of how it is measured. The library only calls out a shared cause once, instead of turning every card red.
- **Every export carries the whole assembly.** `buildCasing` also returns the Core, magnets and eyes as closed solids. STEP holds shells, Core, magnets and eyes as separate bodies; STL adds a core-and-parts file; both OBJ files add eyes, Core and magnets as separate objects. STL and STEP prepare the preview on demand.
- Turntable: a slow camera orbit toggle next to the eye.

## Consequences
Library favourites start as Charmer, Star, Triangle, Drop, Clover; "Ghost" is renamed Charmer (the see-through view mode keeps its name). Stored items migrate (library version 10).
