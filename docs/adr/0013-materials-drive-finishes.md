# 0013: Materials drive finishes and weight
Status: accepted (2026-11-05)

## Context
The Material control only changed the density used for weight, so it looked broken, and finishes were offered regardless of what the part could plausibly be made of.

## Decision
Three real materials, each with plausible finishes and a density (data in `design/finishes.ts`): **PC/ABS** (rigid painted shell: Gloss, Pearl, Matte), **Silicone** (soft-touch overmold or translucent: Soft-touch, Frosted), **Metal** (zinc die-cast, plated or satin: Chrome, Satin). Choosing a material hides finishes that do not apply, swaps to a valid one if needed, and drives the shader and the weight estimate. Material is a **global** parameter. The enum controls now repaint their selected state when clicked (this was the actual toggle bug).

## Consequences
- Old share links with `PC/ABS/Zinc` fall back to defaults safely.
- Sources: rigid housings are typically PC, ABS or PC/ABS; TPU/TPE/silicone for soft parts and overmolds; aluminum or zinc for premium metal (vendor guidance, not independently verified).
