import { Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { BufferGeometry } from 'three';
import { CORE, floorThickness, seatRadius } from '../params/core';
import { Profile } from '../geometry/profile';
import { castSurface, Placement } from '../geometry/features';
import { Params } from '../params/schema';

export type Pt = { x: number; y: number; z: number };
/** A check result. When it fails, `fix` is a one-line next step and `at` (or `angleDeg` on the outline pad) says where to look. */
export type CheckResult = { id: 'fit' | 'wall' | 'nook' | 'magnet' | 'draft' | 'radius'; ok: boolean; label: string; detail: string; fix?: string; at?: Pt; angleDeg?: number };

export function checkFit(profile: Profile, p: Params, bvh: MeshBVH, geo: BufferGeometry, place: Placement): CheckResult {
  const need = seatRadius() + p.wall;
  const min = profile.minRadius(720);
  const deg = (min.phi * 180) / Math.PI;
  if (min.r < need) {
    const a = ((deg % 360) + 360) % 360, c = place.puck?.point;
    return { id: 'fit', ok: false, label: 'Core fit', detail: `Too tight near ${Math.round(a)}°: the core needs ${(need - min.r).toFixed(1)} mm more room`, fix: `Widen the outline near ${Math.round(a)}° by ${(need - min.r + 0.1).toFixed(1)} mm`, angleDeg: deg, at: c ? { x: min.r * Math.cos(min.phi), y: c.y + min.r * Math.sin(min.phi), z: c.z } : undefined };
  }
  if (!place.puck || place.backZ === null) return { id: 'fit', ok: false, label: 'Core fit', detail: 'Could not measure the body at the core' };
  const depth = place.puck.point.z - place.backZ;
  const needDepth = CORE.puckDepth + floorThickness() + p.wall;
  if (depth < needDepth) {
    return { id: 'fit', ok: false, label: 'Core fit', detail: `Too shallow behind the core (${depth.toFixed(1)} mm, needs ${needDepth.toFixed(1)} mm)`, fix: `Add ${(needDepth - depth + 0.1).toFixed(1)} mm of depth`, at: place.puck.point };
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
    return { id: 'fit', ok: false, label: 'Core fit', detail: `The seat breaks through the surface near ${Math.round(worstDeg)}°. Flatten the front or add depth`, fix: 'Add depth or shrink the seat', angleDeg: worstDeg, at: place.puck.point };
  }
  return { id: 'fit', ok: true, label: 'Core fit', detail: `At its tightest, ${(min.r - CORE.puckDiameter / 2).toFixed(1)} mm of body surrounds the core (needs ${(need - CORE.puckDiameter / 2).toFixed(1)} mm)` };
}
