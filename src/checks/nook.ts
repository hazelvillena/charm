import { BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { CORE } from '../params/core';
import { Placement } from '../geometry/features';
import { CheckResult } from './fit';

/** The strap holes (two slots through the back wall; the cord runs inside the shell between them) need a back that faces straight back and hollow behind it. */
export function checkNook(_bvh: MeshBVH, _geo: BufferGeometry, place: Placement): CheckResult {
  if (!place.strap) return { id: 'nook', ok: false, label: 'Strap hole', detail: 'No room for the strap holes on the back', fix: 'Make the body deeper, or flatten the back toward the top' };
  const s = CORE.strap;
  return { id: 'nook', ok: true, label: 'Strap hole', detail: `Two strap holes on the back: ${s.openingWidth} × ${s.openingHeight} mm slots, ${s.spacing} mm apart; the cord runs inside the shell`, at: { x: place.strap.center.x, y: place.strap.center.y, z: place.strap.center.z } };
}
