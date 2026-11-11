import { describe, it, expect } from 'vitest';
import { PRESETS, presetParams } from '../src/params/presets';
import { clampOutline } from '../src/params/outline';
import { buildCasing } from '../src/geometry/solids';
import { buildAll } from './helpers';
import { getManifold } from '../src/geometry/kernel';
import { PRINT } from '../src/params/print';
import { CORE } from '../src/params/core';
import { meshHealth } from '../src/geometry/meshHealth';

const weldedProblems = meshHealth;

const bbox = (m: { positions: Float32Array }) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.positions[i + k]); hi[k] = Math.max(hi[k], m.positions[i + k]); }
  return { lo, hi };
};

async function build(presetIx: number, patch: Record<string, unknown>, print: boolean, strap = true) {
  const pr = PRESETS[presetIx], params = { ...presetParams(pr), ...patch } as any;
  const a = buildAll(clampOutline(pr.outline, params.wall), params, 3);
  const place = strap ? a.place : { ...a.place, strap: null }; // `strap: false` builds the same shape without the strap hole, to compare against
  return { casing: await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params, place, print }), place, params };
}

describe('3D print prototype export', () => {
  for (const ix of [0, 1]) {
    it(`${PRESETS[ix].id}: parts lie flat on the plate, apart, with the Core as a fit dummy`, async () => {
      const { casing } = await build(ix, {}, true);
      const pp = casing.print!.parts;
      expect(pp.map((x) => x.name)).toEqual(['Front shell', 'Back shell', 'Core (fit dummy)']);
      const boxes = pp.map((x) => bbox(x.mesh));
      for (const b of boxes) { expect(b.lo[2]).toBeCloseTo(0, 3); expect(Math.abs(b.lo[1] + b.hi[1])).toBeLessThan(1e-3); }
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].lo[0] - boxes[i - 1].hi[0]).toBeGreaterThanOrEqual(PRINT.gap - 1e-3); // no overlap, a gap between
      // the dummy Core is the real puck size (the clearance is in the seat)
      expect(boxes[2].hi[0] - boxes[2].lo[0]).toBeCloseTo(CORE.puckDiameter, 1);
      // eyes are engraved into the front shell, not exported as parts
      expect(pp.some((x) => /eye/i.test(x.name))).toBe(false);
      // clean for slicers (Bambu Studio flagged a non-manifold edge once): every part is closed and consistently wound
      for (const x of pp) expect(weldedProblems(x.mesh), x.name).toEqual({ open: 0, flipped: 0 });
    }, 30000);
  }

  it('engraves the eyes: the print front shell has less material than the plain one; with eyes off it is the same apart from the joint', async () => {
    const plain = await build(0, {}, false), printed = await build(0, {}, true);
    expect(printed.casing.frontVolume).not.toBeCloseTo(plain.casing.frontVolume, 0); // rim band + rebate + engraving all change it
    const noEyes = await build(0, { eyes: 'none' }, true);
    expect(noEyes.casing.frontVolume).toBeGreaterThan(printed.casing.frontVolume); // two engraved recesses removed more
    expect(printed.casing.print!.parts.length).toBe(3);
  }, 40000);

  it('half-lap joint: the shells fit together without overlapping and the rim magnet pockets are real', async () => {
    const { casing } = await build(0, {}, true);
    const api = await getManifold();
    const mk = (m: { positions: Float32Array; tris: Uint32Array }) => new api.Manifold(new api.Mesh({ numProp: 3, vertProperties: m.positions.slice(), triVerts: m.tris.slice() }));
    const f = mk(casing.front), b = mk(casing.back);
    expect(f.status()).toBe('NoError'); expect(b.status()).toBe('NoError');
    // assembled (not laid out): the back's lap sits in the front's rebate with clearance, so the two never intersect
    const inter = f.intersect(b);
    expect(inter.volume()).toBeLessThan(0.5); // mm3: touching faces only
    expect(casing.print!.rimMagnets % 2).toBe(0);
    console.log('rim magnets', casing.print!.rimMagnets, 'front cm3', (casing.frontVolume / 1000).toFixed(2), 'back cm3', (casing.backVolume / 1000).toFixed(2));
  }, 40000);

  for (let ix = 0; ix < PRESETS.length; ix++) it(`${PRESETS[ix].id}: strap tunnel — a cord runs down one opening, under the bar and up the other; the bar and the outline are intact`, async () => {
    const { casing, place } = await build(ix, {}, true);
    expect(place.strap).not.toBeNull();
    const st = place.strap!, S = CORE.strap, api = await getManifold(), M = api.Manifold;
    expect(st.z1 + S.floor).toBeLessThanOrEqual(casing.splitOffset + 1e-6); // the whole tunnel sits in the back shell
    for (const x of casing.print!.parts) expect(weldedProblems(x.mesh), x.name).toEqual({ open: 0, flipped: 0 });
    const back = new api.Manifold(new api.Mesh({ numProp: 3, vertProperties: casing.back.positions.slice(), triVerts: casing.back.tris.slice() }));
    const zc = (st.z0 + st.z1) / 2, r = Math.min(S.openingHeight, S.channelHeight) / 2 - 0.3;
    const cyl = (len: number, at: [number, number, number], rot: [number, number, number]) => M.cylinder(len, r, r, 24, true).rotate(rot).translate(at);
    // the cord: straight down into each opening, and along the channel between them
    const cord = M.union([cyl(400, [-S.spacing / 2, st.yc, st.z0 - 200 + 1], [0, 0, 0]), cyl(400, [S.spacing / 2, st.yc, st.z0 - 200 + 1], [0, 0, 0]), cyl(S.spacing, [0, st.yc, zc], [0, 90, 0])]);
    expect(back.intersect(cord).volume()).toBeLessThan(0.5); // nothing blocks the cord's path
    const bar = M.cube([1, 1, 1], true).translate([0, st.yc, st.z0 - S.bar / 2]);
    expect(back.intersect(bar).volume()).toBeGreaterThan(0.9); // the bar the cord wraps around is solid
    const floor = M.cube([1, 1, 1], true).translate([0, st.yc, st.z1 + S.floor / 2]);
    expect(back.intersect(floor).volume()).toBeGreaterThan(0.9); // and so is the floor under the channel
    // nothing sticks out: the strap tunnel is inside the body
    const plain = await build(ix, {}, true, false);
    expect(bbox(casing.back).hi[1]).toBeCloseTo(bbox(plain.casing.back).hi[1], 1);
  }, 40000);
});

describe('print prototype across the built-in shapes', () => {
  for (let ix = 0; ix < PRESETS.length; ix++) {
    it(`${PRESETS[ix].id}: builds, joint does not collide`, async () => {
      const { casing } = await build(ix, {}, true);
      const api = await getManifold();
      const mk = (m: { positions: Float32Array; tris: Uint32Array }) => new api.Manifold(new api.Mesh({ numProp: 3, vertProperties: m.positions.slice(), triVerts: m.tris.slice() }));
      const f = mk(casing.front), b = mk(casing.back);
      expect(f.status()).toBe('NoError'); expect(b.status()).toBe('NoError');
      expect(f.intersect(b).volume()).toBeLessThan(0.5);
      for (const x of casing.print!.parts) expect(weldedProblems(x.mesh), `${PRESETS[ix].id} ${x.name}`).toEqual({ open: 0, flipped: 0 });
      console.log(PRESETS[ix].id, 'rim magnets', casing.print!.rimMagnets);
    }, 40000);
  }
});

describe('every STL output is watertight for slicers (root guard for all exports)', () => {
  for (let ix = 0; ix < PRESETS.length; ix++) for (const loop of [false, true]) { // false = built without the strap hole (a comparison), true = as the app builds it
    it(`${PRESETS[ix].id}${loop ? ' with loop' : ''}: shells, parts and print layout`, async () => {
      for (const print of [false, true]) {
        const { casing } = await build(ix, {}, print, loop);
        const meshes = [['front', casing.front], ['back', casing.back], ['core', casing.parts.core], ...casing.parts.magnets.map((m, i) => [`magnet ${i}`, m] as const), ...casing.parts.eyes.map((m, i) => [`eye ${i}`, m] as const), ...(casing.print?.parts ?? []).map((x) => [x.name, x.mesh] as const)] as const;
        for (const [name, m] of meshes) expect(meshHealth(m), `${PRESETS[ix].id} ${loop ? 'loop ' : ''}${print ? 'print ' : ''}${name}`).toEqual({ open: 0, flipped: 0 });
      }
    }, 60000);
  }
});

describe('strap tunnel search always ends', () => {
  it('a body too shallow for the tunnel gets none (and the sanity check says so) instead of searching forever', () => {
    const pr = PRESETS[0], params = { ...presetParams(pr), depth: 12, splitZ: 0 } as any;
    const a = buildAll(clampOutline(pr.outline, params.wall), params, 2);
    expect(a.place.strap).toBeNull();
  }, 15000);
});
