# 0025: Point-by-point drawing, independent halves, free eyes

Date: 2026-11-11. Status: accepted.

## Context
Freehand drawing was fitted into a mirrored 4–11 point outline with heavy smoothing, so what you drew was rarely what you got. The outline could only be mirror-symmetric, so asymmetric shapes (the Shuriken sketch) could not be made. The eyes were positioned relative to the body height with a fixed centre line, so they could not be placed on their own.

## Decision
- **Draw has two ways.** *Points* (default): click to place points; each one becomes an outline control point, so the curve passes through it (an interpolated curve, like Rhino). A live dashed preview shows the outline as you go; drag a point to move it, Backspace removes the last, Generate (or Enter) finishes. *Freehand* stays as the quick sketch.
- **Mirror toggle** (on by default, in Edit and Draw). Off, the outline carries its own `left` half (4–12 points, angles measured mirrored, the two axis points shared with the right half). Editing, adding and deleting points then work on either side. Old outlines, share links and library items have no `left` and behave exactly as before; share links add `lp`/`lr` only when the halves differ.
- **Click-to-add points on the outline**: hovering the outline shows a "+" where a click will add a point. (The stepper still adds/removes automatically, one per side when the halves are independent.)
- **Eyes are free of the Core**: a new `eyeX` (mm, across) and a wider `eyeHeight` range, and the eyes are draggable markers on the outline canvas (the pair moves together). They still keep clear of the Core seat.
- **Starters**: Blob10 (kept from the deployed app, decoded from its share code), Shuriken and Tile (traced from `docs/sketches/shuriken-tile.jpg`, PC white gloss, with the Charmer's inflation: depth, belly, flat back and side profile, so they rock the same way). The library migrates existing users (v14, v15).

- **Tight corners**: up to 24 points per side (was 12) and points may sit 2.5° apart (was 6°), so a tip or small-radius corner can be articulated. Freehand uses up to 18 points at full fidelity.
- **Select several points**: Cmd/Ctrl/Alt-click toggles a point, Cmd/Ctrl/Alt-drag draws a selection box, Cmd/Ctrl+A selects all; dragging any selected point moves them together (spacing and Core clearance still apply), Delete removes them. Works in Edit and in Points draw. (Shift is taken: shift-drag pans the canvas.)

- **Smooth curve** (`outline.curve = 'c2'`): the original curve was only tangent-continuous in polar form, so each point made a small lump with a flatter stretch between ("pillowing"). The smooth curve is a closed cubic spline through the points in the flat front view (chord-length parameter, continuous slope and bend), read off as R(phi) on a 0.25° grid (`src/geometry/smoothRing.ts`); the Smooth slider still blends towards straight segments. New drawings (Points, Freehand) use it; Shuriken and Tile are on it; older outlines carry no flag and keep the original curve exactly (an Edit toggle, "Smooth curve", switches any shape). The bend changes about four times more gradually on a typical shape (`tests/smoothCurve.test.ts`).
- **True Width and Height** (Body volume, in mm): the controls show the built body's real bounding box and resize the outline itself (`resizeOutline`: the control points are scaled, then corrected against the measured size, one axis without moving the other). There is no hidden scale, so the canvas handles, the body and the print always agree; the Core keeps its size and the outline never goes under it. (A first version stored a relative scale per iteration; it left the handles in the unscaled frame, which was confusing, so it was replaced.)
- **Reference outline**: the canvas foot has a Reference picker: none, the original Charmer, this iteration as saved, or any iteration in the library, drawn faintly behind the outline to compare against. The canvas can be dragged taller up to 6000 px (was 720) and zoomed out further.

## Consequences
- The outline is still one radius per angle around the Core (star-shaped), so a shape that folds back on itself can't be drawn; points that do not go around the Core are rejected.
- The Shuriken keeps the sketch's points, rounded to a 3 mm radius: a needle-thin tip is thinner than the shell wall (the Wall check), and the two edges that hugged the Core were pushed out so the seat clears. The Tile's Core is centred (the sketch had it off to one side).
- Tests: `tests/asym.test.ts` (halves, points fit, freehand without mirror, watertight print of Blob10/Shuriken/Tile).
