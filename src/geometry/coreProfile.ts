import { CORE } from '../params/core';

/** how square the Core's top shoulder is: 2 is an ellipse, higher is a fuller, flatter dome with a tighter edge */
const DOME_N = 2.4;

/** the shoulder height where the straight wall ends, and the extra height up to the top of the dome */
function shoulder() {
  const R = CORE.puckDiameter / 2, t = CORE.puckDepth, er = Math.min(CORE.edgeRadius, R - 0.5, t - 0.5);
  return { R, t, y0: t / 2 - er, H: er + CORE.domeHeight };
}

/**
 * Lathe profile (radius, height) of the Core, centered on its mid-plane: flat underside with a small chamfer,
 * a straight wall, then ONE continuous domed top (a superellipse): vertical where it leaves the wall, level at the
 * centre, with no plateau, no step and no dip in between. The edge radius and dome height set how tall that top is.
 */
export function coreProfile(segments = 36): [number, number][] {
  const { R, t, y0, H } = shoulder();
  const pts: [number, number][] = [[0, -t / 2], [R - 0.4, -t / 2], [R, -t / 2 + 0.4], [R, y0]];
  for (let i = 1; i <= segments; i++) {
    const a = (i / segments) * Math.PI / 2;
    pts.push([R * Math.pow(Math.cos(a), 2 / DOME_N), y0 + H * Math.pow(Math.sin(a), 2 / DOME_N)]);
  }
  return pts;
}

/** height of the Core's top surface above its flat mid-plane top (t / 2) at radius r; the apex is the dome height */
export function domeAt(r: number): number {
  const { R, t, y0, H } = shoulder();
  const q = Math.min(1, Math.max(0, r / R));
  return y0 + H * Math.pow(1 - Math.pow(q, DOME_N), 1 / DOME_N) - t / 2;
}
