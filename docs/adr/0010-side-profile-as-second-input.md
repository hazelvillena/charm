# 0010: Side profile is a second input; the puck plateau stays flat
Status: accepted (2026-11-05)

## Context
The outline only describes the front view. Measuring `charmerv1` showed the model is perfectly left/right symmetric (so mirroring is faithful) but strongly front/back asymmetric: a rounded back bulge at about 40% height and a forward-leaning head. Our first fit captured only depth/belly/back flatness, so that character was lost (back was within 7.7 mm of the model at worst). Feet tips were also about 5% soft from cage smoothing.

## Decision
Add a **side profile**: 7 multipliers each for back and front extent at evenly spaced heights, edited in a side-view editor and stored in `Params.side`. The Ghost values are fitted from the reference by `tests/fitSide.test.ts` (`FIT_SIDE=1`) using the real engine (worst error 2.4 mm, back within about 0.5 mm over most heights). The front around the puck is excluded from the fit and held **flat by design** (puck seat), blending into the side profile over 12 mm. The inner shell insets extra in z on steep slopes so walls stay near target. Outline peaks get a small sharpening (`TIP_SHARPEN`) to counter Catmull-Clark shrink (feet within 0.4 mm of the model).

## Consequences
- The Ghost reads much closer to the original; the front below the puck is intentionally fuller than the model.
- A new editable input (side profile) shares the same share link, presets and animation as the other params.
- Wall check stays honest: Ghost min wall 1.45 mm vs 1.6 target.
