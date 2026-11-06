import { WebGLRenderer, Scene, PerspectiveCamera, Color, PMREMGenerator, Mesh, BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, MeshPhysicalMaterial, DirectionalLight, HemisphereLight, NeutralToneMapping, Vector3, Group, SphereGeometry, Quaternion } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { triangulate } from '../geometry/mesh';
import { applyFinish, installSplitBand } from './materials';
import { finishById, Look } from '../../design/finishes';
import { makePuck } from './parts';
import { CORE } from '../params/core';
import type { ThumbEye } from '../evaluate';

/** Renders small thumbnails of saved iterations with a private renderer (keeps the main stage untouched). */
export class ThumbRenderer {
  private r: WebGLRenderer; private scene = new Scene(); private cam: PerspectiveCamera;
  private eyeMeshes: Mesh[] = []; private eyeMat = new MeshPhysicalMaterial({ color: 0x15151b, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  private puck: Group | null = null; private puckKey = '';
  private mat = new MeshPhysicalMaterial(); private mesh: Mesh; private geo = new BufferGeometry();
  constructor(faces2: Uint32Array, size = 168) {
    this.r = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.r.setSize(size, size, false); this.r.setPixelRatio(1); this.r.toneMapping = NeutralToneMapping;
    this.r.setClearColor(new Color('#fafaf8'), 1);
    const pm = new PMREMGenerator(this.r); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.9;
    this.scene.add(new HemisphereLight(0xffffff, 0xdad8d0, 0.25)); const dl = new DirectionalLight(0xffffff, 1.1); dl.position.set(60, 120, 140); this.scene.add(dl);
    this.cam = new PerspectiveCamera(30, 1, 5, 1000);
    let max = 0; for (let i = 0; i < faces2.length; i++) if (faces2[i] > max) max = faces2[i];
    this.geo.setAttribute('position', new Float32BufferAttribute(new Float32Array((max + 1) * 3), 3));
    this.geo.setIndex(new Uint32BufferAttribute(triangulate(faces2), 1));
    installSplitBand(this.mat);
    this.mesh = new Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.scene.add(this.mesh);
  }
  /** positions: level-2 surface (mm, y up). Returns a small JPEG data URL. */
  render(positions: Float32Array, look: Look, puck?: { point: Vector3; normal: Vector3 } | null, eyes: ThumbEye[] = []): string {
    while (this.eyeMeshes.length < 2) { const m = new Mesh(new SphereGeometry(1, 20, 14), this.eyeMat); this.scene.add(m); this.eyeMeshes.push(m); }
    this.eyeMeshes.forEach((m, i) => { const e = eyes[i]; m.visible = !!e; if (e) { m.position.copy(e.point); m.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), e.normal); m.scale.set(e.rx, e.ry, e.rz); } });
    // the Core sits in the seat, as in the main view (rebuilt when its shape changes)
    const key = [CORE.puckDiameter, CORE.puckDepth, CORE.domeHeight, CORE.edgeRadius].join();
    if (key !== this.puckKey || !this.puck) { if (this.puck) this.scene.remove(this.puck); this.puck = makePuck(); this.puckKey = key; this.scene.add(this.puck); }
    this.puck.visible = !!puck;
    if (puck) { this.puck.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), puck.normal); this.puck.position.copy(puck.point).addScaledVector(puck.normal, -CORE.puckDepth / 2); }
    const pos = this.geo.attributes.position as Float32BufferAttribute;
    (pos.array as Float32Array).set(positions.subarray(0, pos.array.length)); pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    // frame by the larger of height and width so wide shapes (the Peanut) are not cropped
    let h = 0, wx = 0; for (let i = 0; i < positions.length; i += 3) { if (positions[i + 1] > h) h = positions[i + 1]; if (Math.abs(positions[i]) > wx) wx = Math.abs(positions[i]); }
    const size = Math.max(h, wx * 2.05);
    const col = new Color(look.color); this.mat.color.copy(col); applyFinish(this.mat, finishById(look.finish), col);
    this.cam.position.set(size * 1.0, size * 0.95, size * 2.15); this.cam.lookAt(0, h * 0.46, 0);
    this.r.render(this.scene, this.cam);
    return this.r.domElement.toDataURL('image/jpeg', 0.88);
  }
}
