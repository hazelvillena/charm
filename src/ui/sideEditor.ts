import { svg, h } from './dom';
import { SIDE_MAX, SIDE_MIN, SIDE_MAX_POINTS, SIDE_MIN_POINTS, SIDE_MIN_T_GAP, SideProfile, SideWhich, addSidePoint, cloneSide, removeSidePoint, removeSidePointAuto, sideTs } from '../params/side';
import { SideCurve } from '../geometry/profile';
import { Pad } from './pad';

const VB_W = 76; // drawing units across: x = depth (front left, back right). The height follows the canvas, so a taller canvas spreads the profile out.

type Pick = { which: SideWhich; idx: number };

/**
 * Side-view editor, built on the shared Pad: drag points to shape how far the front and back extend at each height,
 * move them to any height, add one by clicking the curve, select one to delete it. The curve is always smooth.
 */
export class SideEditor {
  readonly el: HTMLElement;
  private pad: Pad; private s: SVGSVGElement;
  private fill: SVGPathElement; private puck: SVGRectElement; private result: SVGPathElement;
  private groups: Record<SideWhich, SVGGElement>;
  private side!: SideProfile;
  private zf = 17; private zb = 13; private H = 62; private cy = 25; private vbH = 76;
  private active: Pick | null = null; private selected: Pick | null = null;
  private steppers: Record<SideWhich, ReturnType<typeof Pad.stepper>>;
  private resultSegs: Float32Array | null = null;
  onChange: (s: SideProfile, final: boolean) => void = () => {};
  onReset: () => void = () => {};

  constructor() {
    this.pad = new Pad({ base: { cx: 0, cy: -4 + 76 / 2, w: VB_W, h: 76 }, label: 'Side profile. Drag points, click the curve to add one.', shape: 'tall' });
    this.s = this.pad.svg;
    this.s.append(svg('line', { x1: 0, y1: -4, x2: 0, y2: 2000, class: 'ui-pad-axis' }));
    this.fill = svg('path', { class: 'ui-pad-fill' }) as SVGPathElement;
    this.puck = svg('rect', { class: 'ui-pad-core', rx: 1.2 }) as SVGRectElement; this.puck.style.pointerEvents = 'none';
    this.result = svg('path', { class: 'ui-pad-result' }) as SVGPathElement;
    const front = svg('text', { x: -VB_W / 2 + 2, y: 2, class: 'ui-pad-note' }); front.textContent = 'front';
    const back = svg('text', { x: VB_W / 2 - 2, y: 2, class: 'ui-pad-note', 'text-anchor': 'end' }); back.textContent = 'back';
    this.groups = { back: svg('g') as SVGGElement, front: svg('g') as SVGGElement };
    this.s.append(this.fill, this.result, this.puck, front, back, this.groups.front, this.groups.back);
    this.pad.view.onChange = () => this.render();
    this.pad.onRevert = () => this.onReset();
    this.pad.onDelete = () => this.deleteSelected();
    this.steppers = { front: Pad.stepper('Front', (d) => this.step('front', d)), back: Pad.stepper('Back', (d) => this.step('back', d)) };
    this.pad.top.prepend(this.steppers.front.el, this.steppers.back.el);
    this.s.addEventListener('keydown', (e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelected(); } else if (e.key === 'Escape') { this.selected = null; this.render(); } });
    this.s.addEventListener('pointerdown', (e) => { this.s.focus({ preventScroll: true }); this.down(e); });
    this.s.addEventListener('pointermove', (e) => this.move(e));
    this.s.addEventListener('pointerup', (e) => this.up(e));
    this.s.addEventListener('pointercancel', (e) => this.up(e));
    this.el = h('div', { class: 'side-editor ui-pad-editor' }, h('div', { class: 'outline-stage' }, this.pad.el));
  }

  set(side: SideProfile, depthFront: number, depthBack: number, height: number, puckY: number) {
    this.side = side; this.zf = depthFront; this.zb = depthBack; this.H = height; this.cy = puckY; this.render();
  }

  /** the true side silhouette of the finished body (x = 0 section), so this pad follows the outline parametrically */
  setResult(segments: Float32Array) { this.resultSegs = segments; this.paintResult(); }
  private paintResult() {
    const a = this.resultSegs, on = !!a && a.length > 0; this.result.style.display = on ? '' : 'none'; this.fill.classList.toggle('guide', on);
    if (!on) return; const sc = this.scale(); let d = '';
    for (let i = 0; i < a!.length; i += 6) d += `M${(-a![i + 2] * sc).toFixed(2)} ${this.flipY(a![i + 1]).toFixed(2)}L${(-a![i + 5] * sc).toFixed(2)} ${this.flipY(a![i + 4]).toFixed(2)}`;
    this.result.setAttribute('d', d);
  }

  private flipY(y: number) { return this.vbH - 8 - (y / Math.max(30, this.H)) * (this.vbH - 12); }
  private tFromY(ySvg: number) { return Math.min(1, Math.max(0, (((this.vbH - 8 - ySvg) / (this.vbH - 12)) * Math.max(30, this.H)) / this.H)); }
  /** stylized roll-off toward the top and bottom so the drawing reads as a body (display only) */
  private roll(t: number) { return Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * Math.min(1, Math.max(0, t)))), 0.45); }
  private scale() { return Math.min(1, 34 / Math.max(this.zf * SIDE_MAX * 0.6, this.zb * SIDE_MAX * 0.6, 1)); }
  private depth(which: SideWhich) { return which === 'back' ? this.zb : this.zf; }
  private curve(which: SideWhich) { return new SideCurve(this.side[which], sideTs(this.side, which), this.side.smooth ?? 1); }
  /** x of a point on a side's curve (svg units; front is left, back is right) */
  private xOf(which: SideWhich, t: number, value: number) { return (which === 'back' ? 1 : -1) * this.depth(which) * this.scale() * this.roll(t) * value; }

  private pointer(e: PointerEvent): [number, number] {
    const m = this.s.getScreenCTM()!.inverse(); const pt = this.s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(m); return [p.x, p.y];
  }
  private capture(e: PointerEvent) { try { this.s.setPointerCapture(e.pointerId); } catch { /* optional */ } }
  private edit(next: SideProfile | null, final: boolean) { if (!next) return; this.side = next; this.render(); this.onChange(next, final); }

  private step(which: SideWhich, d: -1 | 1) {
    const next = d > 0 ? addSidePoint(this.side, which) : removeSidePointAuto(this.side, which);
    this.selected = null; this.edit(next, true);
  }
  private deleteSelected() {
    const sel = this.selected; if (!sel) return;
    const next = removeSidePoint(this.side, sel.which, sel.idx); if (!next) return;
    this.selected = null; this.edit(next, true);
  }

  private down(e: PointerEvent) {
    const target = e.target as SVGElement, g = target.closest('.ui-pad-pt') as SVGGElement | null;
    if (g) {
      const which = (g.dataset.w as SideWhich), idx = +g.dataset.i!;
      this.active = { which, idx }; this.selected = { which, idx }; this.render(); g.classList.add('drag'); this.capture(e); e.preventDefault(); return;
    }
    // click on the curve adds a point at that height and starts dragging it
    const [x, y] = this.pointer(e), t = this.tFromY(y), which: SideWhich = x >= 0 ? 'back' : 'front';
    const onCurve = Math.abs(Math.abs(x) - Math.abs(this.xOf(which, t, this.curve(which).eval(t)))) < 10 * this.pad.unit();
    if (onCurve && this.side[which].length < SIDE_MAX_POINTS) {
      const next = addSidePoint(this.side, which, t);
      if (next) {
        const idx = sideTs(next, which).findIndex((v) => Math.abs(v - t) < 1e-6);
        this.active = { which, idx }; this.selected = { which, idx }; this.capture(e); this.edit(next, false); return;
      }
    }
    if (this.selected) { this.selected = null; this.render(); }
    this.pad.view.startPan(e);
  }

  private move(e: PointerEvent) {
    const a = this.active; if (!a) return;
    const [x, ySvg] = this.pointer(e), side = cloneSide(this.side), v = side[a.which], ts = [...sideTs(side, a.which)];
    // height: free for interior points (kept in order), fixed at the bottom and top
    let t = ts[a.idx];
    if (a.idx > 0 && a.idx < v.length - 1) {
      t = Math.min(Math.max(this.tFromY(ySvg), ts[a.idx - 1] + SIDE_MIN_T_GAP), ts[a.idx + 1] - SIDE_MIN_T_GAP); ts[a.idx] = t;
      if (a.which === 'back') side.backT = ts; else side.frontT = ts;
    }
    const nominal = this.depth(a.which) * this.scale() * this.roll(t);
    v[a.idx] = Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.abs(x) / Math.max(1e-6, nominal)));
    this.edit(side, false);
  }

  private up(e: PointerEvent) {
    if (!this.active) return;
    this.s.querySelector('.ui-pad-pt.drag')?.classList.remove('drag'); this.active = null;
    try { this.s.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    this.onChange(this.side, true);
  }

  render() {
    if (!this.side) return;
    if (this.pad.fitAspect(-4)) this.vbH = this.pad.view.baseSize.h;
    const sc = this.scale(), fc = this.curve('front'), bc = this.curve('back');
    let d = '';
    const n = 48;
    for (let i = 0; i <= n; i++) { const t = i / n; d += `${i ? 'L' : 'M'}${(-this.zf * sc * fc.eval(t) * this.roll(t)).toFixed(2)} ${this.flipY(t * this.H).toFixed(2)}`; }
    for (let i = n; i >= 0; i--) { const t = i / n; d += `L${(this.zb * sc * bc.eval(t) * this.roll(t)).toFixed(2)} ${this.flipY(t * this.H).toFixed(2)}`; }
    this.fill.setAttribute('d', d + 'Z');
    const u = this.pad.unit();
    for (const which of ['back', 'front'] as SideWhich[]) {
      const v = this.side[which], ts = sideTs(this.side, which), grp = this.groups[which];
      if (grp.childElementCount !== v.length) {
        grp.replaceChildren();
        for (let i = 0; i < v.length; i++) {
          const g = Pad.point(i); g.dataset.w = which;
          g.addEventListener('dblclick', (ev) => { ev.stopPropagation(); const nx = removeSidePoint(this.side, which, i); if (nx) { this.selected = null; this.edit(nx, true); } });
          grp.append(g);
        }
      }
      v.forEach((val, i) => {
        const g = grp.children[i] as SVGGElement;
        Pad.placePoint(g, this.xOf(which, ts[i], val), this.flipY(ts[i] * this.H), u);
        g.classList.toggle('sel', !!this.selected && this.selected.which === which && this.selected.idx === i);
      });
      this.steppers[which].set(v.length, SIDE_MIN_POINTS, SIDE_MAX_POINTS);
    }
    if (this.selected && this.selected.idx >= this.side[this.selected.which].length) this.selected = null;
    const sel = this.selected;
    this.pad.setCanDelete(!!sel && sel.idx > 0 && sel.idx < this.side[sel.which].length - 1 && this.side[sel.which].length > SIDE_MIN_POINTS);
    // the Core's seat marker on the front side
    const py = this.flipY(this.cy), ph = (25.4 / Math.max(30, this.H)) * (this.vbH - 12), tc = Math.min(1, Math.max(0, this.cy / this.H));
    this.puck.setAttribute('x', (this.xOf('front', tc, fc.eval(tc)) - 1.2).toFixed(2));
    this.puck.setAttribute('y', (py - ph / 2).toFixed(2)); this.puck.setAttribute('width', '3.2'); this.puck.setAttribute('height', ph.toFixed(2));
    this.paintResult();
  }
}
