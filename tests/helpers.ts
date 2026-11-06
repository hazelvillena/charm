import { BufferGeometry, Float32BufferAttribute } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ShapeEngine } from '../src/geometry/engine';
import { triangulate, bounds } from '../src/geometry/mesh';
import { placeFeatures } from '../src/geometry/features';
import { Outline } from '../src/params/outline';
import { Params } from '../src/params/schema';

export const engine = new ShapeEngine();

export function geoOf(pos: Float32Array, faces: Uint32Array) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos.slice(), 3));
  g.setIndex(Array.from(triangulate(faces)));
  g.computeVertexNormals();
  return { g, bvh: new MeshBVH(g, { indirect: true }) };
}

export function buildAll(outline: Outline, params: Params, level = 3) {
  const V = engine.qs.vertCount;
  const cage = new Float32Array(V * 3);
  const info = engine.buildCage(outline, params, cage)!;
  const outer = new Float32Array(engine.smoothVertCount(level) * 3); engine.smoothInto(cage, level, outer);
  const inner = new Float32Array(engine.smoothVertCount(level) * 3); engine.innerSurface(outer, level, params.wall, inner);
  const faces = engine.smoothFaces(level);
  const og = geoOf(outer, faces);
  const b = bounds(outer);
  const place = placeFeatures(og.bvh, og.g, params, info.shiftY, b.max[1]);
  return { cage, info, outer, inner, faces, og, bounds: b, place };
}
