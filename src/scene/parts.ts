import { Group, Mesh, CylinderGeometry, TorusGeometry, MeshPhysicalMaterial, MeshBasicMaterial } from 'three';
import { CORE } from '../params/core';

/** AI puck: off-white disc with a warm emissive ring. Local +Z is the front face. */
export function makePuck(): Group {
  const g = new Group();
  const R = CORE.puckDiameter / 2;
  const body = new Mesh(new CylinderGeometry(R, R, CORE.puckDepth, 64), new MeshPhysicalMaterial({ color: 0xe9e7e2, roughness: 0.35, clearcoat: 0.6 }));
  body.rotation.x = Math.PI / 2;
  const ring = new Mesh(new TorusGeometry(R - 0.5, 0.38, 12, 96), new MeshBasicMaterial({ color: 0xffe2b0 }));
  ring.position.z = CORE.puckDepth / 2 + 0.02;
  const halo = new Mesh(new TorusGeometry(R - 0.5, 0.9, 12, 96), new MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.22, depthWrite: false }));
  halo.position.z = CORE.puckDepth / 2 + 0.02;
  g.add(body, ring, halo);
  return g;
}

export function makeMagnet(): Mesh {
  const m = new Mesh(new CylinderGeometry(CORE.magnet.diameter / 2, CORE.magnet.diameter / 2, CORE.magnet.thickness, 32),
    new MeshPhysicalMaterial({ color: 0x9aa0aa, metalness: 1, roughness: 0.3 }));
  m.rotation.x = Math.PI / 2;
  return m;
}
