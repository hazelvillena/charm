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

## Consequences
- The outline is still one radius per angle around the Core (star-shaped), so a shape that folds back on itself can't be drawn; points that do not go around the Core are rejected.
- The Shuriken's tips are widened from the sketch: a needle-thin tip is thinner than the shell wall (the Wall check) and the lower edge must clear the Core seat. The Tile's Core is centred (the sketch had it off to one side).
- Tests: `tests/asym.test.ts` (halves, points fit, freehand without mirror, watertight print of Blob10/Shuriken/Tile).
