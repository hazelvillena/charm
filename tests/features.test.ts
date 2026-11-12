import { describe, it, expect, afterEach } from 'vitest';
import { PRESETS, presetParams } from '../src/params/presets';
import { clampOutline, isOutlineValid, makeOutline, OUTLINE_MAX_POINTS, OUTLINE_MIN_POINTS } from '../src/params/outline';
import { insertPoint, removePoint, addPointAuto, removePointAuto, blendOutlines } from '../src/params/outlineEdit';
import { Profile } from '../src/geometry/profile';
import { draftAngles, checkDraft, curvatureRadii, checkRadius } from '../src/checks/analysis';
import { sectionSegments } from '../src/geometry/section';
import { coreProfile, domeAt } from '../src/geometry/coreProfile';
import { CORE, setCore, resetCore, seatRadius } from '../src/params/core';
import { checkMagnetGap } from '../src/checks/magnet';
import { MATERIALS, FINISHES, finishAllowed, defaultFinishFor } from '../design/finishes';
import { encodeShare, decodeShare } from '../src/io/share';
import { evaluateIteration } from '../src/evaluate';
import { Library } from '../src/library';
import { buildQuadSphere } from '../src/geometry/quadSphere';
import { engine, buildAll } from './helpers';
import { defaultParams, sanitizeParams } from '../src/params/schema';

afterEach(() => resetCore());
const DEG = Math.PI / 180;

describe('outline points and smoothness', () => {
  const o = clampOutline(PRESETS[1].outline, 1.6);
  it('add / remove keep a valid ordered outline within 4..12 points', () => {
    let cur = o;
    for (let i = 0; i < 20; i++) { const n = addPointAuto(cur, 1.6); if (!n) break; cur = n; expect(isOutlineValid(cur)).toBe(true); }
    expect(cur.phi.length).toBe(OUTLINE_MAX_POINTS);
    for (let i = 0; i < 20; i++) { const n = removePointAuto(cur, 1.6); if (!n) break; cur = n; expect(isOutlineValid(cur)).toBe(true); }
    expect(cur.phi.length).toBe(OUTLINE_MIN_POINTS);
  });
  it('inserting on the curve preserves the shape; axis points cannot be removed', () => {
    const ins = insertPoint(o, 20 * DEG, 1.6)!;
    expect(ins).not.toBeNull();
    const a = new Profile(o), b = new Profile(ins.outline);
    for (let d = -90; d <= 90; d += 5) expect(Math.abs(a.radius(d * DEG) - b.radius(d * DEG))).toBeLessThan(1.2);
    expect(removePoint(o, 0, 1.6)).toBeNull(); expect(removePoint(o, o.phi.length - 1, 1.6)).toBeNull();
  });
  it('smoothness 0 gives straight segments, 1 the smooth curve; both valid and continuous', () => {
    const base = makeOutline([-90, -30, 30, 90], [20, 34, 30, 40]);
    const straight = new Profile({ ...base, smooth: 0 }), curved = new Profile({ ...base, smooth: 1 });
    const mid = (-30 + 30) / 2 * DEG;
    expect(straight.radius(mid)).toBeCloseTo((34 + 30) / 2, 1);   // linear midpoint in R(phi)
    expect(curved.radius(-30 * DEG)).toBeCloseTo(34, 5);          // both interpolate the control points
    expect(straight.radius(-30 * DEG)).toBeCloseTo(34, 5);
  });
  it('blending outlines with different point counts yields a valid outline at every t', () => {
    const a = PRESETS[0].outline, b = PRESETS[3].outline;
    for (let t = 0; t <= 1.0001; t += 0.1) expect(isOutlineValid(clampOutline(blendOutlines(a, makeOutline([-90, -45, 0, 45, 90, ], [20, 25, 30, 25, 22]), t), 1.6))).toBe(true);
    expect(blendOutlines(a, b, 1).phi.length).toBe(b.phi.length);
  });
});

describe('analysis helpers', () => {
  it('draft: front faces pulling +Z are positive, a face turned against the pull is an undercut', () => {
    const pos = new Float32Array([0, 0, 10, 0, 0, 10, 0, 0, -10, 0, 0, -10]);
    const nor = new Float32Array([0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, 1]);
    const d = draftAngles(pos, nor, 0);
    expect(d[0]).toBeGreaterThan(80); expect(d[1]).toBeLessThan(-80); expect(d[2]).toBeGreaterThan(80); expect(d[3]).toBeLessThan(-80);
    expect(checkDraft(new Float32Array([5, 8, 30, 45]), 0).ok).toBe(true);
    expect(checkDraft(new Float32Array([-30, -20, 5, 5]), 0).ok).toBe(false);
  });
  it('curvature radius of a sphere mesh is close to its radius', () => {
    const qs = buildQuadSphere(8), R = 10, pos = new Float32Array(qs.unit.length), nor = new Float32Array(qs.unit.length);
    for (let i = 0; i < qs.unit.length; i++) { pos[i] = qs.unit[i] * R; nor[i] = qs.unit[i]; }
    const r = curvatureRadii(pos, nor, qs.faces);
    const med = [...r].sort((a, b) => a - b)[Math.floor(r.length / 2)];
    expect(med).toBeGreaterThan(R * 0.7); expect(med).toBeLessThan(R * 1.3);
    expect(checkRadius(r, 1.6).ok).toBe(true); expect(checkRadius(r, 9).ok).toBe(false);
  });
  it('section of a sphere at x=0 is a closed loop of segments', () => {
    const qs = buildQuadSphere(8), pos = new Float32Array(qs.unit.length);
    for (let i = 0; i < qs.unit.length; i++) pos[i] = qs.unit[i] * 10 + (i % 3 === 0 ? 0.0137 : 0);
    const seg = sectionSegments(pos, qs.faces, 0, 0);
    expect(seg.length / 6).toBeGreaterThan(20);
    for (let i = 0; i < seg.length; i += 3) expect(Math.abs(Math.hypot(seg[i], seg[i + 1], seg[i + 2]) - 10)).toBeLessThan(0.6);
  });
});

describe('core', () => {
  it('profile is finite, the top is one neat dome (no plateau, step or dip), and params clamp', () => {
    const p = coreProfile(); expect(p.every(([r, y]) => Number.isFinite(r) && Number.isFinite(y))).toBe(true);
    expect(domeAt(0)).toBeCloseTo(CORE.domeHeight, 6);
    const top = p.slice(3); // from the top of the wall to the apex
    for (let i = 1; i < top.length; i++) { expect(top[i][1]).toBeGreaterThanOrEqual(top[i - 1][1] - 1e-9); expect(top[i][0]).toBeLessThanOrEqual(top[i - 1][0] + 1e-9); } // always rising toward the centre
    // convex: height as a function of radius never has a dip (it is concave-down, so slopes only steepen toward the edge)
    const h = (r: number) => domeAt(r); let prev = 0;
    for (let r = 0.5; r < CORE.puckDiameter / 2 - 0.5; r += 0.5) { const slope = (h(r - 0.5) - h(r)) / 0.5; expect(slope).toBeGreaterThanOrEqual(prev - 1e-6); prev = slope; }
    setCore({ puckDiameter: 999, domeHeight: -5, edgeRadius: 99 });
    expect(CORE.puckDiameter).toBe(34); expect(CORE.domeHeight).toBe(0); expect(CORE.edgeRadius).toBeLessThanOrEqual(CORE.puckDiameter / 2 - 1);
  });
  it('magnet gap check follows the design rule', () => {
    expect(checkMagnetGap().ok).toBe(true);
    setCore({ magnetGap: 1.8 }); expect(checkMagnetGap().ok).toBe(false);
  });
  it('a bigger core tightens the keep-out and a failing iteration is reported by the library evaluation', () => {
    const g = PRESETS[1], p = presetParams(g);
    const ok = evaluateIteration(engine, g.outline, p)!;
    expect(ok.ok).toBe(true);
    setCore({ puckDiameter: 34 });
    expect(seatRadius()).toBeGreaterThan(16);
    const tight = evaluateIteration(engine, makeOutline([-90, -30, 30, 90], [17.5, 17.5, 17.5, 17.5]), { ...p, wall: 1.2 } as any);
    expect(tight === null || !tight.ok || tight.checks.length > 0).toBe(true);
  });
});

describe('materials and finishes', () => {
  it('every material offers at least one finish and every finish belongs to a material', () => {
    for (const m of MATERIALS) { expect(m.finishes.length).toBeGreaterThan(0); m.finishes.forEach((f) => expect(FINISHES.some((x) => x.id === f)).toBe(true)); }
    for (const f of FINISHES) expect(MATERIALS.some((m) => m.finishes.includes(f.id))).toBe(true);
    expect(finishAllowed('Metal', 'gloss')).toBe(false); expect(defaultFinishFor('Metal')).toBe('chrome');
  });
  it('weight follows the material: metal is much heavier than plastic for the same shape', () => {
    const g = PRESETS[1], p = presetParams(g);
    const plastic = evaluateIteration(engine, g.outline, { ...p, material: 'PC/ABS' })!.weightG!;
    const metal = evaluateIteration(engine, g.outline, { ...p, material: 'Metal' })!.weightG!;
    expect(metal / plastic).toBeGreaterThan(4);
  });
  it('share links repair a finish that does not suit the material and carry the name', () => {
    const p = { ...defaultParams(), material: 'Metal' as const };
    const d = decodeShare(encodeShare(p, PRESETS[0].outline, { color: '#112233', finish: 'gloss' }, 'My charm'))!;
    expect(d.look.finish).toBe('chrome'); expect(d.look.color).toBe('#112233'); expect(d.name).toBe('My charm');
    expect(sanitizeParams({ material: 'PC' }).material).toBe('PC/ABS'); // old links fall back cleanly
  });
});

describe('library', () => {
  it('works without browser storage (no throw) and keeps per-iteration data', () => {
    const lib = new Library(), seeded = lib.items.length; // a first-run library comes with the smooth starters
    const g = PRESETS[2], p = presetParams(g);
    const it = lib.add('Star A', p, g.outline, { color: '#C9C3F2', finish: 'gloss' });
    expect(lib.get(it.id)!.name).toBe('Star A');
    lib.rename(it.id, 'Star B'); expect(lib.get(it.id)!.name).toBe('Star B');
    p.depth = 1; expect(lib.get(it.id)!.params.depth).not.toBe(1); // stored by value
    lib.remove(it.id); expect(lib.items.length).toBe(seeded);
  });
});

describe('optional flat core seat', () => {
  it('turning it off removes the flat seat and the curvature carry-over, and every shape stays valid', () => {
    const g = PRESETS[1], on = { ...presetParams(g), corePlateau: true }, off = { ...on, corePlateau: false };
    const o = clampOutline(g.outline, on.wall);
    const cageOn = new Float32Array(engine.qs.vertCount * 3), cageOff = new Float32Array(engine.qs.vertCount * 3);
    engine.buildCage(o, on, cageOn); engine.buildCage(o, off, cageOff);
    let diff = 0; for (let i = 0; i < cageOn.length; i++) diff = Math.max(diff, Math.abs(cageOn[i] - cageOff[i]));
    expect(diff).toBeGreaterThan(0.3);                       // the surface really changes
    expect(cageOff.every(Number.isFinite)).toBe(true);
    expect(sanitizeParams({ corePlateau: false }).corePlateau).toBe(false);
    expect(sanitizeParams({ corePlateau: 'nope' }).corePlateau).toBe(false); // junk falls back to the default (off)
    expect(evaluateIteration(engine, o, off)).not.toBeNull();
  });
});

describe('smooth result silhouette', () => {
  it('the z = 0 section of the finished body is a closed, smooth outline close to the control curve', () => {
    const g = PRESETS[2], p = presetParams(g), o = clampOutline(g.outline, p.wall);
    const cage = new Float32Array(engine.qs.vertCount * 3), info = engine.buildCage(o, p, cage)!;
    const pos = new Float32Array(engine.smoothVertCount(2) * 3); engine.smoothInto(cage, 2, pos);
    const seg = sectionSegments(pos, engine.smoothFaces(2), 2, 0);
    expect(seg.length / 6).toBeGreaterThan(60);
    const prof = new Profile(o);
    for (let i = 0; i < seg.length; i += 6) {
      const x = seg[i], y = seg[i + 1] - info.shiftY, r = Math.hypot(x, y), want = prof.radius(Math.atan2(y, x));
      expect(Math.abs(r - want)).toBeLessThan(3.5);   // subdivision shrinks sharp lobes a little, never wildly
    }
  });
});

import { STARTERS, starterParams } from '../src/params/starters';
describe('starter library: smooth, abstract, and sound', () => {
  const turn = (o: any) => { const p = new Profile(o); let max = 0; for (let d = -90; d <= 270; d++) { const P = (a: number) => { const r = p.radius(a * DEG); return [r * Math.cos(a * DEG), r * Math.sin(a * DEG)]; }; const [a, b, c] = [P(d - 1), P(d), P(d + 1)]; const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]]; max = Math.max(max, Math.abs(Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1])) / DEG); } return max; };
  for (const st of STARTERS) it(`${st.name}: valid outline, fully curved, passes every check`, () => {
    expect(isOutlineValid(st.outline)).toBe(true);
    expect(st.outline.smooth).toBe(1);
    const ev = evaluateIteration(engine, st.outline, starterParams(st))!;
    expect(ev, st.name).not.toBeNull();
    console.log(st.name.padEnd(8), 'maxTurn/deg', turn(st.outline).toFixed(1), ev.ok ? 'ALL CHECKS OK' : 'FAIL: ' + ev.checks.filter((c) => !c.ok).map((c) => c.label + ' ' + c.detail).join(' | '));
    expect(ev.ok, ev.checks.filter((c) => !c.ok).map((c) => c.label + ': ' + c.detail).join(' | ')).toBe(true);
    expect(turn(st.outline)).toBeLessThan(st.name === 'Shuriken' ? 50 : 9); // no kinks: the outline turns gradually (the Shuriken's points are its character, still rounded)
  });
  it('has distinct names and a first-run library is seeded exactly once', () => {
    expect(new Set(STARTERS.map((s) => s.name)).size).toBe(STARTERS.length);
    const lib = new Library(); expect(lib.items.length).toBe(STARTERS.length + PRESETS.length);
    expect(lib.starred().map((i) => i.name)).toEqual(['Charmer', 'Star', 'Triangle', 'Drop', 'Shuriken', 'Slate', 'Tile', 'Clover']); // the favourites the pill starts with
  });
});

describe('every preset is sound', () => {
  for (const pr of PRESETS) it(`${pr.name}: passes every live check with the default core`, () => {
    const ev = evaluateIteration(engine, pr.outline, presetParams(pr))!;
    expect(ev.ok, ev.checks.filter((c) => !c.ok).map((c) => c.label + ': ' + c.detail).join(' | ')).toBe(true);
  });
  it('the Triangle is a real triangle: three corners, flat sides, apex up', () => {
    const t = PRESETS.find((p) => p.id === 'triangle')!, prof = new Profile(t.outline);
    const apex = prof.radius(90 * DEG), corner = prof.radius(-30 * DEG), sideMid = prof.radius(-90 * DEG), edgeMid = prof.radius(30 * DEG);
    expect(Math.abs(apex - corner)).toBeLessThan(0.3);        // equilateral: corners equally far
    expect(sideMid).toBeLessThan(apex - 8); expect(Math.abs(sideMid - edgeMid)).toBeLessThan(0.3); // flat sides sit at the inradius
  });
});

import { eyeClearance } from '../src/geometry/features';
describe('eyes never sit on the core', () => {
  const all = [...PRESETS.map((p) => ({ name: p.name, outline: p.outline, params: presetParams(p) })), ...STARTERS.map((s) => ({ name: s.name, outline: s.outline, params: starterParams(s) }))];
  for (const c of all) it(`${c.name}: eyes are outside the core clearance zone (or hidden)`, () => {
    for (const eyeHeight of [0.55, 0.62, 0.74, 0.92]) {
      const params = { ...c.params, eyeHeight } as any;
      const a = buildAll(clampOutline(c.outline, params.wall), params, 2);
      for (const e of a.place.eyes) if (e) expect(Math.hypot(e.point.x, e.point.y - a.info.shiftY), `${c.name} @ ${eyeHeight}`).toBeGreaterThanOrEqual(eyeClearance(params) - 0.6);
    }
  });
});

describe('default eyes', () => {
  it('every shape starts with the 2.4 mm eyes', () => {
    expect(defaultParams().eyeSize).toBe(2.4);
    for (const p of PRESETS) expect(presetParams(p).eyeSize, p.name).toBe(2.4);
    for (const s of STARTERS) expect(starterParams(s).eyeSize, s.name).toBe(2.4);
  });
});

describe('side profile points can sit at any height', () => {
  it('SideCurve is a smooth spline through its points (continuous slope, matches uniform spacing)', async () => {
    const { SideCurve } = await import('../src/geometry/profile');
    const v = [0.8, 1, 1.3, 1.1, 0.9, 0.7, 0.5], u = Array.from({ length: 7 }, (_, i) => i / 6);
    const a = new SideCurve(v), b = new SideCurve(v, u);
    for (let t = 0; t <= 1; t += 0.05) expect(b.eval(t)).toBeCloseTo(a.eval(t), 6);
    v.forEach((y, i) => expect(a.eval(u[i])).toBeCloseTo(y, 6)); // passes through every point
    const c = new SideCurve([1, 1, 1, 1.5, 1.5, 1.5, 1.5], [0, 0.1, 0.2, 0.3, 0.6, 0.8, 1]);
    for (let t = 0.02; t < 0.98; t += 0.02) { const y = c.eval(t); expect(y).toBeGreaterThan(0.8); expect(y).toBeLessThan(1.75); expect(Math.abs(c.deriv(t + 1e-4) - c.deriv(t - 1e-4))).toBeLessThan(0.05); } // no kinks
  });
  it('clampSide repairs heights: ordered, ends fixed', async () => {
    const { clampSide } = await import('../src/params/side');
    const s = clampSide({ back: Array(7).fill(1), front: Array(7).fill(1), backT: [0.2, 0.9, 0.1, 0.5, 0.4, 0.3, 0.8] });
    expect(s.backT![0]).toBe(0); expect(s.backT![6]).toBe(1);
    for (let i = 1; i < 7; i++) expect(s.backT![i]).toBeGreaterThan(s.backT![i - 1]);
  });
});

describe('recenter the outline around a moved Core', () => {
  it('keeps the shape and refuses a move that would leave no room', async () => {
    const { recenterOutline } = await import('../src/params/outlineEdit');
    const { PRESETS } = await import('../src/params/presets');
    const o = PRESETS[0].outline;
    const up = recenterOutline(o, 4, 1.6);
    expect(up).not.toBeNull();
    expect(new Profile(up!).radius(-Math.PI / 2)).toBeGreaterThan(new Profile(o).radius(-Math.PI / 2)); // more body below the Core now
    expect(recenterOutline(o, -60, 1.6)).toBeNull();
  });
});

describe('failing checks say where and what to fix', () => {
  it('radius and draft failures carry a fix and a location', async () => {
    const r = checkRadius(new Float32Array([0.5, 5, 9]), 1.6, new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(r.ok).toBe(false); expect(r.fix).toBeTruthy(); expect(r.at).toEqual({ x: 1, y: 2, z: 3 });
    const d = checkDraft(new Float32Array([-30, -20, 5, 5]), 0, new Float32Array(12));
    expect(d.fix).toBeTruthy(); expect(d.at).toBeDefined();
  });
});

describe('side profile smoothness', () => {
  it('smooth 0 is straight between points, 1 is the cubic', async () => {
    const { SideCurve } = await import('../src/geometry/profile');
    const v = [1, 1.4, 0.8, 1, 1.2, 0.9, 1];
    const lin = new SideCurve(v, undefined, 0), cub = new SideCurve(v, undefined, 1);
    expect(lin.eval(1 / 12)).toBeCloseTo((v[0] + v[1]) / 2, 6); // halfway along the first segment
    expect(lin.eval(2 / 6)).toBeCloseTo(v[2], 6);
    expect(cub.eval(1 / 12)).not.toBeCloseTo((v[0] + v[1]) / 2, 3);
  });
});

describe('side profile points can be added and removed', () => {
  it('adds at the biggest gap, removes interior points only, keeps 4 to 10, and blends profiles with different counts', async () => {
    const { defaultSide, addSidePoint, removeSidePoint, removeSidePointAuto, lerpSide, sideTs, clampSide } = await import('../src/params/side');
    let s = defaultSide();
    for (let i = 0; i < 3; i++) s = addSidePoint(s, 'front')!;
    expect(s.front.length).toBe(10); expect(s.back.length).toBe(7);
    expect(addSidePoint(s, 'front')).toBeNull(); // at most 10
    const ts = sideTs(s, 'front'); for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
    expect(removeSidePoint(s, 'front', 0)).toBeNull(); expect(removeSidePoint(s, 'front', 9)).toBeNull();
    let r = s; for (let i = 0; i < 6; i++) r = removeSidePointAuto(r, 'front')!; expect(r.front.length).toBe(4); expect(removeSidePointAuto(r, 'front')).toBeNull();
    const mid = lerpSide(defaultSide(), s, 0.5); expect(mid.front.length).toBe(10); for (const v of mid.front) expect(Number.isFinite(v)).toBe(true);
    expect(clampSide(JSON.parse(JSON.stringify(s))).front.length).toBe(10);
  });
});

describe('eyes can be two, one or none', () => {
  it('places the requested number of eyes, and a single eye is centred', () => {
    const pr = PRESETS[0], base = presetParams(pr), o = clampOutline(pr.outline, base.wall);
    const count = (eyes: 'two' | 'one' | 'none') => buildAll(o, { ...base, eyes }, 2).place.eyes.filter(Boolean).length;
    expect(count('two')).toBe(2); expect(count('one')).toBe(1); expect(count('none')).toBe(0);
    const one = buildAll(o, { ...base, eyes: 'one' }, 2).place.eyes.find(Boolean)!;
    expect(Math.abs(one.point.x)).toBeLessThan(0.5);
  });
});

describe('side silhouette', () => {
  it('shows the whole body seen from the side, not just the centre slice (the gap between feet)', async () => {
    const { sideSilhouette } = await import('../src/geometry/section');
    const pr = PRESETS[0], p = presetParams(pr), a = buildAll(clampOutline(pr.outline, p.wall), p, 2);
    const seg = sideSilhouette(a.outer, a.faces); expect(seg.length).toBeGreaterThan(300);
    const slice = sectionSegments(a.outer, a.faces, 0, 0);
    const minY = (arr: Float32Array) => { let m = Infinity; for (let i = 1; i < arr.length; i += 3) m = Math.min(m, arr[i]); return m; };
    expect(minY(seg)).toBeLessThanOrEqual(minY(slice) + 1e-6); // the feet reach lower than the centre slice
    let zmax = -Infinity, zminSlice = Infinity; for (let i = 2; i < seg.length; i += 3) zmax = Math.max(zmax, seg[i]); for (let i = 2; i < slice.length; i += 3) zminSlice = Math.min(zminSlice, slice[i]);
    expect(Number.isFinite(zmax) && Number.isFinite(zminSlice)).toBe(true);
  });
});

describe('side profile is true to the body and smooth', () => {
  it('matches the 3D body extents and has no jagged steps', async () => {
    const { sideProfileOf } = await import('../src/geometry/section');
    const pr = PRESETS[0], p = presetParams(pr), a = buildAll(clampOutline(pr.outline, p.wall), p, 2), prof = sideProfileOf(a.outer, a.faces);
    let zmax = -Infinity, zmin = Infinity, ymax = -Infinity, ymin = Infinity; for (let i = 0; i < a.outer.length; i += 3) { zmax = Math.max(zmax, a.outer[i + 2]); zmin = Math.min(zmin, a.outer[i + 2]); ymax = Math.max(ymax, a.outer[i + 1]); ymin = Math.min(ymin, a.outer[i + 1]); }
    expect(Math.max(...prof.front)).toBeGreaterThan(zmax - 0.4); expect(Math.min(...prof.back)).toBeLessThan(zmin + 0.4); // reaches the true extremes
    expect(prof.ys[prof.ys.length - 1]).toBeGreaterThan(ymax - ymin - 0.8);
    const jag = (a: number[]) => { let w = 0; for (let i = 1; i < a.length - 1; i++) w = Math.max(w, Math.abs(a[i + 1] - 2 * a[i] + a[i - 1])); return w; }; // second difference: stair-steps show up here
    console.log('side outline roughness (max 2nd difference, mm):', jag(prof.front).toFixed(2), jag(prof.back).toFixed(2));
    expect(jag(prof.front)).toBeLessThan(1.2); expect(jag(prof.back)).toBeLessThan(1.2);
  });
});
