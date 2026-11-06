# 0015: Library with global vs per-iteration parameters
Status: accepted (2026-11-05)

## Context
Designers iterate on shapes and want to compare them, and to see every iteration react when hardware or manufacturing settings change.

## Decision
A Library (grid icon next to the presets) stores saved iterations with a thumbnail, name, estimated weight and check status. **Per-iteration:** outline, side profile, body, face, nook, look (color and finish). **Global:** Core params, wall, material and split line. Changing a global parameter re-evaluates and re-renders every saved iteration (private thumbnail renderer, headless checks, debounced and chunked). The iteration name is editable on the stage and saved with it. Data persists in `localStorage` (guarded; the app works without it).

## Consequences
- Loading an iteration keeps the current globals, so it always reflects today's hardware.
- A thumbnail refresh costs about 50 ms per iteration, so very large libraries refresh progressively.
