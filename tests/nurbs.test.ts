import { describe, it, expect } from 'vitest';
import { PRESETS, presetParams } from '../src/params/presets';
import { clampOutline } from '../src/params/outline';
import { limitPositions, cageFaceGrids, interpolation, patchControlPoints, curveControlPoints, evalPatch } from '../src/geometry/nurbs';
import { engine } from './helpers';

const sample = (level: number, id = 0) => {
  const pr = PRESETS[id], p = presetParams(pr), o = clampOutline(pr.outline, p.wall);
  const cage = new Float32Array(engine.qs.vertCount * 3); engine.buildCage(o, p, cage);
  const pos = new Float32Array(engine.smoothVertCount(level) * 3); engine.smoothInto(cage, level, pos);
  const faces = engine.smoothFaces(level), limit = limitPositions(pos, faces, pos.length / 3);
  return { cage, pos, faces, limit, grids: cageFaceGrids(engine.qs.faces.length / 4, level, faces, limit) };
};

describe('exact NURBS from the SubD cage', () => {
  it('a patch passes through its own limit samples and agrees with a denser sampling in between', () => {
    const a = sample(2), b = sample(3), it2 = interpolation(4);
    let maxPass = 0, maxBetween = 0;
    for (let f = 0; f < a.grids.length; f += 7) {
      const cp = patchControlPoints(a.grids[f], it2);
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const q = evalPatch(cp, it2, i / 4, j / 4); for (let k = 0; k < 3; k++) maxPass = Math.max(maxPass, Math.abs(q[k] - a.grids[f][(i * 5 + j) * 3 + k])); }
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { const q = evalPatch(cp, it2, i / 8, j / 8); for (let k = 0; k < 3; k++) maxBetween = Math.max(maxBetween, Math.abs(q[k] - b.grids[f][(i * 9 + j) * 3 + k])); }
    }
    console.log('patch deviation: through samples', maxPass.toExponential(1), 'mm; between samples vs 2x denser limit', maxBetween.toFixed(4), 'mm');
    expect(maxPass).toBeLessThan(1e-6);
    expect(maxBetween).toBeLessThan(0.03); // a few hundredths of a millimetre at most, including the eight corner regions
  });
  it('neighbouring patches share exactly the same boundary (no gaps)', () => {
    const a = sample(2), it2 = interpolation(4), faces = engine.qs.faces, edgeCurves = new Map<string, Float64Array>();
    let worst = 0;
    for (let f = 0; f < a.grids.length; f++) {
      const cp = patchControlPoints(a.grids[f], it2), v = [0, 1, 2, 3].map((i) => faces[f * 4 + i]);
      const edges: [number, number, (t: number) => number][] = [[0, 1, (t) => t * 5], [1, 2, (t) => 4 * 5 + t], [2, 3, (t) => (4 - t) * 5 + 4], [3, 0, (t) => (4 - t)]];
      edges.forEach(([x, y, idx]) => {
        const pts = new Float64Array(15); for (let t = 0; t < 5; t++) for (let k = 0; k < 3; k++) pts[t * 3 + k] = a.grids[f][idx(t) * 3 + k];
        const lo = Math.min(v[x], v[y]), hi = Math.max(v[x], v[y]); const rev = v[x] > v[y];
        const ordered = rev ? Float64Array.from({ length: 15 }, (_, q) => pts[(4 - Math.floor(q / 3)) * 3 + (q % 3)]) : pts;
        const c = curveControlPoints(ordered, it2), key = `${lo}-${hi}`, prev = edgeCurves.get(key);
        if (prev) for (let q = 0; q < 15; q++) worst = Math.max(worst, Math.abs(prev[q] - c[q])); else edgeCurves.set(key, c);
      });
      void cp;
    }
    expect(edgeCurves.size).toBe(engine.qs.faces.length / 4 * 2); // a closed quad mesh has 2 edges per face
    expect(worst).toBeLessThan(1e-9);
  });
});

// @ts-ignore: no types shipped
import occtimportjs from 'occt-import-js';
import { nurbsBodyStep } from '../src/io/exportNurbs';
import { signedVolume } from '../src/geometry/mesh';

describe('NURBS STEP round-trips through OpenCascade', () => {
  for (const id of [0, 3]) it(`${PRESETS[id].id}: a closed solid of true B-spline surfaces with the right shape and volume`, async () => {
    const a = sample(2, id), { text, stats } = nurbsBodyStep(engine.qs.faces, a.grids, 2, { productName: 'Test', fileName: 'test.step' });
    console.log('NURBS STEP:', stats.patches, 'patches,', stats.edges, 'edges,', (stats.bytes / 1048576).toFixed(1), 'MB');
    expect(text).toContain('B_SPLINE_SURFACE_WITH_KNOTS'); expect(text).not.toContain('PLANE(');
    expect((text.match(/B_SPLINE_SURFACE_WITH_KNOTS\(/g) ?? []).length).toBe(stats.patches);
    const occt = await occtimportjs(), res = occt.ReadStepFile(new TextEncoder().encode(text), null);
    expect(res.success).toBe(true); expect(res.meshes.length).toBe(1);
    const m = res.meshes[0], pos = Float32Array.from(m.attributes.position.array), idx = Uint32Array.from(m.index.array);
    expect(m.brep_faces.length).toBe(stats.patches); // one CAD face per cage quad: smooth patches, not facets
    // the volume of the CAD kernel's triangulation matches the SubD body (positive = outward faces, closed shell)
    const tri = new Uint32Array(idx.length / 3 * 4); for (let i = 0, k = 0; i < idx.length; i += 3) { tri[k++] = idx[i]; tri[k++] = idx[i + 1]; tri[k++] = idx[i + 2]; tri[k++] = idx[i + 2]; }
    const vol = signedVolume(pos, tri), want = signedVolume(a.limit as any, a.faces);
    console.log('volume from CAD kernel', vol.toFixed(0), 'mm3; SubD limit', want.toFixed(0), 'mm3');
    expect(vol).toBeGreaterThan(0); expect(Math.abs(vol - want) / want).toBeLessThan(0.01);
  }, 120000);
});
