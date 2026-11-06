# 0021 · One top bar, zoomable pads, checks that point

Status: accepted · 2026-11-05

## Context
Controls floated over the canvas in several places, the drawing pads had no precision tools, side-profile points only moved sideways, and failing checks said what was wrong but not where or what to do.

## Decision
- **Name and skeleton.** The tool is called Clayground. A slim top bar carries only the page title and the permalink. Below it, each space owns its controls: panel collapse icons in the panel headers, library, layers and the pill menu on the canvas.
- **Canvas section.** The front outline and the side profile share one "Canvas" card, both with a smoothness slider (straight … curved) and point selection with delete on the outline. View modes sit behind an eye popover; columns have draggable edges.
- **Pads** (`src/ui/padView.ts`): wheel zoom about the pointer, background-drag pan, corner + / − / fit buttons. Strokes are hairlines (`vector-effect: non-scaling-stroke`) and handles are sized in screen pixels, so points stay small at any zoom. Points count and smoothness sit on the canvas; Revert is a corner icon.
- **Free side points.** `SideProfile` gains optional `backT` / `frontT` (heights of the points). `SideCurve` takes non-uniform knots (Fritsch–Butland slopes, still monotone). Absent = evenly spaced, so old links and library items load unchanged.
- **Core drag.** The Core can be dragged up or down on the outline pad. `recenterOutline` re-expresses the outline around the new Core centre with the same point count and smoothness, and refuses moves that leave no room. The pad view shifts so the shape stays still while the Core moves.
- **Checks point.** `CheckResult` gains `fix` (one line), `at` (a point on the model) and `angleDeg` (on the outline pad). Failing rows show the fix, are clickable, fly the camera there, and ring markers appear on the model and the pad.
- **Library.** Materials are per iteration (only wall and split line are global). Cards show the Core in the thumbnail and `Material · W × H`.
- **Attachment** (loop) is optional and off by default.

## Consequences
Legends and analysis colours use a matte material so they read true. The section view uses hatched poche with ink outlines (`src/scene/section.ts`). Export rows are the formats: OBJ (SubD), OBJ (Mesh), STL, STEP.
