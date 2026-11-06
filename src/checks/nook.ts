import { Vector3, BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { CORE } from '../params/core';
import { castSurface, Placement } from '../geometry/features';
import { CheckResult } from './fit';

export function checkNook(bvh: MeshBVH, geo: BufferGeometry, place: Placement): CheckResult {
  if (!place.loop) return { id: 'nook', ok: false, label: 'Nook', detail: 'No surface found for the loop' };
  const c = place.loop.center;
  const f = castSurface(bvh, geo, new Vector3(c.x, c.y, 300), new Vector3(0, 0, -1));
  const b = castSurface(bvh, geo, new Vector3(c.x, c.y, -300), new Vector3(0, 0, 1));
  if (!f || !b) return { id: 'nook', ok: false, label: 'Nook', detail: 'Loop sits off the body' };
  const t = f.point.z - b.point.z;
  const need = CORE.loop.minThickness;
  return t >= need
    ? { id: 'nook', ok: true, label: 'Nook', detail: `Body is ${t.toFixed(1)} mm thick at the loop (needs ${need.toFixed(1)} mm)` }
    : { id: 'nook', ok: false, label: 'Nook', detail: `Body is only ${t.toFixed(1)} mm thick at the loop (needs ${need.toFixed(1)} mm)` };
}
