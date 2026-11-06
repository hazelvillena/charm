# 0014: Analysis views and designer checks replace the wall heatmap
Status: accepted (2026-11-05)

## Context
The wall heatmap showed almost nothing because the inner shell is generated at a uniform offset, so thickness is uniform by construction. Designers need views that expose what actually goes wrong.

## Decision
- **View modes:** Shaded, Ghost (translucent shell revealing the inner wall, core and magnets), Section (cut open with section lines), Cage.
- **Analyze menu:** Mold draft (uses the split plane as the pull direction; flags undercuts), Curvature (local radius), Zebra stripes (reflection continuity, shader), Wall thickness.
- **Checks:** Core fit, Magnet gap, Wall, Mold draft (undercuts), Tightest radius (>= 1.5 x wall), Loop. All run live and are listed with the reason in the Outputs column.

## Consequences
- Draft near the parting line is zero by definition, so only undercuts fail; low draft is reported as information.
- Radius and draft rules are common DFM rules of thumb (vendor guidance varies); confirm with the molder before tooling.
