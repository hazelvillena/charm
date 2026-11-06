import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ShapeEngine } from './geometry/engine';
import { triangulate, signedVolume } from './geometry/mesh';
import { placeFeatures, eyeShapes } from './geometry/features';
import { Profile } from './geometry/profile';
import { checkFit, CheckResult } from './checks/fit';
import { checkNook } from './checks/nook';
import { checkWall, innerGeometry } from './checks/wall';
import { draftAngles, checkDraft } from './checks/analysis';
import { DENSITY_G_CM3 } from './spec/materials';
import { Outline, clampOutline } from './params/outline';
import { Params } from './params/schema';

export type Evaluation = { positions: Float32Array; checks: CheckResult[]; ok: boolean; weightG: number | null; failing: string[]; sizeMm: [number, number]; puck: { point: Vector3; normal: Vector3 } | null; eyes: ThumbEye[] };
export type ThumbEye = { point: Vector3; normal: Vector3; rx: number; ry: number; rz: number };

/**
 * Headless evaluation of one iteration with the CURRENT globals (core, wall, material, split):
 * the same checks the live view runs, used by the library to keep every saved iteration up to date. Level-2 surface.
 */
export function evaluateIteration(engine: ShapeEngine, outlineIn: Outline, params: Params): Evaluation | null {
  const V = engine.qs.vertCount, faces2 = engine.smoothFaces(2);
  const outline = clampOutline(outlineIn, params.wall);
  const cage = new Float32Array(V * 3), info = engine.buildCage(outline, params, cage);
  if (!info) return null;
  const pos = new Float32Array(engine.smoothVertCount(2) * 3); engine.smoothInto(cage, 2, pos);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos.slice(), 3));
  g.setIndex(new Uint32BufferAttribute(triangulate(faces2), 1));
  g.computeVertexNormals();
  const bvh = new MeshBVH(g, { indirect: true });
  let height = 0; for (let i = 1; i < pos.length; i += 3) if (pos[i] > height) height = pos[i];
  const place = placeFeatures(bvh, g, params, info.shiftY, height);
  const checks: CheckResult[] = [];
  let weightG: number | null = null;
  try {
    checks.push(checkFit(new Profile(outline), params, bvh, g, place));
    const innerPos = new Float32Array(engine.smoothVertCount(2) * 3);
    if (engine.innerSurface(pos, 2, params.wall, innerPos)) {
      const inner = innerGeometry(innerPos, faces2);
      checks.push(checkWall(g, inner.bvh, params.wall).check);
      inner.g.dispose();
      weightG = ((signedVolume(pos, faces2) - signedVolume(innerPos, faces2)) / 1000) * DENSITY_G_CM3[params.material];
    } else checks.push({ id: 'wall', ok: false, label: 'Wall', detail: 'Inner shell could not be built' });
    const nor = g.attributes.normal.array as Float32Array, sz = params.splitZ * params.depth;
    checks.push(checkDraft(draftAngles(pos, nor, sz), sz, pos));
    if (place.loop) checks.push(checkNook(bvh, g, place));
  } catch { checks.push({ id: 'fit', ok: false, label: 'Checks', detail: 'A check failed to run' }); }
  g.dispose();
  const failing = checks.filter((c) => !c.ok).map((c) => c.label);
  const eyes: ThumbEye[] = eyeShapes(place, params).map((e) => ({ point: new Vector3(e.c.x, e.c.y, e.c.z), normal: new Vector3(e.z.x, e.z.y, e.z.z), rx: e.rx, ry: e.ry, rz: e.rz }));
  let wx = 0; for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i]) > wx) wx = Math.abs(pos[i]);
  return { positions: pos, checks, ok: failing.length === 0, weightG, failing, sizeMm: [wx * 2, height], puck: place.puck ? { point: place.puck.point, normal: place.puck.normal } : null, eyes };
}
