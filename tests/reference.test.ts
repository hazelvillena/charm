import { describe, it, expect } from 'vitest';
import { PRESETS, presetParams } from '../src/params/presets';
import { STARTERS, starterParams } from '../src/params/starters';
import { evaluateIteration } from '../src/evaluate';
import { sideProfileOf } from '../src/geometry/section';
import { engine } from './helpers';

describe('the side canvas reference', () => {
  it('another iteration can be built and read side on (true mm), and different shapes give different silhouettes', () => {
    const faces = engine.smoothFaces(2), side = (o: any, p: any) => sideProfileOf(evaluateIteration(engine, o, p)!.positions, faces);
    const charmer = side(PRESETS[0].outline, presetParams(PRESETS[0])), slate = STARTERS.find((s) => s.name === 'Slate')!, sl = side(slate.outline, starterParams(slate));
    for (const p of [charmer, sl]) { expect(p.ys.length).toBeGreaterThan(50); expect(p.front.length).toBe(p.ys.length); expect(p.back.length).toBe(p.ys.length); }
    expect(Math.max(...sl.ys)).not.toBeCloseTo(Math.max(...charmer.ys), 0); // different heights: the silhouettes differ
  }, 60000);
});
