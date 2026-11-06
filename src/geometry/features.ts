import { Ray, Vector3, Triangle, BufferGeometry, DoubleSide, FrontSide, Side } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Params } from '../params/schema';
import { CORE } from '../params/core';

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

export const LOOP_INSET = 1.5; // loop center sits this far inside the outline (lug sticks out)

export function loopDir(pos: Params['nookPos']) {
  const deg = pos === 'top' ? 90 : pos === 'top-left' ? 112 : 68;
  const r = (deg * Math.PI) / 180;
  return new Vector3(Math.cos(r), Math.sin(r), 0);
}

/** Places eyes, puck and loop on the smooth surface. Call after the BVH was refit for the current positions. */
export function placeFeatures(bvh: MeshBVH, geo: BufferGeometry, p: Params, shiftY: number, height: number): Placement {
  const dn = new Vector3(0, 0, -1);
  const eyeY = p.eyeHeight * height;
  const eyes = [-1, 1].map((s) => castSurface(bvh, geo, new Vector3((s * p.eyeSpacing) / 2, eyeY, 300), dn));
  const puck = castSurface(bvh, geo, new Vector3(0, shiftY, 300), dn);
  const back = castSurface(bvh, geo, new Vector3(0, shiftY, -300), new Vector3(0, 0, 1));
  const d = loopDir(p.nookPos);
  const h = castSurface(bvh, geo, new Vector3(0, shiftY, 0), d, DoubleSide);
  const loop = h ? { center: h.point.clone().addScaledVector(d, -LOOP_INSET), outward: d } : null;
  return { eyes, puck, backZ: back ? back.point.z : null, loop };
}

export const loopRing = () => ({
  tube: CORE.loop.boss / 2,
  major: CORE.loop.holeDiameter / 2 + CORE.loop.boss / 2,
});
