import { Outline, makeOutline } from './outline';
import { Params, defaultParams } from './schema';
import { Look } from '../../design/finishes';
import { decodeShare } from '../io/share';
import { PRESETS, presetParams } from './presets';

/**
 * Starter iterations for a first-time library: smooth, abstract, analytic shapes (every outline is a smooth function of
 * angle, mirrored left to right) that pass all of the live checks with the default core. Per-iteration data only;
 * the library applies the current global core / wall / material / split on top.
 */
export type Starter = { name: string; outline: Outline; params: Partial<Params>; look: Look };

const D = Math.PI / 180;
/** n control points evenly spaced from the bottom (-90) to the top (+90) of a radius function of the angle */
const polar = (fn: (phi: number) => number, n: number, smooth = 1): Outline => {
  const a = Array.from({ length: n }, (_, i) => -90 + (180 * i) / (n - 1));
  return makeOutline(a, a.map((d) => +fn(d * D).toFixed(2)), smooth);
};
const sinc = (phi: number) => Math.sin(phi);
const bump = (phi: number, at: number, w: number) => Math.exp(-(((phi - at * D) / w) ** 2));

/** a saved shape kept forever: the share code of the iteration, decoded into a starter (exactly as it was saved) */
const saved = (code: string): Starter => { const d = decodeShare(code)!; return { name: d.name, outline: d.outline, params: { ...d.params, eyeSize: Math.round(d.params.eyeSize * 10) / 10 }, look: d.look }; }; // (float noise in the code: 2.4000000000000004 is 2.4)
const BLOB10 = 'eyJ2IjoyLCJwIjp7ImRlcHRoIjozMCwiYmVsbHkiOjAuNSwiYmFja0ZsYXQiOjAuNSwiY29yZVBsYXRlYXUiOmZhbHNlLCJwbGF0ZWF1IjowLjgsImV5ZXMiOiJ0d28iLCJleWVTaXplIjoyLjQwMDAwMDAwMDAwMDAwMDQsImV5ZVNwYWNpbmciOjQuNSwiZXllSGVpZ2h0IjowLjY1LCJleWVUeXBlIjoiaW5zZXQiLCJ3YWxsIjoxLjYsInNwbGl0WiI6MCwibWF0ZXJpYWwiOiJQQy9BQlMiLCJzaWRlIjp7ImJhY2siOlswLjMsMS4wOTA0NzM5Nzg0ODc3ODgyLDEuMzgwNDkyNDkyNzgwMzQ2MSwwLjg0NzQ0ODkyNDM1Njk5NjEsMC42NzUyMTE2MDU3MDQ1NTcxXSwiZnJvbnQiOlsxLjEyNTIwMTgzMzg0NDcyMzQsMSwxLDEsMSwxLDEuMjc0OTIzNzA3NjE2NDYxNV0sInNtb290aCI6MSwiYmFja1QiOlswLDAuMDgzOTg2MzY0Mzc2MDYzMiwwLjE3MjkzMjU4NzM0ODk3MjE2LDAuNTc4Njk4MzMzMTk3NDEwOCwxXX19LCJvIjp7InBoaSI6Wy0xLjU3MSwtMC42NzgsLTAuMDczLDAuMzc3LDAuODQzLDEuMTc4LDEuNTcxXSwiciI6WzIxLjA3NSwyMi45MiwyNS43OTEsMjcuNDg3LDI0LjkwMiwyNy45NywyOC4zOTVdLCJzIjoxfSwibCI6eyJjb2xvciI6IiNFNEU2RUEiLCJmaW5pc2giOiJnbG9zcyJ9LCJuIjoiQmxvYjEwIn0';

/** the Charmer's inflation: its depth, belly, flat back and side profile, so a new shape rocks on its back the same way */
const CHARMER = presetParams(PRESETS[0]);
const inflated = { depth: CHARMER.depth, belly: CHARMER.belly, backFlat: CHARMER.backFlat, side: CHARMER.side };
const WHITE: Look = { color: '#F4F5F7', finish: 'gloss' }; // PC, white, gloss

/**
 * Shuriken, traced from a pencil sketch (docs/sketches/shuriken-tile.jpg): a top point, a long right arm, a bottom point and a left corner,
 * not mirrored. The sketch's outline was cast from the Core centre (0.11 mm per sketch pixel), its tips rounded to a 3 mm radius (a needle-thin
 * tip is thinner than the shell wall) and its notches to 3 mm, the two edges that hugged the Core pushed out a little so the seat clears,
 * then fitted with 18 points a side so the tips and corners stay articulated.
 */
const shuriken = (): Outline => {
  const o = makeOutline([-90, -87.5, -77.5, -65, -45, -30, -2.5, 10, 15, 17.5, 20, 27.5, 45, 60, 65, 75, 80, 90],
    [28.4, 27.1, 26, 25.6, 23.4, 24.1, 35.8, 43, 38.6, 32.6, 30.4, 26, 24.3, 29.1, 33.1, 45, 44.6, 39.6]);
  o.left = { phi: [-90, -87.5, -80, -75, -70, -65, -45, -35, -22.5, -10, -2.5, 7.5, 22.5, 30, 50, 77.5, 85, 90].map((d) => d * D),
    r: [28.4, 30.2, 40.4, 39.7, 36.3, 34.5, 30.9, 27, 25.7, 30.4, 38, 40.2, 35.6, 33.4, 31.2, 34.9, 37.4, 39.6] };
  return o;
};
/** Tile, from the same sketch: a rounded square with the Core a little below centre (mirrored; the sketch's Core sat off to one side, centred here) */
const tile = (): Outline => makeOutline([-90, -72, -58, -46, -32, 0, 32, 46, 58, 72, 90], [32.2, 33.9, 36.9, 36.8, 32.8, 27.8, 32.8, 39.4, 42.0, 40.0, 38.0]); // corner radius 13 mm

export const STARTERS: Starter[] = [
  saved(BLOB10), // kept from the deployed app (Blob10): PC/ABS, gloss
  { name: 'Shuriken', outline: shuriken(), params: { ...inflated, eyeHeight: 0.72, eyeSpacing: 4.7 }, look: WHITE },
  { name: 'Tile', outline: tile(), params: { ...inflated, eyes: 'one', eyeHeight: 0.78 }, look: WHITE },
  // flat base, round top: nothing else in the library has a straight edge on the bottom
  { name: 'Arch', outline: polar((p) => { const flat = 21 / Math.max(1e-3, Math.abs(sinc(p))), k = 2.2, below = p < 0 ? -k * Math.log(Math.exp(-flat / k) + Math.exp(-30 / k)) : 30 - 3 * sinc(p) ** 2; return below; }, 11), params: { depth: 30, belly: 0.5, backFlat: 0.7, eyeHeight: 0.7 }, look: { color: '#F3EEE3', finish: 'matte' } },
  { name: 'Seed', outline: polar((p) => 20 + 13 * Math.abs(sinc(p)) ** 1.6, 9), params: { depth: 26, belly: 0.4, backFlat: 0.4, eyeHeight: 0.7 }, look: { color: '#A9C4F5', finish: 'gloss' } },
  { name: 'Trefoil', outline: polar((p) => 27 + 6.5 * Math.cos(3 * (p - 90 * D)), 9), params: { depth: 28, belly: 0.5, backFlat: 0.3, eyeHeight: 0.6 }, look: { color: '#BFE8D2', finish: 'gloss' } },
  { name: 'Clover', outline: polar((p) => 26 + 5 * Math.cos(4 * p), 9), params: { depth: 27, belly: 0.5, backFlat: 0.3, eyeHeight: 0.6 }, look: { color: '#F6C1B5', finish: 'gloss' } },
  { name: 'Gem', outline: polar((p) => 27.5 + 2.2 * Math.cos(6 * p), 11), params: { depth: 30, belly: 0.5, backFlat: 0.5, eyeHeight: 0.62 }, look: { color: '#F4D35E', finish: 'matte' } },
  { name: 'Pillow', outline: polar((p) => 23.5 / (Math.abs(Math.cos(p)) ** 4 + Math.abs(Math.sin(p)) ** 4) ** 0.25, 9), params: { depth: 31, belly: 0.5, backFlat: 0.8, eyeHeight: 0.64 }, look: { color: '#F3EEE3', finish: 'matte' } },
  { name: 'Sprout', outline: polar((p) => 23.5 + 11 * bump(p, 90, 0.38) + 1.5 * sinc(p), 9), params: { depth: 29, belly: 0.45, backFlat: 0.4, eyeHeight: 0.5 }, look: { color: '#2B2D3A', finish: 'gloss' } },
  { name: 'Peanut', outline: polar((p) => 23.5 + 6.5 * Math.cos(2 * p), 9), params: { depth: 26, belly: 0.5, backFlat: 0.5, eyeHeight: 0.62 }, look: { color: '#E4E6EA', finish: 'gloss' } },
];

export const starterParams = (s: Starter): Params => ({ ...defaultParams(), ...s.params } as Params);
