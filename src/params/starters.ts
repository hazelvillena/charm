import { Outline, makeOutline } from './outline';
import { Params, defaultParams } from './schema';
import { Look } from '../../design/finishes';

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

export const STARTERS: Starter[] = [
  // flat base, round top: nothing else in the library has a straight edge on the bottom
  { name: 'Arch', outline: polar((p) => { const flat = 18 / Math.max(1e-3, Math.abs(sinc(p))), k = 2.2, below = p < 0 ? -k * Math.log(Math.exp(-flat / k) + Math.exp(-30 / k)) : 30 - 3 * sinc(p) ** 2; return below; }, 11), params: { depth: 30, belly: 0.5, backFlat: 0.7, eyeHeight: 0.7 }, look: { color: '#F3EEE3', finish: 'matte' } },
  { name: 'Seed', outline: polar((p) => 20 + 13 * Math.abs(sinc(p)) ** 1.6, 9), params: { depth: 26, belly: 0.4, backFlat: 0.4, eyeHeight: 0.7 }, look: { color: '#A9C4F5', finish: 'gloss' } },
  { name: 'Trefoil', outline: polar((p) => 27 + 6.5 * Math.cos(3 * (p - 90 * D)), 9), params: { depth: 28, belly: 0.5, backFlat: 0.3, eyeHeight: 0.6 }, look: { color: '#BFE8D2', finish: 'gloss' } },
  { name: 'Clover', outline: polar((p) => 26 + 5 * Math.cos(4 * p), 9), params: { depth: 27, belly: 0.5, backFlat: 0.3, eyeHeight: 0.6 }, look: { color: '#F6C1B5', finish: 'gloss' } },
  { name: 'Gem', outline: polar((p) => 27.5 + 2.2 * Math.cos(6 * p), 11), params: { depth: 30, belly: 0.5, backFlat: 0.5, eyeHeight: 0.62 }, look: { color: '#F4D35E', finish: 'matte' } },
  { name: 'Pillow', outline: polar((p) => 23.5 / (Math.abs(Math.cos(p)) ** 4 + Math.abs(Math.sin(p)) ** 4) ** 0.25, 9), params: { depth: 31, belly: 0.5, backFlat: 0.8, eyeHeight: 0.64 }, look: { color: '#F3EEE3', finish: 'matte' } },
  { name: 'Sprout', outline: polar((p) => 23.5 + 11 * bump(p, 90, 0.38) + 1.5 * sinc(p), 9), params: { depth: 29, belly: 0.45, backFlat: 0.4, eyeHeight: 0.5 }, look: { color: '#2B2D3A', finish: 'gloss' } },
  { name: 'Peanut', outline: polar((p) => 23.5 + 6.5 * Math.cos(2 * p), 9), params: { depth: 26, belly: 0.5, backFlat: 0.5, eyeHeight: 0.62 }, look: { color: '#E4E6EA', finish: 'gloss' } },
];

export const starterParams = (s: Starter): Params => ({ ...defaultParams(), ...s.params } as Params);
