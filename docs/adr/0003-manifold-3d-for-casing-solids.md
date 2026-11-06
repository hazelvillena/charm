# 0003: manifold-3d for hollow, cuts and split
Status: accepted (2026-11-05)

## Context
Accept must produce buildable shells: hollow, puck seat, magnet pockets, notch, loop, split. Mesh booleans are often unreliable; non-manifold output breaks slicers.

## Decision
Use `manifold-3d` (WASM) for all solid operations. The inner solid is **regenerated from the shrunk shape** (outline and depth reduced by the wall), not a normal offset, which self-intersects on thin parts. Every Manifold is tracked and `.delete()`d by one helper.

## Consequences
- Output is guaranteed manifold; invalid input yields an error status we catch.
- Booleans run only on Accept (never during drag).
- STL loses topology on re-import; STL is for printing, OBJ and spec JSON are the sources of truth.
- OpenCascade.js is the later path for real B-rep/STEP in-browser.
