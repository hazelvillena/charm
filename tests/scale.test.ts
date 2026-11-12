import { describe, it, expect } from 'vitest';
import { makeOutline, scaleOutline, clampOutline, unmirror, isOutlineValid } from '../src/params/outline';
import { Profile } from '../src/geometry/profile';
import { PRESETS, presetParams } from '../src/params/presets';
import { buildAll } from './helpers';
import { evaluateIteration } from '../src/evaluate';
import { engine } from './helpers';
import { defaultParams, sanitizeParams } from '../src/params/schema';
import { Library } from '../src/library';

const DEG = Math.PI / 180;
const extent = (o: any) => { const p = new Profile(o); let x0 = 0, x1 = 0, y0 = 0, y1 = 0; for (let d = 0; d < 360; d++) { const a = d * DEG, r = p.radius(a); x0 = Math.min(x0, r * Math.cos(a)); x1 = Math.max(x1, r * Math.cos(a)); y0 = Math.min(y0, r * Math.sin(a)); y1 = Math.max(y1, r * Math.sin(a)); } return { w: x1 - x0, h: y1 - y0 }; };

describe('width and height scale', () => {
  const o = () => clampOutline(makeOutline([-90, -45, 0, 45, 90], [30, 32, 36, 32, 34]), 1.6);
  it('scales the shape across and up around the Core, and 1 changes nothing', () => {
    const base = extent(o()), s = scaleOutline(o(), 1.3, 1, 1.6), t = scaleOutline(o(), 1, 0.8, 1.6);
    expect(extent(s).w / base.w).toBeCloseTo(1.3, 1); expect(extent(s).h / base.h).toBeCloseTo(1, 1);
    expect(extent(t).h / base.h).toBeCloseTo(0.8, 1); expect(extent(t).w / base.w).toBeCloseTo(1, 1);
    const a = o(); expect(scaleOutline(a, 1, 1, 1.6)).toBe(a);
  });
  it('keeps the halves, the curve type and a valid outline, and clears the Core', () => {
    const l = unmirror(o()); l.left!.r = l.left!.r.map((r) => r + 4); l.curve = 'c2';
    const s = scaleOutline(l, 0.62, 0.62, 1.6);
    expect(s.left).toBeDefined(); expect(s.curve).toBe('c2'); expect(isOutlineValid(s)).toBe(true);
    expect(new Profile(s).minRadius().r).toBeGreaterThanOrEqual(16);
  });
  it('is a body parameter with sane limits, and old shapes load at 1', () => {
    const p = defaultParams(); expect(p.scaleW).toBe(1); expect(p.scaleH).toBe(1);
    expect(sanitizeParams({ scaleW: 9, scaleH: 0 }).scaleW).toBe(1.6); expect(sanitizeParams({ scaleW: 9, scaleH: 0 }).scaleH).toBe(0.6);
    expect(sanitizeParams({}).scaleW).toBe(1);
  });
  it('the built body is wider and taller by the scale, and still passes the checks when it stays big', () => {
    const pr = PRESETS[0], base = presetParams(pr), out = clampOutline(pr.outline, base.wall);
    const a = buildAll(out, base, 2), b = buildAll(out, { ...base, scaleW: 1.25, scaleH: 1.15 }, 2);
    expect(b.bounds.size[0] / a.bounds.size[0]).toBeGreaterThan(1.15); expect(b.bounds.size[1] / a.bounds.size[1]).toBeGreaterThan(1.08);
    const ev = evaluateIteration(engine, out, { ...base, scaleW: 1.25, scaleH: 1.15 })!;
    expect(ev.ok).toBe(true);
  }, 60000);
  it('a library saved before the parameters existed gets their defaults (no NaN sliders)', () => {
    const store: Record<string, string> = {}, real = (globalThis as any).localStorage; (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
    const first = new Library(), it = first.items[0];
    const old: any = JSON.parse(JSON.stringify(it)); delete old.params.scaleW; delete old.params.scaleH; delete old.params.eyeX;
    localStorage.setItem('charmer-playground:v1', JSON.stringify({ items: [old], seeded: true, v: 99 }));
    const lib = new Library(); expect(lib.items[0].params.scaleW).toBe(1); expect(lib.items[0].params.scaleH).toBe(1); expect(lib.items[0].params.eyeX).toBe(0);
    expect(lib.items[0].params.side).toBeDefined();
    (globalThis as any).localStorage = real;
  });
});
