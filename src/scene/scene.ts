import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, PMREMGenerator, Group, Mesh, BufferGeometry, Float32BufferAttribute,
  Uint32BufferAttribute, MeshPhysicalMaterial, MeshBasicMaterial, LineSegments, LineBasicMaterial, Points, PointsMaterial,
  CylinderGeometry, SphereGeometry, Shape, Path, ExtrudeGeometry, Vector3, Quaternion, DirectionalLight, HemisphereLight, CanvasTexture,
  PlaneGeometry, NeutralToneMapping, DoubleSide, FrontSide, Object3D, Material, Plane, ShaderMaterial,
  MeshLambertMaterial, Sprite, SpriteMaterial,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshBVH } from 'three-mesh-bvh';
import { triangulate } from '../geometry/mesh';
import { Placement, loopSlot } from '../geometry/features';
import { CORE } from '../params/core';
import { Params } from '../params/schema';
import { Look, finishById, DEFAULT_LOOK } from '../../design/finishes';
import { applyFinish, installSplitBand, splitUniforms } from './materials';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { makePuck, makeMagnet } from './parts';
import type { ViewMode, Analysis } from '../store';
import { SectionView } from './section';
import type { SectionData } from '../geometry/solids';

export const BG = '#F6F6F4';
const maxIndex = (a: Uint32Array) => { let m = 0; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }; // no spread: arrays can be 150k long

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
  private innerMesh: Mesh;
  private innerMat: MeshPhysicalMaterial;
  private magnets = new Group();
  private sectionOuter: LineSegments; private sectionInner: LineSegments;
  private clipPlane = new Plane(new Vector3(-1, 0, 0), 0); // keeps x <= 0, so the cut face looks toward +x
  private zebraMat: ShaderMaterial;
  private analysisMat = new MeshLambertMaterial({ vertexColors: true }); // matte, so the analysis colors read true (no clearcoat or tint over them)
  private hasColors = false;
  private viewMode: ViewMode = 'shaded';
  private analysis: Analysis = 'none';
  private clip: Plane[] = [];
  private sectionView = new SectionView();
  private sectionReady = false;
  private puckWanted = false; private loopWanted = false;
  private shadow: Mesh;
  private ghost: Mesh | null = null;
  private baseColor = new Color(DEFAULT_LOOK.color);
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
    this.camera.position.set(110, 62, 172);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.target.copy(this.target); this.controls.minDistance = 60; this.controls.maxDistance = 500;

    this.scene.add(this.root, this.stageGroup);
    this.stageGroup.visible = false;

    this.shellMat = new MeshPhysicalMaterial({ color: this.baseColor, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12, metalness: 0 });
    installSplitBand(this.shellMat);
    for (const [lv, f] of Object.entries(faces)) {
      const g = new BufferGeometry();
      const verts = maxIndex(f) + 1;
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
    this.loopMat = this.shellMat.clone();
    this.loopMesh = new Mesh(loopLugGeometry(), this.loopMat);
    this.loopMesh.visible = false; this.root.add(this.loopMesh);

    // inner shell (ghost + section views), magnets, section lines, zebra material
    const f2 = faces[2]; const v2 = maxIndex(f2) + 1;
    const ig = new BufferGeometry();
    ig.setAttribute('position', new Float32BufferAttribute(new Float32Array(v2 * 3), 3));
    ig.setAttribute('normal', new Float32BufferAttribute(new Float32Array(v2 * 3), 3));
    ig.setIndex(new Uint32BufferAttribute(triangulate(f2), 1));
    this.innerMat = new MeshPhysicalMaterial({ color: 0xc4cbff, roughness: 0.55, metalness: 0, side: DoubleSide, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: 1 });
    this.innerMesh = new Mesh(ig, this.innerMat); this.innerMesh.visible = false; this.innerMesh.frustumCulled = false; this.root.add(this.innerMesh);
    for (let i = 0; i < 2; i++) { const m = makeMagnet(i === 0 ? 'N' : 'S'); this.magnets.add(m); }
    this.magnets.visible = false; this.root.add(this.magnets);
    this.sectionOuter = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: 0x0f1117 }));
    this.sectionInner = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: 0x5b6cff }));
    for (const l of [this.sectionOuter, this.sectionInner]) { l.visible = false; l.frustumCulled = false; this.root.add(l); }
    this.root.add(this.sectionView.group);
    this.zebraMat = new ShaderMaterial({
      uniforms: { uFreq: { value: 26 } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vP; uniform float uFreq; void main(){ vec3 n = normalize(vN); vec3 r = reflect(normalize(vP), n); vec3 w = normalize(transpose(mat3(viewMatrix)) * r); float s = sin(w.y * uFreq + w.x * uFreq * 0.3); float band = smoothstep(-0.12, 0.12, s); gl_FragColor = vec4(mix(vec3(0.06, 0.06, 0.09), vec3(0.97), band), 1.0); }',
    });

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
    this.puckWanted = !!pl.puck; this.loopWanted = !!pl.loop;
    const hideForSection = this.viewMode === 'section' && this.sectionReady;
    if (pl.puck) {
      this.puck.visible = !hideForSection;
      const n = pl.puck.normal;
      this.puck.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
      this.puck.position.copy(pl.puck.point).addScaledVector(n, -(CORE.puckDepth / 2)); // top plane flush with the surface, dome proud
    } else this.puck.visible = false;
    if (pl.puck) {
      const zFloor = pl.puck.point.z - CORE.puckDepth, zc = zFloor - CORE.magnet.gap - CORE.magnet.thickness / 2;
      this.magnets.children.forEach((m, i) => m.position.set(0, pl.puck!.point.y + (i - 0.5) * CORE.magnet.spacing, zc));
    }
    if (pl.loop) {
      this.loopMesh.visible = !hideForSection;
      this.loopMesh.position.copy(pl.loop.center);
      this.loopMesh.rotation.z = Math.atan2(pl.loop.outward.y, pl.loop.outward.x) - Math.PI / 2; // long side of the slot runs along the edge
    } else this.loopMesh.visible = false;
  }

  /** rebuild the core mesh after its shape params changed */
  rebuildCore() {
    const vis = this.puck.visible, pos = this.puck.position.clone(), q = this.puck.quaternion.clone();
    this.root.remove(this.puck);
    this.puck.traverse((o) => { const m = o as Mesh; if (m.geometry) m.geometry.dispose(); });
    this.puck = makePuck(); this.puck.visible = vis; this.puck.position.copy(pos); this.puck.quaternion.copy(q);
    this.root.add(this.puck); this.applyClip();
  }

  /** shaded | ghost (see-through to the wall, core and magnets) | section (cut open) | cage */
  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    const ghost = mode === 'ghost', section = mode === 'section', cage = mode === 'cage';
    this.cageLines.visible = cage; this.cagePts.visible = cage;
    this.innerMesh.visible = ghost || section; this.magnets.visible = ghost || section;
    this.sectionOuter.visible = section; this.sectionInner.visible = section;
    this.renderer.localClippingEnabled = section;
    this.clip = section ? [this.clipPlane] : [];
    this.applyClip();
    this.shellMat.side = section ? DoubleSide : FrontSide;
    this.applySectionVisibility();
    const see = ghost || cage;
    this.shellMat.transparent = see; this.shellMat.opacity = ghost ? 0.2 : cage ? 0.32 : 1; this.shellMat.depthWrite = !see;
    this.shellMat.needsUpdate = true;
    this.loopMat.transparent = see; this.loopMat.opacity = see ? 0.85 : 1; this.loopMat.needsUpdate = true;
    this.innerMat.needsUpdate = true;
    this.applyMeshMaterial();
  }
  /** the section plane applies to the shell, wall, core, magnets and eyes (not the ground shadow) */
  private applyClip() {
    for (const m of [this.shellMat, this.innerMat, this.loopMat, this.eyeMat]) m.clippingPlanes = this.clip;
    for (const g of [this.puck, this.magnets]) g.traverse((o) => { const mat = (o as Mesh).material as Material | undefined; if (mat) mat.clippingPlanes = this.clip; });
  }
  /** the cut-open casing (real solids with poche) replaces the quick clipped preview once it is ready */
  setSectionData(data: SectionData | null) {
    if (data) {
      const coreMat = new MeshPhysicalMaterial({ color: 0xeceae5, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, side: DoubleSide });
      const magMat = new MeshPhysicalMaterial({ color: 0x9aa0aa, metalness: 1, roughness: 0.3, side: DoubleSide });
      this.sectionView.set(data, this.shellMat, coreMat, magMat);
    } else this.sectionView.clear();
    this.sectionReady = !!data; this.applySectionVisibility();
  }
  get hasSection() { return this.sectionReady; }
  private applySectionVisibility() {
    const section = this.viewMode === 'section', ready = section && this.sectionReady;
    this.sectionView.group.visible = ready;
    this.smooth.visible = !ready; this.puck.visible = this.puckWanted && !ready;
    this.innerMesh.visible = (this.viewMode === 'ghost' || section) && !ready;
    this.magnets.visible = (this.viewMode === 'ghost' || section) && !ready;
    this.loopMesh.visible = this.loopWanted && !ready;
    this.sectionOuter.visible = section && !ready; this.sectionInner.visible = section && !ready;
  }
  get mode() { return this.viewMode; }

  updateInner(positions: Float32Array) {
    const pos = this.innerMesh.geometry.attributes.position as Float32BufferAttribute;
    (pos.array as Float32Array).set(positions.subarray(0, pos.array.length)); pos.needsUpdate = true;
    this.innerMesh.geometry.computeVertexNormals();
  }
  updateSection(outer: Float32Array, inner: Float32Array) {
    this.sectionOuter.geometry.setAttribute('position', new Float32BufferAttribute(outer, 3));
    this.sectionInner.geometry.setAttribute('position', new Float32BufferAttribute(inner, 3));
  }

  /** analysis overlays: vertex colors on the level-2 surface, or the zebra shader */
  setAnalysis(mode: Analysis, colors: Float32Array | null) {
    this.analysis = mode;
    const lg = this.levels.get(2)!;
    if (colors) { lg.geo.setAttribute('color', new Float32BufferAttribute(colors, 3)); this.smooth.geometry = lg.geo; this.active = 2; }
    this.hasColors = !!colors;
    this.applyMeshMaterial();
  }
  private applyMeshMaterial() { this.smooth.material = this.analysis === 'zebra' && this.viewMode === 'shaded' ? this.zebraMat : this.hasColors ? this.analysisMat : this.shellMat; }
  get analysisMode() { return this.analysis; }
  get isZebra() { return this.analysis === 'zebra'; }

  setLook(look: Look) {
    this.baseColor.set(look.color);
    const f = finishById(look.finish);
    applyFinish(this.shellMat, f, this.baseColor);
    applyFinish(this.loopMat, f, this.baseColor);
    this.applyTint();
  }
  setSplit(zMm: number, on: boolean, cy = 0) { splitUniforms.uSplitZ.value = zMm; splitUniforms.uSplitOn.value = on ? 1 : 0; splitUniforms.uSplitCy.value = cy; }
  get shellColor() { return this.baseColor; }
  setInvalidTint(t: number) { this.tint = t; this.applyTint(); }
  private applyTint() {
    this.shellMat.color.copy(this.baseColor).lerp(new Color('#ff6b6b'), this.tint * 0.28);
    this.loopMat.color.copy(this.shellMat.color); this.loopMat.metalness = this.shellMat.metalness; this.loopMat.roughness = this.shellMat.roughness;
  }

  /** heatmap: pass per-vertex colors for the level-2 geometry, or null */
  setHeatmap(colors: Float32Array | null) { this.setAnalysis(this.analysis, colors); }
  get activeLevel() { return this.active; }
  showLevel(level: number) { this.active = level; this.smooth.geometry = this.levels.get(level)!.geo; }

  setShadow(width: number) { this.shadow.scale.set(width * 2.2, width * 2.2, 1); }
  setTarget(y: number) { this.controls.target.y += (y - this.controls.target.y) * 0.2; }
  frame(height: number) { this.target.set(0, height * 0.46, 0); this.controls.target.copy(this.target); }

  /** ring markers on the model where a check needs attention (always on top, so they read through the surface) */
  private issues = new Group(); private issueTex: CanvasTexture | null = null;
  setIssues(points: Vector3[]) {
    if (!this.issues.parent) this.root.add(this.issues);
    this.issues.clear();
    if (!this.issueTex) {
      const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d')!;
      g.lineWidth = 7; g.strokeStyle = '#e5484d'; g.beginPath(); g.arc(48, 48, 36, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(229,72,77,0.18)'; g.fill();
      this.issueTex = new CanvasTexture(c);
    }
    for (const p of points) { const sp = new Sprite(new SpriteMaterial({ map: this.issueTex, depthTest: false, transparent: true })); sp.position.copy(p); sp.scale.setScalar(11); sp.renderOrder = 20; this.issues.add(sp); }
  }
  /** turn the camera to look at a point from the outside */
  focusAt(p: Vector3) {
    const dir = p.clone().sub(this.target); if (dir.lengthSq() < 1) dir.set(0, 0, 1);
    dir.normalize(); const up = new Vector3(0, 0.25, 0);
    this.flyTo(p.clone().addScaledVector(dir.add(up).normalize(), 90), p, 600);
  }

  /** a slow turntable: the camera orbits the model about once a minute until switched off */
  setTurntable(on: boolean) { this.controls.autoRotate = on; this.controls.autoRotateSpeed = 1.0; }
  get turntable() { return this.controls.autoRotate; }

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

/** the loop lug: a rounded slot (stadium) in a stadium-shaped boss, as built into the shell */
function loopLugGeometry() {
  const l = loopSlot(), stad = (p: Shape | Path, len: number, w: number, ccw: boolean) => {
    const r = w / 2, a = len / 2 - r;
    if (ccw) { p.absarc(a, 0, r, -Math.PI / 2, Math.PI / 2, false); p.absarc(-a, 0, r, Math.PI / 2, Math.PI * 1.5, false); }
    else { p.absarc(-a, 0, r, Math.PI * 1.5, Math.PI / 2, true); p.absarc(a, 0, r, Math.PI / 2, -Math.PI / 2, true); }
  };
  const outer = new Shape(); stad(outer, l.length + 2 * l.boss, l.width + 2 * l.boss, true);
  const hole = new Path(); stad(hole, l.length, l.width, false); outer.holes.push(hole);
  const th = CORE.loop.minThickness + 1, g = new ExtrudeGeometry(outer, { depth: th, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -th / 2); return g;
}
