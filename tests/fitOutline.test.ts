import { describe, it, expect } from 'vitest';
import { fitOutlineFromStroke } from '../src/params/fitOutline';
import { PRESETS } from '../src/params/presets';
import { Profile } from '../src/geometry/profile';
import { OUTLINE_MIN_POINTS, OUTLINE_MAX_POINTS, isOutlineValid } from '../src/params/outline';
import { outlineMinRadius } from '../src/params/core';

const sample = (f: (phi: number) => number, n = 200, jitter = 0): [number, number][] => {
  let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  return Array.from({ length: n }, (_, i) => { const phi = (i / n) * Math.PI * 2, r = f(phi) + rnd() * jitter; return [r * Math.cos(phi), r * Math.sin(phi)] as [number, number]; });
};

describe('freehand stroke -> outline', () => {
  it('fidelity trades point count and accuracy for smoothing', () => {
    const prof = new Profile(PRESETS[0].outline);
    const stroke = sample((a) => prof.radius(a), 360, 1.2);
    const smooth = fitOutlineFromStroke(stroke, 1.6, { fidelity: 0 })!, faithful = fitOutlineFromStroke(stroke, 1.6, { fidelity: 1 })!;
    expect(smooth.points).toBeLessThan(faithful.points);
    expect(faithful.maxErrorMm).toBeLessThanOrEqual(smooth.maxErrorMm + 1e-6);
    expect(smooth.outline.smooth).toBeGreaterThan(faithful.outline.smooth);
  });
  it('recovers a preset outline from its own silhouette (with hand jitter)', () => {
    for (const pr of PRESETS) {
      const prof = new Profile(pr.outline);
      const fit = fitOutlineFromStroke(sample((a) => prof.radius(a), 360, 0.8), 1.6, { fidelity: 0.8 })!;
      expect(fit, pr.id).not.toBeNull();
      expect(fit.outline.phi.length).toBeGreaterThanOrEqual(OUTLINE_MIN_POINTS);
      expect(fit.outline.phi.length).toBeLessThanOrEqual(OUTLINE_MAX_POINTS);
      expect(isOutlineValid(fit.outline)).toBe(true);
      expect(fit.maxErrorMm, pr.id).toBeLessThan(3.2);
    }
  });
  it('never returns radii inside the puck keep-out', () => {
    const fit = fitOutlineFromStroke(sample(() => 8, 120), 1.6)!;
    expect(fit.grew).toBe(true);
    fit.outline.r.forEach((r) => expect(r).toBeGreaterThanOrEqual(outlineMinRadius(1.6) - 1e-6));
  });
  it('rejects strokes that do not go around the puck, and tiny ones', () => {
    const half = Array.from({ length: 60 }, (_, i) => { const a = (i / 59) * Math.PI * 0.6; return [30 * Math.cos(a), 30 * Math.sin(a)] as [number, number]; });
    expect(fitOutlineFromStroke(half, 1.6)).toBeNull();
    expect(fitOutlineFromStroke([[1, 1], [2, 2]], 1.6)).toBeNull();
  });
  it('handles a self-crossing scribble without throwing', () => {
    const scribble = Array.from({ length: 300 }, (_, i) => { const t = i / 20; return [(20 + 6 * Math.sin(5 * t)) * Math.cos(t), (22 + 5 * Math.cos(3 * t)) * Math.sin(t)] as [number, number]; });
    const fit = fitOutlineFromStroke(scribble, 1.6);
    expect(fit === null || isOutlineValid(fit.outline)).toBe(true);
  });
});
