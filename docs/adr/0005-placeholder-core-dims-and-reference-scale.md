# 0005: Placeholder core dims (1 inch puck) and reference scale
Status: accepted (2026-11-05)

## Context
Real puck, magnet, notch and loop dimensions are unknown. `charmerv1.obj` is 23.75 x 35.34 x 20.10 in file units, too small for a 1 inch puck, so its scale is unknown.

## Decision
All hardware values live in `params/core.ts`, labeled TBD in the UI. Puck default 25.4 mm. `REFERENCE_SCALE = 1.78` makes the reference belly about 42 mm wide so the puck covers about 60% of it. Depth range widened to 10 to 42 mm. Eye defaults are ratio-based from the reference.

## Consequences
- Updating real dims = editing one object; every shape re-checks.
- Weight and fit numbers are plausible, not authoritative. The UI never claims production readiness.
