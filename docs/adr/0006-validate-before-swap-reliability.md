# 0006: Validate before swap; never break Explore
Status: accepted (2026-11-05)

## Context
Live screen-share demo. A slider must never crash the app or show a broken mesh.

## Decision
Every geometry update computes a candidate, validates it (finite, positive volume), and only then replaces the live state; otherwise the last valid state stays and a toast appears. Fixed topology per level; checks and booleans run on release (debounced 150 ms). Accept is isolated (try/catch per step). A vitest sweep covers every preset and 1000 random outline/parameter combinations. The demo runs from the offline production build.

## Consequences
- Slight extra cost per update (finite check), negligible.
- Failures are visible as toasts, not silent.
