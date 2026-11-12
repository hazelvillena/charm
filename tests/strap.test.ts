import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { PRESETS, presetParams } from '../src/params/presets';
import { STARTERS, starterParams } from '../src/params/starters';
import { clampOutline } from '../src/params/outline';
import { buildCasing } from '../src/geometry/solids';
import { castSurface } from '../src/geometry/features';
import { buildAll } from './helpers';
import { getManifold } from '../src/geometry/kernel';
import { meshHealth } from '../src/geometry/meshHealth';
import { CORE } from '../src/params/core';

type Item = { name: string; outline: any; params: any };
const items: Item[] = [...PRESETS.map((p) => ({ name: p.name, outline: p.outline, params: presetParams(p) })), ...STARTERS.map((s) => ({ name: s.name, outline: s.outline, params: starterParams(s) }))];

/** area (mm2) of back-shell triangles near the strap that face up toward the seam: in the print (seam face down) those are the ceilings that need support */
function ceilingArea(m: { positions: Float32Array; tris: Uint32Array }, yc: number): number {
  let A = 0; const P = m.positions, T = m.tris;
  for (let t = 0; t < T.length; t += 3) {
    const v = [0, 1, 2].map((k) => [P[T[t + k] * 3], P[T[t + k] * 3 + 1], P[T[t + k] * 3 + 2]]);
    const cx = (v[0][0] + v[1][0] + v[2][0]) / 3, cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
    if (Math.abs(cx) > 12 || Math.abs(cy - yc) > 9) continue;
    const a = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], b = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = Math.hypot(n[0], n[1], n[2]) || 1;
    if (n[2] / len > 0.707) A += len / 2; // normal within 45 degrees of facing the seam
  }
  return A;
}
function planeArea(m: { positions: Float32Array; tris: Uint32Array }, z: number, tol = 0.02): number {
  let A = 0; const P = m.positions, T = m.tris;
  for (let t = 0; t < T.length; t += 3) {
    const v = [0, 1, 2].map((k) => [P[T[t + k] * 3], P[T[t + k] * 3 + 1], P[T[t + k] * 3 + 2]]);
    if (v.every((p) => Math.abs(p[2] - z) < tol)) { const a = [v[1][0] - v[0][0], v[1][1] - v[0][1]], b = [v[2][0] - v[0][0], v[2][1] - v[0][1]]; A += Math.abs(a[0] * b[1] - a[1] * b[0]) / 2; }
  }
  return A;
}

describe('the two strap holes, on every shape', () => {
  for (const it0 of items) it(`${it0.name}: placed on a back that faces back, a cord passes through both holes inside the shell, nothing extra to support`, async () => {
    const S = CORE.strap, api = await getManifold(), M = api.Manifold;
    const a = buildAll(clampOutline(it0.outline, it0.params.wall), it0.params, 3), st = a.place.strap;
    expect(st, 'the holes fit').not.toBeNull();
    // 1. each hole sits on a stretch of back that faces (nearly) straight back: a vertical cut is a clean hole, not a slanted slot
    for (const x of [-S.spacing / 2, S.spacing / 2]) for (const [dx, dy] of [[0, 0], [S.openingWidth / 2, 0], [-S.openingWidth / 2, 0], [0, S.openingHeight / 2], [0, -S.openingHeight / 2]]) {
      const h = castSurface(a.og.bvh, a.og.g, new Vector3(x + dx, st!.yc + dy, -300), new Vector3(0, 0, 1))!;
      expect(-h.normal.z, `back faces back at (${(x + dx).toFixed(1)}, ${(st!.yc + dy).toFixed(1)})`).toBeGreaterThanOrEqual(Math.cos((S.maxTiltDeg * Math.PI) / 180) - 1e-6);
    }
    // 2. the finished shell: holes through the back wall; a cord (2.6 mm) goes down into one, across the hollow and out the other, touching neither shell
    const casing = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params: it0.params, place: a.place, print: false });
    const printed = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params: it0.params, place: a.place, print: true }); // the print shells too: the rim band and the lap are in the cord's way if the holes are close to the seam
    const mk = (m: any) => new api.Manifold(new api.Mesh({ numProp: 3, vertProperties: m.positions.slice(), triVerts: m.tris.slice() }));
    const back = mk(printed.back), front = mk(printed.front), r = Math.min(S.openingHeight / 2 - 0.3, 1.3), zc = st!.zTop + 0.3;
    const cyl = (len: number, at: [number, number, number], rot: [number, number, number]) => M.cylinder(len, r, r, 24, true).rotate(rot).translate(at);
    const cord = M.union([cyl(400, [-S.spacing / 2, st!.yc, zc - 200], [0, 0, 0]), cyl(400, [S.spacing / 2, st!.yc, zc - 200], [0, 0, 0]), cyl(S.spacing, [0, st!.yc, zc], [0, 90, 0])]);
    expect(back.intersect(cord).volume(), 'the cord passes the back shell').toBeLessThan(0.5);
    expect(front.intersect(cord).volume(), 'and the front shell').toBeLessThan(0.5);
    expect(zc, 'the cord runs below the seam, inside the hollow').toBeLessThan(casing.splitOffset - 3);
    // 3. nothing else was added: no channel, no column, no bridge. The back shell has no more up-facing ceiling near the strap than the same shell without holes
    const without = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params: it0.params, place: { ...a.place, strap: null }, print: false });
    expect(ceilingArea(casing.back, st!.yc) - ceilingArea(without.back, st!.yc), 'no new overhang for the holes').toBeLessThanOrEqual(2);
    expect(without.backVolume - casing.backVolume, 'the holes only remove material').toBeGreaterThan(0);
    // 4. the print set: both shells seam face down on the plate (flat), watertight
    const [fr, bk] = printed.print!.parts.map((x) => x.mesh);
    for (const x of printed.print!.parts) expect(meshHealth(x.mesh), `${it0.name} ${x.name}`).toEqual({ open: 0, flipped: 0 });
    expect(planeArea(bk, 0), 'the back shell lies on its seam ring, a real flat').toBeGreaterThan(200);
    expect(planeArea(fr, 0), 'and so does the front shell (its lap, the first thing printed)').toBeGreaterThan(30);
  }, 120000);
});
