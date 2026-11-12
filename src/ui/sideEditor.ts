import { svg, h } from './dom';
import { SIDE_MAX, SIDE_MIN, SIDE_MAX_POINTS, SIDE_MIN_POINTS, SIDE_MIN_T_GAP, SideProfile, SideWhich, addSidePoint, cloneSide, removeSidePoint, removeSidePointAuto, sideTs } from '../params/side';
import { SideCurve } from '../geometry/profile';
import type { SideProfileCurve } from '../geometry/section';
import { CORE } from '../params/core';
import { Pad } from './pad';

type Pick = { which: SideWhich; idx: number };

/**
 * Side-view editor, built on the shared Pad and drawn in TRUE millimetres: the outline is the real silhouette of the 3D body
 * seen from the side, and the points sit on it. Drag a point to push the body in or out at that height, move it to any
 * height, click the outline to add one, select one to delete it. Front is on the left, back on the right.
 */
export class SideEditor {
  readonly el: HTMLElement;
  private pad: Pad; private s: SVGSVGElement;
  private fill: SVGPathElement; private ink!: SVGPathElement; private puck: SVGRectElement; private axis: SVGLineElement; private frontNote: SVGTextElement; private backNote: SVGTextElement;
  private groups: Record<SideWhich, SVGGElement>;
  private side!: SideProfile;
  private zf = 17; private zb = 13; private H = 62; private cy = 25;
  private profile: SideProfileCurve | null = null;
  private ref!: SVGPathElement; private refProfile: SideProfileCurve | null = null; // another iteration's silhouette, faint behind this one
  private active: Pick | null = null; private selected: Pick | null = null;
  private steppers: Record<SideWhich, ReturnType<typeof Pad.stepper>>;
  onChange: (s: SideProfile, final: boolean) => void = () => {};
  onReset: () => void = () => {};

  constructor() {
    this.pad = new Pad({ base: { cx: 0, cy: -31, w: 90, h: 90 }, label: 'Side profile, true to the 3D body. Drag points, click the outline to add one.', shape: 'tall' });
    this.s = this.pad.svg;
    this.axis = svg('line', { x1: 0, y1: 0, x2: 0, y2: -80, class: 'ui-pad-axis' }) as SVGLineElement;
    this.ref = svg('path', { class: 'ui-pad-ref' }) as SVGPathElement; this.ref.style.display = 'none'; // the reference silhouette (faint, dashed)
    this.fill = svg('path', { class: 'ui-pad-fill quiet' }) as SVGPathElement;
    this.ink = svg('path', { class: 'ui-pad-result' }) as SVGPathElement; // the same black outline as the front canvas
    this.puck = svg('rect', { class: 'ui-pad-core', rx: 0.8 }) as SVGRectElement; this.puck.style.pointerEvents = 'none';
    this.frontNote = svg('text', { class: 'ui-pad-note' }) as SVGTextElement; this.frontNote.textContent = 'front';
    this.backNote = svg('text', { class: 'ui-pad-note', 'text-anchor': 'end' }) as SVGTextElement; this.backNote.textContent = 'back';
    this.groups = { back: svg('g') as SVGGElement, front: svg('g') as SVGGElement };
    this.s.append(this.ref, this.axis, this.fill, this.ink, this.puck, this.frontNote, this.backNote, this.groups.front, this.groups.back);
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

  /** the true side silhouette of the finished body (mm), measured from the 3D mesh */
  setProfile(p: SideProfileCurve) { this.profile = p; this.render(); }
  /** another iteration's side silhouette (true mm, same frame), drawn faintly behind this one; null clears it */
  setReference(p: SideProfileCurve | null) { this.refProfile = p && p.ys.length > 1 ? p : null; this.paintRef(); }
  private paintRef() {
    const p = this.refProfile; if (!p) { this.ref.style.display = 'none'; return; }
    let d = ''; p.ys.forEach((y, i) => { d += `${i ? 'L' : 'M'}${(-p.front[i]).toFixed(2)} ${(-y).toFixed(2)}`; });
    for (let i = p.ys.length - 1; i >= 0; i--) d += `L${(-p.back[i]).toFixed(2)} ${(-p.ys[i]).toFixed(2)}`;
    this.ref.setAttribute('d', d + 'Z'); this.ref.style.display = '';
  }

  private curve(which: SideWhich) { return new SideCurve(this.side[which], sideTs(this.side, which), this.side.smooth ?? 1); }
  private depth(which: SideWhich) { return which === 'back' ? this.zb : this.zf; }
  /** how far the body reaches toward `which` at height y (mm): measured when the mesh is known, estimated before */
  private extent(which: SideWhich, y: number): number {
    const p = this.profile;
    if (p && p.ys.length > 1) {
      const arr = which === 'back' ? p.back : p.front, step = p.ys[1] - p.ys[0], f = Math.min(arr.length - 1, Math.max(0, y / step)), i = Math.min(arr.length - 2, Math.floor(f)), u = f - i;
      return Math.abs(which === 'back' ? -(arr[i] + (arr[i + 1] - arr[i]) * u) : arr[i] + (arr[i + 1] - arr[i]) * u);
    }
    return this.depth(which) * this.curve(which).eval(Math.min(1, Math.max(0, y / Math.max(1, this.H)))) * 0.8;
  }
  /** svg x (front is left, back is right) and y (up is negative) of a point of the outline */
  private xAt(which: SideWhich, y: number) { return (which === 'back' ? 1 : -1) * this.extent(which, y); }
  private tFromY(ySvg: number) { return Math.min(1, Math.max(0, -ySvg / Math.max(1, this.H))); }

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
    // click on the outline adds a point at that height and starts dragging it
    const [x, y] = this.pointer(e), t = this.tFromY(y), which: SideWhich = x >= 0 ? 'back' : 'front';
    const onOutline = Math.abs(Math.abs(x) - this.extent(which, -y)) < 10 * this.pad.unit();
    if (onOutline && this.side[which].length < SIDE_MAX_POINTS) {
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
    // depth: the body's reach at a height scales with the point, so aim the reach at the pointer
    const now = this.extent(a.which, t * this.H), kNow = new SideCurve(this.side[a.which], sideTs(this.side, a.which), 1).eval(t);
    const k = now > 0.5 ? (kNow * Math.abs(x)) / now : Math.abs(x) / Math.max(1, this.depth(a.which) * 0.5);
    v[a.idx] = Math.min(SIDE_MAX, Math.max(SIDE_MIN, k));
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
    // true scale: millimetres in both directions; the canvas shows the whole body as large as the canvas allows
    const r = this.s.getBoundingClientRect();
    if (r.width > 20 && r.height > 20) {
      const asp = r.height / r.width, need = 2 * Math.max(this.zf, this.zb) * 1.15 + 14, w = Math.max(need, (this.H + 14) / asp), hh = w * asp, base = this.pad.view.baseSize;
      if (Math.abs(w - base.w) > 0.5 || Math.abs(hh - base.h) > 0.5) this.pad.view.setBase({ cx: 0, cy: -this.H / 2, w, h: hh });
    }
    const b = this.pad.view.baseSize;
    this.axis.setAttribute('y1', '0'); this.axis.setAttribute('y2', String(-this.H));
    this.frontNote.setAttribute('x', String(b.cx - b.w / 2 + 2)); this.frontNote.setAttribute('y', String(b.cy - b.h / 2 + 5));
    this.backNote.setAttribute('x', String(b.cx + b.w / 2 - 2)); this.backNote.setAttribute('y', String(b.cy - b.h / 2 + 5));
    // the outline is the body's own silhouette
    const p = this.profile;
    if (p && p.ys.length > 1) {
      let d = ''; p.ys.forEach((y, i) => { d += `${i ? 'L' : 'M'}${(-p.front[i]).toFixed(2)} ${(-y).toFixed(2)}`; });
      for (let i = p.ys.length - 1; i >= 0; i--) d += `L${(-p.back[i]).toFixed(2)} ${(-p.ys[i]).toFixed(2)}`;
      this.fill.setAttribute('d', d + 'Z'); this.ink.setAttribute('d', d + 'Z');
    }
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
      v.forEach((_, i) => {
        const g = grp.children[i] as SVGGElement, y = ts[i] * this.H;
        Pad.placePoint(g, this.xAt(which, y), -y, u);
        g.classList.toggle('sel', !!this.selected && this.selected.which === which && this.selected.idx === i);
      });
      this.steppers[which].set(v.length, SIDE_MIN_POINTS, SIDE_MAX_POINTS);
    }
    if (this.selected && this.selected.idx >= this.side[this.selected.which].length) this.selected = null;
    const sel = this.selected;
    this.pad.setCanDelete(!!sel && sel.idx > 0 && sel.idx < this.side[sel.which].length - 1 && this.side[sel.which].length > SIDE_MIN_POINTS);
    // the Core's seat on the front, at its true size
    const d = CORE.puckDiameter;
    this.puck.setAttribute('x', (this.xAt('front', this.cy) - 0.8).toFixed(2)); this.puck.setAttribute('y', (-(this.cy + d / 2)).toFixed(2));
    this.puck.setAttribute('width', '1.6'); this.puck.setAttribute('height', d.toFixed(2));
  }
}
