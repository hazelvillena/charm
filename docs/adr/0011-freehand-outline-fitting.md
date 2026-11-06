# 0011: Freehand drawing fits into the same editable outline
Status: accepted (2026-11-05)

## Context
Designers want to sketch a silhouette instead of dragging points, but the rest of the system (checks, presets, share links, cage) is built on the 7-point mirrored polar outline (ADR 0001).

## Decision
A Draw mode captures a freehand stroke and `fitOutlineFromStroke` (pure, in `params/fitOutline.ts`) converts it to the same outline: outermost stroke radius per angle (star-shaped from the puck), gap fill, light smoothing, mirror-symmetrize, greedy choice of 7 angles that minimizes worst deviation, clamp to the puck keep-out. The stroke is first shown for **review** next to the fitted outline, with a fidelity versus smoothing slider (like a pen tool's smoothing) before **Generate**. Strokes that do not go around the core are rejected with a message. The editor shows a spinner for a short fixed beat (the fit itself is instant) so the hand-off reads as a deliberate step.

## Consequences
- Drawing produces the same global parameters as manual edits; nothing downstream changes.
- Concave details are not representable (star-shaped limit, ADR 0001). The reported fit error is shown to the user.
