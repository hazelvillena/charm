import { Color, Group, Mesh, BufferGeometry, Float32BufferAttribute, ShaderMaterial, MeshBasicMaterial, MeshPhysicalMaterial, DoubleSide, Material } from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MeshOut, SectionData } from '../geometry/solids';

import { POCHE, PocheHatch } from '../../design/poche';

// poche: hatched cut faces with an ink outline, all from the design tokens (design/poche.ts)
const INK = new Color(POCHE.ink).getHex();
type Hatch = PocheHatch;
const HATCH = { shell: POCHE.shell, core: POCHE.core, magnet: POCHE.magnet };

function hatchMaterial(h: Hatch) {
  return new ShaderMaterial({
    side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    uniforms: { uAng: { value: (h.angle * Math.PI) / 180 }, uSp: { value: h.spacing }, uW: { value: h.line }, uCross: { value: h.cross ? 1 : 0 }, uPaper: { value: new Color(POCHE.paper) }, uInk: { value: new Color(POCHE.hatch) } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.yz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vP; uniform float uAng, uSp, uW, uCross; uniform vec3 uPaper, uInk;
      float band(float c){ float f = abs(fract(c / uSp) - 0.5) * 2.0; float aa = fwidth(c / uSp) * 2.0; return 1.0 - smoothstep(1.0 - uW - aa, 1.0 - uW + aa, f); }
      void main(){
        float a = band(vP.x * cos(uAng) + vP.y * sin(uAng));
        if (uCross > 0.5) a = max(a, band(vP.x * -sin(uAng) + vP.y * cos(uAng)));
        gl_FragColor = vec4(mix(uPaper, uInk, a), 1.0);
      }`,
  });
}

/** The cut face's boundary as a flat ribbon (in the plane x = 0), so the outline is a real thick stroke. */
function outlineRibbon(cap: BufferGeometry, half: number): BufferGeometry | null {
  const pos = cap.getAttribute('position'), key = (i: number) => `${Math.round(pos.getY(i) * 200)},${Math.round(pos.getZ(i) * 200)}`;
  const edges = new Map<string, { a: number; b: number; n: number }>();
  for (let t = 0; t < pos.count; t += 3) for (let e = 0; e < 3; e++) {
    const a = t + e, b = t + ((e + 1) % 3), ka = key(a), kb = key(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    const cur = edges.get(k); if (cur) cur.n++; else edges.set(k, { a, b, n: 1 });
  }
  const v: number[] = [];
  for (const { a, b, n } of edges.values()) {
    if (n !== 1) continue;
    const ay = pos.getY(a), az = pos.getZ(a), by = pos.getY(b), bz = pos.getZ(b);
    const dy = by - ay, dz = bz - az, len = Math.hypot(dy, dz) || 1, ny = (-dz / len) * half, nz = (dy / len) * half, ex = (dy / len) * half, ez = (dz / len) * half; // extend a little so corners close
    const P = [[ay - ex + ny, az - ez + nz], [by + ex + ny, bz + ez + nz], [by + ex - ny, bz + ez - nz], [ay - ex - ny, az - ez - nz]];
    for (const q of [0, 1, 2, 0, 2, 3]) v.push(0.03, P[q][0], P[q][1]);
  }
  if (!v.length) return null;
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(v, 3)); return g;
}

/** Split a trimmed solid into its surface and its flat cut faces (all vertices on x = 0). */
function split(m: MeshOut): { body: BufferGeometry | null; cap: BufferGeometry | null } {
  const body: number[] = [], cap: number[] = [];
  for (let t = 0; t < m.tris.length; t += 3) {
    const ids = [m.tris[t], m.tris[t + 1], m.tris[t + 2]];
    const flat = ids.every((i) => Math.abs(m.positions[i * 3]) < 1e-3);
    const dst = flat ? cap : body;
    for (const i of ids) dst.push(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
  }
  const geo = (a: number[], crease: boolean) => {
    if (!a.length) return null;
    let g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(a, 3));
    g = crease ? toCreasedNormals(g, Math.PI / 5) : (g.computeVertexNormals(), g);
    return g;
  };
  return { body: geo(body, true), cap: geo(cap, false) };
}

/** The casing cut open with hatched poche with an ink outline on every cut face: walls, core seat, floor, magnet pockets, loop boss. */
export class SectionView {
  readonly group = new Group();
  private disposables: { dispose(): void }[] = [];

  clear() {
    this.group.clear();
    this.disposables.forEach((d) => d.dispose()); this.disposables = [];
  }

  set(data: SectionData, shellBodyMat: MeshPhysicalMaterial, coreBodyMat: Material, magnetBodyMat: Material) {
    this.clear();
    const add = (m: MeshOut, bodyMat: Material, h: Hatch) => {
      const { body, cap } = split(m);
      if (body) { const mesh = new Mesh(body, bodyMat); mesh.frustumCulled = false; this.group.add(mesh); this.disposables.push(body); }
      if (cap) {
        const mat = hatchMaterial(h);
        const mesh = new Mesh(cap, mat); mesh.frustumCulled = false; this.group.add(mesh); this.disposables.push(cap, mat);
        const rib = outlineRibbon(cap, h.outline);
        if (rib) {
          const rm = new MeshBasicMaterial({ color: INK, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
          const rmesh = new Mesh(rib, rm); rmesh.frustumCulled = false; this.group.add(rmesh); this.disposables.push(rib, rm);
        }
      }
    };
    const shellMat = shellBodyMat.clone(); shellMat.side = DoubleSide; shellMat.vertexColors = false; shellMat.transparent = false; shellMat.opacity = 1; shellMat.depthWrite = true; shellMat.clippingPlanes = [];
    this.disposables.push(shellMat);
    add(data.shell, shellMat, HATCH.shell);
    add(data.core, coreBodyMat, HATCH.core);
    data.magnets.forEach((m) => add(m, magnetBodyMat, HATCH.magnet));
  }
}
