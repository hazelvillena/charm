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
      // every export carries the whole assembly: Core, both magnets and both eyes exist as closed solids
      expect(casing.parts.core.tris.length).toBeGreaterThan(100);
      expect(casing.parts.magnets.length).toBe(2); expect(casing.parts.eyes.length).toBe(2);
      for (const m of [...casing.parts.magnets, ...casing.parts.eyes]) expect(m.tris.length).toBeGreaterThan(20);
      expect(casing.shellVolume).toBeLessThan(casing.outerVolume);
      // checks
      const l2 = buildAll(outline, params, 2);
      const inner = innerGeometry(l2.inner, engine.smoothFaces(2));
      const wall = checkWall(l2.og.g, inner.bvh, params.wall);
      const fit = checkFit(new Profile(outline), params, a.og.bvh, a.og.g, a.place);
      const nook = checkNook(a.og.bvh, a.og.g, a.place);
      console.log(pr.id, 'ms', Math.round(ms), 'shell cm3', (casing.shellVolume / 1000).toFixed(1), 'weight PC g',
        (casing.shellVolume / 1000 * 1.2).toFixed(1), 'minWall', wall.min.toFixed(2), '| fit:', fit.ok, fit.detail, '| nook:', nook.ok);
      expect(ms).toBeLessThan(8000);
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
    const tight = { phi: [...o.phi], r: o.r.map(() => 16.2), smooth: 1 };
    const a = buildAll(clampOutline(tight, 1.2), { ...p, wall: 1.2 }, 2);
    const fit = checkFit(new Profile(tight), p, a.og.bvh, a.og.g, a.place);
    expect(fit.ok).toBe(false);
  });
});

describe('accept robustness under random shapes (incl. extreme side profiles)', () => {
  it('either builds a valid casing or fails cleanly with a named step', async () => {
    let seed = 99; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const { SCHEMA } = await import('../src/params/schema');
    const { makeOutline } = await import('../src/params/outline');
    const { AcceptError } = await import('../src/geometry/solids');
    let ok = 0, clean = 0; const N = 24; const failures: string[] = [];
    for (let n = 0; n < N; n++) {
      const p: any = { ...defaultParams() };
      for (const d of SCHEMA) if (d.kind === 'range') p[d.id] = d.min! + rnd() * (d.max! - d.min!);
      p.depth = 24 + rnd() * 18; p.wall = 1.2 + rnd() * 1.3;
      p.side = { back: Array.from({ length: 7 }, () => 0.35 + rnd() * 1.2), front: Array.from({ length: 7 }, () => 0.5 + rnd() * 1.0) };
      const angles = [-90]; for (let i = 1; i < 6; i++) angles.push(-90 + (i + (rnd() - 0.5) * 0.7) * 30); angles.push(90);
      const o = clampOutline(makeOutline(angles, angles.map(() => 17 + rnd() * 30)), p.wall);
      const a = buildAll(o, p, 3);
      try {
        const c = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params: p, place: a.place });
        expect(c.shellVolume).toBeGreaterThan(0); ok++;
      } catch (e) { if (e instanceof AcceptError) { clean++; failures.push(e.step); } else throw e; }
    }
    console.log('random accept:', ok, 'built,', clean, 'clean failures', failures.join(','));
    expect(ok + clean).toBe(N);
    expect(ok).toBeGreaterThanOrEqual(Math.floor(N * 0.75));
  }, 120000);
});

describe('section with poche (real solids cut at x = 0)', () => {
  it('cuts the shell, core and magnets, with true cut faces including the core seat walls', async () => {
    const pr = PRESETS[0], params = presetParams(pr), outline = clampOutline(pr.outline, params.wall);
    const a = buildAll(outline, params, 3);
    const c = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params, place: a.place, section: true });
    const s = c.section!;
    expect(s).toBeDefined();
    const flat = (m: { positions: Float32Array; tris: Uint32Array }) => { let n = 0; for (let t = 0; t < m.tris.length; t += 3) if ([0, 1, 2].every((k) => Math.abs(m.positions[m.tris[t + k] * 3]) < 1e-3)) n++; return n; };
    expect(flat(s.shell)).toBeGreaterThan(50);   // wall + seat walls + floor + boss are cut faces
    expect(flat(s.core)).toBeGreaterThan(5);
    expect(s.magnets.length).toBe(2); s.magnets.forEach((m) => expect(flat(m)).toBeGreaterThanOrEqual(2)); // vertical pair on the centre line: both are cut through their axes
    // every vertex of the cut parts is on the kept side
    for (const part of [s.shell, s.core]) for (let i = 0; i < part.positions.length; i += 3) expect(part.positions[i]).toBeLessThanOrEqual(1e-3);
    // the seat is a real pocket: cut-face area around the core location exceeds a bare thin wall
    const bounds = (m: { positions: Float32Array }) => { let z0 = 1e9, z1 = -1e9; for (let i = 2; i < m.positions.length; i += 3) { z0 = Math.min(z0, m.positions[i]); z1 = Math.max(z1, m.positions[i]); } return [z0, z1]; };
    const [cz0, cz1] = bounds(s.core); expect(cz1 - cz0).toBeGreaterThan(8); // core thickness + dome
  }, 60000);
});
