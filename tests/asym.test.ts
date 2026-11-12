import { describe, it, expect } from 'vitest';
import { Outline, clampOutline, cloneOutline, isOutlineValid, makeOutline, ringOf, unmirror, mirrorOf } from '../src/params/outline';
import { Profile } from '../src/geometry/profile';
import { outlineFromPoints } from '../src/params/outlinePoints';
import { fitOutlineFromStroke } from '../src/params/fitOutline';
import { insertPoint, removePoint, addPointAuto, removePointAuto, blendOutlines } from '../src/params/outlineEdit';
import { encodeShare, decodeShare } from '../src/io/share';
import { defaultParams } from '../src/params/schema';
import { PRESETS, presetParams } from '../src/params/presets';
import { buildAll } from './helpers';
import { buildCasing } from '../src/geometry/solids';
import { meshHealth } from '../src/geometry/meshHealth';
import { STARTERS, starterParams } from '../src/params/starters';
import { PRINT } from '../src/params/print';

const DEG = Math.PI / 180;
const pol = (deg: number, r: number): [number, number] => [r * Math.cos(deg * DEG), r * Math.sin(deg * DEG)];
/** an asymmetric outline: the left side is fuller than the right */
const lopsided = (): Outline => { const o = unmirror(makeOutline([-90, -45, 0, 45, 90], [26, 30, 32, 34, 28])); o.left!.r = [26, 36, 40, 38, 28]; return o; };

describe('outlines with their own left half', () => {
  it('the two sides really differ, and the axis points are shared', () => {
    const o = clampOutline(lopsided(), 1.6), p = new Profile(o);
    expect(p.radius(0)).toBeCloseTo(32, 0);              // right side at 0 degrees
    expect(p.radius(Math.PI)).toBeCloseTo(40, 0);        // left side at 180 degrees
    expect(p.radius(-Math.PI / 2)).toBeCloseTo(p.radius(-Math.PI / 2 + 1e-6), 3);
    expect(o.left!.r[0]).toBe(o.r[0]); expect(o.left!.r[4]).toBe(o.r[4]);
    expect(isOutlineValid(o)).toBe(true);
    const ring = ringOf(o); expect(ring.a.every((a, i) => i === 0 || a > ring.a[i - 1])).toBe(true);
  });
  it('a mirrored outline is unchanged by unmirror / mirrorOf', () => {
    const m = makeOutline([-90, -50, 0, 50, 90], [25, 30, 31, 30, 27]);
    const u = unmirror(m), p0 = new Profile(m), p1 = new Profile(u);
    for (let d = -180; d <= 180; d += 7) expect(p1.radius(d * DEG)).toBeCloseTo(p0.radius(d * DEG), 6);
    expect(mirrorOf(u).left).toBeUndefined();
  });
  it('share links carry the left half', () => {
    const o = clampOutline(lopsided(), 1.6), d = decodeShare(encodeShare(defaultParams(), o, undefined, 'Lopsided'))!;
    expect(d.outline.left).toBeDefined();
    d.outline.left!.r.forEach((r, i) => expect(r).toBeCloseTo(o.left!.r[i], 2));
    const m = decodeShare(encodeShare(defaultParams(), makeOutline([-90, -45, 0, 45, 90], [26, 30, 32, 34, 28])))!; expect(m.outline.left).toBeUndefined();
  });
  it('points are added and removed on the chosen side only', () => {
    const o = clampOutline(lopsided(), 1.6);
    const a = insertPoint(o, 20 * DEG, 1.6, 'L')!; expect(a.outline.left!.phi.length).toBe(6); expect(a.outline.phi.length).toBe(5);
    const b = insertPoint(o, 20 * DEG, 1.6, 'R')!; expect(b.outline.phi.length).toBe(6); expect(b.outline.left!.phi.length).toBe(5);
    expect(removePoint(a.outline, a.index, 1.6, 'L')!.left!.phi.length).toBe(5);
    expect(addPointAuto(o, 1.6)!.phi.length).toBe(6); expect(addPointAuto(o, 1.6)!.left!.phi.length).toBe(6);
    expect(removePointAuto(addPointAuto(o, 1.6)!, 1.6)!.left!.phi.length).toBe(5);
  });
  it('blends between mirrored and independent outlines', () => {
    const a = makeOutline([-90, -45, 0, 45, 90], [26, 30, 32, 34, 28]), b = clampOutline(lopsided(), 1.6);
    const mid = blendOutlines(a, b, 0.5); expect(isOutlineValid(mid)).toBe(true); expect(mid.left).toBeDefined();
    expect(blendOutlines(a, b, 1).left).toBeDefined();
  });
});

describe('outline from clicked points', () => {
  const ring = (n: number, r: (deg: number) => number): [number, number][] => Array.from({ length: n }, (_, i) => { const d = -170 + (340 * i) / (n - 1); return pol(d, r(d)); });
  it('passes through the clicked points (mirrored: folded onto the right half)', () => {
    const pts = ring(9, (d) => 28 + 6 * Math.cos(2 * d * DEG)), fit = outlineFromPoints(pts, 1.6, true)!;
    expect(fit).not.toBeNull(); expect(fit.outline.left).toBeUndefined(); expect(isOutlineValid(fit.outline)).toBe(true);
    const p = new Profile(fit.outline);
    for (const [x, y] of pts) { const folded = Math.atan2(y, Math.abs(x)); if (Math.abs(Math.abs(folded) - Math.PI / 2) < 8 * DEG) continue; expect(p.radius(Math.atan2(y, x))).toBeCloseTo(Math.hypot(x, y), 0); }
  });
  it('without mirror the two sides follow their own points', () => {
    const pts = ring(11, (d) => (Math.abs(d) > 90 ? 40 : 28)), fit = outlineFromPoints(pts, 1.6, false)!;
    expect(fit.outline.left).toBeDefined();
    const p = new Profile(fit.outline);
    expect(p.radius(0)).toBeLessThan(33); expect(p.radius(Math.PI)).toBeGreaterThan(36);
    expect(isOutlineValid(fit.outline)).toBe(true);
  });
  it('a point straight above the core sets the top axis radius', () => {
    const pts: [number, number][] = [pol(-120, 30), pol(-60, 30), pol(0, 30), pol(60, 30), pol(88, 44), pol(120, 30), pol(180, 30), pol(-180, 30)];
    const fit = clampOutline(outlineFromPoints(pts, 1.6, false)!.outline, 1.6);
    expect(fit.r[fit.r.length - 1]).toBeGreaterThan(40);
  });
  it('rejects points that do not go around the core, and keeps points apart', () => {
    expect(outlineFromPoints([pol(0, 30), pol(30, 30)], 1.6, true)).toBeNull();
    expect(outlineFromPoints([pol(10, 30), pol(20, 30), pol(30, 30), pol(40, 30)], 1.6, false)).toBeNull(); // all on one side
    const crowded = ring(40, () => 30), fit = outlineFromPoints(crowded, 1.6, true)!;
    expect(fit.outline.phi.length).toBeLessThanOrEqual(12); expect(isOutlineValid(fit.outline)).toBe(true);
  });
  it('very small clicks grow to clear the core', () => {
    const fit = outlineFromPoints(ring(8, () => 10), 1.6, false)!;
    expect(fit.grew).toBe(true);
    expect(Math.min(...fit.outline.r)).toBeGreaterThanOrEqual(16);
  });
});

describe('freehand fit without mirror', () => {
  it('keeps a lopsided stroke lopsided', () => {
    const stroke: [number, number][] = Array.from({ length: 200 }, (_, i) => { const d = (i / 200) * 360; return pol(d, d > 90 && d < 270 ? 42 : 28); });
    const sym = fitOutlineFromStroke(stroke, 1.6, { fidelity: 0.9 })!, asym = fitOutlineFromStroke(stroke, 1.6, { fidelity: 0.9, mirror: false })!;
    expect(sym.outline.left).toBeUndefined(); expect(asym.outline.left).toBeDefined();
    const p = new Profile(asym.outline); expect(p.radius(Math.PI)).toBeGreaterThan(38); expect(p.radius(0)).toBeLessThan(32);
    expect(asym.maxErrorMm).toBeLessThan(8); // against the real stroke (the mirrored fit measures itself against its own symmetrised target)
    void sym;
  });
});

describe('an asymmetric shape builds and prints', () => {
  it('builds a watertight print set with the Core fit', async () => {
    const o = clampOutline(lopsided(), 1.6), params = presetParams(PRESETS[0]) as any;
    const a = buildAll(o, params, 3);
    expect(a.info.ok).toBe(true);
    const casing = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params, place: a.place, print: true });
    for (const x of casing.print!.parts) expect(meshHealth(x.mesh), x.name).toEqual({ open: 0, flipped: 0 });
  }, 60000);
  it('cloneOutline copies the left half', () => { const o = lopsided(), c = cloneOutline(o); c.left!.r[1] = 99; expect(o.left!.r[1]).not.toBe(99); });
});

describe('the sketchbook and saved starters print cleanly', () => {
  for (const name of ['Blob10', 'Shuriken', 'Tile']) it(`${name}: watertight print set with the strap tunnel and the snap`, async () => {
    const st = STARTERS.find((x) => x.name === name)!, params = starterParams(st), a = buildAll(clampOutline(st.outline, params.wall), params, 3);
    expect(a.place.strap, 'strap tunnel fits').not.toBeNull();
    const flat = PRINT.snap.depth; PRINT.snap.depth = 0.0001;
    const without = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params, place: a.place, print: true });
    PRINT.snap.depth = flat;
    const casing = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params, place: a.place, print: true });
    for (const x of casing.print!.parts) expect(meshHealth(x.mesh), `${name} ${x.name}`).toEqual({ open: 0, flipped: 0 });
    expect(casing.frontVolume - without.frontVolume, 'a snap bead on the lip').toBeGreaterThan(5);
    expect(without.backVolume - casing.backVolume, 'and its groove').toBeGreaterThan(5);
  }, 90000);
});
