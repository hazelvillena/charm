import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, PMREMGenerator, Group, Mesh, BufferGeometry, Float32BufferAttribute,
  Uint32BufferAttribute, MeshPhysicalMaterial, MeshBasicMaterial, LineSegments, LineBasicMaterial, Points, PointsMaterial,
  CylinderGeometry, TorusGeometry, SphereGeometry, Vector3, Quaternion, DirectionalLight, HemisphereLight, CanvasTexture,
  PlaneGeometry, NeutralToneMapping, DoubleSide, Object3D, Material,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshBVH } from 'three-mesh-bvh';
import { triangulate } from '../geometry/mesh';
import { Placement, loopRing } from '../geometry/features';
import { CORE } from '../params/core';
import { Params } from '../params/schema';
import { COLORS } from '../store';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { makePuck } from './parts';

export const BG = '#F6F6F4';

type LevelGeo = { geo: BufferGeometry; bvh: MeshBVH | null; dirty: boolean; level: number };

export class SceneView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly root = new Group();          // explore-mode content
  readonly stageGroup = new Group();    // accepted-mode content (set by exploded.ts)
  private levels = new Map<number, LevelGeo>();
  private smooth: Mesh;
  private cageLines: LineSegments;
  private cagePts: Points;
  private cageGeo = new BufferGeometry();
  readonly shellMat: MeshPhysicalMaterial;
  readonly eyeMat = new MeshPhysicalMaterial({ color: 0x15151b, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  private eyes: Mesh[] = [];
  private puck: Group;
  private loopMesh: Mesh;
  private loopMat: MeshPhysicalMaterial;
  private shadow: Mesh;
  private ghost: Mesh | null = null;
  private baseColor = new Color('#C9C3F2');
  private tint = 0;
  private active = 2;
  private target = new Vector3(0, 30, 0);
  readonly labelRenderer = new CSS2DRenderer();
  onFrame: (() => void) | null = null;

  constructor(private host: HTMLElement, faces: Record<number, Uint32Array>, cageFaces: Uint32Array, cageVerts: number) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = NeutralToneMapping;
    host.appendChild(this.renderer.domElement);
    this.labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    host.appendChild(this.labelRenderer.domElement);
    this.scene.background = new Color(BG);
    const pm = new PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    this.scene.add(new HemisphereLight(0xffffff, 0xdad8d0, 0.25));
    const dl = new DirectionalLight(0xffffff, 1.1); dl.position.set(60, 120, 140); this.scene.add(dl);

    this.camera = new PerspectiveCamera(30, 1, 5, 2000);
    this.camera.position.set(75, 70, 190);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.target.copy(this.target); this.controls.minDistance = 60; this.controls.maxDistance = 500;

    this.scene.add(this.root, this.stageGroup);
    this.stageGroup.visible = false;

    this.shellMat = new MeshPhysicalMaterial({ color: this.baseColor, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12, metalness: 0 });
    for (const [lv, f] of Object.entries(faces)) {
      const g = new BufferGeometry();
      const verts = Math.max(...Array.from(f)) + 1;
      g.setAttribute('position', new Float32BufferAttribute(new Float32Array(verts * 3), 3));
      g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(verts * 3), 3));
      g.setIndex(new Uint32BufferAttribute(triangulate(f), 1));
      this.levels.set(+lv, { geo: g, bvh: null, dirty: true, level: +lv });
    }
    this.smooth = new Mesh(this.levels.get(2)!.geo, this.shellMat);
    this.root.add(this.smooth);

    // cage wireframe + vertex dots share one position attribute
    this.cageGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(cageVerts * 3), 3));
    const edges = new Set<number>(), idx: number[] = [];
    for (let f = 0; f < cageFaces.length / 4; f++) for (let i = 0; i < 4; i++) {
      const a = cageFaces[f * 4 + i], b = cageFaces[f * 4 + ((i + 1) & 3)];
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      if (!edges.has(k)) { edges.add(k); idx.push(a, b); }
    }
    this.cageGeo.setIndex(idx);
    this.cageLines = new LineSegments(this.cageGeo, new LineBasicMaterial({ color: 0x14141c, transparent: true, opacity: 0.85 }));
    const ptsGeo = new BufferGeometry(); ptsGeo.setAttribute('position', this.cageGeo.attributes.position);
    this.cagePts = new Points(ptsGeo, new PointsMaterial({ color: 0x14141c, size: 2.4, sizeAttenuation: false }));
    this.cageLines.visible = false; this.cagePts.visible = false;
    this.cageLines.frustumCulled = false; this.cagePts.frustumCulled = false; this.smooth.frustumCulled = false;
    this.root.add(this.cageLines, this.cagePts);

    // features
    for (let i = 0; i < 2; i++) { const m = new Mesh(new SphereGeometry(1, 24, 16), this.eyeMat); m.visible = false; this.eyes.push(m); this.root.add(m); }
    this.puck = makePuck(); this.puck.visible = false;
    this.root.add(this.puck);
    const lr = loopRing();
    this.loopMat = this.shellMat.clone();
    this.loopMesh = new Mesh(new TorusGeometry(lr.major, lr.tube, 18, 40), this.loopMat);
    this.loopMesh.visible = false; this.root.add(this.loopMesh);

    // contact shadow
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d')!; const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(20,20,40,0.28)'); gr.addColorStop(0.5, 'rgba(20,20,40,0.10)'); gr.addColorStop(1, 'rgba(20,20,40,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
    this.shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.05; this.scene.add(this.shadow);

    const ro = new ResizeObserver(() => this.resize()); ro.observe(host);
    this.resize();
    const loop = () => { this.controls.update(); this.onFrame?.(); this.renderer.render(this.scene, this.camera); if (this.stageGroup.visible) this.labelRenderer.render(this.scene, this.camera); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = Math.min(52, 30 * Math.max(1, 1.45 / (w / h))); // keep the body in frame on narrow stages
    this.camera.updateProjectionMatrix();
  }

  // ---- shape updates ----
  updateShape(cage: Float32Array, level: number, positions: Float32Array, display = true) {
    const lg = this.levels.get(level)!;
    const pos = lg.geo.attributes.position as Float32BufferAttribute;
    (pos.array as Float32Array).set(positions.subarray(0, pos.array.length));
    pos.needsUpdate = true;
    lg.geo.computeVertexNormals();
    lg.dirty = true;
    const cp = this.cageGeo.attributes.position as Float32BufferAttribute;
    (cp.array as Float32Array).set(cage); cp.needsUpdate = true;
    if (display) { this.active = level; this.smooth.geometry = lg.geo; }
  }

  geometry(level: number) { return this.levels.get(level)!.geo; }
  bvh(level: number): MeshBVH {
    const lg = this.levels.get(level)!;
    if (!lg.bvh) { lg.bvh = new MeshBVH(lg.geo, { indirect: true }); lg.dirty = false; }
    else if (lg.dirty) { lg.bvh.refit(); lg.dirty = false; }
    return lg.bvh;
  }

  setFeatures(pl: Placement, p: Params) {
    const sz = p.eyeSize, rx = sz / 2, ry = (sz * 1.57) / 2, rz = (sz / 2) * (p.eyeType === 'flush' ? 0.25 : 0.7);
    const off = p.eyeType === 'inset' ? -0.15 : p.eyeType === 'raised' ? 0.55 : -0.05;
    pl.eyes.forEach((e, i) => {
      const m = this.eyes[i];
      if (!e) { m.visible = false; return; }
      m.visible = true;
      m.position.copy(e.point).addScaledVector(e.normal, off * rz);
      // orient: local Z -> normal, keep local Y roughly up
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), e.normal);
      m.quaternion.copy(q);
      m.scale.set(rx, ry, rz);
    });
    if (pl.puck) {
      this.puck.visible = true;
      const n = pl.puck.normal;
      this.puck.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
      this.puck.position.copy(pl.puck.point).addScaledVector(n, -(CORE.puckDepth / 2) + 0.6);
    } else this.puck.visible = false;
    if (pl.loop) {
      this.loopMesh.visible = true;
      this.loopMesh.position.copy(pl.loop.center);
    } else this.loopMesh.visible = false;
  }

  setViewMode(mode: 'smooth' | 'cage' | 'both') {
    this.cageLines.visible = mode !== 'smooth'; this.cagePts.visible = mode !== 'smooth';
    this.shellMat.transparent = mode !== 'smooth';
    this.shellMat.opacity = mode === 'smooth' ? 1 : mode === 'both' ? 0.32 : 0.0;
    this.shellMat.depthWrite = mode === 'smooth';
    this.shellMat.needsUpdate = true;
    this.loopMat.transparent = this.shellMat.transparent; this.loopMat.opacity = mode === 'smooth' ? 1 : 0.9; this.loopMat.needsUpdate = true;
  }

  setColor(id: string) {
    const c = COLORS.find((x) => x.id === id) ?? COLORS[0];
    this.baseColor.set(c.hex);
    this.shellMat.metalness = c.metal ? 1 : 0;
    this.shellMat.roughness = c.metal ? 0.14 : 0.25;
    this.applyTint();
  }
  get shellColor() { return this.baseColor; }
  setInvalidTint(t: number) { this.tint = t; this.applyTint(); }
  private applyTint() {
    this.shellMat.color.copy(this.baseColor).lerp(new Color('#ff6b6b'), this.tint * 0.28);
    this.loopMat.color.copy(this.shellMat.color); this.loopMat.metalness = this.shellMat.metalness; this.loopMat.roughness = this.shellMat.roughness;
  }

  /** heatmap: pass per-vertex colors for the level-2 geometry, or null */
  setHeatmap(colors: Float32Array | null) {
    const lg = this.levels.get(2)!;
    if (colors) {
      lg.geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
      this.shellMat.vertexColors = true; this.smooth.geometry = lg.geo; this.active = 2;
    } else this.shellMat.vertexColors = false;
    this.shellMat.needsUpdate = true;
  }
  get activeLevel() { return this.active; }
  showLevel(level: number) { this.active = level; this.smooth.geometry = this.levels.get(level)!.geo; }

  setShadow(width: number) { this.shadow.scale.set(width * 2.2, width * 2.2, 1); }
  setTarget(y: number) { this.controls.target.y += (y - this.controls.target.y) * 0.2; }
  frame(height: number) { this.target.set(0, height * 0.46, 0); this.controls.target.copy(this.target); }

  flyTo(pos: Vector3, target: Vector3, ms = 800) {
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone(), start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(p0, pos, e); this.controls.target.lerpVectors(t0, target, e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  setGhost(mesh: Mesh | null) { if (this.ghost) this.root.remove(this.ghost); this.ghost = mesh; if (mesh) this.root.add(mesh); }
  get ghostMesh() { return this.ghost; }
  setExploreVisible(v: boolean) { this.root.visible = v; this.shadow.visible = v; }
  all(): Object3D[] { return [this.smooth]; }
  dispose(m: Material) { m.dispose(); }
}
export { DoubleSide };
