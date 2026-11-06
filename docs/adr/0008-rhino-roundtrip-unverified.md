# 0008: Rhino round trip is stated as unverified
Status: accepted (2026-11-05)

## Context
Rhino is not available on the demo machine, so cage OBJ -> `ToSubD` has not been tested.

## Decision
The cage OBJ follows the standard quad OBJ format and is verified by our own re-import test (quads only, closed, outward normals, vertex count). UI and demo wording: "designed to open as SubD in Rhino, round trip not yet verified". Class-A and production claims are never made.

## Consequences
- Honest framing for technical reviewers. Verify in Rhino as soon as access exists, then supersede this ADR.
