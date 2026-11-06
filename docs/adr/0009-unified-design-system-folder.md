# 0009: One design-system folder, tokens-only app styling
Status: accepted (2026-11-05)

## Context
UI styles were scattered in one app stylesheet with raw colors and sizes, sliders looked dated, and materials/colors were hard-coded in scene code. The tool is meant to be reused and extended.

## Decision
Create `design/` as the single source: `tokens.css` (color, type, shape, space, elevation, motion, layout), `components.css` (`ui-` components), `finishes.ts` (material finishes + palette), `brand.ts` (name + organic SubD brand mark), `styleguide.html` (living reference) and a README with rules. App CSS may only use `var(--token)`; scene materials read finishes as data.

## Consequences
- Re-theming or adding a finish touches one place.
- The product is named **Clayground**; the brand mark is an organic SubD blob (cage lines, highlight, eyes), not a plain circle.
- `design/` is included in typecheck and the production build (styleguide page ships with the app).
