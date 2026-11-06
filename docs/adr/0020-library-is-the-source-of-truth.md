# 0020: The library is the source of truth; stars drive the top pill; Save; expandable sketch dock
Status: accepted (2026-11-05)

## Context
Presets were hard-coded chips separate from the library, so the pill at the top and the library disagreed, and edits had no obvious way to be kept. The two drawing pads were small, and the side pad did not follow the body.

## Decision
- **One list:** the built-in presets are real library items (starred on first run, with the 8 starter shapes unstarred). The pill at the top shows exactly the **starred** library items; **unstar** from a library card to remove one from the pill without deleting it. Anything in the pill is in the library by construction. Returning users get the presets added once (storage version 2) without touching their own items.
- **Save:** editing a loaded or new iteration marks it edited and shows a quiet **Save** control next to its name (a small dot and text, never a filled button), plus "as new" for loaded items. Global changes (core, wall, material, split) do not count as edits.
- **Sketch dock:** an expand icon on either drawing pad moves both pads (front outline on top, side profile below) into the left half of the canvas next to the 3D view; the side panels step aside to make room. Both pads show the finished body's real silhouette over the control curve and update live, so editing either one updates the other parametrically.
- **Copy and scope:** helper text is cut to a few words; checks are written in plain designer language (core fit, magnet hold, wall, mold release, curve radius, loop); the redundant wall-thickness map, the static core list, the spec/blurb text, and the shell-volume and split tiles are removed for the iteration stage. "Manufacturing" is now **Shell**.
- Eyes are kept clear of the core: they slide up above the core's clearance zone, or are hidden if the body is too small.

## Consequences
- Presets are editable and deletable like any iteration (Revert restores a loaded iteration's saved state).
- The spec JSON is no longer in the export list (the formats are cage OBJ, smooth OBJ, STL and STEP).
