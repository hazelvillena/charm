# Demo script (3 to 5 minutes)

Run from the **production build, offline**, so nothing depends on the network or hot reload:

```bash
npm run build && npm run preview     # open http://127.0.0.1:4173
```
Window about 1440 x 900. Chrome. Close other tabs. Start from a fresh load (Ghost preset).
Make a **backup screen recording** first (QuickTime: Cmd+Shift+5) running this exact script.

## Story in one line
"Identity varies, the hardware interface does not." A parametric system that holds real hardware constraints while the form changes, then bridges design to engineering.

## Beats
1. **Open on the Ghost** (about 20 s). "This is the original Charmer, fitted from my own model." Tick **Show original Charmer** to overlay the reference in 2D and 3D, then untick. Say what the tool is: a concept casing and prefab preview, not class-A.
2. **Preset tour** (20 s). Click Blob, Star, Cloud, Drop. Shapes animate; same locked puck. "Same hardware, different identity."
3. **Draw the outline** (40 s). Drag a couple of outline points on the 2D editor: a longer leg, a pointier head. Point out the puck keep-out circle: drag toward it and the point stops. "The hardware constraint is built into the input."
4. **Cage vs smooth** (20 s). Toggle Cage / Both. "Low-poly quad cage, Catmull-Clark SubD live in the browser, like Tab in Rhino."
5. **Break it on purpose** (40 s). Drop **Depth** to the minimum. The Puck fit pill goes red with the exact reason ("Depth behind the puck is 10.0 mm, needs 12.8 mm") and the wall pill follows. Turn on **Wall heatmap** to show thin areas. Raise Depth back to green.
6. **Accept** (40 s). Click Accept. Hollow front and back shells build in about half a second (manifold-3d). Exploded view: back shell, magnets, AI core, front shell, loop, with labels. Orbit the camera. Toggle Assemble / Explode.
7. **Spec card** (30 s). Dimensions, volumes, weight for the material (about 15 to 17 g PC), measured wall vs target, split line, core dims (labeled TBD placeholders), check results.
8. **Export and Rhino** (30 s). Export > Cage OBJ (quads). "Designed to open in Rhino as SubD, then ToNURBS and STEP for engineering. I haven't verified that round trip yet." Also STL shells, spec JSON, and **Share link** (restores this exact identity).

## If something goes wrong
- A bad edit never breaks the app: it keeps the last valid shape and shows a toast.
- If Accept fails, the toast names the step and Explore is untouched. Adjust the shape and retry.
- Reload with the share link to restore a known-good identity. Fall back to the backup recording if the machine misbehaves.

## Honest framing (say it before they ask)
- Core dimensions are placeholders (1 inch puck). Real dims drop into one file.
- Outlines are star-shaped from the puck center (no deep C-notches) so every shape is valid by construction.
- Eyes are separate parts, not cut into the shells. Class-A surfacing is a separate stage.
