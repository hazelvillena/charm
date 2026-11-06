# 0012: The Core is a global, shaped module; magnets sit behind a thin floor
Status: accepted (2026-11-05)

## Context
The AI puck was a flat cylinder with exposed magnet pockets. Hazel wants it to be a smooth, rounded, pillowed object whose curvature carries into the casing, and asked that the core-in-case concept be credible with magnets (like big-tech magnetic attachments).

## Decision
- Rename **AI core / puck** to **Core** in the UI and diagram.
- The Core has editable, **global** params (shared by every iteration): diameter, thickness, dome height, edge radius, magnet gap. `CORE` is a mutable object with clamped `setCore()`; everything reads it at call time.
- Shape: a lathe profile with a flat underside, rounded top edge and a quartic **dome tangent to the top plane** (`geometry/coreProfile.ts`). The casing front rises around the seat by a fraction of the dome height (`CORE_LIFT`) so the curvature carries over.
- Magnets (N/S keyed pair) press in **from the back** and are sealed behind a thin plastic floor (`magnet.gap`, default 1.0 mm), retained by the back shell. A **Magnet gap** check enforces a 1.2 mm rule of thumb because hold weakens quickly with distance.
- The attachment model follows two references: MagSafe-style centered, flush magnets near the contact surface; and the Humane AI Pin two-piece idea (a keeper on the other side of the fabric) as the future wearable story.

## Consequences
- Changing the Core re-checks every shape and re-renders every library thumbnail.
- The magnet gap rule is a heuristic; real retention needs bench data (TBD). The check is labeled accordingly.
