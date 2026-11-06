import { Group, Mesh, BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, MeshPhysicalMaterial, SphereGeometry, Vector3, Quaternion, Material } from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Casing, MeshOut } from '../geometry/solids';
import { Placement } from '../geometry/features';
import { Params } from '../params/schema';
import { CORE } from '../params/core';
import { makePuck, makeMagnet } from './parts';

const OFFSETS = { back: -38, front: 0, magnets: 24, puck: 46 };

function geoFrom(m: MeshOut): BufferGeometry {
  let g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(m.positions, 3));
  g.setIndex(new Uint32BufferAttribute(m.tris, 1));
  g = toCreasedNormals(g, Math.PI / 5);
  return g;
}

const label = (text: string) => { const d = document.createElement('div'); d.className = 'label3d'; d.textContent = text; return new CSS2DObject(d); };

/** Exploded/assembled view of the accepted casing with CSS2D labels. */
export class ExplodedView {
  readonly group = new Group();
  private parts: { obj: Group; base: number; off: number }[] = [];
  private t = 1; // 1 = exploded
  private anim: number | null = null;
  private mats: Material[] = [];
  private geos: BufferGeometry[] = [];

  constructor(casing: Casing, place: Placement, p: Params, shellMat: MeshPhysicalMaterial, eyeMat: Material, size: { w: number; h: number }) {
    const add = (name: keyof typeof OFFSETS, obj: Group) => { this.group.add(obj); this.parts.push({ obj, base: 0, off: OFFSETS[name] }); return obj; };
    const mat = shellMat.clone(); mat.vertexColors = false; mat.transparent = false; mat.opacity = 1; mat.depthWrite = true; mat.side = 2; // DoubleSide: cut faces visible
    this.mats.push(mat);

    const mkShell = (m: MeshOut) => { const g = geoFrom(m); this.geos.push(g); return new Mesh(g, mat); };
    const back = new Group(); back.add(mkShell(casing.back));
    const bl = label('Back shell'); bl.position.set(size.w / 2 + 4, size.h * 0.62, -8); back.add(bl);
    add('back', back);

    const front = new Group(); front.add(mkShell(casing.front));
    place.eyes.forEach((e) => {
      if (!e) return;
      const m = new Mesh(new SphereGeometry(1, 20, 14), eyeMat); this.geos.push(m.geometry);
      const sz = p.eyeSize, rz = (sz / 2) * (p.eyeType === 'flush' ? 0.25 : 0.7);
      const off = p.eyeType === 'inset' ? -0.15 : p.eyeType === 'raised' ? 0.55 : -0.05;
      m.position.copy(e.point).addScaledVector(e.normal, off * rz);
      m.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), e.normal);
      m.scale.set(sz / 2, (sz * 1.57) / 2, rz);
      front.add(m);
    });
    const fl = label('Front shell'); fl.position.set(size.w / 2 + 4, size.h * 0.1, casing.seat.zFront * 0.4); front.add(fl);
    if (place.loop) { const ll = label('Loop'); ll.position.copy(place.loop.center).add(new Vector3(0, 7, 0)); front.add(ll); }
    add('front', front);

    const mags = new Group();
    casing.magnets.forEach((mg) => { const m = makeMagnet(); m.position.set(mg.x, mg.y, mg.z + CORE.magnet.thickness / 2 + 0.2); mags.add(m); this.geos.push(m.geometry); });
    const ml = label('Magnets'); ml.position.set(CORE.magnet.spacing / 2 + CORE.magnet.diameter / 2 + 5, casing.seat.y - 2, casing.seat.zFloor); mags.add(ml);
    add('magnets', mags);

    const puck = new Group(); const pk = makePuck();
    pk.position.set(casing.seat.x, casing.seat.y, casing.seat.zFloor + CORE.puckDepth / 2 + 0.3);
    puck.add(pk);
    const pl = label('AI core'); pl.position.set(casing.seat.radius + 4, casing.seat.y + casing.seat.radius * 0.8, casing.seat.zFloor + CORE.puckDepth); puck.add(pl);
    add('puck', puck);
    this.apply();
    void Quaternion;
  }

  private apply() { for (const p of this.parts) p.obj.position.z = p.base + p.off * this.t; }

  setExploded(ex: boolean, animate = true) {
    const to = ex ? 1 : 0;
    if (this.anim) cancelAnimationFrame(this.anim);
    if (!animate) { this.t = to; this.apply(); return; }
    const from = this.t, t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 650), e = 1 - Math.pow(1 - k, 3);
      this.t = from + (to - from) * e; this.apply();
      this.anim = k < 1 ? requestAnimationFrame(step) : null;
    };
    this.anim = requestAnimationFrame(step);
  }

  dispose() {
    if (this.anim) cancelAnimationFrame(this.anim);
    this.group.traverse((o) => { if (o instanceof CSS2DObject) o.element.remove(); });
    this.geos.forEach((g) => g.dispose()); this.mats.forEach((m) => m.dispose());
    this.group.clear();
  }
}
