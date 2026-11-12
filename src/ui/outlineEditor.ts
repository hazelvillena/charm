import { svg, h } from './dom';
import { Outline, OUTLINE_MAX_POINTS, OUTLINE_MIN_POINTS, clampOutline, cloneOutline, ringOf, leftOf, unmirror, mirrorOf } from '../params/outline';
import { insertPoint, removePoint, addPointAuto, removePointAuto, recenterOutline, Side } from '../params/outlineEdit';
import { outlineFromPoints } from '../params/outlinePoints';
import { Pad } from './pad';
import { Profile } from '../geometry/profile';
import { CORE, OUTLINE_MIN_GAP_DEG, outlineMinRadius, seatRadius } from '../params/core';
import { GHOST_SILHOUETTE } from '../params/presets';
import { fitOutlineFromStroke, StrokeFit } from '../params/fitOutline';

const VB = 52; // viewBox half-size in mm
const DEG = Math.PI / 180;

function pathOf(o: Outline, n = 240): string {
  const prof = new Profile(o); let d = '';
  for (let i = 0; i <= n; i++) { const phi = -Math.PI / 2 + (i / n) * Math.PI * 2, r = prof.radius(phi); d += `${i ? 'L' : 'M'}${(r * Math.cos(phi)).toFixed(2)} ${(-r * Math.sin(phi)).toFixed(2)}`; }
  return d + 'Z';
}

/**
 * Front outline editor, built on the shared Pad. Edit: drag points, click a point to select it (then delete it),
 * click the curve to add one, drag the Core to move it, points and smoothness in the top row.
 * Draw: sketch freehand, review it against the fitted outline, trade fidelity for smoothing, then Generate.
 */
export class OutlineEditor {
  readonly el: HTMLElement;
  private pad: Pad; private s: SVGSVGElement;
  private result: SVGPathElement; private showResultOn = true;
  private path: SVGPathElement; private ref: SVGPathElement; private preview: SVGPathElement; private sketch: SVGPathElement;
  private keep: SVGCircleElement; private keepLabel: SVGTextElement; private puckC: SVGCircleElement;
  private eyesG: SVGGElement; private eyeDrag = -1; private addHint: SVGCircleElement;
  private handlesG: SVGGElement; private hand: SVGGElement; private issue: SVGCircleElement;
  private coreDrag: { y0: number; outline0: Outline; cx: number; cy: number } | null = null; private issueDeg: number | null = null;
  private outline!: Outline;
  private wall = 1.6;
  private showRef = false;
  private active = -1; private selected = -1; private activeSide: Side = 'R'; private selSide: Side = 'R';
  private mirror = true; private mirrorInput!: HTMLInputElement;
  private drawKind: 'points' | 'freehand' = 'points';
  private kindSeg!: HTMLElement; private kindBtns: HTMLButtonElement[] = [];
  private dpts: [number, number][] = []; private dptDrag = -1; private dptsG: SVGGElement; private ptsCtl!: HTMLElement; private ptsInfo = h('span', { class: 'ui-tag-note fit-info' }); private ptsGen!: HTMLButtonElement;
  private mode: 'edit' | 'draw' = 'edit';
  private drawing = false;
  private stroke: [number, number][] = [];
  private reviewing = false;
  private fidelity = 0.55;
  private fit: StrokeFit | null = null;
  private modeBtns: HTMLButtonElement[] = [];
  private busy: HTMLElement;
  private drawCtl: HTMLElement;
  private points: ReturnType<typeof Pad.stepper>;
  private smoothInput: HTMLInputElement; private smoothWrap: HTMLElement;
  private fidInput: HTMLInputElement; private fitInfo = h('span', { class: 'ui-tag-note fit-info' });
  private genBtn: HTMLButtonElement;
  onChange: (o: Outline, final: boolean) => void = () => {};
  onReset: () => void = () => {};
  /** dragging an eye marker: its index, and where it is now (mm, Core centre = origin, y up) */
  onEye: (idx: number, x: number, y: number, final: boolean) => void = () => {};
  onRef: ((show: boolean) => void) | null = null;
  /** called with the fitted outline after Generate (or null + reason if the stroke could not be used) */
  onDrawn: (fit: StrokeFit | null) => void = () => {};

  constructor() {
    this.pad = new Pad({ base: { cx: 0, cy: 0, w: VB * 2, h: VB * 2 }, label: 'Front outline. Drag points, click the curve to add, drag the core to move it.' });
    this.s = this.pad.svg;
    for (const r of [20, 40]) this.s.append(svg('circle', { cx: 0, cy: 0, r, class: 'ui-pad-ring' }));
    this.s.append(svg('line', { x1: -VB, y1: 0, x2: VB, y2: 0, class: 'ui-pad-axis' }), svg('line', { x1: 0, y1: -VB, x2: 0, y2: VB, class: 'ui-pad-axis' }));
    this.ref = svg('path', { class: 'ui-pad-ref' }) as SVGPathElement;
    this.path = svg('path', { class: 'ui-pad-fill' }) as SVGPathElement;
    this.result = svg('path', { class: 'ui-pad-result' }) as SVGPathElement;
    this.keep = svg('circle', { cx: 0, cy: 0, class: 'ui-pad-keep' }) as SVGCircleElement;
    this.puckC = svg('circle', { cx: 0, cy: 0, class: 'ui-pad-core' }) as SVGCircleElement;
    this.keepLabel = svg('text', { x: 0, y: 0, class: 'ui-pad-note', 'text-anchor': 'middle' }) as SVGTextElement;
    this.handlesG = svg('g') as SVGGElement;
    this.eyesG = svg('g', { class: 'ui-pad-eyes' }) as SVGGElement;
    this.dptsG = svg('g', { class: 'ui-pad-dpts' }) as SVGGElement;
    this.addHint = svg('circle', { class: 'ui-pad-addhint' }) as SVGCircleElement; this.addHint.style.display = 'none';
    this.preview = svg('path', { class: 'ui-pad-preview' }) as SVGPathElement;
    this.sketch = svg('path', { class: 'ui-pad-stroke' }) as SVGPathElement;
    this.hand = svg('g', { class: 'ui-pad-glyph' }) as SVGGElement;
    this.hand.append(svg('path', { d: 'M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15' }));
    this.issue = svg('circle', { class: 'ui-pad-issue' }) as SVGCircleElement; this.issue.style.display = 'none';
    this.s.append(this.ref, this.keep, this.path, this.result, this.puckC, this.hand, this.keepLabel, this.eyesG, this.handlesG, this.addHint, this.issue, this.preview, this.sketch, this.dptsG);
    this.pad.view.onChange = () => this.render();
    this.pad.onRevert = () => this.onReset();
    this.pad.onDelete = () => this.deleteSelected();
    this.s.addEventListener('keydown', (e) => {
      if (this.mode === 'draw' && this.drawKind === 'points') { if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); this.undoPoint(); } else if (e.key === 'Enter') { e.preventDefault(); this.generatePoints(); } else if (e.key === 'Escape') this.clearPoints(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelected(); } else if (e.key === 'Escape') { this.select(-1); } });
    this.s.addEventListener('pointerdown', (e) => { this.s.focus({ preventScroll: true }); this.onDown(e); });
    this.s.addEventListener('pointermove', (e) => this.onMove(e));
    this.s.addEventListener('pointerleave', () => { this.addHint.style.display = 'none'; });
    this.s.addEventListener('pointerup', (e) => this.onUp(e));
    this.s.addEventListener('pointercancel', (e) => this.onUp(e));

    const seg = h('div', { class: 'ui-seg ui-fit' });
    (['edit', 'draw'] as const).forEach((m) => { const b = h('button', { type: 'button', text: m === 'edit' ? 'Edit' : 'Draw', onClick: () => this.setMode(m) }) as HTMLButtonElement; this.modeBtns.push(b); seg.append(b); });
    this.kindSeg = h('div', { class: 'ui-seg ui-fit' });
    (['points', 'freehand'] as const).forEach((k) => { const b = h('button', { type: 'button', text: k === 'points' ? 'Points' : 'Freehand', onClick: () => this.setDrawKind(k) }) as HTMLButtonElement; this.kindBtns.push(b); this.kindSeg.append(b); });
    this.mirrorInput = h('input', { type: 'checkbox', onChange: () => this.setMirror(this.mirrorInput.checked) }) as HTMLInputElement; this.mirrorInput.checked = true;
    const mirrorToggle = h('label', { class: 'mini-toggle', title: 'Mirror the left side of the shape from the right. Off: draw each side on its own' }, this.mirrorInput, h('span', { text: 'Mirror' }));
    const refToggle = h('label', { class: 'mini-toggle' }, h('input', { type: 'checkbox', onChange: (e: Event) => { this.showRef = (e.target as HTMLInputElement).checked; this.render(); this.onRef?.(this.showRef); } }), h('span', { text: 'Original' }));
    this.busy = h('div', { class: 'ui-busy hidden' }, h('div', { class: 'ui-spinner' }), h('span', { text: 'Shaping…' }));

    // top row: how many points, and straight versus curved
    this.points = Pad.stepper('Points', (d) => this.stepPoints(d));
    this.smoothInput = h('input', { type: 'range', class: 'ui-range ui-pad-slider', min: 0, max: 1, step: 0.05, value: 1, title: 'Straight to curved', 'aria-label': 'Smoothness' }) as HTMLInputElement;
    this.smoothInput.addEventListener('input', () => { if (!this.outline) return; this.outline.smooth = +this.smoothInput.value; this.paintSmooth(); this.render(); this.onChange(this.outline, false); });
    this.smoothInput.addEventListener('change', () => { if (this.outline) this.onChange(this.outline, true); });
    this.smoothWrap = h('div', { class: 'ui-pad-stepper' }, this.smoothInput);
    this.pad.top.prepend(this.points.el, this.smoothWrap);

    // draw review: only while there is a sketch to review
    this.fidInput = h('input', { type: 'range', class: 'ui-range', min: 0, max: 1, step: 0.05, value: this.fidelity, 'aria-label': 'Fidelity versus smoothing', title: 'Smoother to more faithful' }) as HTMLInputElement;
    this.fidInput.addEventListener('input', () => { this.fidelity = +this.fidInput.value; this.refit(); });
    this.genBtn = h('button', { type: 'button', class: 'ui-btn primary', text: 'Generate', onClick: () => this.generate() }) as HTMLButtonElement;
    this.drawCtl = h('div', { class: 'ui-pad-row hidden' }, this.fidInput, this.fitInfo,
      h('button', { type: 'button', class: 'ui-pad-link', text: 'Redo', onClick: () => this.clearSketch() }), this.genBtn);
    this.ptsGen = h('button', { type: 'button', class: 'ui-btn primary', text: 'Generate', onClick: () => this.generatePoints() }) as HTMLButtonElement;
    this.ptsCtl = h('div', { class: 'ui-pad-row hidden' }, this.ptsInfo,
      h('button', { type: 'button', class: 'ui-pad-link', text: 'Undo point', onClick: () => this.undoPoint() }),
      h('button', { type: 'button', class: 'ui-pad-link', text: 'Clear', onClick: () => this.clearPoints() }), this.ptsGen);
    this.pad.hud.append(this.drawCtl, this.ptsCtl);
    this.pad.foot.prepend(refToggle); // Original sits quietly at the bottom of the canvas, beside Reset

    this.el = h('div', { class: 'outline-editor ui-pad-editor' }, h('div', { class: 'outline-tools' }, seg, this.kindSeg, mirrorToggle),
      h('div', { class: 'outline-stage' }, this.pad.el, this.busy));
    this.setDrawKind('points'); this.setMode('edit');
  }

  set(outline: Outline, wall: number) {
    this.outline = outline; this.wall = wall;
    if (this.mode === 'edit' && this.mirror !== !outline.left) { this.mirror = !outline.left; this.mirrorInput.checked = this.mirror; }
    this.render();
  }
  /** Mirror on/off. Editing: turns the current outline mirrored or independent (the left starts as a copy of the right). Drawing: how the new shape will be made. */
  private setMirror(on: boolean) {
    this.mirror = on;
    if (this.mode === 'edit' && this.outline) {
      this.outline = on ? mirrorOf(this.outline) : unmirror(this.outline); this.selected = -1; this.render(); this.onChange(this.outline, true);
    } else this.refreshPoints();
  }

  /** the real silhouette of the finished body (smooth, after subdivision), as segment endpoints in the body frame */
  private resultSegs: Float32Array | null = null; private resultShift = 0;
  setResult(segments: Float32Array, shiftY: number) { this.resultSegs = segments; this.resultShift = shiftY; this.paintResult(); }
  private paintResult() {
    const on = this.showResultOn && !!this.resultSegs && this.resultSegs.length > 0;
    this.result.style.display = on ? '' : 'none'; this.path.classList.toggle('guide', on);
    if (!on) return;
    const a = this.resultSegs!; let d = '';
    for (let i = 0; i < a.length; i += 6) d += `M${a[i].toFixed(2)} ${(-(a[i + 1] - this.resultShift)).toFixed(2)}L${a[i + 3].toFixed(2)} ${(-(a[i + 4] - this.resultShift)).toFixed(2)}`;
    this.result.setAttribute('d', d);
  }

  /** the eyes as draggable markers (mm, Core centre = origin, y up); an empty list hides them */
  setEyes(pts: { x: number; y: number }[]) {
    this.eyesPts = pts; this.paintEyes();
  }
  private eyesPts: { x: number; y: number }[] = [];
  private paintEyes() {
    const u = this.pad.unit(), n = this.eyesPts.length;
    if (this.eyesG.childElementCount !== n) {
      this.eyesG.replaceChildren();
      for (let i = 0; i < n; i++) { const c = svg('circle', { class: 'ui-pad-eye' }); (c as SVGElement).dataset.i = String(i); this.eyesG.append(c); }
    }
    this.eyesPts.forEach((p, i) => { const c = this.eyesG.children[i]; c.setAttribute('cx', p.x.toFixed(2)); c.setAttribute('cy', (-p.y).toFixed(2)); c.setAttribute('r', (5 * u).toFixed(3)); });
    this.eyesG.style.display = this.mode === 'edit' ? '' : 'none';
  }

  /** mark where a check needs attention (angle on the outline, degrees) or clear it */
  setIssue(deg: number | null) { this.issueDeg = deg; this.paintIssue(); }
  private paintIssue() {
    if (this.issueDeg === null || !this.outline) { this.issue.style.display = 'none'; return; }
    const phi = this.issueDeg * DEG, r = new Profile(this.outline).radius(phi), u = this.pad.unit();
    this.issue.setAttribute('cx', (r * Math.cos(phi)).toFixed(2)); this.issue.setAttribute('cy', (-r * Math.sin(phi)).toFixed(2)); this.issue.setAttribute('r', (7 * u).toFixed(3)); this.issue.style.display = '';
  }

  setMode(m: 'edit' | 'draw') {
    this.mode = m; this.clearSketch();
    this.modeBtns.forEach((b, i) => b.classList.toggle('on', (i === 0) === (m === 'edit')));
    this.handlesG.style.display = m === 'edit' ? '' : 'none';
    this.s.classList.toggle('drawing', m === 'draw');
    this.pad.top.classList.toggle('hidden', m !== 'edit');
    this.hand.style.display = m === 'edit' ? '' : 'none'; this.paintEyes();
    this.drawCtl.classList.add('hidden'); this.kindSeg.classList.toggle('hidden', m !== 'draw');
    if (m === 'edit' && this.outline) { this.mirror = !this.outline.left; this.mirrorInput.checked = this.mirror; }
    this.syncDrawUi();
  }

  // ---------- draw: point by point ----------
  private setDrawKind(k: 'points' | 'freehand') {
    this.drawKind = k; this.kindBtns.forEach((b, i) => b.classList.toggle('on', (i === 0) === (k === 'points')));
    this.clearSketch(); this.syncDrawUi();
  }
  private syncDrawUi() {
    const pts = this.mode === 'draw' && this.drawKind === 'points';
    this.ptsCtl.classList.toggle('hidden', !pts); this.dptsG.style.display = pts ? '' : 'none';
    this.s.classList.toggle('pointing', pts);
    this.refreshPoints();
  }
  /** dots for the placed points (and their mirror), and a live preview of the outline they make */
  private refreshPoints() {
    const on = this.mode === 'draw' && this.drawKind === 'points', u = this.pad.unit();
    const all: { x: number; y: number; own: number }[] = [];
    this.dpts.forEach(([x, y], i) => { all.push({ x, y, own: i }); if (this.mirror) all.push({ x: -x, y, own: -1 }); });
    if (this.dptsG.childElementCount !== all.length) {
      this.dptsG.replaceChildren();
      for (const a of all) { const c = svg('circle', { class: 'ui-pad-dp' + (a.own < 0 ? ' mir' : '') }); if (a.own >= 0) (c as SVGElement).dataset.i = String(a.own); this.dptsG.append(c); }
    }
    all.forEach((a, k) => { const c = this.dptsG.children[k]; c.setAttribute('cx', a.x.toFixed(2)); c.setAttribute('cy', (-a.y).toFixed(2)); c.setAttribute('r', ((a.own < 0 ? 2.2 : 3.4) * u * 1.6).toFixed(3)); });
    if (!on) { if (!this.reviewing) this.preview.setAttribute('d', ''); return; }
    const fit = this.dpts.length >= 3 ? outlineFromPoints(this.dpts, this.wall, this.mirror) : null;
    this.preview.setAttribute('d', fit ? pathOf(fit.outline) : '');
    this.ptsGen.disabled = !fit;
    this.ptsInfo.textContent = !this.dpts.length ? 'Click to add points' : fit ? `${this.dpts.length} points${fit.grew ? ' · grew' : ''}${fit.dropped ? ` · ${fit.dropped} skipped` : ''}` : this.dpts.length < 3 ? `${this.dpts.length} points` : 'Go around the core';
    this.ptsInfo.title = fit?.grew ? 'The outline grew to clear the core' : fit?.dropped ? 'Some points were too close to the next one and were skipped' : 'Place points around the core, then Generate. Drag a point to move it, Backspace removes the last';
  }
  private undoPoint() { this.dpts.pop(); this.refreshPoints(); }
  private clearPoints() { this.dpts = []; this.refreshPoints(); }
  private generatePoints() {
    const fit = outlineFromPoints(this.dpts, this.wall, this.mirror); if (!fit) return;
    this.busy.classList.remove('hidden'); const t0 = performance.now();
    setTimeout(() => {
      this.busy.classList.add('hidden'); this.dpts = []; this.preview.setAttribute('d', '');
      this.setMode('edit');
      this.onDrawn({ outline: fit.outline, maxErrorMm: 0, coverage: 1, grew: fit.grew, points: fit.points });
    }, Math.max(0, 500 - (performance.now() - t0)));
  }
  private pointsDown(e: PointerEvent) {
    const [x, y] = this.toSvg(e), u = this.pad.unit();
    let hit = -1, best = 9 * u; this.dpts.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < best) { best = d; hit = i; } });
    if (hit < 0) { this.dpts.push([x, y]); hit = this.dpts.length - 1; }
    this.dptDrag = hit; this.capture(e); this.refreshPoints();
  }

  private paintSmooth() { this.smoothInput.style.setProperty('--p', `${this.outline.smooth * 100}%`); }
  private select(i: number) { this.selected = i; this.render(); }
  private deleteSelected() {
    if (this.selected < 0 || !this.outline) return;
    const o = removePoint(this.outline, this.selected, this.wall, this.selSide);
    if (!o) return; this.selected = -1; this.outline = o; this.render(); this.onChange(o, true);
  }
  private stepPoints(d: number) {
    const o = d > 0 ? addPointAuto(this.outline, this.wall) : removePointAuto(this.outline, this.wall);
    if (!o) return; this.selected = -1; this.outline = o; this.render(); this.onChange(o, true);
  }

  // ---------- pointer handling ----------
  private toSvg(e: PointerEvent): [number, number] {
    const m = this.s.getScreenCTM()!.inverse(); const pt = this.s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(m); return [p.x, -p.y]; // y up
  }
  private capture(e: PointerEvent) { try { this.s.setPointerCapture(e.pointerId); } catch { /* optional */ } }

  private onDown(e: PointerEvent) {
    if (this.busy && !this.busy.classList.contains('hidden')) return;
    if (this.mode === 'draw' && this.drawKind === 'points') { this.pointsDown(e); return; }
    if (this.mode === 'draw') {
      this.stroke = []; this.drawing = true; this.reviewing = false; this.drawCtl.classList.add('hidden'); this.preview.setAttribute('d', '');
      this.capture(e); this.addStrokePoint(e); return;
    }
    const target = e.target as SVGElement;
    const eye = target.closest('.ui-pad-eye') as SVGElement | null;
    if (eye) { this.eyeDrag = +eye.dataset.i!; eye.classList.add('drag'); this.capture(e); e.preventDefault(); return; }
    const pt = target.closest('.ui-pad-pt:not(.mirror)') as SVGGElement | null;
    if (pt) { this.active = +pt.dataset.i!; this.activeSide = (pt.dataset.side as Side) ?? 'R'; this.selected = this.active; this.selSide = this.activeSide; this.render(); pt.classList.add('drag'); this.capture(e); e.preventDefault(); return; }
    if (target.classList.contains('ui-pad-core') || target.closest('.ui-pad-glyph')) { // the Core: drag it up or down inside the body
      this.coreDrag = { y0: e.clientY, outline0: cloneOutline(this.outline), cx: this.pad.view.center[0], cy: this.pad.view.center[1] };
      this.s.classList.add('moving-core'); this.capture(e); e.preventDefault(); return;
    }
    // click on the curve adds a point and starts dragging it
    const hit = this.curveHit(e);
    if (!hit) { if (this.selected >= 0) this.select(-1); this.pad.view.startPan(e); return; }
    const phi = hit.phi;
    const ins = insertPoint(this.outline, phi, this.wall, hit.side);
    if (!ins) return;
    this.outline = ins.outline; this.active = ins.index; this.activeSide = hit.side; this.selected = ins.index; this.selSide = hit.side; this.capture(e); this.render(); this.onChange(this.outline, false);
  }

  /** where the pointer is close enough to the outline to add a point there (angle on the right half), or null */
  private curveHit(e: PointerEvent): { phi: number; x: number; y: number; side: Side } | null {
    const [x, y] = this.toSvg(e), mx = Math.abs(x), phi = Math.atan2(y, mx), r = Math.hypot(x, y);
    const side: Side = this.outline.left && x < 0 ? 'L' : 'R', R = new Profile(this.outline).radius(side === 'L' ? Math.PI - phi : phi);
    const near = Math.abs(r - R) < 3.4 * this.pad.unit() / 0.4 * 0.4 + 2.2 && Math.abs(phi) < Math.PI / 2 - OUTLINE_MIN_GAP_DEG * DEG * 0.9;
    return near ? { phi, x: Math.sign(x || 1) * R * Math.cos(phi), y: R * Math.sin(phi), side } : null;
  }
  private showAddHint(e: PointerEvent) {
    const hit = this.mode === 'edit' && this.active < 0 && !this.coreDrag && this.eyeDrag < 0 && !(e.target as Element).closest?.('.ui-pad-pt, .ui-pad-eye, .ui-pad-core') && this.outline.phi.length < OUTLINE_MAX_POINTS ? this.curveHit(e) : null;
    if (!hit) { this.addHint.style.display = 'none'; return; }
    this.addHint.setAttribute('cx', hit.x.toFixed(2)); this.addHint.setAttribute('cy', (-hit.y).toFixed(2)); this.addHint.setAttribute('r', (4 * this.pad.unit()).toFixed(3)); this.addHint.style.display = '';
  }

  private onMove(e: PointerEvent) {
    this.showAddHint(e);
    if (this.mode === 'draw' && this.drawKind === 'points') { if (this.dptDrag >= 0) { const [x, y] = this.toSvg(e); this.dpts[this.dptDrag] = [x, y]; this.refreshPoints(); } return; }
    if (this.mode === 'draw') { if (this.drawing) this.addStrokePoint(e); return; }
    if (this.eyeDrag >= 0) { const [x, y] = this.toSvg(e); this.onEye(this.eyeDrag, x, y, false); return; }
    if (this.coreDrag) {
      const u = this.pad.unit(), dy = (this.coreDrag.y0 - e.clientY) * u; // mm the Core has moved up
      const o = recenterOutline(this.coreDrag.outline0, dy, this.wall);
      if (o) { this.outline = o; this.pad.view.setCenter(this.coreDrag.cx, this.coreDrag.cy + dy); this.onChange(o, false); }
      return;
    }
    if (this.active < 0) return;
    const [x, y0] = this.toSvg(e); const xr = Math.abs(x);
    const o = cloneOutline(this.outline), gap = OUTLINE_MIN_GAP_DEG * DEG;
    const h = this.activeSide === 'L' && o.left ? o.left : o, n = h.phi.length, i = this.active;
    let phi = Math.atan2(y0, xr); const r = Math.hypot(xr, y0);
    if (i === 0 || i === n - 1) phi = h.phi[i];
    else phi = Math.min(Math.max(phi, h.phi[i - 1] + gap), h.phi[i + 1] - gap);
    h.phi[i] = phi; h.r[i] = r;
    if (o.left && (i === 0 || i === n - 1)) { const other = h === o ? o.left : o; other.r[i === 0 ? 0 : other.r.length - 1] = r; } // the axis points are shared by both sides
    this.outline = clampOutline(o, this.wall); this.render(); this.onChange(this.outline, false);
  }

  private onUp(e: PointerEvent) {
    try { this.s.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (this.mode === 'draw' && this.drawKind === 'points') { this.dptDrag = -1; this.refreshPoints(); return; }
    if (this.mode === 'draw') { this.finishStroke(); return; }
    if (this.eyeDrag >= 0) { const [x, y] = this.toSvg(e); this.eyesG.querySelector('.drag')?.classList.remove('drag'); const i = this.eyeDrag; this.eyeDrag = -1; this.onEye(i, x, y, true); return; }
    if (this.coreDrag) { this.coreDrag = null; this.s.classList.remove('moving-core'); this.onChange(this.outline, true); return; }
    if (this.active < 0) return;
    this.handlesG.querySelector('.drag')?.classList.remove('drag');
    this.active = -1; this.onChange(this.outline, true);
  }

  // ---------- draw: sketch -> review -> generate ----------
  private addStrokePoint(e: PointerEvent) {
    const [x, y] = this.toSvg(e); const last = this.stroke[this.stroke.length - 1];
    if (last && Math.hypot(x - last[0], y - last[1]) < 0.35) return;
    this.stroke.push([x, y]);
    this.sketch.setAttribute('d', this.stroke.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${(-p[1]).toFixed(2)}`).join(''));
  }
  private finishStroke() {
    if (!this.drawing) return; this.drawing = false;
    if (this.stroke.length < 8) { this.clearSketch(); return; }
    this.reviewing = true; this.drawCtl.classList.remove('hidden'); this.refit();
  }
  private refit() {
    if (!this.reviewing) return;
    let fit: StrokeFit | null = null;
    try { fit = fitOutlineFromStroke(this.stroke, this.wall, { fidelity: this.fidelity, mirror: this.mirror }); } catch { fit = null; }
    this.fit = fit;
    this.preview.setAttribute('d', fit ? pathOf(fit.outline) : '');
    this.genBtn.disabled = !fit;
    this.fitInfo.textContent = fit ? `${fit.points} points · ±${fit.maxErrorMm.toFixed(1)} mm${fit.grew ? ' · grew to clear the core' : ''}` : 'Close the shape around the core';
  }
  clearSketch() {
    this.drawing = false; this.reviewing = false; this.stroke = []; this.fit = null;
    this.sketch.setAttribute('d', ''); this.preview.setAttribute('d', ''); this.drawCtl.classList.add('hidden');
  }
  private generate() {
    if (!this.reviewing) return;
    const fit = this.fit; this.busy.classList.remove('hidden'); const t0 = performance.now();
    // the fit itself is instant; hold the loading state briefly so the hand-off reads as a deliberate step
    setTimeout(() => {
      this.busy.classList.add('hidden'); this.clearSketch();
      if (fit) this.setMode('edit');
      this.onDrawn(fit);
    }, Math.max(0, 850 - (performance.now() - t0)));
  }

  // ---------- render ----------
  render() {
    if (!this.outline) return;
    this.pad.fitAspect();
    this.path.setAttribute('d', pathOf(this.outline));
    this.paintResult();
    this.keep.setAttribute('r', String(outlineMinRadius(this.wall)));
    this.puckC.setAttribute('r', String(CORE.puckDiameter / 2));
    const prof = new Profile(this.outline);
    const bad = prof.minRadius().r < seatRadius() + this.wall - 1e-6;
    this.keep.classList.toggle('bad', bad);
    this.keepLabel.setAttribute('y', String(-(CORE.puckDiameter / 2) - 1.2));
    this.keepLabel.textContent = bad ? 'core does not fit' : 'core';
    this.keepLabel.classList.toggle('bad', bad);
    // points: the right half is editable; the left too when the outline has its own left, otherwise it shows small dots
    const ring = ringOf(this.outline), n = this.outline.phi.length, L = leftOf(this.outline), m = L.phi.length, own = !!this.outline.left;
    if (this.handlesG.childElementCount !== ring.a.length || (this.handlesG as unknown as { _own?: boolean })._own !== own) {
      this.handlesG.replaceChildren(); (this.handlesG as unknown as { _own?: boolean })._own = own;
      for (let k = 0; k < ring.a.length; k++) {
        const right = k < n, li = m - 2 - (k - n); // index in the left half
        const g = right ? Pad.point(k, false) : own ? Pad.point(li, false) : Pad.point(2 * (n - 1) - k, true);
        g.dataset.side = right ? 'R' : 'L';
        const side: Side = right ? 'R' : 'L', idx = right ? k : li;
        if (right || own) g.addEventListener('dblclick', (ev) => { ev.stopPropagation(); const o = removePoint(this.outline, idx, this.wall, side); if (o) { this.selected = -1; this.outline = o; this.render(); this.onChange(o, true); } });
        this.handlesG.append(g);
      }
    }
    const u = this.pad.unit();
    ring.a.forEach((a, k) => Pad.placePoint(this.handlesG.children[k] as SVGGElement, ring.r[k] * Math.cos(a), -ring.r[k] * Math.sin(a), u, k >= n && !own));
        this.hand.setAttribute('transform', `scale(${(14 / 24 * u).toFixed(4)}) translate(-12 -12)`);
    const selN = this.selSide === 'L' && own ? m : n;
    if (this.selected >= selN) this.selected = -1;
    Array.from(this.handlesG.children).forEach((el) => { const g = el as SVGGElement; g.classList.toggle('sel', !g.classList.contains('mirror') && +g.dataset.i! === this.selected && (g.dataset.side ?? 'R') === this.selSide); });
    this.pad.setCanDelete(this.selected > 0 && this.selected < selN - 1 && selN > OUTLINE_MIN_POINTS);
    this.paintIssue(); this.paintEyes();
    this.points.set(n, OUTLINE_MIN_POINTS, OUTLINE_MAX_POINTS);
    this.smoothInput.value = String(this.outline.smooth); this.paintSmooth();
    if (this.showRef) {
      const pts: [number, number][] = [];
      GHOST_SILHOUETTE.forEach((r, i) => { const a = (-90 + i * 2.5) * DEG; pts.push([r * Math.cos(a), -r * Math.sin(a)]); });
      for (let i = GHOST_SILHOUETTE.length - 2; i >= 1; i--) { const r = GHOST_SILHOUETTE[i]; const a = (-90 + i * 2.5) * DEG; pts.push([-r * Math.cos(a), -r * Math.sin(a)]); }
      this.ref.setAttribute('d', pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('') + 'Z'); this.ref.style.display = '';
    } else this.ref.style.display = 'none';
  }
}
