import { getManifold, ManifoldApi } from './kernel';
import { triangulate } from './mesh';
import { Params } from '../params/schema';
import { CORE, floorThickness, seatRadius } from '../params/core';
import { Placement, eyeShapes } from './features';
import { coreProfile } from './coreProfile';

export type MeshOut = { positions: Float32Array; tris: Uint32Array };
/** The casing cut open at x = 0 (keeps x <= 0): real solids, so the cut faces are true section faces. */
/** mm of radial clearance around a magnet so it presses in without force (moulding tolerance). */
export const MAGNET_CLEARANCE = 0.1;
export type SectionData = { shell: MeshOut; core: MeshOut; magnets: MeshOut[] };
export type Casing = {
  section?: SectionData;
  front: MeshOut; back: MeshOut;
  outerVolume: number; frontVolume: number; backVolume: number; shellVolume: number;
  /** the rest of the hardware as closed solids, so every export carries the whole assembly */
  parts: { core: MeshOut; magnets: MeshOut[]; eyes: MeshOut[] };
  seat: { x: number; y: number; zFront: number; zFloor: number; radius: number };
  magnets: { x: number; y: number; z: number }[];
  splitOffset: number;
  ms: number;
  steps: string[];
};

export class AcceptError extends Error {
  constructor(public step: string, cause?: unknown) {
    super(`Accept failed at step "${step}"${cause instanceof Error ? ': ' + cause.message : ''}`);
  }
}

const PUCK_HEAD = 8; // extend cutters beyond the front surface

function toManifold(api: ManifoldApi, pos: Float32Array, faces: Uint32Array, track: <T extends { delete(): void }>(x: T) => T) {
  const mesh = new api.Mesh({ numProp: 3, vertProperties: pos.slice(), triVerts: triangulate(faces) });
  const m = track(new api.Manifold(mesh));
  if (m.status() !== 'NoError' || m.isEmpty() || m.volume() <= 0) throw new Error(`mesh rejected (${m.status()})`);
  return m;
}

function extract(m: { getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } }): MeshOut {
  const g = m.getMesh();
  const n = g.vertProperties.length / g.numProp;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] = g.vertProperties[i * g.numProp + k];
  return { positions, tris: new Uint32Array(g.triVerts) };
}

/**
 * Accept pipeline. Runs on release only. Any failure throws AcceptError naming the step;
 * callers keep the previous valid state. All WASM objects are freed.
 */
export async function buildCasing(input: {
  outerPos: Float32Array; innerPos: Float32Array; faces: Uint32Array; params: Params; place: Placement; section?: boolean;
}): Promise<Casing> {
  const t0 = performance.now();
  const api = await getManifold();
  const pool: { delete(): void }[] = [];
  const track = <T extends { delete(): void }>(x: T): T => { pool.push(x); return x; };
  const steps: string[] = [];
  let step = 'start';
  const run = <T>(name: string, fn: () => T): T => {
    step = name;
    try { const r = fn(); steps.push(name); return r; } catch (e) { throw new AcceptError(name, e); }
  };
  const { params: p, place } = input;
  const M = api.Manifold;
  try {
    if (!place.puck) throw new AcceptError('features', new Error('core not placed'));
    const outer = run('outer solid', () => toManifold(api, input.outerPos, input.faces, track));
    const inner = run('inner solid', () => toManifold(api, input.innerPos, input.faces, track));
    let shell = run('hollow shell', () => track(outer.subtract(inner)));

    const cx = 0, cy = place.puck.point.y, zFront = place.puck.point.z;
    const sr = seatRadius(), zFloor = zFront - CORE.puckDepth, floorT = floorThickness();

    // seat cup: solid wall + floor around the puck, clipped to the outer envelope, then the seat is cut out
    shell = run('puck seat', () => {
      const cupR = sr + p.wall;
      const zLo = zFloor - floorT, h = zFront + PUCK_HEAD - zLo;
      const cup = track(M.cylinder(h, cupR, cupR, 72, false).translate([cx, cy, zLo]));
      const clipped = track(M.intersection(cup, outer));
      const withCup = track(M.union(shell, clipped));
      const seat = track(M.cylinder(zFront + PUCK_HEAD - zFloor, sr, sr, 72, false).translate([cx, cy, zFloor]));
      return track(withCup.subtract(seat));
    });

    const magnets: Casing['magnets'] = [];
    // magnets press in from the back, sealed behind a thin floor (the "gap"), retained by the back shell
    shell = run('magnet pockets', () => {
      let s = shell;
      const { count, spacing, diameter, thickness, gap } = CORE.magnet;
      const zTop = zFloor - gap, zBot = zFloor - floorT - 0.4;
      for (let i = 0; i < count; i++) {
        const my = cy + (i - (count - 1) / 2) * spacing; // stacked vertically, on the centre line
        const pocket = track(M.cylinder(zTop - zBot, diameter / 2 + MAGNET_CLEARANCE, diameter / 2 + MAGNET_CLEARANCE, 40, false).translate([0, my, zBot]));
        s = track(s.subtract(pocket));
        magnets.push({ x: 0, y: my, z: zTop - thickness / 2 });
      }
      return s;
    });

    shell = run('notch', () => {
      const w = CORE.notch.width, d = CORE.notch.depth;
      const box = track(M.cube([w, d + 0.6, zFront + PUCK_HEAD - zFloor], false).translate([cx - w / 2, cy - sr - d, zFloor]));
      return track(shell.subtract(box));
    });

    if (place.loop) shell = run('loop nook', () => {
      const c = place.loop!.center, hr = CORE.loop.holeDiameter / 2, br = hr + CORE.loop.boss, bh = CORE.loop.minThickness + 1;
      const boss = track(M.cylinder(bh, br, br, 48, false).translate([c.x, c.y, c.z - bh / 2]));
      const bossIn = track(M.intersection(boss, outer)); // never sticks out past the body surface
      const withBoss = track(M.union(shell, bossIn));
      const hole = track(M.cylinder(bh + 20, hr, hr, 36, false).translate([c.x, c.y, c.z - (bh + 20) / 2]));
      return track(withBoss.subtract(hole));
    });

    let section: SectionData | undefined;
    if (input.section) {
      section = run('section cut', () => {
        const plane: [number, number, number] = [-1, 0, 0];
        const cutShell = track(shell.trimByPlane(plane, 0));
        // the Core as a real solid (revolved profile), seated on the floor of the seat
        const poly = coreProfile().map(([r, y]) => [r, y] as [number, number]);
        const coreSolid = track(api.Manifold.revolve(track(new api.CrossSection([poly])), 96)).translate([0, cy, zFloor + CORE.puckDepth / 2]);
        track(coreSolid);
        const cutCore = track(coreSolid.trimByPlane(plane, 0));
        const mags = magnets.map((mg) => {
          const m = track(M.cylinder(CORE.magnet.thickness, CORE.magnet.diameter / 2, CORE.magnet.diameter / 2, 40, true).translate([mg.x, mg.y, mg.z]));
          return track(m.trimByPlane(plane, 0));
        });
        const ex = (m: { isEmpty(): boolean; getMesh(): any }) => (m.isEmpty() ? { positions: new Float32Array(), tris: new Uint32Array() } : extract(m));
        return { shell: ex(cutShell), core: ex(cutCore), magnets: mags.map(ex) };
      });
    }

    // the Core, the magnets and the eyes as closed solids (they ship in every export alongside the two shells)
    const parts = run('hardware solids', () => {
      const poly = coreProfile().map(([r, y]) => [r, y] as [number, number]);
      const core = track(track(api.Manifold.revolve(track(new api.CrossSection([poly])), 96)).translate([0, cy, zFloor + CORE.puckDepth / 2]));
      const mags = magnets.map((mg) => track(M.cylinder(CORE.magnet.thickness, CORE.magnet.diameter / 2, CORE.magnet.diameter / 2, 40, true).translate([mg.x, mg.y, mg.z])));
      const eyes = eyeShapes(place, p).map((e) => {
        const mat = [e.x.x, e.x.y, e.x.z, 0, e.y.x, e.y.y, e.y.z, 0, e.z.x, e.z.y, e.z.z, 0, e.c.x, e.c.y, e.c.z, 1];
        return track(track(track(M.sphere(1, 28)).scale([e.rx, e.ry, e.rz])).transform(mat as any));
      });
      return { core: extract(core), magnets: mags.map(extract), eyes: eyes.map(extract) };
    });

    const splitOffset = p.splitZ * p.depth;
    const [frontM, backM] = run('split front/back', () => {
      const [a, b] = shell.splitByPlane([0, 0, 1], splitOffset);
      track(a); track(b);
      if (a.isEmpty() || b.isEmpty()) throw new Error('split plane misses the body');
      return [a, b] as const;
    });

    const out = run('collect meshes', () => ({
      front: extract(frontM), back: extract(backM),
      outerVolume: outer.volume(), frontVolume: frontM.volume(), backVolume: backM.volume(),
    }));
    return {
      ...out, parts, section, shellVolume: out.frontVolume + out.backVolume,
      seat: { x: cx, y: cy, zFront, zFloor, radius: sr }, magnets, splitOffset,
      ms: performance.now() - t0, steps,
    };
  } catch (e) {
    if (e instanceof AcceptError) throw e;
    throw new AcceptError(step, e);
  } finally {
    for (const o of pool) { try { o.delete(); } catch { /* already freed */ } }
  }
}

/**
 * Simplify a shell mesh within `tolerance` mm (merges nearly coplanar facets, keeps it manifold).
 * Used for STEP export, where every triangle becomes a face.
 */
export async function simplifyMesh(m: MeshOut, tolerance: number): Promise<MeshOut> {
  const api = await getManifold();
  const pool: { delete(): void }[] = [];
  try {
    const mesh = new api.Mesh({ numProp: 3, vertProperties: m.positions.slice(), triVerts: m.tris.slice() });
    const a = new api.Manifold(mesh); pool.push(a);
    if (a.status() !== 'NoError') throw new Error(`mesh rejected (${a.status()})`);
    const b = a.simplify(tolerance); pool.push(b);
    return extract(b);
  } finally { for (const o of pool) { try { o.delete(); } catch { /* freed */ } } }
}
