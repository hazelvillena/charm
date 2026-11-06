import { describe, it, expect } from 'vitest';
import { buildQuadSphere } from '../src/geometry/quadSphere';
import { Subdivider } from '../src/geometry/catmullClark';
import { closureReport, signedVolume, minFaceArea, allFinite, bounds, vertexNormals } from '../src/geometry/mesh';
import { setInflationMode } from '../src/geometry/shapeMap';
import { ShapeEngine } from '../src/geometry/engine';
import { Profile } from '../src/geometry/profile';
import { PRESETS, presetParams, GHOST_SILHOUETTE } from '../src/params/presets';
import { clampOutline, makeOutline, Outline } from '../src/params/outline';
import { SCHEMA, defaultParams, Params } from '../src/params/schema';
import { outlineMinRadius } from '../src/params/core';

describe('quad sphere', () => {
  const N = 8; const qs = buildQuadSphere(N);
  it('is a closed welded sphere with outward faces', () => {
    expect(qs.faces.length / 4).toBe(6 * N * N);
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
  it('300 random outlines x params stay valid (sweep, Poisson body)', () => {
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let n = 0; n < 300; n++) {
      const p: any = defaultParams();
      for (const d of SCHEMA) if (d.kind === 'range') p[d.id] = d.min! + rnd() * (d.max! - d.min!);
      const angles = [-90]; for (let i = 1; i < 6; i++) angles.push(-90 + (i + (rnd() - 0.5) * 0.8) * 30); angles.push(90);
      const radii = angles.map(() => 10 + rnd() * 55);
      const o = clampOutline(makeOutline(angles, radii), p.wall);
      p.side = { back: Array.from({ length: 7 }, () => 0.3 + rnd() * 1.3), front: Array.from({ length: 7 }, () => 0.3 + rnd() * 1.3) };
      p.corePlateau = rnd() > 0.5;
      check(o, p as Params, `sweep ${n}`);
    }
  }, 120000);
});

describe('Poisson inflation is smoother than the old radial pillow', () => {
  // roughness: 98th percentile angle (deg) between the normals of neighbouring vertices, away from the rim (|z| > 3 mm)
  const roughness = (outline: any, params: any) => {
    const eng = new ShapeEngine(), o = clampOutline(outline, params.wall), cage = new Float32Array(eng.qs.vertCount * 3);
    eng.buildCage(o, params, cage);
    const pos = new Float32Array(eng.smoothVertCount(2) * 3); eng.smoothInto(cage, 2, pos);
    const faces = eng.smoothFaces(2), nor = vertexNormals(pos, faces, pos.length / 3), ang: number[] = [];
    for (let f = 0; f < faces.length; f += 4) for (let i = 0; i < 4; i++) {
      const a = faces[f + i], b = faces[f + ((i + 1) & 3)];
      if (Math.abs(pos[a * 3 + 2]) < 3 || Math.abs(pos[b * 3 + 2]) < 3) continue;
      const d = nor[a * 3] * nor[b * 3] + nor[a * 3 + 1] * nor[b * 3 + 1] + nor[a * 3 + 2] * nor[b * 3 + 2];
      ang.push((Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI);
    }
    ang.sort((x, y) => x - y); return ang[Math.floor(ang.length * 0.98)];
  };
  for (const id of ['ghost', 'star', 'triangle']) it(`${id}: the Poisson body is at least as smooth as the legacy one`, () => {
    const pr = PRESETS.find((p) => p.id === id)!, p = presetParams(pr);
    setInflationMode('legacy'); const legacy = roughness(pr.outline, p);
    setInflationMode('poisson'); const poisson = roughness(pr.outline, p);
    console.log(id, 'roughness p98 legacy', legacy.toFixed(1), 'poisson', poisson.toFixed(1));
    expect(poisson).toBeLessThanOrEqual(legacy + 0.05);
  });
  it('the body is mirror-symmetric left to right (no one-sided creases)', () => {
    const eng = new ShapeEngine(), pr = PRESETS.find((p) => p.id === 'triangle')!, p = presetParams(pr), cage = new Float32Array(eng.qs.vertCount * 3);
    eng.buildCage(clampOutline(pr.outline, p.wall), p, cage);
    const pos = new Float32Array(eng.smoothVertCount(2) * 3); eng.smoothInto(cage, 2, pos);
    const key = (x: number, y: number, z: number) => `${Math.round(x * 4)},${Math.round(y * 4)},${Math.round(z * 4)}`;
    const set = new Set<string>(); for (let i = 0; i < pos.length; i += 3) set.add(key(pos[i], pos[i + 1], pos[i + 2]));
    let miss = 0, n = 0; for (let i = 0; i < pos.length; i += 3) { n++; let found = false; for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dz of [-1, 0, 1]) if (set.has(`${Math.round(-pos[i] * 4) + dx},${Math.round(pos[i + 1] * 4) + dy},${Math.round(pos[i + 2] * 4) + dz}`)) found = true; if (!found) miss++; }
    expect(miss / n).toBeLessThan(0.02);
  });
});
