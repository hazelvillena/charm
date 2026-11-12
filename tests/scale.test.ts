import { describe, it, expect } from 'vitest';
import { makeOutline, scaleOutline, clampOutline, unmirror, isOutlineValid } from '../src/params/outline';
import { Profile, outlineExtent, resizeOutline } from '../src/geometry/profile';
import { defaultParams, sanitizeParams } from '../src/params/schema';
import { Library } from '../src/library';

describe('resizing the outline to a true width and height', () => {
  const o = () => clampOutline(makeOutline([-90, -45, 0, 45, 90], [30, 32, 36, 32, 34]), 1.6);
  it('moves the points so the shape gets the requested size, and 1 changes nothing', () => {
    const base = outlineExtent(o()), s = scaleOutline(o(), 1.3, 1, 1.6), t = scaleOutline(o(), 1, 0.8, 1.6);
    expect(outlineExtent(s).w / base.w).toBeCloseTo(1.3, 1); expect(outlineExtent(s).h / base.h).toBeCloseTo(1, 1);
    expect(outlineExtent(t).h / base.h).toBeCloseTo(0.8, 1); expect(outlineExtent(t).w / base.w).toBeCloseTo(1, 1);
    const a = o(); expect(scaleOutline(a, 1, 1, 1.6)).toBe(a);
  });
  it('keeps the halves, the curve type and a valid outline, and never goes under the Core', () => {
    const l = unmirror(o()); l.left!.r = l.left!.r.map((r) => r + 4); l.curve = 'c2';
    const s = scaleOutline(l, 0.62, 0.62, 1.6);
    expect(s.left).toBeDefined(); expect(s.curve).toBe('c2'); expect(isOutlineValid(s)).toBe(true);
    expect(new Profile(s).minRadius().r).toBeGreaterThanOrEqual(16);
  });
  it('resizing from where a drag started is repeatable (no drift)', () => {
    const base = o(), w1 = outlineExtent(scaleOutline(base, 1.2, 1, 1.6)).w, w2 = outlineExtent(scaleOutline(scaleOutline(base, 1.5, 1, 1.6), 1, 1, 1.6)).w;
    expect(w1).toBeLessThan(w2); expect(outlineExtent(scaleOutline(base, 1.2, 1, 1.6)).w).toBeCloseTo(w1, 6);
  });
  it('resizeOutline lands on the requested true width and height, one axis without moving the other', () => {
    const base = o(), e = outlineExtent(base);
    const w = outlineExtent(resizeOutline(base, e.w + 9, e.h, 1.6)), h = outlineExtent(resizeOutline(base, e.w, e.h + 12, 1.6));
    expect(w.w).toBeCloseTo(e.w + 9, 0); expect(w.h).toBeCloseTo(e.h, 0);
    expect(h.h).toBeCloseTo(e.h + 12, 0); expect(h.w).toBeCloseTo(e.w, 0);
    const both = outlineExtent(resizeOutline(base, e.w * 1.3, e.h * 0.85, 1.6)); expect(both.w).toBeCloseTo(e.w * 1.3, 0); expect(both.h).toBeCloseTo(e.h * 0.85, 0);
  });
  it('size is not a stored parameter any more: it is the outline itself', () => {
    expect('scaleW' in defaultParams()).toBe(false); expect('scaleW' in sanitizeParams({ scaleW: 1.4 })).toBe(false);
  });
  it('a library saved before a parameter existed gets its default (no NaN sliders)', () => {
    const store: Record<string, string> = {}, real = (globalThis as any).localStorage; (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
    const first = new Library(), it0 = first.items[0];
    const old: any = JSON.parse(JSON.stringify(it0)); delete old.params.eyeX;
    localStorage.setItem('charmer-playground:v1', JSON.stringify({ items: [old], seeded: true, v: 99 }));
    const lib = new Library(); expect(lib.items[0].params.eyeX).toBe(0); expect(lib.items[0].params.side).toBeDefined();
    (globalThis as any).localStorage = real;
  });
});
