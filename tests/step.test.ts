import { describe, it, expect } from 'vitest';
// @ts-ignore: no types shipped
import occtimportjs from 'occt-import-js';
import { PRESETS, presetParams } from '../src/params/presets';
import { clampOutline } from '../src/params/outline';
import { buildCasing, simplifyMesh } from '../src/geometry/solids';
import { stepFromBodies } from '../src/io/exportStep';
import { buildAll } from './helpers';

const STEP_TOL = 0.08; // mm, the same value the app uses
const bbox = (p: ArrayLike<number>) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); } return { mn, mx }; };

describe('STEP export (faceted B-rep) round-trips through OpenCascade', () => {
  for (const presetIdx of [1, 0]) it(`${PRESETS[presetIdx].id}: a valid STEP file that a real CAD kernel reads back with the same shape`, async () => {
    const pr = PRESETS[presetIdx], params = presetParams(pr), outline = clampOutline(pr.outline, params.wall);
    const a = buildAll(outline, params, 3);
    const c = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params, place: a.place });
    const [front, back] = await Promise.all([simplifyMesh(c.front, STEP_TOL), simplifyMesh(c.back, STEP_TOL)]);
    expect(front.tris.length).toBeLessThan(c.front.tris.length); // simplification reduces the facet count
    const { text, stats } = stepFromBodies([{ name: 'Front shell', ...front }, { name: 'Back shell', ...back }], { productName: 'Test', fileName: 'test.step' });
    console.log('STEP:', stats.faces, 'facets,', (stats.bytes / 1048576).toFixed(1), 'MB (was', (c.front.tris.length + c.back.tris.length) / 3, 'triangles before simplify)');
    expect(text.startsWith('ISO-10303-21;')).toBe(true);
    expect(text).toContain('MANIFOLD_SOLID_BREP');

    const occt = await occtimportjs();
    const res = occt.ReadStepFile(new TextEncoder().encode(text), null);
    expect(res.success).toBe(true);
    expect((text.match(/MANIFOLD_SOLID_BREP\(/g) ?? []).length).toBe(2); // front and back shell are two solids in the file
    expect(res.meshes.length).toBeGreaterThanOrEqual(2);  // and the CAD kernel returns geometry for them
    let tris = 0; const all: number[] = [];
    for (const m of res.meshes) { tris += m.index.array.length / 3; all.push(...m.attributes.position.array); }
    expect(Math.abs(tris - stats.faces) / stats.faces).toBeLessThan(0.002); // a CAD kernel may drop a handful of near-degenerate slivers
    const got = bbox(all), want = bbox([...front.positions, ...back.positions]);
    for (let k = 0; k < 3; k++) { expect(Math.abs(got.mn[k] - want.mn[k])).toBeLessThan(0.01); expect(Math.abs(got.mx[k] - want.mx[k])).toBeLessThan(0.01); }
    expect(stats.bytes).toBeLessThan(30 * 1048576);
  }, 120000);
});
