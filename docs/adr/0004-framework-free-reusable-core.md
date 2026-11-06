# 0004: Framework-free core, DOM/scene-free geometry layers
Status: accepted (2026-11-05)

## Context
Priority 3 is reuse: the geometry stack must survive past the demo (workers, Node, Rhino.Compute bridge, other shape experiments).

## Decision
Vite + TypeScript (strict), plain DOM, no React/state library. `params/ geometry/ checks/ spec/ io/` never touch `document`, `window` or three scene/controls/renderer code (a test enforces it). They may use three data classes (`BufferGeometry`, `Vector3`) and three-mesh-bvh.

## Consequences
- Geometry, checks and Accept run headless under vitest (including the 1000-case sweep).
- UI is replaceable without touching the core.
