# 0007: Eyes are separate meshes, not booleans
Status: accepted (2026-11-05)

## Context
HANDOFF subtracts/unions eye ellipsoids on the front shell in Accept. That is the most fragile boolean (tiny features against a smooth mesh) and the reference eyes are tiny.

## Decision
Eyes stay separate dark glossy meshes placed by raycast, in Explore and after Accept. Boolean-inset eyes is a stretch goal behind try/catch.

## Consequences
- Accept is more reliable. STL shells do not contain eye recesses (noted in the spec card).
