import '@fontsource-variable/instrument-sans';
import './styles.css';
import { Color, Vector3 } from 'three';
import { Store, ViewMode, Analysis } from './store';
import { ShapeEngine } from './geometry/engine';
import { ShapeInfo } from './geometry/shapeMap';
import { bounds, signedVolume } from './geometry/mesh';
import { Profile } from './geometry/profile';
import { placeFeatures, Placement } from './geometry/features';
import { SceneView } from './scene/scene';
import { buildReferenceGhost } from './scene/referenceGhost';
import { cloneOutline, clampOutline } from './params/outline';
import { blendOutlines } from './params/outlineEdit';
import { cloneSide, lerpSide, defaultSide } from './params/side';
import { Params, SCHEMA } from './params/schema';
import { setCore, CORE } from './params/core';
import { Library, GLOBAL_PARAM_KEYS } from './library';
import { LibraryPanel } from './ui/library';
import { evaluateIteration } from './evaluate';
import type { ThumbRenderer } from './scene/thumbs';
import type { Outline } from './params/outline';
import type { Look } from '../design/finishes';
import { DENSITY_G_CM3 } from './spec/materials';
import { OutlineEditor } from './ui/outlineEditor';
import { SideEditor } from './ui/sideEditor';
import { Panel } from './ui/panel';
import { OutputsPanel } from './ui/outputs';
import { Toolbar, ANALYSES } from './ui/toolbar';
import { icon } from './ui/icons';
import { replaceOrNew, nameNew } from './ui/dialog';
import { toast } from './ui/toast';
import { download } from './ui/download';
import { h } from './ui/dom';
import { checkFit, CheckResult } from './checks/fit';
import { checkNook } from './checks/nook';
import { draftAngles, checkDraft, curvatureRadii } from './checks/analysis';
import { sectionSegments, sideSilhouette } from './geometry/section';
import { partsObj } from './io/exportObj';
import { checkWall, innerGeometry } from './checks/wall';
import { encodeShare, decodeShare } from './io/share';
import { quadObj } from './io/exportObj';
import { setupAccept } from './acceptFlow';
import { buildCasing, SectionData } from './geometry/solids';
import { BRAND_NAME, brandMarkSvg } from '../design/brand';
import { finishAllowed, defaultFinishFor } from '../design/finishes';

document.title = BRAND_NAME;
const store = new Store();
const engine = new ShapeEngine();
const V = engine.qs.vertCount;
const cage = new Float32Array(V * 3);
const buf2 = new Float32Array(engine.smoothVertCount(2) * 3);
const buf3 = new Float32Array(engine.smoothVertCount(3) * 3);

// ---- DOM ----
const app = document.getElementById('app')!;
app.classList.add('ui-root');
const editor = new OutlineEditor();
const sideEditor = new SideEditor();
const panel = new Panel({ outline: editor.el, side: sideEditor.el });
const outputs = new OutputsPanel();
const stageRoot = h('main', { class: 'stage' });            // holds the sketch dock (when expanded) next to the view
const dock = h('div', { class: 'sketch-dock' });
const stage = h('div', { class: 'view-area' });             // the 3D canvas and every floating control
const toolbar = new Toolbar();
const legend = h('div', { class: 'legend ui-float' });
const sectionStatus = h('div', { class: 'section-status hidden' }, h('div', { class: 'ui-spinner small' }), h('span', { text: 'Cutting the section…' }));
const iconSvg = (side: 'l' | 'r') => `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="${side === 'l' ? 'M8 3.5v13' : 'M12 3.5v13'}" stroke="currentColor" stroke-width="1.5"/></svg>`;
const inputsBtn = h('button', { type: 'button', class: 'ui-btn ui-float drawer-btn inputs-btn', title: 'Show or hide the inputs panel', 'aria-label': 'Toggle inputs panel', onClick: () => togglePanel('inputs') });
const outputsBtn = h('button', { type: 'button', class: 'ui-btn ui-float drawer-btn outputs-btn', title: 'Show or hide the outputs panel', 'aria-label': 'Toggle outputs panel', onClick: () => togglePanel('outputs') });
inputsBtn.innerHTML = icon('panelLeft', 18); outputsBtn.innerHTML = icon('panelRight', 18);
const permaStageBtn = h('button', { type: 'button', class: 'ui-btn ui-float drawer-btn perma-btn', title: 'Copy permalink', 'aria-label': 'Copy permalink', onClick: () => outputs.onShare() });
permaStageBtn.innerHTML = icon('link', 17);
const brandMark = h('div', { class: 'brand-mark' }); brandMark.innerHTML = brandMarkSvg('ab');
// top bar: page title and permalink only. Panel toggles, library, layers and the pill menu live in their own spaces below it.
const appbar = h('header', { class: 'appbar' },
  h('div', { class: 'ab-left' }, brandMark, h('span', { class: 'brand-name', text: BRAND_NAME })),
  h('div', { class: 'ab-right' }, permaStageBtn));
const topbar = h('div', { class: 'topbar' }, h('div', { class: 'tb-left' }, inputsBtn), h('div', { class: 'ab-center' }, toolbar.layers, toolbar.chips), h('div', { class: 'tb-right' }, outputsBtn));
const nameField = h('input', { class: 'name-field', type: 'text', maxlength: '40', placeholder: 'Name this iteration', 'aria-label': 'Iteration name', spellcheck: 'false' }) as HTMLInputElement;
const libPanel = new LibraryPanel();
const saveBtn = h('button', { type: 'button', class: 'save-btn hidden', text: 'Save' }) as HTMLButtonElement;
const saveNewBtn = h('button', { type: 'button', class: 'save-btn alt hidden', text: 'as new' }) as HTMLButtonElement;
stageRoot.append(dock, stage);
app.append(appbar, panel.el, stageRoot, outputs.el);
// every column edge can be dragged: inputs, outputs, and (when the pads fill the canvas) the pad dock
function dragEdge(el: HTMLElement, apply: (clientX: number) => void) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* optional */ } el.classList.add('drag'); document.body.classList.add('col-dragging');
    const move = (ev: PointerEvent) => apply(ev.clientX);
    const up = () => { el.classList.remove('drag'); document.body.classList.remove('col-dragging'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); window.dispatchEvent(new Event('resize')); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}
const clampW = (w: number, other: number) => Math.round(Math.max(240, Math.min(560, w, window.innerWidth - other - 320)));
const outW = () => outputs.el.getBoundingClientRect().width, inW = () => panel.el.getBoundingClientRect().width;
const resizeL = h('div', { class: 'col-resizer left', title: 'Drag to resize' }), resizeR = h('div', { class: 'col-resizer right', title: 'Drag to resize' });
dragEdge(resizeL, (x) => app.style.setProperty('--col-inputs', `${clampW(x, outW())}px`));
dragEdge(resizeR, (x) => app.style.setProperty('--col-outputs', `${clampW(window.innerWidth - x, inW())}px`));
const dockResizer = h('div', { class: 'dock-resizer', title: 'Drag to resize' });
dragEdge(dockResizer, (x) => { const r = stageRoot.getBoundingClientRect(); stageRoot.style.setProperty('--dock-w', `${Math.round(Math.max(280, Math.min(r.width - 240, x - r.left)))}px`); });
stageRoot.append(dockResizer);
app.append(resizeL, resizeR);
stage.append(topbar, h('div', { class: 'namebar' }, nameField, saveBtn, saveNewBtn), libPanel.el, toolbar.el, legend, sectionStatus);
// Side panels: docked columns (the canvas readapts when they open or close); drawers only on phones.
const mqNarrow = window.matchMedia('(max-width: 699px)');
const MIN_STAGE = 460; // below this the canvas is too small to work in, so the other panel steps aside
const asDrawer = () => mqNarrow.matches;
function panelVisible(which: 'inputs' | 'outputs') { return asDrawer() ? app.classList.contains(`${which}-open`) : !app.classList.contains(`collapsed-${which}`); }
function syncPanelButtons() {
  inputsBtn.classList.toggle('on', panelVisible('inputs')); outputsBtn.classList.toggle('on', panelVisible('outputs'));
  app.classList.toggle('outputs-hidden', !panelVisible('outputs'));
}
function setDrawer(which: 'inputs' | 'outputs', open: boolean) {
  app.classList.toggle(`${which}-open`, open);
  if (open) app.classList.remove(which === 'inputs' ? 'outputs-open' : 'inputs-open');
  syncPanelButtons();
}
// the columns animate, so decide from their target widths rather than from the current layout
const colTarget = (w: 'inputs' | 'outputs') => { const v = app.style.getPropertyValue(w === 'inputs' ? '--col-inputs' : '--col-outputs'); return v ? parseFloat(v) : Math.min(320, Math.max(284, window.innerWidth * 0.23)); };
const stageWidthNow = () => window.innerWidth - (app.classList.contains('collapsed-inputs') ? 0 : colTarget('inputs')) - (app.classList.contains('collapsed-outputs') ? 0 : colTarget('outputs'));
function autoFit(keep: 'inputs' | 'outputs' | null) {
  if (asDrawer() || stageWidthNow() >= MIN_STAGE) return;
  const other = keep === 'outputs' ? 'inputs' : 'outputs'; // never close the panel the user just opened
  if (!app.classList.contains(`collapsed-${other}`)) app.classList.add(`collapsed-${other}`);
}
function togglePanel(which: 'inputs' | 'outputs') {
  if (asDrawer()) { setDrawer(which, !app.classList.contains(`${which}-open`)); return; }
  app.classList.toggle(`collapsed-${which}`);
  if (!app.classList.contains(`collapsed-${which}`)) autoFit(which);
  syncPanelButtons();
}
mqNarrow.addEventListener('change', syncPanelButtons);
let fitTimer: number | undefined;
window.addEventListener('resize', () => { toolbar.layout(); clearTimeout(fitTimer); fitTimer = window.setTimeout(() => { autoFit(null); syncPanelButtons(); }, 120); });
panel.onCollapse = () => togglePanel('inputs');

// Expand the two drawing pads (front outline + side profile) into the left half of the canvas; the view keeps the right half.
const shapeHome = editor.el.parentElement!, sideHome = sideEditor.el.parentElement!;
const dockFront = h('section', { class: 'dock-cell' }), dockSide = h('section', { class: 'dock-cell' });
dock.append(dockFront, dockSide);
let sketchOpen = false;
function setSketch(open: boolean) {
  sketchOpen = open;
  stageRoot.classList.toggle('sketch-open', open); app.classList.toggle('sketch-open', open);
  if (open) {
    // make room: the dock needs a wide canvas, so side panels step aside (outputs first)
    for (const which of ['outputs', 'inputs'] as const) { if (!asDrawer() && stageWidthNow() < 880 && !app.classList.contains(`collapsed-${which}`)) app.classList.add(`collapsed-${which}`); }
    syncPanelButtons();
    dockFront.append(editor.el); dockSide.append(sideEditor.el);
  } else { shapeHome.append(editor.el); sideHome.append(sideEditor.el); }
  panel.setExpanded(open); editor.render(); sideEditor.render();
}
panel.onExpand = () => setSketch(!sketchOpen);
// one control to leave the expanded canvas, and a handle to trade height between the two pads
const dockClose = h('button', { type: 'button', class: 'ui-btn icon-btn dock-close', title: 'Back to the panel', 'aria-label': 'Collapse the canvas', onClick: () => setSketch(false) });
dockClose.innerHTML = icon('shrink', 15);
const rowResizer = h('div', { class: 'row-resizer', title: 'Drag to resize' });
dock.append(dockClose, rowResizer);
{
  let startY = 0, startFrac = 0.5;
  rowResizer.addEventListener('pointerdown', (e) => { startY = e.clientY; startFrac = parseFloat(dock.style.getPropertyValue('--dock-frac')) || 0.5; });
  dragEdge(rowResizer, () => {});
  rowResizer.addEventListener('pointermove', (e) => {
    if (!rowResizer.classList.contains('drag')) return;
    const r = dock.getBoundingClientRect(), f = Math.min(0.75, Math.max(0.25, startFrac + (e.clientY - startY) / Math.max(1, r.height)));
    dock.style.setProperty('--dock-frac', String(f));
  });
}
stage.addEventListener('pointerdown', () => { if (app.classList.contains('inputs-open') || app.classList.contains('outputs-open')) { app.classList.remove('inputs-open', 'outputs-open'); syncPanelButtons(); } });
outputs.onClose = () => togglePanel('outputs');

const view = new SceneView(stage, { 2: engine.smoothFaces(2), 3: engine.smoothFaces(3) }, engine.qs.faces, engine.qs.vertCount);
let ghostBuilt = false;

// ---- state helpers ----
let info: ShapeInfo | null = null;
let place: Placement | null = null;
let height = 60;
const snap = () => ({ outline: cloneOutline(store.state.outline), params: { ...store.state.params, side: cloneSide(store.state.params.side) } });
let lastValid = snap();
let checks: CheckResult[] = [];
let thickness: Float32Array | null = null;
let draftArr: Float32Array | null = null;
let radiiArr: Float32Array | null = null;
const innerL2 = new Float32Array(engine.smoothVertCount(2) * 3);
let innerOk = false;
let minWall = Infinity;
let est: { shellCm3: number | null; weightG: number | null } = { shellCm3: null, weightG: null };
let dirty = true;
let settleTimer: number | undefined;

function revert(reason: string) {
  store.state.outline = cloneOutline(lastValid.outline);
  store.state.params = { ...lastValid.params, side: cloneSide(lastValid.params.side) };
  panel.setParams(store.state.params); editor.set(store.state.outline, store.state.params.wall);
  toast('Invalid shape, kept the last valid one', 'warn');
  dirty = true;
}

function markDirty() { dirty = true; clearTimeout(settleTimer); settleTimer = window.setTimeout(settle, 150); }

function pushLive(b: ReturnType<typeof bounds>) {
  const p = store.state.params;
  outputs.setLive({ w: b.size[0], h: b.max[1], d: b.size[2], shellCm3: est.shellCm3, weightG: est.weightG, material: p.material, splitZ: p.splitZ * p.depth });
}

function updateHash() { const s = store.state; history.replaceState(null, '', '#p=' + encodeShare(s.params, s.outline, s.look, s.name)); }

function live() {
  const s = store.state;
  const i = engine.buildCage(s.outline, s.params, cage, 'live');
  if (!i) { revert('geometry'); return; }
  info = i; lastValid = snap();
  engine.smoothInto(cage, 2, buf2);
  view.setAnalysis(store.state.analysis === 'zebra' ? 'zebra' : 'none', null); // colored analyses refresh when you let go
  view.updateShape(cage, 2, buf2, true);
  const b = bounds(buf2); height = b.max[1];
  view.setShadow(Math.max(b.size[0], b.size[2]));
  view.setSplit(s.params.splitZ * s.params.depth, s.showSplit, i.shiftY);
  placeFeaturesAt(2);
  if (view.mode === 'ghost' || view.mode === 'section') { computeInner(); if (view.mode === 'section') { if (view.hasSection) view.setSectionData(null); sectionKey = ''; updateSection(); } }
  view.setTarget(height * 0.46);
  sideEditor.set(s.params.side, i.zFront, i.zBack, height, i.shiftY);
  editor.setResult(sectionSegments(buf2, engine.smoothFaces(2), 2, 0), i.shiftY);
  sideEditor.setResult(sideSilhouette(buf2)); // both pads follow the body parametrically
  pushLive(b);
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
  } catch (e) { console.error(e); toast('Showing the live preview', 'warn'); }
  view.showLevel(3);
  if (view.mode === 'section') { updateSection(); ensureSection(); }
  applyAnalysis();
  pushLive(bounds(buf3));
  updateHash();
}

// ---- section: cut the real casing (core seat walls, floor, magnet pockets) so the cut faces are true poche ----
let sectionKey = '', sectionBusy = false, sectionAgain = false;
let sectionCache: { key: string; data: SectionData } | null = null;
const sectionKeyNow = () => JSON.stringify([store.state.outline, store.state.params, coreSnapshot()]);
/** the real cut of the casing (walls, core seat, floor, magnet pockets) for the current shape */
async function buildSectionData(): Promise<SectionData | null> {
  const s = store.state;
  const outerPos = new Float32Array(engine.smoothVertCount(3) * 3); engine.smoothInto(cage, 3, outerPos);
  const innerPos = new Float32Array(engine.smoothVertCount(3) * 3);
  if (!engine.innerSurface(outerPos, 3, s.params.wall, innerPos)) throw new Error('inner shell');
  const c = await buildCasing({ outerPos, innerPos, faces: engine.smoothFaces(3), params: s.params, place: place!, section: true });
  return c.section ?? null;
}
/** make the section ready BEFORE the view switches, so the first Section click never flashes a hollow shell */
async function prepareSection(): Promise<boolean> {
  if (!info || !place) return false;
  const key = sectionKeyNow(); if (sectionCache?.key === key) return true;
  sectionStatus.classList.remove('hidden');
  try { const data = await buildSectionData(); if (data) { sectionCache = { key, data }; return true; } } catch (e) { console.warn('section build failed', e); }
  finally { sectionStatus.classList.add('hidden'); }
  return false;
}
async function ensureSection() {
  if (view.mode !== 'section' || !info || !place) return;
  const key = sectionKeyNow();
  if (key === sectionKey && view.hasSection) return;
  if (sectionCache?.key === key) { view.setSectionData(sectionCache.data); sectionKey = key; return; }
  if (sectionBusy) { sectionAgain = true; return; }
  sectionBusy = true; sectionStatus.classList.remove('hidden');
  try {
    const data = await buildSectionData();
    if (view.mode === 'section' && data) { sectionCache = { key, data }; view.setSectionData(data); sectionKey = key; }
  } catch (e) { console.warn('section build failed', e); view.setSectionData(null); toast('Showing the quick section', 'warn'); }
  finally { sectionBusy = false; sectionStatus.classList.add('hidden'); if (sectionAgain) { sectionAgain = false; ensureSection(); } }
}

function computeInner(): boolean {
  if (!info) return false;
  innerOk = engine.innerSurface(buf2, 2, store.state.params.wall, innerL2);
  if (innerOk) view.updateInner(innerL2);
  return innerOk;
}
function updateSection() {
  if (!innerOk) computeInner();
  view.updateSection(sectionSegments(buf2, engine.smoothFaces(2), 0, 0), innerOk ? sectionSegments(innerL2, engine.smoothFaces(2), 0, 0) : new Float32Array());
}

function runChecks() {
  if (!info || !place) return;
  const s = store.state;
  const results: Record<string, CheckResult> = {};
  try {
    const prof = new Profile(s.outline);
    if (computeInner()) {
      const inner = innerGeometry(innerL2, engine.smoothFaces(2));
      const w = checkWall(view.geometry(2), inner.bvh, s.params.wall);
      thickness = w.thickness; minWall = w.min; results.wall = w.check;
      inner.g.dispose();
      const shell = (signedVolume(buf2, engine.smoothFaces(2)) - signedVolume(innerL2, engine.smoothFaces(2))) / 1000;
      est = { shellCm3: shell, weightG: shell * DENSITY_G_CM3[s.params.material] };
    } else results.wall = { id: 'wall', ok: false, label: 'Wall', detail: 'Inner shell could not be built' };
    results.fit = checkFit(prof, s.params, view.bvh(3), view.geometry(3), place);
    const g2 = view.geometry(2), pos = g2.attributes.position.array as Float32Array, nor = g2.attributes.normal.array as Float32Array;
    draftArr = draftAngles(pos, nor, s.params.splitZ * s.params.depth);
    results.draft = checkDraft(draftArr, s.params.splitZ * s.params.depth, buf2);
    radiiArr = curvatureRadii(pos, nor, engine.smoothFaces(2));
    if (place.loop) results.nook = checkNook(view.bvh(3), view.geometry(3), place);
  } catch (e) { console.error(e); results.fit = results.fit ?? { id: 'fit', ok: false, label: 'Checks', detail: 'A check failed to run' }; }
  const list = ['fit', 'wall', 'draft', 'nook'].map((k) => results[k]).filter(Boolean);
  checks = list;
  const bad = list.some((c) => !c.ok);
  view.setInvalidTint(bad ? 1 : 0);
  outputs.setWarn(bad); outputs.setChecks(list, false);
  { const f = results.fit; editor.setIssue(f && !f.ok && f.angleDeg !== undefined ? f.angleDeg : null); }
  view.setIssues(list.filter((c) => !c.ok && c.at).map((c) => new Vector3(c.at!.x, c.at!.y, c.at!.z)));
  store.emit('checks');
}

const LEGENDS: Record<string, [string, string][]> = {
  draft: [['#e5484d', 'Undercut'], ['#f2b36b', 'Under 1°'], ['#f1e08a', '1° to 3°'], ['#58c29a', '3°+']],
  curvature: [['#e5484d', 'Too sharp'], ['#f2b36b', 'Under 4 mm'], ['#f1e08a', 'Under 8 mm'], ['#d9dbe3', 'Gentle']],
};
const hexRGB = (hex: string) => { const c = new Color(hex); return [c.r, c.g, c.b]; };

function applyAnalysis() {
  const a: Analysis = store.state.analysis;
  const on = a !== 'none' && store.state.mode === 'explore';
  legend.classList.toggle('on', on && a !== 'zebra'); // zebra explains itself
  legend.replaceChildren(...(a === 'none' ? [] : [h('div', { class: 'legend-title', text: ANALYSES.find((x) => x.id === a)?.label ?? '' })]), ...(LEGENDS[a] ?? []).map(([c, t]) => h('div', { class: 'legend-row' }, h('i', { style: `background:${c}` }), h('span', { text: t }))));
  if (!on) { view.setAnalysis('none', null); view.showLevel(3); return; }
  if (a === 'zebra') { view.setAnalysis('zebra', null); view.showLevel(3); return; }
  const n = view.geometry(2).attributes.position.count, col = new Float32Array(n * 3), wall = store.state.params.wall;
  const put = (i: number, c: number[]) => { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; };
  const base = [view.shellColor.r, view.shellColor.g, view.shellColor.b];
  const [red, amber, yellow, green, gentle] = ['#e5484d', '#f2b36b', '#f1e08a', '#58c29a', '#d9dbe3'].map(hexRGB);
  if (a === 'draft' && draftArr) for (let i = 0; i < n; i++) { const d = draftArr[i]; put(i, d < -0.75 ? red : d < 1 ? amber : d < 3 ? yellow : green); }
  else if (a === 'curvature' && radiiArr) for (let i = 0; i < n; i++) { const r = radiiArr[i]; put(i, r < 1.5 * wall ? red : r < 4 ? amber : r < 8 ? yellow : gentle); }
  else { for (let i = 0; i < n; i++) put(i, base); }
  view.setAnalysis(a, col);
}

view.onFrame = () => { if (dirty) { dirty = false; live(); } };

// ---- wiring: inputs ----
const modified = () => { markEdited(); outputs.setChecks(checks, true); markDirty(); };
// ---- undo / redo: every finished edit (a drag released, a point deleted, a slider set, a colour picked) is one step ----
type Snap = { outline: Outline; params: Params; look: Look };
const takeSnap = (): Snap => ({ outline: cloneOutline(store.state.outline), params: { ...store.state.params, side: cloneSide(store.state.params.side) }, look: { ...store.state.look } });
let committed: Snap = takeSnap(); const undoStack: Snap[] = [], redoStack: Snap[] = [];
function commit() {
  const now = takeSnap(); if (JSON.stringify(now) === JSON.stringify(committed)) return;
  undoStack.push(committed); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; committed = now;
}
const resetHistory = () => { committed = takeSnap(); undoStack.length = 0; redoStack.length = 0; };
function restore(sn: Snap) {
  store.state.outline = cloneOutline(sn.outline); store.state.params = { ...sn.params, side: cloneSide(sn.params.side) }; store.state.look = { ...sn.look };
  panel.setParams(store.state.params); panel.setLook(store.state.look); view.setLook(store.state.look); editor.set(store.state.outline, store.state.params.wall);
  modified(); updateHash();
}
function undo() { const sn = undoStack.pop(); if (!sn) { toast('Nothing to undo'); return; } redoStack.push(committed); committed = sn; restore(sn); toast('Undone'); }
function redo() { const sn = redoStack.pop(); if (!sn) { toast('Nothing to redo'); return; } undoStack.push(committed); committed = sn; restore(sn); toast('Redone'); }
window.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || store.state.mode !== 'explore') return;
  const t = e.target as HTMLElement, typing = t instanceof HTMLTextAreaElement || t.isContentEditable || (t instanceof HTMLInputElement && ['text', 'number', 'search'].includes(t.type));
  if (typing) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});
editor.onChange = (o, final) => { store.state.outline = o; modified(); if (final) commit(); };
// revert: each canvas goes back to how it was when this iteration was loaded or last saved
let baseline = { outline: cloneOutline(store.state.outline), side: cloneSide(store.state.params.side) };
const captureBaseline = () => { baseline = { outline: cloneOutline(store.state.outline), side: cloneSide(store.state.params.side) }; };
editor.onReset = () => { const o = cloneOutline(baseline.outline); editor.set(o, store.state.params.wall); editor.onChange(o, true); };
sideEditor.onReset = () => { const sd = cloneSide(baseline.side); sideEditor.onChange(sd, true); };
editor.onRef = (show) => {
  if (show && !ghostBuilt) { view.setGhost(buildReferenceGhost()); ghostBuilt = true; }
  if (view.ghostMesh) view.ghostMesh.visible = show;
  store.state.refGhost = show;
};
editor.onDrawn = (fit) => {
  if (!fit) { toast('Draw around the core', 'warn'); return; }
  store.state.outline = fit.outline; store.state.params.side = defaultSide(); // the old side profile was tailored to the previous shape
  editor.set(fit.outline, store.state.params.wall); modified(); commit();
  toast(`Outline generated · ${fit.points} points${fit.grew ? ' · grew to clear the core' : ''}`);
};
sideEditor.onChange = (side, final) => { store.state.params.side = side; modified(); if (final) commit(); };
panel.onParam = (id, value, final) => {
  (store.state.params as any)[id] = value;
  if (id === 'material' && !finishAllowed(String(value), store.state.look.finish)) {
    store.state.look = { ...store.state.look, finish: defaultFinishFor(String(value)) };
    panel.setLook(store.state.look); view.setLook(store.state.look); updateHash();
  }
  if (id === 'wall') editor.set(store.state.outline, store.state.params.wall);
  if (!final || id === 'eyeType' || id === 'nookPos' || id === 'material') outputs.setChecks(checks, true);
  if ((GLOBAL_PARAM_KEYS as readonly string[]).includes(id)) scheduleLibraryRefresh(); else markEdited();
  markDirty();
  if (final) commit();
};
panel.onCore = (k, v, final) => {
  setCore({ [k]: v }); panel.setCoreValues();
  if (k !== 'magnetGap') view.rebuildCore();
  editor.set(store.state.outline, store.state.params.wall);
  library.persist(coreSnapshot()); scheduleLibraryRefresh();
  outputs.setChecks(checks, true); markDirty(); void final;
};
panel.onLook = (look) => { store.state.look = look; view.setLook(look); markEdited(); updateHash(); commit(); };

// ---- wiring: stage ----
let viewRequest = 0;
toolbar.onView = async (v: ViewMode) => {
  const prev = store.state.view, mine = ++viewRequest;
  if (v === 'section' && prev !== 'section') { toolbar.setView(v); computeInner(); await prepareSection(); if (mine !== viewRequest) return; } // ready first, then switch
  store.state.view = v; view.setViewMode(v); toolbar.setView(v);
  if (v === 'ghost' || v === 'section') { if (computeInner() && v === 'section') { updateSection(); ensureSection(); } }
  if (v === 'section' && prev !== 'section') view.flyTo(new Vector3(185, 52, 44), new Vector3(0, height * 0.46, 0), 700);
  if (prev === 'section' && v !== 'section') view.flyTo(new Vector3(110, 62, 172), new Vector3(0, height * 0.46, 0), 700);
};
toolbar.onAnalysis = (a: Analysis) => { store.state.analysis = a; toolbar.setAnalysis(a); applyAnalysis(); };
toolbar.onSplit = () => { store.state.showSplit = !store.state.showSplit; toolbar.setSplit(store.state.showSplit); markDirty(); };
toolbar.onChip = (id) => loadIteration(id);

// ---- presets / library iterations with animation ----
const globalsNow = () => { const p = store.state.params; return { wall: p.wall, splitZ: p.splitZ }; };
const lookFor = (look: Look, material: string): Look => (finishAllowed(material, look.finish) ? { ...look } : { ...look, finish: defaultFinishFor(material) });

function animateTo(toOutline: Outline, toParams: Params, meta: { name: string; libraryId: string | null; look?: Look }) {
  const from = { o: cloneOutline(store.state.outline), p: snap().params };
  store.state.name = meta.name; nameField.value = meta.name; store.state.libraryId = meta.libraryId; libPanel.setCurrent(meta.libraryId);
  store.state.dirty = false; updateSaveUi(); renderChips();
  if (meta.look) { store.state.look = lookFor(meta.look, toParams.material); panel.setLook(store.state.look); view.setLook(store.state.look); }
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / 300), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    store.state.outline = blendOutlines(from.o, toOutline, e);
    const np: any = { ...toParams };
    for (const d of SCHEMA) if (d.kind === 'range') np[d.id] = (from.p as any)[d.id] + ((toParams as any)[d.id] - (from.p as any)[d.id]) * e;
    np.side = lerpSide(from.p.side, toParams.side, e);
    store.state.params = np as Params;
    panel.setParams(store.state.params); editor.set(store.state.outline, store.state.params.wall);
    markDirty();
    if (t < 1) requestAnimationFrame(step);
    else { store.state.outline = cloneOutline(toOutline); store.state.params = toParams; panel.setParams(toParams); editor.set(store.state.outline, toParams.wall); markDirty(); captureBaseline(); resetHistory(); }
  };
  requestAnimationFrame(step);
}

// ---- library: saved iterations, live-updated when the global params change ----
const library = new Library(() => { libPanel.render(library.items); toolbar.setLibraryCount(library.items.length); renderChips(); });
function renderChips() { toolbar.setChips(library.starred().map((i) => ({ id: i.id, name: i.name })), store.state.libraryId); }
let thumbs: ThumbRenderer | null = null;
let refreshToken = 0;
async function refreshLibrary(items: typeof library.items = library.items) {
  if (!items.length) return;
  const token = ++refreshToken; libPanel.setBusy(true);
  try {
    if (!thumbs) { const m = await import('./scene/thumbs'); thumbs = new m.ThumbRenderer(engine.smoothFaces(2)); }
    for (const it of items) {
      if (token !== refreshToken && items === library.items) return; // a newer refresh superseded this one
      const params = { ...it.params, ...globalsNow() } as Params;
      const ev = evaluateIteration(engine, it.outline, params);
      if (ev) { it.thumb = thumbs.render(ev.positions, lookFor(it.look, params.material), ev.puck, ev.eyes); it.weightG = ev.weightG; it.sizeMm = ev.sizeMm; it.material = params.material; it.failing = ev.failing; }
      libPanel.render(library.items);
      await new Promise((r) => setTimeout(r, 0));
    }
  } catch (e) { console.warn('library refresh failed', e); }
  library.persist(coreSnapshot()); libPanel.setBusy(false);
}
let libTimer: number | undefined;
const scheduleLibraryRefresh = () => { clearTimeout(libTimer); libTimer = window.setTimeout(() => refreshLibrary(), 700); };
const coreSnapshot = () => ({ puckDiameter: CORE.puckDiameter, puckDepth: CORE.puckDepth, domeHeight: CORE.domeHeight, edgeRadius: CORE.edgeRadius, magnetGap: CORE.magnet.gap });

/** the current iteration is "dirty" once edited; Save writes it to the library (update in place, or as a new item) */
function markEdited() { if (store.state.mode !== 'explore') return; store.state.dirty = true; updateSaveUi(); }
function updateSaveUi() {
  const s = store.state, unsaved = !s.libraryId, show = s.dirty || unsaved;
  saveBtn.classList.toggle('hidden', !show); saveNewBtn.classList.toggle('hidden', !(show && !unsaved));
  libPanel.setCanSave(s.dirty);
  saveBtn.title = unsaved ? 'Add this iteration to the library' : `Update “${s.name}” in the library`;
}
async function saveCurrent(opts: { asNew: boolean; name?: string; starred?: boolean }) {
  const s = store.state; let it;
  if (s.libraryId && !opts.asNew) it = library.update(s.libraryId, s.name, s.params, s.outline, s.look);
  else {
    it = library.add(opts.name ?? s.name, s.params, s.outline, s.look); s.name = it.name; nameField.value = it.name;
    if (opts.starred) library.toggleStar(it.id);
  }
  if (!it) return;
  captureBaseline(); s.libraryId = it.id; s.dirty = false; updateSaveUi(); renderChips(); libPanel.setCurrent(it.id); updateHash();
  await refreshLibrary([it]); toast(opts.asNew || !s.libraryId ? 'Saved as new' : 'Saved');
}
/** Save: a saved iteration asks replace-or-new; a new one asks for a name. */
async function askNewAndSave() {
  const s = store.state, r = await nameNew(s.libraryId ? `${s.name} copy` : s.name || 'Untitled');
  if (r) await saveCurrent({ asNew: true, name: r.name, starred: r.starred });
}
async function requestSave() {
  const s = store.state;
  if (!s.libraryId) { await askNewAndSave(); return; }
  const choice = await replaceOrNew(s.name);
  if (choice === 'replace') await saveCurrent({ asNew: false });
  else if (choice === 'new') await askNewAndSave();
}
saveBtn.addEventListener('click', () => requestSave()); saveNewBtn.addEventListener('click', () => askNewAndSave());
libPanel.onSave = () => { askNewAndSave(); };
function loadIteration(id: string) {
  const it = library.get(id); if (!it || store.state.mode !== 'explore') return;
  const toParams = { ...it.params, ...globalsNow() } as Params;
  animateTo(clampOutline(it.outline, toParams.wall), toParams, { name: it.name, libraryId: id, look: it.look });
}
libPanel.onLoad = (id) => loadIteration(id);
libPanel.onStar = (id) => { library.toggleStar(id); };
libPanel.onStarters = () => { library.addDefaults(); refreshLibrary(); };
libPanel.onDelete = (id) => { library.remove(id); if (store.state.libraryId === id) store.state.libraryId = null; libPanel.setCurrent(store.state.libraryId); };
toolbar.onLibrary = () => libPanel.toggle();
toolbar.onTurntable = (on) => view.setTurntable(on);
nameField.addEventListener('input', () => { store.state.name = nameField.value; if (store.state.libraryId) { library.rename(store.state.libraryId, nameField.value); } updateHash(); });

// ---- wiring: outputs ----
outputs.onShare = async () => {
  updateHash();
  try { await navigator.clipboard.writeText(location.href); toast('Link copied'); }
  catch { toast('Link is in the address bar'); }
};
outputs.onFocus = (c) => { if (c.at) view.focusAt(new Vector3(c.at.x, c.at.y, c.at.z)); };
outputs.onExport = (k) => {
  try {
    if (k === 'cage') { download('charmer-cage.obj', quadObj('charmer_cage', cage, engine.qs.faces, V, 'Clayground cage (quads). In Rhino: ToSubD on the cage object. Units mm.') + (place ? partsObj(V, store.state.params, place) : ''), 'text/plain'); toast('OBJ saved'); }
    else if (k === 'smooth') { download('charmer-smooth.obj', quadObj('charmer_smooth', buf3, engine.smoothFaces(3), engine.smoothVertCount(3), 'Clayground mesh, subdivision level 3. Units mm.') + (place ? partsObj(engine.smoothVertCount(3), store.state.params, place) : ''), 'text/plain'); toast('OBJ saved'); }
    else accept.export(k).catch((e) => { console.error(e); toast('Export failed', 'error'); });
  } catch (e) { console.error(e); toast('Export failed', 'error'); }
};

const accept = setupAccept({
  store, engine, view, toolbar, panel, outputs,
  getCage: () => cage, getInfo: () => info, getChecks: () => checks, getPlace: () => place, getHeight: () => height, getMinWall: () => minWall,
  settleNow: () => { clearTimeout(settleTimer); settle(); },
  resume: () => { dirty = true; clearTimeout(settleTimer); settle(); },
  openOutputs: () => { if (!panelVisible('outputs')) togglePanel('outputs'); },
});

// ---- boot ----
function boot() {
  const savedCore = library.savedCore(); if (savedCore) { setCore(savedCore); }
  const m = location.hash.match(/#p=([^&]+)/);
  let fromLink = false;
  if (m) {
    const d = decodeShare(m[1]);
    if (d) { store.state.params = d.params; store.state.outline = d.outline; store.state.look = d.look; if (d.name) store.state.name = d.name; fromLink = true; }
    else toast('Could not read that link. Loaded the default.', 'warn');
  }
  // the default shape is the library's Charmer; a shared link starts as an unsaved iteration
  if (!fromLink) store.state.libraryId = library.items.find((i) => i.name === 'Charmer')?.id ?? null;
  panel.setParams(store.state.params); panel.setLook(store.state.look); view.setLook(store.state.look); panel.setCoreValues(); view.rebuildCore();
  nameField.value = store.state.name; libPanel.render(library.items); toolbar.setLibraryCount(library.items.length); libPanel.setCurrent(store.state.libraryId);
  renderChips(); updateSaveUi(); captureBaseline(); resetHistory();
  if (library.items.some((i) => !i.thumb)) scheduleLibraryRefresh();
  editor.set(store.state.outline, store.state.params.wall);
  toolbar.setView(store.state.view); toolbar.setAnalysis(store.state.analysis); toolbar.setMode(false); toolbar.setSplit(store.state.showSplit);
  outputs.setChecks([], true); outputs.setCasing(null);
  view.setViewMode(store.state.view);
  autoFit(null); syncPanelButtons();
  live(); settle();
  (window as any).__charmer = { store, engine, view, settle, checks: () => checks, loadIteration, library, setSketch };
}
boot();
toolbar.setMode(false); requestAnimationFrame(() => { toolbar.layout(); document.fonts?.ready.then(() => toolbar.layout()); });
// warm up the solid-modelling engine while the page is idle, so the first Section or Preview is not slowed by loading it
((window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200)))(() => { import('./geometry/kernel').then((m) => m.getManifold()).catch(() => { /* optional */ }); });
