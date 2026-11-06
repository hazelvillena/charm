import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three';
import { REFERENCE_SCALE } from '../params/core';
import { GHOST_Z_EQ } from '../params/presets';
import objText from '../../reference/charmer-body.obj?raw';

/** Translucent gray reference of the original Charmer body, scaled to mm and aligned to the shape frame. */
export function buildReferenceGhost(): Mesh {
  const v: number[] = [], idx: number[] = [];
  for (const l of objText.split('\n')) {
    const t = l.trim().split(/\s+/);
    if (t[0] === 'v') v.push(+t[1] * REFERENCE_SCALE, +t[2] * REFERENCE_SCALE, +t[3] * REFERENCE_SCALE);
    else if (t[0] === 'f') { const q = t.slice(1).map((x) => +x - 1); idx.push(q[0], q[1], q[2], q[0], q[2], q[3]); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new Mesh(g, new MeshBasicMaterial({ color: 0x6b7280, transparent: true, opacity: 0.2, depthWrite: false, wireframe: false }));
  m.position.z = -GHOST_Z_EQ;
  m.renderOrder = 2;
  return m;
}
