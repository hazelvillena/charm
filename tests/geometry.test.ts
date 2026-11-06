import { describe, it, expect } from 'vitest';
import { buildQuadSphere } from '../src/geometry/quadSphere';
import { Subdivider } from '../src/geometry/catmullClark';
import { closureReport, signedVolume, minFaceArea, allFinite, bounds } from '../src/geometry/mesh';
import { ShapeEngine } from '../src/geometry/engine';
import { Profile } from '../src/geometry/profile';
import { PRESETS, presetParams, GHOST_SILHOUETTE } from '../src/params/presets';
import { clampOutline, makeOutline, Outline } from '../src/params/outline';
import { SCHEMA, defaultParams, Params } from '../src/params/schema';
import { outlineMinRadius } from '../src/params/core';

describe('quad sphere', () => {
  const qs = buildQuadSphere(8);
  it('is a closed welded sphere with outward faces', () => {
    expect(qs.faces.length / 4).toBe(6 * 8 * 8);
    expect(qs.vertCount).toBe(qs.faces.length / 4 + 2);
    const r = closureReport(qs.faces, qs.vertCount);
    expect(r.closed).toBe(true); expect(r.euler).toBe(2);
    expect(signedVolume(qs.unit, qs.faces)).toBeGreaterThan(0);
  });
  it('has a vertex at the center of the +Z face', () => {
    let found = false;
    for (let i = 0; i < qs.vertCount; i++) if (Math.abs(qs.unit[i * 3]) < 1e-6 && Math.abs(qs.unit[i * 3 + 1]) < 1e-6 && qs.unit[i * 3 + 2] > 0.99) found = true;
    expect(found).toBe(true);
  });
});

describe('catmull-clark', () => {
  it('cube x4 -> expected counts, closed, rounder', () => {
    // a plain cube
    const pos = new Float32Array([-1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,-1,1, 1,1,1, -1,1,1]);
    const faces = new Uint32Array([0,3,2,1, 4,5,6,7, 0,1,5,4, 2,3,7,6, 0,4,7,3, 1,2,6,5]);
    expect(signedVolume(pos, faces)).toBeGreaterThan(0);
    const sub = new Subdivider(faces, 8, 4);
    for (let l = 1; l <= 4; l++) {
      const out = sub.evaluate(pos, l);
      const V = sub.vertCount(l), F = sub.faces(l).length / 4;
      expect(F).toBe(6 * 4 ** l);
      expect(V).toBe(F + 2); // closed quad sphere: V = F + 2
      const r = closureReport(sub.faces(l), V);
      expect(r.closed).toBe(true); expect(r.euler).toBe(2);
      expect(allFinite(out.subarray(0, V * 3))).toBe(true);
    }
    const out = sub.evaluate(pos, 4); const V = sub.vertCount(4);
    let maxR = 0; for (let i = 0; i < V; i++) maxR = Math.max(maxR, Math.hypot(out[i*3], out[i*3+1], out[i*3+2]));
    expect(maxR).toBeLessThan(Math.sqrt(3) * 0.95); // corners pulled in (rounded cube)
  });
});

describe('shape engine invariants', () => {
  const eng = new ShapeEngine();
  const cage = new Float32Array(eng.qs.vertCount * 3);
  const check = (o: Outline, p: Params, label: string) => {
    const info = eng.buildCage(o, p, cage);
    expect(info, label).not.toBeNull();
    expect(allFinite(cage), label).toBe(true);
    expect(signedVolume(cage, eng.qs.faces), label).toBeGreaterThan(0);
    expect(minFaceArea(cage, eng.qs.faces), label).toBeGreaterThan(1e-4);
    const L2 = new Float32Array(eng.smoothVertCount(2) * 3);
    eng.smoothInto(cage, 2, L2);
    expect(allFinite(L2), label).toBe(true);
    expect(signedVolume(L2, eng.smoothFaces(2)), label).toBeGreaterThan(0);
    const b = bounds(L2);
    expect(b.min[1], label).toBeGreaterThan(-0.5);
  };
  it('every preset is valid and respects the puck keep-out', () => {
    for (const pr of PRESETS) {
      const p = presetParams(pr);
      const o = clampOutline(pr.outline, p.wall);
      const prof = new Profile(o);
      expect(prof.minRadius().r, pr.id).toBeGreaterThanOrEqual(outlineMinRadius(p.wall) - 0.5);
      check(o, p, pr.id);
    }
  });
  it('Ghost preset tracks the reference silhouette', () => {
    const g = PRESETS[0]; const prof = new Profile(g.outline);
    let worst = 0;
    GHOST_SILHOUETTE.forEach((r, i) => { const deg = -90 + i * 2.5; worst = Math.max(worst, Math.abs(prof.radius(deg * Math.PI / 180) - r)); });
    expect(worst).toBeLessThan(3);
  });
  it('1000 random outlines x params stay valid (sweep)', () => {
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let n = 0; n < 1000; n++) {
      const p: any = defaultParams();
      for (const d of SCHEMA) if (d.kind === 'range') p[d.id] = d.min! + rnd() * (d.max! - d.min!);
      const angles = [-90]; for (let i = 1; i < 6; i++) angles.push(-90 + (i + (rnd() - 0.5) * 0.8) * 30); angles.push(90);
      const radii = angles.map(() => 10 + rnd() * 55);
      const o = clampOutline(makeOutline(angles, radii), p.wall);
      check(o, p as Params, `sweep ${n}`);
    }
  });
});
