import './styles.css';
import { Color } from 'three';
import { Store, ViewMode } from './store';
import { ShapeEngine } from './geometry/engine';
import { ShapeInfo } from './geometry/shapeMap';
import { bounds } from './geometry/mesh';
import { Profile } from './geometry/profile';
import { placeFeatures, Placement } from './geometry/features';
import { SceneView } from './scene/scene';
import { buildReferenceGhost } from './scene/referenceGhost';
import { PRESETS, presetParams } from './params/presets';
import { Outline, cloneOutline, clampOutline, lerpOutline } from './params/outline';
import { Params, SCHEMA, defaultParams } from './params/schema';
import { OutlineEditor } from './ui/outlineEditor';
import { Panel } from './ui/panel';
import { Toolbar } from './ui/toolbar';
import { toast } from './ui/toast';
import { download } from './ui/download';
import { h } from './ui/dom';
import { checkFit, CheckResult } from './checks/fit';
import { checkNook } from './checks/nook';
import { checkWall, innerGeometry } from './checks/wall';
import { encodeShare, decodeShare } from './io/share';
import { quadObj } from './io/exportObj';
import { setupAccept } from './acceptFlow';

const store = new Store();
const engine = new ShapeEngine();
const V = engine.qs.vertCount;
const cage = new Float32Array(V * 3);
const buf2 = new Float32Array(engine.smoothVertCount(2) * 3);
const buf3 = new Float32Array(engine.smoothVertCount(3) * 3);

// ---- DOM ----
const app = document.getElementById('app')!;
const editor = new OutlineEditor();
const panel = new Panel(editor.el);
const stage = h('main', { class: 'stage' });
const toolbar = new Toolbar(PRESETS.map((p) => ({ id: p.id, name: p.name })));
const legend = h('div', { class: 'legend' }, h('div', { text: 'Wall thickness' }), h('div', { class: 'bar' }), h('div', { text: 'thin → at target' }));
const status = h('div', { class: 'status' });
app.append(panel.el, stage);
stage.append(toolbar.chips, toolbar.el, legend, status);

const view = new SceneView(stage, { 2: engine.smoothFaces(2), 3: engine.smoothFaces(3) }, engine.qs.faces, engine.qs.vertCount);
let ghostBuilt = false;

// ---- state helpers ----
let info: ShapeInfo | null = null;
let place: Placement | null = null;
let height = 60;
let lastValid = { outline: cloneOutline(store.state.outline), params: { ...store.state.params } };
let checks: CheckResult[] = [];
let thickness: Float32Array | null = null;
let minWall = Infinity;
let dirty = true;
let settleTimer: number | undefined;
let animating = false;

function snapshotOk() { lastValid = { outline: cloneOutline(store.state.outline), params: { ...store.state.params } }; }

function revert(reason: string) {
  store.state.outline = cloneOutline(lastValid.outline);
  store.state.params = { ...lastValid.params };
  panel.setParams(store.state.params); editor.set(store.state.outline, store.state.params.wall);
  toast(`That change produced an invalid shape (${reason}). Kept the last valid one.`, 'warn');
  dirty = true;
}

function markDirty() {
  dirty = true;
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(settle, 150);
}

function live() {
  const s = store.state;
  const i = engine.buildCage(s.outline, s.params, cage);
  if (!i) { revert('geometry'); return; }
  info = i; snapshotOk();
  engine.smoothInto(cage, 2, buf2);
  view.setHeatmap(null);
  view.updateShape(cage, 2, buf2, true);
  const b = bounds(buf2); height = b.max[1];
  view.setShadow(Math.max(b.size[0], b.size[2]));
  placeFeaturesAt(2);
  view.setTarget(height * 0.46);
}

function placeFeaturesAt(level: number) {
  if (!info) return;
  try {
    place = placeFeatures(view.bvh(level), view.geometry(level), store.state.params, info.shiftY, height);
    view.setFeatures(place, store.state.params);
  } catch (e) { console.warn('feature placement failed', e); }
}

function settle() {
  if (store.state.mode !== 'explore') return;
  const s = store.state;
  const i = engine.buildCage(s.outline, s.params, cage);
  if (!i) { revert('geometry'); return; }
  info = i;
  try {
    engine.smoothInto(cage, 2, buf2); view.updateShape(cage, 2, buf2, false);
    engine.smoothInto(cage, 3, buf3); view.updateShape(cage, 3, buf3, true);
    height = bounds(buf3).max[1];
    placeFeaturesAt(3);
    runChecks();
  } catch (e) { console.error(e); toast('Could not refine the shape; showing the live preview.', 'warn'); }
  view.showLevel(store.state.heatmap ? 2 : 3);
  applyHeatmap();
  history.replaceState(null, '', '#p=' + encodeShare(s.params, s.outline));
}

function runChecks() {
  if (!info || !place) return;
  const s = store.state;
  const list: CheckResult[] = [];
  try {
    const prof = new Profile(s.outline);
    const innerCage = new Float32Array(V * 3);
    const innerL2 = new Float32Array(engine.smoothVertCount(2) * 3);
    if (engine.buildInnerCage(s.outline, s.params, info.shiftY, innerCage)) {
      engine.smoothInto(innerCage, 2, innerL2);
      const inner = innerGeometry(innerL2, engine.smoothFaces(2));
      const w = checkWall(view.geometry(2), inner.bvh, s.params.wall);
      thickness = w.thickness; minWall = w.min; list.push(w.check);
      inner.g.dispose();
    } else list.push({ id: 'wall', ok: false, label: 'Wall', detail: 'Inner shell could not be built' });
    list.unshift(checkFit(prof, s.params, view.bvh(3), view.geometry(3), place));
    list.push(checkNook(view.bvh(3), view.geometry(3), place));
  } catch (e) { console.error(e); list.push({ id: 'fit', ok: false, label: 'Checks', detail: 'A check failed to run' }); }
  checks = list;
  const bad = list.some((c) => !c.ok);
  view.setInvalidTint(bad ? 1 : 0);
  toolbar.setWarn(bad); toolbar.setChecks(list, false);
  store.emit('checks');
}

function applyHeatmap() {
  const on = store.state.heatmap && thickness && store.state.mode === 'explore';
  legend.classList.toggle('on', !!on);
  if (!on) { view.setHeatmap(null); return; }
  const target = store.state.params.wall;
  const col = new Float32Array(thickness!.length * 3);
  const base = view.shellColor, red = new Color('#e5484d'), mid = new Color('#f2b36b'), c = new Color();
  for (let i = 0; i < thickness!.length; i++) {
    const t = thickness![i] / target; // 1 = at target
    if (!Number.isFinite(t) || t >= 1) c.copy(base);
    else if (t > 0.8) c.copy(mid).lerp(base, (t - 0.8) / 0.2);
    else c.copy(red).lerp(mid, Math.max(0, (t - 0.5) / 0.3));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  view.setHeatmap(col);
}

view.onFrame = () => { if (dirty) { dirty = false; live(); } };

// ---- editor + panel wiring ----
editor.onChange = (o, final) => {
  store.state.outline = o; store.state.presetId = null; toolbar.setPreset(null);
  toolbar.setChecks(checks, true); markDirty(); void final;
};
editor.onReset = () => { const p = PRESETS.find((x) => x.id === (store.state.presetId ?? 'ghost')) ?? PRESETS[0]; applyPreset(p.id); };
editor.onRef = (show) => {
  if (show && !ghostBuilt) { view.setGhost(buildReferenceGhost()); ghostBuilt = true; }
  if (view.ghostMesh) view.ghostMesh.visible = show;
  store.state.refGhost = show;
};
panel.onParam = (id, value, final) => {
  (store.state.params as any)[id] = value;
  if (id === 'wall') editor.set(store.state.outline, store.state.params.wall);
  if (!final || id === 'eyeType' || id === 'nookPos' || id === 'material') toolbar.setChecks(checks, true);
  markDirty();
};
panel.onColor = (id) => { store.state.color = id; view.setColor(id); applyHeatmap(); };

toolbar.onView = (v: ViewMode) => { store.state.view = v; view.setViewMode(v); toolbar.setView(v); };
toolbar.onHeat = () => { store.state.heatmap = !store.state.heatmap; toolbar.setHeat(store.state.heatmap); view.showLevel(store.state.heatmap ? 2 : 3); applyHeatmap(); };
toolbar.onPreset = (id) => applyPreset(id);
toolbar.onShare = async () => {
  const url = location.origin + location.pathname + '#p=' + encodeShare(store.state.params, store.state.outline);
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('Share link copied. Opening it restores this exact identity.'); }
  catch { toast('Link is in the address bar (clipboard blocked).'); }
};

// ---- presets with animation ----
function applyPreset(id: string) {
  const p = PRESETS.find((x) => x.id === id); if (!p || store.state.mode !== 'explore') return;
  const from = { o: cloneOutline(store.state.outline), p: { ...store.state.params } };
  const keep = { wall: from.p.wall, material: from.p.material, splitZ: from.p.splitZ, nookPos: from.p.nookPos, eyeType: from.p.eyeType };
  const toParams = { ...presetParams(p), ...keep } as Params;
  const toOutline = clampOutline(p.outline, toParams.wall);
  store.state.presetId = id; toolbar.setPreset(id);
  const t0 = performance.now(); animating = true;
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / 300), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    store.state.outline = lerpOutline(from.o, toOutline, e);
    const np: any = { ...toParams };
    for (const d of SCHEMA) if (d.kind === 'range') np[d.id] = (from.p as any)[d.id] + ((toParams as any)[d.id] - (from.p as any)[d.id]) * e;
    store.state.params = np as Params;
    panel.setParams(store.state.params); editor.set(store.state.outline, store.state.params.wall);
    markDirty();
    if (t < 1) requestAnimationFrame(step);
    else { store.state.outline = toOutline; store.state.params = toParams; panel.setParams(toParams); editor.set(toOutline, toParams.wall); animating = false; markDirty(); }
  };
  requestAnimationFrame(step);
}

// ---- export (explore-capable) ----
toolbar.onExport = (k) => {
  try {
    if (k === 'cage') { download('charmer-cage.obj', quadObj('charmer_cage', cage, engine.qs.faces, V, 'Charmer Lab cage (quads). In Rhino: ToSubD. Units mm.'), 'text/plain'); toast('Cage OBJ saved. Opens in Rhino; ToSubD round trip not yet verified.'); }
    else if (k === 'smooth') { download('charmer-smooth.obj', quadObj('charmer_smooth', buf3, engine.smoothFaces(3), engine.smoothVertCount(3), 'Charmer Lab smooth mesh, subdivision level 3. Units mm.'), 'text/plain'); toast('Smooth OBJ saved.'); }
    else accept.export(k);
  } catch (e) { console.error(e); toast('Export failed. Nothing was changed.', 'error'); }
};

// ---- accept / exploded / spec card (acceptFlow.ts) ----
const accept = setupAccept({
  store, engine, view, toolbar, panel, stage,
  getCage: () => cage, getInfo: () => info, getChecks: () => checks, getPlace: () => place, getHeight: () => height, getMinWall: () => minWall,
  settleNow: () => { clearTimeout(settleTimer); settle(); },
  resume: () => { dirty = true; clearTimeout(settleTimer); settle(); },
});

// ---- boot ----
function boot() {
  const m = location.hash.match(/#p=([^&]+)/);
  if (m) {
    const d = decodeShare(m[1]);
    if (d) { store.state.params = d.params; store.state.outline = d.outline; store.state.presetId = null; }
    else toast('That share link could not be read. Loaded the Ghost preset instead.', 'warn');
  }
  panel.setParams(store.state.params);
  panel.setColor(store.state.color); view.setColor(store.state.color);
  editor.set(store.state.outline, store.state.params.wall);
  toolbar.setView(store.state.view); toolbar.setPreset(store.state.presetId); toolbar.setMode(false); toolbar.setChecks([], true);
  view.setViewMode(store.state.view);
  live(); settle();
  status.textContent = '';
  (window as any).__charmer = { store, engine, view, settle, checks: () => checks, applyPreset };
}
boot();
export { defaultParams };
