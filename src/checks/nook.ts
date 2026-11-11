import { BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { CORE } from '../params/core';
import { Placement } from '../geometry/features';
import { CheckResult } from './fit';

/** The strap tunnel (two openings on the back joined by a channel inside) needs room behind the back surface. */
export function checkNook(_bvh: MeshBVH, _geo: BufferGeometry, place: Placement): CheckResult {
  if (!place.strap) return { id: 'nook', ok: false, label: 'Strap hole', detail: 'No room for the strap tunnel on the back', fix: 'Make the body deeper or taller toward the top back' };
  const s = CORE.strap;
  return { id: 'nook', ok: true, label: 'Strap hole', detail: `Cord tunnel on the back: two ${s.openingWidth} × ${s.openingHeight} mm openings, ${s.spacing} mm apart, ${s.bar} mm bar`, at: { x: place.strap.center.x, y: place.strap.center.y, z: place.strap.center.z } };
}
