import { Ray, Vector3, Triangle, BufferGeometry, DoubleSide, FrontSide, Side } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Params } from '../params/schema';
import { CORE, seatRadius } from '../params/core';

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
  loop: { center: Vector3; outward: Vector3 } | null;
};

/** margin (mm) kept between the core seat wall and an eye */
export const EYE_CORE_MARGIN = 1.5;

/** smallest distance from the core centre at which an eye of this size may sit (seat + wall + margin + the eye's own half height) */
export function eyeClearance(p: Params): number { return seatRadius() + p.wall + EYE_CORE_MARGIN + 0.8 * p.eyeSize; }

/** the loop sits toward the back half, so it is on the top edge but not on the very tip */
export const LOOP_BACK = 0.25; // fraction of the depth behind the mid plane
/** loop centre sits this far inside the outline: the slot's half width plus a firm bridge of plastic */
export const loopInset = () => CORE.loop.holeWidth / 2 + 1.6;

export function loopDir(pos: Params['nookPos']) {
  const deg = pos === 'top' ? 90 : pos === 'top-left' ? 112 : 68;
  const r = (deg * Math.PI) / 180;
  return new Vector3(Math.cos(r), Math.sin(r), 0);
}

/** Places eyes, puck and loop on the smooth surface. Call after the BVH was refit for the current positions. */
export function placeFeatures(bvh: MeshBVH, geo: BufferGeometry, p: Params, shiftY: number, height: number): Placement {
  const dn = new Vector3(0, 0, -1);
  // eyes never sit on the core: if the requested height would put them inside the clearance zone they slide up above it
  const half = p.eyeSpacing / 2, zone = eyeClearance(p);
  const minY = shiftY + Math.sqrt(Math.max(0, zone * zone - half * half));
  const eyeY = Math.max(p.eyeHeight * height, minY);
  // two eyes, a single centred eye, or none (the array always has two slots; an empty slot is simply hidden)
  const mode = p.eyes ?? 'two', xs: (number | null)[] = mode === 'none' ? [null, null] : mode === 'one' ? [0, null] : [-half, half];
  const eyes = xs.map((x) => {
    if (x === null) return null;
    const h = castSurface(bvh, geo, new Vector3(x, eyeY, 300), dn);
    return h && h.normal.z > 0.25 ? h : null; // off the body or on the rim (no room above the core): no eye
  });
  const puck = castSurface(bvh, geo, new Vector3(0, shiftY, 300), dn);
  const back = castSurface(bvh, geo, new Vector3(0, shiftY, -300), new Vector3(0, 0, 1));
  const d = loopDir(p.nookPos);
  const h = castSurface(bvh, geo, new Vector3(0, shiftY, -LOOP_BACK * p.depth), d, DoubleSide);
  const loop = p.loop !== false && h ? { center: h.point.clone().addScaledVector(d, -loopInset()), outward: d } : null; // the loop is optional
  return { eyes, puck, backZ: back ? back.point.z : null, loop };
}

/** the thread slot (a stadium: length along the edge, width across it) and the lug around it */
export const loopSlot = () => ({ length: CORE.loop.holeLength, width: CORE.loop.holeWidth, boss: CORE.loop.boss });

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
