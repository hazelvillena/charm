import { Ray, Vector3, Triangle, BufferGeometry, DoubleSide, FrontSide, Side } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Params } from '../params/schema';
import { CORE, seatRadius, floorThickness } from '../params/core';

export type SurfaceHit = { point: Vector3; normal: Vector3 };

const tri = new Triangle(), bary = new Vector3();
export function castSurface(bvh: MeshBVH, geo: BufferGeometry, origin: Vector3, dir: Vector3, side: Side = FrontSide): SurfaceHit | null {
  const hit = bvh.raycastFirst(new Ray(origin, dir.clone().normalize()), side) as any;
  if (!hit || !hit.face) return null;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const { a, b, c } = hit.face;
  tri.a.fromBufferAttribute(pos, a); tri.b.fromBufferAttribute(pos, b); tri.c.fromBufferAttribute(pos, c);
  tri.getBarycoord(hit.point, bary);
  const n = new Vector3()
    .addScaledVector(new Vector3().fromBufferAttribute(nor, a), bary.x)
    .addScaledVector(new Vector3().fromBufferAttribute(nor, b), bary.y)
    .addScaledVector(new Vector3().fromBufferAttribute(nor, c), bary.z);
  if (n.lengthSq() < 1e-12) n.copy(hit.face.normal);
  return { point: hit.point.clone(), normal: n.normalize() };
}

export type Placement = {
  eyes: (SurfaceHit | null)[];
  puck: SurfaceHit | null;       // front surface at the puck center
  backZ: number | null;          // back surface z at the puck center
  /** the strap holes on the back: two slots (surface points) straight through the back wall into the hollow; `zTop` is where the cut stops (just inside the cavity) */
  strap: { yc: number; center: Vector3; openings: Vector3[]; zTop: number } | null;
};

/** margin (mm) kept between the core seat wall and an eye */
export const EYE_CORE_MARGIN = 1.5;

/** smallest distance from the core centre at which an eye of this size may sit (seat + wall + margin + the eye's own half height) */
export function eyeClearance(p: Params): number { return seatRadius() + p.wall + EYE_CORE_MARGIN + 0.8 * p.eyeSize; }

/** the strap tunnel's opening: a slot (pill) `w` wide along x and `h` tall along y, as a polygon centred on the origin. One definition for the viewport and the solids. */
export function strapPill(w: number, h: number, seg = 16): [number, number][] {
  const r = h / 2, a = Math.max(0, w / 2 - r), pts: [number, number][] = [];
  for (let i = 0; i <= seg; i++) { const t = -Math.PI / 2 + (Math.PI * i) / seg; pts.push([a + r * Math.cos(t), r * Math.sin(t)]); }
  for (let i = 0; i <= seg; i++) { const t = Math.PI / 2 + (Math.PI * i) / seg; pts.push([-a + r * Math.cos(t), r * Math.sin(t)]); }
  return pts;
}

/**
 * Finds where the two strap holes fit: on the back, on the centre line, as high up as they can go. Each hole must sit on a stretch of back that faces
 * (nearly) straight back (so a vertical cut is a clean hole, no long slanted slot), stay on the body with a margin around it, clear of the Core seat,
 * and leave `inside` mm of hollow behind the wall for the cord. Adapts to any shape; null when there is no room (the sanity check then says so).
 */
export function findStrap(bvh: MeshBVH, geo: BufferGeometry, p: Params, shiftY: number, puckZ: number | null): Placement['strap'] {
  const S = CORE.strap, seam = p.splitZ * p.depth, hw = S.openingWidth / 2, hh = S.openingHeight / 2, minNz = Math.cos((S.maxTiltDeg * Math.PI) / 180);
  const xs = [-S.spacing / 2, S.spacing / 2], reachX = S.spacing / 2 + hw + S.padMargin;
  geo.computeBoundingBox(); const top = geo.boundingBox!.max.y;
  const back = (x: number, y: number) => castSurface(bvh, geo, new Vector3(x, y, -300), new Vector3(0, 0, 1));
  // the Core's seat and its magnet pockets only reach into the back shell on deep seats; when they do, keep the holes clear of the seat's wall
  const seatBottom = puckZ === null ? -Infinity : puckZ - CORE.puckDepth - floorThickness() - 0.4;
  const seatMin = seatBottom > seam ? -Infinity : shiftY + seatRadius() + p.wall + 1 + hh + S.padMargin;
  const yMin = Math.max(seatMin, geo.boundingBox!.min.y + hh + S.padMargin); // never search below the body itself (an unbounded search would never end)
  const room = (zb: number) => seam - (zb + p.wall * 1.2) >= S.inside; // hollow left behind the wall, before the seam
  for (let yc = top - 1; yc >= yMin; yc -= 0.5) {
    // cheap first look (one ray): up near the top the back curves away, so most heights fail the depth test right here (this runs on every drag frame)
    const mid = back(0, yc);
    if (!mid || !room(mid.point.z - 2)) continue;
    // the back at both holes' corners and centres (it must face back, within the tilt limit), and a margin beyond them (the body must still be there)
    let zbMax = -Infinity, ok = true;
    for (const x of [-reachX, xs[0] - hw, xs[0], xs[0] + hw, xs[1] - hw, xs[1], xs[1] + hw, reachX]) for (const y of [yc - hh - S.padMargin, yc - hh, yc, yc + hh, yc + hh + S.rimMargin]) {
      const h = back(x, y); if (!h) { ok = false; break; }
      const inHole = Math.abs(y - yc) <= hh + 1e-6 && (Math.abs(x - xs[0]) <= hw + 1e-6 || Math.abs(x - xs[1]) <= hw + 1e-6);
      if (inHole) { zbMax = Math.max(zbMax, h.point.z); if (-h.normal.z < minNz) { ok = false; break; } }
    }
    if (!ok || !room(zbMax)) continue;
    return { yc, center: new Vector3(0, yc, mid.point.z), openings: xs.map((x) => new Vector3(x, yc, back(x, yc)?.point.z ?? mid.point.z)), zTop: zbMax + p.wall * 1.5 + 1 };
  }
  return null;
}

/** Places eyes, puck and the strap tunnel on the smooth surface. Call after the BVH was refit for the current positions. */
export function placeFeatures(bvh: MeshBVH, geo: BufferGeometry, p: Params, shiftY: number, height: number): Placement {
  const dn = new Vector3(0, 0, -1);
  // eyes never sit on the core: if the requested height would put them inside the clearance zone they slide up above it
  const half = p.eyeSpacing / 2, zone = eyeClearance(p);
  // (a pair slid sideways clears the core sooner: the zone is measured from the nearer eye)
  const nearX = Math.max(0, Math.abs(p.eyeX ?? 0) - half), minY = shiftY + Math.sqrt(Math.max(0, zone * zone - (p.eyes === 'one' ? Math.abs(p.eyeX ?? 0) : nearX) ** 2));
  const eyeY = Math.max(p.eyeHeight * height, minY);
  // two eyes, a single centred eye, or none (the array always has two slots; an empty slot is simply hidden)
  const cx = p.eyeX ?? 0, mode = p.eyes ?? 'two', xs: (number | null)[] = mode === 'none' ? [null, null] : mode === 'one' ? [cx, null] : [cx - half, cx + half];
  const eyes = xs.map((x) => {
    if (x === null) return null;
    const h = castSurface(bvh, geo, new Vector3(x, eyeY, 300), dn);
    return h && h.normal.z > 0.25 ? h : null; // off the body or on the rim (no room above the core): no eye
  });
  const puck = castSurface(bvh, geo, new Vector3(0, shiftY, 300), dn);
  const back = castSurface(bvh, geo, new Vector3(0, shiftY, -300), new Vector3(0, 0, 1));
  const strap = findStrap(bvh, geo, p, shiftY, puck ? puck.point.z : null);
  return { eyes, puck, backZ: back ? back.point.z : null, strap };
}

export type V3 = { x: number; y: number; z: number };
/** a right-handed frame whose z axis is `n` (the surface normal), x kept roughly horizontal */
export function frameOf(n: V3): { x: V3; y: V3; z: V3 } {
  const l = Math.hypot(n.x, n.y, n.z) || 1, z = { x: n.x / l, y: n.y / l, z: n.z / l };
  const xl = Math.hypot(z.z, z.x), x = xl < 1e-6 ? { x: 1, y: 0, z: 0 } : { x: z.z / xl, y: 0, z: -z.x / xl };
  const y = { x: z.y * x.z - z.z * x.y, y: z.z * x.x - z.x * x.z, z: z.x * x.y - z.y * x.x };
  return { x, y, z };
}
/** the eyes as ellipsoids (centre, axes, radii), exactly as the viewport draws them: one definition for every export */
export function eyeShapes(place: Pick<Placement, 'eyes'>, p: Pick<Params, 'eyeSize' | 'eyeType'>) {
  const sz = p.eyeSize, rz = (sz / 2) * (p.eyeType === 'flush' ? 0.25 : 0.7), off = p.eyeType === 'inset' ? -0.15 : p.eyeType === 'raised' ? 0.55 : -0.05;
  return place.eyes.filter((e): e is NonNullable<typeof e> => !!e).map((e) => ({
    c: { x: e.point.x + e.normal.x * off * rz, y: e.point.y + e.normal.y * off * rz, z: e.point.z + e.normal.z * off * rz },
    ...frameOf(e.normal), rx: sz / 2, ry: (sz * 1.57) / 2, rz,
  }));
}

/** engraved eyes: shallow ellipsoid recesses centred on the surface (the print has no separate eye parts) */
export function engraveShapes(place: Pick<Placement, 'eyes'>, p: Pick<Params, 'eyeSize'>, depth: number) {
  const sz = p.eyeSize;
  return place.eyes.filter((e): e is NonNullable<typeof e> => !!e).map((e) => ({
    c: { x: e.point.x, y: e.point.y, z: e.point.z }, ...frameOf(e.normal), rx: sz / 2, ry: (sz * 1.57) / 2, rz: depth,
  }));
}
