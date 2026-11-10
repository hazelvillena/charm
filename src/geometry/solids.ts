import { getManifold, ManifoldApi } from './kernel';
import type { Manifold } from 'manifold-3d';
import { triangulate } from './mesh';
import { Params } from '../params/schema';
import { CORE, floorThickness, seatRadius } from '../params/core';
import { Placement, eyeShapes, engraveShapes, loopSlot } from './features';
import { coreProfile } from './coreProfile';
import { PRINT } from '../params/print';
import { stadium, closureSpots, layoutFlat } from './printParts';

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
  /** 3D-print prototype only (`print: true`): the parts laid flat on a plate, ready for one STL */
  print?: { parts: { name: string; mesh: MeshOut }[]; rimMagnets: number };
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
  /** build the print prototype: half-lap seam, rim magnet pockets, engraved eyes, flat layout */
  print?: boolean;
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
    const cx = 0, cy = place.puck.point.y, zFront = place.puck.point.z;
    const sr = seatRadius(), zFloor = zFront - CORE.puckDepth, floorT = floorThickness();
    const splitOffset = p.splitZ * p.depth;
    const print = !!input.print;
    const C = api.CrossSection;
    // Extra material (the rim band, magnet bosses, the loop lug) is made by filling parts of the empty inside before the hollow is cut,
    // so it never has to be fused to the outer surface (fusing faces that coincide leaves sliver edges that slicers reject).
    const fills: { delete(): void }[] = [];
    // print prototype: a thicker rim band around the seam holds the half-lap joint
    const T = p.wall + PRINT.rimExtra, lc = PRINT.lapClearance, L = PRINT.lapHeight, H = L + lc + 1;
    const seam = print ? track(outer.slice(splitOffset)) : null;
    // the rim features keep out of the seat cup (its wall is solid anyway)
    const cupDisc = print ? track(C.circle(sr + p.wall - 0.3, 72).translate([cx, cy])) : null;
    const pockets: { delete(): void }[] = []; // rim magnet pockets, cut from the finished shell
    const keepOut: { delete(): void }[] = []; // cutters the half-lap must stay clear of
    let rimMagnets = 0;
    if (print) run('rim band', () => {
      // back half: the full band. Front half: only the outer half of the band up to the rebate's ceiling, then the full band above it
      // (so the rebate is simply left empty: nothing has to be cut out of the front afterwards)
      const full = track(track(seam!.subtract(track(seam!.offset(-T, 'Round')))).subtract(cupDisc!));
      const outerHalf = track(track(seam!.subtract(track(seam!.offset(-(T / 2 - lc / 2), 'Round')))).subtract(cupDisc!));
      const prism = (cs: typeof full, z0: number, z1: number) => track(track(cs.extrude(z1 - z0)).translate([0, 0, splitOffset + z0]));
      fills.push(prism(full, -H, 0), prism(outerHalf, 0, H), prism(full, L + lc, H));
      keepOut.push(track(M.cylinder(zFront + PUCK_HEAD - zFloor, sr, sr, 72, false).translate([cx, cy, zFloor])));
      keepOut.push(track(M.cube([CORE.notch.width, CORE.notch.depth + 0.6, zFront + PUCK_HEAD - zFloor], false).translate([cx - CORE.notch.width / 2, cy - sr - CORE.notch.depth, zFloor])));
    });
    // print prototype: closure magnets (one pair of 5x2 mm discs per spot) sit in bosses on the seam, outside the rim band
    if (print) run('rim magnets', () => {
      const rm = PRINT.rimMagnet, pr = rm.diameter / 2 + rm.clearance, pd = rm.thickness + 0.1; // pocket radius, depth each side of the seam
      const room = track(track(seam!.offset(-(T + rm.margin + pr), 'Round')).subtract(track(C.circle(sr + CORE.notch.depth + pr + 0.4, 72).translate([cx, cy]))));
      for (const sp of closureSpots(room, pr + 1)) {
        const bossH = 2 * (pd + rm.boss);
        fills.push(track(M.cylinder(bossH, pr + rm.boss, pr + rm.boss, 48, true).translate([sp.x, sp.y, splitOffset])));
        pockets.push(track(M.cylinder(2 * pd, pr, pr, 40, true).translate([sp.x, sp.y, splitOffset])));
        keepOut.push(track(M.cylinder(bossH + 2, pr + 0.3, pr + 0.3, 40, true).translate([sp.x, sp.y, splitOffset])));
        rimMagnets += 2;
      }
    });
    // the thread loop: a rounded slot through a lug that melts into the shell (never sticks out past the body)
    let slotCut: Manifold | null = null;
    if (place.loop) run('loop slot', () => {
      const c = place.loop!.center, d = place.loop!.outward, ls = loopSlot(), bh = CORE.loop.minThickness + 1;
      const ang = (Math.atan2(d.y, d.x) * 180) / Math.PI - 90; // long side of the slot runs along the edge
      const slot = track(track(stadium(api, track, ls.length, ls.width).rotate(ang)).translate([c.x, c.y]));
      fills.push(track(track(slot.offset(ls.boss, 'Round', 2, 48)).extrude(bh, 0, 0, 1, true).translate([0, 0, c.z])));
      slotCut = track(track(slot.extrude(bh + 20, 0, 0, 1, true)).translate([0, 0, c.z]));
      if (print) keepOut.push(slotCut);
    });
    let shell = run('hollow shell', () => track(outer.subtract(fills.length ? track(inner.subtract(track(M.union(fills as any[])))) : inner)));
    if (pockets.length) shell = run('rim pockets', () => track(shell.subtract(track(M.union(pockets as any[])))));
    if (slotCut) { const cut = slotCut as Manifold; shell = run('loop slot cut', () => track(shell.subtract(cut))); }

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

    const [frontM, backM] = run('split front/back', () => {
      const [a, b] = shell.splitByPlane([0, 0, 1], splitOffset);
      track(a); track(b);
      if (a.isEmpty() || b.isEmpty()) throw new Error('split plane misses the body');
      return [a, b] as const;
    });

    // print prototype: half-lap seam (back shell's inner half reaches into a rebate in the front shell), engraved eyes, flat layout
    let printOut: Casing['print'];
    let frontF = frontM, backF = backM;
    if (print) {
      const lapped = run('half-lap seam', () => {
        const keep = track(M.union(keepOut as any));
        // the lap stays inside the cavity as it is at the lap's full height (where it is narrowest), so a steep wall never runs into it
        const reach = track(track(inner.slice(splitOffset + L + lc)).offset(-lc, 'Round'));
        const ring = track(track(track(seam!.offset(-(T / 2 + lc / 2), 'Round').subtract(track(seam!.offset(-(T - PRINT.lapInset), 'Round')))).subtract(cupDisc!)));
        const lap = track(track(track(ring.intersect(reach)).extrude(L + 0.2)).translate([0, 0, splitOffset - 0.2]));
        const back2 = track(M.union(backM, track(lap.subtract(keep))));
        return [frontM, back2] as const;
      });
      frontF = lapped[0]; backF = lapped[1];
      frontF = run('engrave eyes', () => {
        const cuts = engraveShapes(place, p, PRINT.engraveDepth).map((e) => {
          const mat = [e.x.x, e.x.y, e.x.z, 0, e.y.x, e.y.y, e.y.z, 0, e.z.x, e.z.y, e.z.z, 0, e.c.x, e.c.y, e.c.z, 1];
          return track(track(track(M.sphere(1, 28)).scale([e.rx, e.ry, e.rz])).transform(mat as any));
        });
        return cuts.length ? track(frontF.subtract(track(M.union(cuts)))) : frontF;
      });
      // tidy for slicers: merge near-coplanar facets and collapse sliver edges (0.01 mm), which also cuts the file size
      frontF = run('tidy front', () => track(frontF.simplify(PRINT.tidy)));
      backF = run('tidy back', () => track(backF.simplify(PRINT.tidy)));
      printOut = run('print layout', () => ({
        parts: layoutFlat([{ name: 'Front shell', mesh: extract(frontF) }, { name: 'Back shell', mesh: extract(backF), flip: true }, { name: 'Core (fit dummy)', mesh: parts.core }], PRINT.gap),
        rimMagnets,
      }));
    }

    const out = run('collect meshes', () => ({
      front: extract(frontF), back: extract(backF),
      outerVolume: outer.volume(), frontVolume: frontF.volume(), backVolume: backF.volume(),
    }));
    return {
      ...out, parts, section, print: printOut, shellVolume: out.frontVolume + out.backVolume,
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
