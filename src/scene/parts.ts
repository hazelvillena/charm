import { Group, Mesh, CylinderGeometry, TorusGeometry, LatheGeometry, Vector2, DoubleSide, MeshPhysicalMaterial, MeshBasicMaterial } from 'three';
import { CORE } from '../params/core';
import { coreProfile, domeAt } from '../geometry/coreProfile';

/** The Core: domed, rounded-edge module with a soft gray ring and halo. Local +Z is the front; origin at its mid-plane. */
export function makeCore(): Group {
  const g = new Group();
  const R = CORE.puckDiameter / 2, t = CORE.puckDepth;
  const pts = coreProfile().map(([r, y]) => new Vector2(r, y));
  const lathe = new Mesh(new LatheGeometry(pts, 96), new MeshPhysicalMaterial({ color: 0xeceae5, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, side: DoubleSide }));
  lathe.rotation.x = Math.PI / 2; // lathe axis (y) -> Z
  const rr = Math.max(1, R - Math.min(CORE.edgeRadius, R - 0.5) - 0.7);
  const ringZ = t / 2 + domeAt(rr) + 0.02;
  const ring = new Mesh(new TorusGeometry(rr, 0.32, 12, 96), new MeshBasicMaterial({ color: 0xc4c8d0 }));
  ring.position.z = ringZ;
  const halo = new Mesh(new TorusGeometry(rr, 0.85, 12, 96), new MeshBasicMaterial({ color: 0x9aa0ad, transparent: true, opacity: 0.26, depthWrite: false }));
  halo.position.z = ringZ;
  g.add(lathe, ring, halo);
  return g;
}
export const makePuck = makeCore;

/** Disc magnet, front cap tinted by polarity (N accent, S red) to show the keyed pair. */
export function makeMagnet(pol: 'N' | 'S' = 'N'): Group {
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(CORE.magnet.diameter / 2, CORE.magnet.diameter / 2, CORE.magnet.thickness, 32), new MeshPhysicalMaterial({ color: 0x9aa0aa, metalness: 1, roughness: 0.3 }));
  body.rotation.x = Math.PI / 2;
  const cap = new Mesh(new CylinderGeometry(CORE.magnet.diameter / 2 - 0.2, CORE.magnet.diameter / 2 - 0.2, 0.12, 32), new MeshBasicMaterial({ color: pol === 'N' ? 0x5b6cff : 0xe5484d }));
  cap.rotation.x = Math.PI / 2; cap.position.z = CORE.magnet.thickness / 2 + 0.07;
  g.add(body, cap);
  return g;
}
