import { getManifold, ManifoldApi } from './kernel';
import type { Manifold } from 'manifold-3d';
import { triangulate } from './mesh';
import { Params } from '../params/schema';
import { CORE, floorThickness, seatRadius } from '../params/core';
import { Placement, eyeShapes, engraveShapes, strapPill } from './features';
import { coreProfile } from './coreProfile';
import { PRINT } from '../params/print';
import { layoutFlat } from './printParts';

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
  print?: { parts: { name: string; mesh: MeshOut }[] };
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
    const keepOut: { delete(): void }[] = []; // cutters the half-lap must stay clear of
    // where the lap can go: inside the cavity as it is at the lap's full depth (the narrowest), so a steep or rolled-over wall never runs into it.
    // The rebate in the back shell is only cut where the lap goes; where the shell is too shallow for the joint the seam stays a flat, wide band
    const reach = print ? track(track(inner.slice(splitOffset - L - lc)).offset(-lc, 'Round')) : null;
    const lapRing = print ? track(track(seam!.offset(-(T / 2 + lc / 2), 'Round').subtract(track(seam!.offset(-(T - PRINT.lapInset), 'Round')))).subtract(cupDisc!)) : null;
    const lapCross = print ? track(lapRing!.intersect(reach!)) : null;
    if (print) run('rim band', () => {
      // front half: the full band. Back half: only the outer half of the band down to the rebate's floor, then the full band below it
      // (so the rebate is simply left empty: nothing has to be cut out afterwards). The front shell carries the lap, so the back shell's
      // seam face is what lies on the plate: both shells print seam face down (the outside surfaces face up, clean; any supports sit inside the hollow)
      const full = track(track(seam!.subtract(track(seam!.offset(-T, 'Round')))).subtract(cupDisc!));
      const outerHalf = track(track(seam!.subtract(track(seam!.offset(-(T / 2 - lc / 2), 'Round')))).subtract(cupDisc!));
      const prism = (cs: typeof full, z0: number, z1: number) => track(track(cs.extrude(z1 - z0)).translate([0, 0, splitOffset + z0]));
      fills.push(prism(full, 0, H), prism(outerHalf, -H, 0), prism(full, -H, -(L + lc)));
      // shallow stretches (feet, tips): no rebate, the band is solid up to the seam. The pocket zone is the lap's footprint grown by the clearance and a little more
      const pocket = track(lapCross!.offset(lc + 0.3, 'Round'));
      const shallow = track(full.subtract(pocket));
      if (!shallow.isEmpty()) fills.push(prism(shallow, -(L + lc) - 0.5, 0)); // its bottom sits inside the band below, not on a shared plane
      keepOut.push(track(M.cylinder(zFront + PUCK_HEAD - zFloor, sr, sr, 72, false).translate([cx, cy, zFloor])));
      keepOut.push(track(M.cube([CORE.notch.width, CORE.notch.depth + 0.6, zFront + PUCK_HEAD - zFloor], false).translate([cx - CORE.notch.width / 2, cy - sr - CORE.notch.depth, zFloor])));
    });
    // the strap holes (every shape, back shell): two vertical slots straight through the back wall into the hollow. Nothing else is added: no column,
    // no channel, so there is no bridge and no overhang, and a cord runs inside the shell from one hole to the other
    let strapCut: Manifold | null = null;
    if (place.strap) run('strap holes', () => {
      const S = CORE.strap, st = place.strap!, ex = (poly: [number, number][], z0: number, z1: number, dx: number) =>
        track(track(track(new api.CrossSection([poly.map(([x, y]): [number, number] => [x + dx, y + st.yc])])).extrude(z1 - z0)).translate([0, 0, z0]));
      const slot = strapPill(S.openingWidth, S.openingHeight);
      strapCut = track(M.union([ex(slot, -200, st.zTop, -S.spacing / 2), ex(slot, -200, st.zTop, S.spacing / 2)] as any[]));
    });
    let shell = run('hollow shell', () => track(outer.subtract(fills.length ? track(inner.subtract(track(M.union(fills as any[])))) : inner)));
    if (strapCut) { const cut = strapCut as Manifold; shell = run('strap cut', () => track(shell.subtract(cut))); }

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
      const core0 = track(track(api.Manifold.revolve(track(new api.CrossSection([poly])), 96)).translate([0, cy, zFloor + CORE.puckDepth / 2]));
      // the Core carries its own magnets: pockets in its underside, facing the ones in the seat floor
      const mr = CORE.magnet.diameter / 2 + MAGNET_CLEARANCE, md = CORE.magnet.thickness + 0.1;
      const corePockets = Array.from({ length: CORE.magnet.count }, (_, i) => track(M.cylinder(md + 1, mr, mr, 40, false).translate([0, cy + (i - (CORE.magnet.count - 1) / 2) * CORE.magnet.spacing, zFloor - 1])));
      const core = track(core0.subtract(track(M.union(corePockets as any[]))));
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

    // print prototype: half-lap seam (the front shell's inner half reaches into a rebate in the back shell), engraved eyes, flat layout
    let printOut: Casing['print'];
    let frontF = frontM, backF = backM;
    if (print) {
      const lapped = run('half-lap seam', () => {
        const keep = track(M.union(keepOut as any[]));
        const lap = track(track(lapCross!.extrude(L + 0.2)).translate([0, 0, splitOffset - L]));
        // snap bead: a small ridge on the lap's outer face (a lead-in step, then the full bead) clicks into a groove cut in the back shell's rebate wall.
        // The groove is the bead grown by the play, so the two can never collide; where the wall would be left under 1.2 mm there is no bead
        const sn = PRINT.snap, a0 = T / 2 + lc / 2, z0g = -L + sn.start;
        // where the groove may go: at least `minWall` of wall must stay outside it, checked at the groove's bottom, middle and top (the body narrows below the seam)
        const wallSlices = [z0g - sn.play, z0g + sn.height / 2, z0g + sn.height + sn.play].map((z) => track(outer.slice(splitOffset + z).offset(-(sn.minWall + sn.play + 0.05), 'Round')));
        const wallAt = wallSlices.slice(1).reduce((acc, c) => track(acc.intersect(c)), wallSlices[0]);
        const core = track(lapCross!.offset(-0.2, 'Miter')), cupBig = track(cupDisc!.offset(sn.play + 0.3, 'Round'));
        const clip = track(seam!.offset(-(a0 - 0.4), 'Round').subtract(track(seam!.offset(-(a0 + 0.77), 'Round'))));
        const beadAt = (d: number) => {
          const raw = track(track(track(lapCross!.offset(d, 'Miter')).subtract(core)).subtract(cupBig).intersect(clip).intersect(wallAt));
          return raw;
        };
        // staircase profile: depth grows one layer's worth per layer up to `depth`, holds, then steps back down (45 degrees both ways, every step one print layer)
        const nl = Math.max(1, Math.round(sn.height / sn.layer)), z0 = -L + sn.start;
        const steps = Array.from({ length: nl }, (_, i) => [Math.min(sn.depth, (i + 1) * sn.layer, (nl - i) * sn.layer), z0 + i * sn.layer, z0 + (i + 1) * sn.layer] as const)
          .map(([d, a, b]) => [beadAt(d), a, b] as const);
        const slab = (cs: { isEmpty(): boolean; extrude(h: number): Manifold }, z0: number, z1: number): Manifold | null => (cs.isEmpty() ? null : track(track(cs.extrude(z1 - z0)).translate([0, 0, splitOffset + z0])));
        const beadParts = steps.map(([cs, z0, z1]) => slab(cs, z0, z1)).filter((x): x is Manifold => !!x);
        // the groove is one plain rectangular recess (vertical walls print cleanly): the full bead grown by the play, over the bead's whole height
        const full = steps.find(([, a]) => a === z0 + Math.floor((nl - 1) / 2) * sn.layer) ?? steps[0];
        const grooveParts = [slab(track(full[0].offset(sn.play, 'Miter')), z0 - sn.play, z0 + nl * sn.layer + sn.play)].filter((x): x is Manifold => !!x);
        const bead = beadParts.length ? track(M.union(beadParts as any[])) : null;
        const front2 = track(M.union(frontF, track((bead ? track(M.union(lap, bead)) : lap).subtract(keep))));
        const back2 = grooveParts.length ? track(backF.subtract(track(track(M.union(grooveParts as any[])).subtract(keep)))) : backF;
        return [front2, back2] as const;
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
