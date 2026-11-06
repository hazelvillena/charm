import { describe, it, expect } from 'vitest';
import { PRESETS, presetParams } from '../src/params/presets';
import { clampOutline } from '../src/params/outline';
import { buildCasing } from '../src/geometry/solids';
import { buildAll, geoOf, engine } from './helpers';
import { checkFit } from '../src/checks/fit';
import { checkWall, innerGeometry } from '../src/checks/wall';
import { checkNook } from '../src/checks/nook';
import { Profile } from '../src/geometry/profile';
import { buildSpec } from '../src/spec/spec';
import { defaultParams } from '../src/params/schema';

describe('accept pipeline + checks (headless)', () => {
  for (const pr of PRESETS) {
    it(`${pr.id}: checks run, casing builds`, async () => {
      const params = presetParams(pr);
      const outline = clampOutline(pr.outline, params.wall);
      const a = buildAll(outline, params, 3);
      const t0 = performance.now();
      const casing = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params, place: a.place });
      const ms = performance.now() - t0;
      expect(casing.front.tris.length).toBeGreaterThan(0);
      expect(casing.back.tris.length).toBeGreaterThan(0);
      expect(casing.shellVolume).toBeGreaterThan(500);
      expect(casing.shellVolume).toBeLessThan(casing.outerVolume);
      // checks
      const l2 = buildAll(outline, params, 2);
      const inner = innerGeometry(l2.inner, engine.smoothFaces(2));
      const wall = checkWall(l2.og.g, inner.bvh, params.wall);
      const fit = checkFit(new Profile(outline), params, a.og.bvh, a.og.g, a.place);
      const nook = checkNook(a.og.bvh, a.og.g, a.place);
      console.log(pr.id, 'ms', Math.round(ms), 'shell cm3', (casing.shellVolume / 1000).toFixed(1), 'weight PC g',
        (casing.shellVolume / 1000 * 1.2).toFixed(1), 'minWall', wall.min.toFixed(2), '| fit:', fit.ok, fit.detail, '| nook:', nook.ok);
      expect(ms).toBeLessThan(4000);
      expect(fit.ok).toBe(true);
      expect(Number.isFinite(wall.min)).toBe(true);
      expect(wall.min).toBeGreaterThan(params.wall * 0.5);
      const spec = buildSpec({ name: pr.name, params, outline, casing, outerBounds: a.bounds, checks: [fit, wall.check, nook], minWall: wall.min, cageVerts: engine.qs.vertCount, cageFaces: engine.qs.faces.length / 4, level: 3 });
      expect(spec.weightG).toBeGreaterThan(0);
    }, 30000);
  }

  it('fit check turns red when the body is too shallow for the puck', () => {
    const p = { ...presetParams(PRESETS[1]), depth: 10 };
    const o = clampOutline(PRESETS[1].outline, p.wall);
    const a = buildAll(o, p, 2);
    const fit = checkFit(new Profile(o), p, a.og.bvh, a.og.g, a.place);
    expect(fit.ok).toBe(false);
  });
  it('fit check turns red when wall growth leaves no room around the puck', () => {
    const p = { ...defaultParams(), wall: 2.5 };
    const o = PRESETS[1].outline; // not re-clamped on purpose (a wall change after the fact)
    const tight = { phi: [...o.phi], r: o.r.map(() => 16.2) };
    const a = buildAll(clampOutline(tight, 1.2), { ...p, wall: 1.2 }, 2);
    const fit = checkFit(new Profile(tight), p, a.og.bvh, a.og.g, a.place);
    expect(fit.ok).toBe(false);
  });
});
