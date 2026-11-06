import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, Ray, Vector3, FrontSide } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { triangulate } from '../geometry/mesh';
import { CheckResult } from './fit';

export type WallResult = { check: CheckResult; thickness: Float32Array; min: number };

export function innerGeometry(positions: Float32Array, faces: Uint32Array) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions.slice(), 3));
  g.setIndex(new Uint32BufferAttribute(triangulate(faces), 1));
  const bvh = new MeshBVH(g, { indirect: true });
  return { g, bvh };
}

/** Distance from each outer vertex along its inward normal to the inner shell. */
export function checkWall(outer: BufferGeometry, innerBvh: MeshBVH, target: number): WallResult {
  const pos = outer.attributes.position, nor = outer.attributes.normal;
  const n = pos.count;
  const thickness = new Float32Array(n);
  const o = new Vector3(), d = new Vector3();
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    o.fromBufferAttribute(pos, i); d.fromBufferAttribute(nor, i).multiplyScalar(-1);
    o.addScaledVector(d, -0.02);
    const hit = innerBvh.raycastFirst(new Ray(o, d), FrontSide) as any;
    const t = hit ? hit.distance - 0.02 : Infinity;
    thickness[i] = t;
    if (t < min) min = t;
  }
  const measurable = Number.isFinite(min);
  const ok = measurable && min >= target * 0.8;
  return {
    thickness, min,
    check: {
      id: 'wall', ok, label: 'Wall',
      detail: measurable ? `Min wall ${min.toFixed(2)} mm (target ${target.toFixed(2)} mm)` : 'Wall could not be measured (inner shell not found)',
    },
  };
}
