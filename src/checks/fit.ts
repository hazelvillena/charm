import { Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { BufferGeometry } from 'three';
import { CORE, floorThickness, seatRadius } from '../params/core';
import { Profile } from '../geometry/profile';
import { castSurface, Placement } from '../geometry/features';
import { Params } from '../params/schema';

export type CheckResult = { id: 'fit' | 'wall' | 'nook'; ok: boolean; label: string; detail: string };

export function checkFit(profile: Profile, p: Params, bvh: MeshBVH, geo: BufferGeometry, place: Placement): CheckResult {
  const need = seatRadius() + p.wall;
  const min = profile.minRadius(720);
  const deg = (min.phi * 180) / Math.PI;
  if (min.r < need) {
    return { id: 'fit', ok: false, label: 'Puck fit', detail: `Puck needs ${(need - min.r).toFixed(1)} mm more room toward ${Math.round(((deg % 360) + 360) % 360)}°` };
  }
  if (!place.puck || place.backZ === null) return { id: 'fit', ok: false, label: 'Puck fit', detail: 'Cannot measure the body at the puck center' };
  const depth = place.puck.point.z - place.backZ;
  const needDepth = CORE.puckDepth + floorThickness() + p.wall;
  if (depth < needDepth) {
    return { id: 'fit', ok: false, label: 'Puck fit', detail: `Depth behind the puck is ${depth.toFixed(1)} mm, needs ${needDepth.toFixed(1)} mm` };
  }
  // seat rim must stay on the surface: sample the rim ring and compare the surface height to the seat floor
  const zFloor = place.puck.point.z - CORE.puckDepth;
  const rim = seatRadius() + p.wall;
  let worst = Infinity, worstDeg = 0;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = rim * Math.cos(a), y = place.puck.point.y + rim * Math.sin(a);
    const h = castSurface(bvh, geo, new Vector3(x, y, 300), new Vector3(0, 0, -1));
    if (!h) { worst = -Infinity; worstDeg = (a * 180) / Math.PI; break; }
    const margin = h.point.z - (zFloor + p.wall);
    if (margin < worst) { worst = margin; worstDeg = (a * 180) / Math.PI; }
  }
  if (worst < 0) {
    return { id: 'fit', ok: false, label: 'Puck fit', detail: `Seat breaks through the surface near ${Math.round(worstDeg)}°: flatten the front or add depth` };
  }
  return { id: 'fit', ok: true, label: 'Puck fit', detail: `Clear by ${(min.r - need).toFixed(1)} mm, depth ${depth.toFixed(1)} mm` };
}
