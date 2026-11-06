# Clayground design system

One folder, one source of truth. The app (`src/`) and this folder's styleguide both consume the same files.

```
design/
  tokens.css        colors, type, radii, space, elevation, motion, layout widths
  components.css    ui- components (card, slider field, segmented, button, chip, pill, stat, kv, swatch, spinner, toast, float)
  finishes.ts       materials (density + plausible finishes), finishes, color palette, default look (data only)
  brand.ts          brand name and the organic SubD brand mark (SVG)
  styleguide.html   living reference, open at /design/styleguide.html in dev
```

## Principles
1. **Quiet and precise.** White surfaces, hairline borders, one accent (periwinkle). The 3D object is the color.
2. **Inputs left, outputs right.** Everything you change lives in the left column; everything that reacts lives in the right column and on the stage.
3. **Honest states.** Red means a hardware constraint failed and says why. Placeholder values are tagged `TBD`. Nothing is hidden behind a clipped control: layouts collapse into drawers before they overflow.
4. **Soft, organic shapes.** Round radii, a blob brand mark, no heavy shadows or gradients in UI chrome.

## Rules
- **Terse copy.** A few words per control, no explanatory sentences under controls. Save is a quiet text control, never a filled button.
- **Messages are plain text, never boxed chips or pills.** Helper notes are muted inline text (`.ui-tag-note`); status messages are a floating caption with a soft halo (`.ui-toast`); problems are text in the status color with a dot. No dashed or bordered message boxes.
- **No monospace typeface anywhere.** Numbers use tabular figures of the sans face (`font-variant-numeric: tabular-nums`).
- **No raw hex, px radii or durations in app CSS.** Use `var(--token)`. If a value is missing, add a token here first.
- App layout lives in `src/styles.css`; reusable component styling lives in `components.css` (class prefix `ui-`).
- Material looks are data in `finishes.ts`; the scene reads them via `src/scene/materials.ts`. To add a finish, add one object there.
- The accent can be re-themed by editing `--accent`, `--accent-ink`, `--accent-soft`, `--accent-ring` only.

## Tokens (summary)
| Group | Tokens |
|---|---|
| Surface | `--canvas`, `--surface`, `--surface-2` |
| Ink | `--ink`, `--ink-2`, `--ink-3` |
| Lines | `--line`, `--line-strong` |
| Accent | `--accent`, `--accent-ink`, `--accent-soft`, `--accent-ring` |
| Status | `--ok`, `--bad`, `--warn`, `--heat-hot`, `--heat-mid` |
| Type | `--font-sans` (the only typeface), `--t-xs` 11, `--t-sm` 12, `--t-md` 13, `--t-lg` 15, `--t-xl` 22, `--t-num` 26 |
| Shape | `--r-xs` 6, `--r-sm` 8, `--r-md` 12, `--r-lg` 16, `--r-pill` |
| Space | `--s-1` 4 … `--s-5` 24 |
| Motion | `--ease`, `--dur-1` 120ms, `--dur-2` 220ms, `--dur-3` 420ms |
| Layout | `--col-inputs`, `--col-outputs` (320px) |

## Responsive behavior
- Wide (>= 1180 px): inputs | stage | outputs.
- Medium (700 to 1179 px): inputs docked, outputs becomes a drawer opened from the stage.
- Narrow (< 700 px): both are drawers. No control is ever clipped off-screen.

## Components in the app
Both side panels collapse at every width (icons at the top of the canvas and inside each panel).
Inputs: Shape (edit / draw), Side profile, Body, Face, Attachment, Shell, Material, Core. The two drawing pads expand into the left half of the canvas. Outputs: metric tiles, checks, casing, export. Stage: preset chips + library, name, view modes, Analyze menu, split line, leader-line diagram tags in the exploded view.

## Legacy list
Inputs column (`src/ui/panel.ts`, `outlineEditor.ts`, `sideEditor.ts`), outputs column (`outputs.ts`), stage controls (`toolbar.ts`), toasts (`toast.ts`).

## Containers and motion
- Every section in a column is its own container (`.ui-card` for collapsible ones, `.ui-group` for fixed ones): one border, `--r-md`. Controls inside containers use `--r-sm`.
- Things roll out, they do not pop: cards animate height (`::details-content`), `.ui-roll-x` rolls content sideways (the eye menu), `.ui-pop` fades and rises, and the side columns animate their width. All use `--dur-3` and `--ease`; reduced motion turns them off.

## Spacing
One rhythm inside every container: `--s-4` inset on all sides, `--s-4` between fields, `6px` between a label and its control, `--s-3` between containers. Section headers use `--s-3` / `--s-4` padding. Nothing may touch a container edge (swatch rings and focus outlines included; collapsing sections keep an 8px clip margin).

## Canvas (drawing pad)
`src/ui/pad.ts` + `design/pad.css` are the one canvas element. Strokes, points, the hit target and the selected ring come from the `--pad-*` tokens; the top bar (points, delete) sits above the drawing, tools (revert, zoom, fit) at its right, and modal controls in the bottom overlay. Build any new canvas on `Pad`; do not style SVG by hand.

## Icons and unroll
- **Icons** come from one set, Lucide (`src/ui/icons.ts`, `icon('eye', 18)`): same grid and stroke everywhere. Do not hand-draw icons. Turntable is `rotate-3d`.
- **Unroll** (`unroll()` in `src/ui/dom.ts`, `.ui-unroll` in components.css): every button that opens a few options (the eye, layers) spins its icon once, fast and smooth, while the options roll out beside it (`side: 'right'`) or below it (`side: 'down'`). It uses `--dur-unroll` and `--ease-unroll`. Dropdowns and popovers use `.ui-pop` instead. Toggle buttons that only flip a state use `.ui-spin-once` / `.ui-spin-live` (the turntable turns slowly while on).

## Poche (section hatching)
`design/poche.ts` holds the one token set for cut faces: paper, a soft slate hatch colour, the ink outline, and per-part angle, spacing (mm) and line width. Change the look of every section there; `src/scene/section.ts` reads only these tokens.

## Dialogs
`src/ui/dialog.ts` + `.ui-scrim` / `.ui-dialog` in components.css: a soft blur over the page and one small card. Esc or a click outside cancels, Enter confirms. Used for Save: replace-or-new for a saved iteration, and name plus "Add to favourites" for a new one.

## Scrollbars
One style, set globally in components.css from `--scroll-*` tokens: 5px, faint grey, rounded, no track, darker on hover. Do not style scrollbars per component.
