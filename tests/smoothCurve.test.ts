import { describe, it, expect } from 'vitest';
import { makeOutline, clampOutline, unmirror, isOutlineValid, Outline } from '../src/params/outline';
import { Profile } from '../src/geometry/profile';
import { encodeShare, decodeShare } from '../src/io/share';
import { defaultParams } from '../src/params/schema';
import { blendOutlines } from '../src/params/outlineEdit';
import { fitOutlineFromStroke } from '../src/params/fitOutline';

const DEG = Math.PI / 180;
const smooth = (o: Outline): Outline => ({ ...o, curve: 'c2' });
/** how abruptly the bend changes along the outline: max jump of the turning angle between neighbouring 0.5 degree samples */
function bendJump(o: Outline): number {
  const p = new Profile(o), pts: [number, number][] = [];
  for (let d = 0; d < 720; d++) { const a = d * 0.5 * DEG, r = p.radius(a); pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  const turn = (i: number) => { const a = pts[(i + 719) % 720], b = pts[i % 720], c = pts[(i + 1) % 720]; const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]]; return Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]); };
  let worst = 0; for (let i = 0; i < 720; i++) worst = Math.max(worst, Math.abs(turn(i + 1) - turn(i)));
  return worst;
}

describe('the smooth outline curve', () => {
  const uneven = () => makeOutline([-90, -50, -10, 15, 30, 55, 90], [26, 24, 30, 41, 33, 28, 30]);

  it('passes through every point', () => {
    const o = smooth(uneven()), p = new Profile(o);
    o.phi.forEach((a, i) => expect(p.radius(a)).toBeCloseTo(o.r[i], 1));
    o.phi.forEach((a, i) => expect(p.radius(Math.PI - a)).toBeCloseTo(o.r[i], 1)); // mirrored
  });
  it('a ring of equal radii is a circle', () => {
    const o = smooth(makeOutline([-90, -60, -30, 0, 30, 60, 90], [30, 30, 30, 30, 30, 30, 30])), p = new Profile(o);
    for (let d = 0; d < 360; d += 7) expect(p.radius(d * DEG)).toBeCloseTo(30, 1);
  });
  it('bends far more gradually than the original curve: no lump at each point', () => {
    const legacy = bendJump(uneven()), c2 = bendJump(smooth(uneven()));
    expect(c2).toBeLessThan(legacy * 0.6);
  });
  it('is mirror symmetric when the outline is mirrored, and lopsided when it is not', () => {
    const m = new Profile(smooth(uneven()));
    for (let d = 0; d < 90; d += 9) expect(m.radius(d * DEG)).toBeCloseTo(m.radius((180 - d) * DEG), 2);
    const u = unmirror(smooth(uneven())); u.left!.r = u.left!.r.map((r, i) => (i > 0 && i < 6 ? r + 6 : r));
    const p = new Profile(clampOutline(u, 1.6)); expect(p.radius(Math.PI)).toBeGreaterThan(p.radius(0) + 3);
  });
  it('the Smooth slider still blends towards straight segments', () => {
    const o = smooth(uneven()), straight = { ...o, smooth: 0 };
    expect(bendJump(straight)).toBeGreaterThan(bendJump(o));
    const p = new Profile(straight), mid = (o.phi[3] + o.phi[4]) / 2; // between two points the polygon is a chord: shorter than the arc
    expect(p.radius(mid)).toBeGreaterThan(0);
  });
  it('older outlines are untouched: no flag, same curve as before', () => {
    const a = new Profile(uneven()), b = new Profile({ ...uneven(), curve: undefined });
    for (let d = 0; d < 360; d += 11) expect(a.radius(d * DEG)).toBe(b.radius(d * DEG));
  });
  it('the flag survives share links, blending to or from it, and refits', () => {
    const o = clampOutline(smooth(uneven()), 1.6), d = decodeShare(encodeShare(defaultParams(), o))!;
    expect(d.outline.curve).toBe('c2'); expect(decodeShare(encodeShare(defaultParams(), uneven()))!.outline.curve).toBeUndefined();
    expect(blendOutlines(uneven(), o, 1).curve).toBe('c2'); expect(isOutlineValid(blendOutlines(uneven(), o, 0.5))).toBe(true);
    const stroke: [number, number][] = Array.from({ length: 200 }, (_, i) => { const a = (i / 200) * 2 * Math.PI; return [30 * Math.cos(a), 30 * Math.sin(a)]; });
    const fit = fitOutlineFromStroke(stroke, 1.6, { fidelity: 0.7, curve: 'c2' })!;
    expect(fit.outline.curve).toBe('c2'); expect(fit.maxErrorMm).toBeLessThan(0.6);
  });
});
