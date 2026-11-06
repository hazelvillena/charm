import { svg, h } from './dom';
import { Outline, OUTLINE_POINTS, clampOutline, cloneOutline, ringOf } from '../params/outline';
import { Profile } from '../geometry/profile';
import { CORE, OUTLINE_MIN_GAP_DEG, outlineMinRadius, seatRadius } from '../params/core';
import { GHOST_SILHOUETTE } from '../params/presets';

const VB = 52; // viewBox half-size in mm
const DEG = Math.PI / 180;

/** SVG outline editor: drag mirrored points around the puck keep-out circle. */
export class OutlineEditor {
  readonly el: HTMLElement;
  private s: SVGSVGElement;
  private path: SVGPathElement;
  private ref: SVGPathElement;
  private keep: SVGCircleElement;
  private keepLabel: SVGTextElement;
  private handlesG: SVGGElement;
  private handles: SVGCircleElement[] = [];
  private outline!: Outline;
  private wall = 1.6;
  private showRef = false;
  private active = -1;
  onChange: (o: Outline, final: boolean) => void = () => {};
  onReset: () => void = () => {};

  constructor() {
    this.s = svg('svg', { viewBox: `${-VB} ${-VB} ${VB * 2} ${VB * 2}`, class: 'outline-svg' }) as SVGSVGElement;
    for (const r of [20, 40, 60]) this.s.append(svg('circle', { cx: 0, cy: 0, r, class: 'grid-ring' }));
    this.s.append(svg('line', { x1: -VB, y1: 0, x2: VB, y2: 0, class: 'grid-axis' }), svg('line', { x1: 0, y1: -VB, x2: 0, y2: VB, class: 'grid-axis' }));
    this.ref = svg('path', { class: 'ref-path' }) as SVGPathElement;
    this.path = svg('path', { class: 'outline-path' }) as SVGPathElement;
    this.keep = svg('circle', { cx: 0, cy: 0, class: 'keepout' }) as SVGCircleElement;
    const puck = svg('circle', { cx: 0, cy: 0, r: CORE.puckDiameter / 2, class: 'puck-circle' });
    this.keepLabel = svg('text', { x: 0, y: 0, class: 'keep-label', 'text-anchor': 'middle' }) as SVGTextElement;
    this.keepLabel.textContent = 'puck';
    this.handlesG = svg('g') as SVGGElement;
    this.s.append(this.ref, this.keep, this.path, puck, this.keepLabel, this.handlesG);
    for (let i = 0; i < 12; i++) {
      const c = svg('circle', { r: 2.5, class: i < OUTLINE_POINTS ? 'handle' : 'handle mirror', 'data-i': i }) as SVGCircleElement;
      c.addEventListener('pointerdown', (e) => this.down(e, i));
      this.handles.push(c); this.handlesG.append(c);
    }
    this.s.addEventListener('pointermove', (e) => this.move(e));
    this.s.addEventListener('pointerup', (e) => this.up(e));
    this.s.addEventListener('pointercancel', (e) => this.up(e));
    this.s.addEventListener('dblclick', () => this.onReset());
    const refToggle = h('label', { class: 'mini-toggle' }, h('input', { type: 'checkbox', onChange: (e: Event) => { this.showRef = (e.target as HTMLInputElement).checked; this.render(); this.onRef?.(this.showRef); } }), h('span', { text: 'Show original Charmer' }));
    this.el = h('div', { class: 'outline-editor' }, this.s, h('div', { class: 'outline-foot' }, h('span', { class: 'hint', text: 'Drag points. Double-click to reset to preset.' }), refToggle));
  }
  onRef: ((show: boolean) => void) | null = null;

  set(outline: Outline, wall: number) { this.outline = outline; this.wall = wall; this.render(); }

  private toSvg(e: PointerEvent): [number, number] {
    const m = this.s.getScreenCTM()!.inverse();
    const pt = this.s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(m);
    return [p.x, -p.y]; // y up
  }
  private down(e: PointerEvent, i: number) {
    this.active = i; e.preventDefault(); this.handles[i].classList.add('drag');
    try { this.s.setPointerCapture(e.pointerId); } catch { /* capture is a nicety; dragging still works via the svg's own move events */ }
  }
  private move(e: PointerEvent) {
    if (this.active < 0) return;
    let [x, y] = this.toSvg(e);
    let i = this.active;
    if (i >= OUTLINE_POINTS) { i = 2 * (OUTLINE_POINTS - 1) - i; x = -x; } // mirrored handle -> right-half index
    const o = cloneOutline(this.outline);
    const gap = OUTLINE_MIN_GAP_DEG * DEG;
    let phi = Math.atan2(y, x), r = Math.hypot(x, y);
    if (i === 0 || i === OUTLINE_POINTS - 1) phi = o.phi[i];
    else {
      phi = Math.min(Math.max(phi, o.phi[i - 1] + gap), o.phi[i + 1] - gap);
    }
    o.phi[i] = phi; o.r[i] = r;
    this.outline = clampOutline(o, this.wall);
    this.render();
    this.onChange(this.outline, false);
  }
  private up(e: PointerEvent) {
    if (this.active < 0) return;
    this.handles[this.active].classList.remove('drag');
    this.active = -1;
    try { this.s.releasePointerCapture(e.pointerId); } catch {}
    this.onChange(this.outline, true);
  }

  render() {
    if (!this.outline) return;
    const prof = new Profile(this.outline);
    let d = '';
    const n = 240;
    for (let i = 0; i <= n; i++) {
      const phi = -Math.PI / 2 + (i / n) * Math.PI * 2, r = prof.radius(phi);
      d += `${i ? 'L' : 'M'}${(r * Math.cos(phi)).toFixed(2)} ${(-r * Math.sin(phi)).toFixed(2)}`;
    }
    this.path.setAttribute('d', d + 'Z');
    const need = outlineMinRadius(this.wall);
    this.keep.setAttribute('r', String(need));
    const bad = prof.minRadius().r < seatRadius() + this.wall - 1e-6;
    this.keep.classList.toggle('bad', bad);
    this.keepLabel.setAttribute('y', String(-(CORE.puckDiameter / 2) - 1.2));
    this.keepLabel.textContent = bad ? 'puck does not fit' : 'puck';
    this.keepLabel.classList.toggle('bad', bad);
    // handles
    const ring = ringOf(this.outline);
    ring.a.forEach((a, k) => {
      const c = this.handles[k < OUTLINE_POINTS ? k : 2 * (OUTLINE_POINTS - 1) - k] ;
      const el = this.handles[k];
      el.setAttribute('cx', (ring.r[k] * Math.cos(a)).toFixed(2));
      el.setAttribute('cy', (-ring.r[k] * Math.sin(a)).toFixed(2));
      void c;
    });
    // reference silhouette
    if (this.showRef) {
      let rd = '';
      const pts: [number, number][] = [];
      GHOST_SILHOUETTE.forEach((r, i) => { const a = (-90 + i * 2.5) * DEG; pts.push([r * Math.cos(a), -r * Math.sin(a)]); });
      for (let i = GHOST_SILHOUETTE.length - 2; i >= 1; i--) { const r = GHOST_SILHOUETTE[i]; const a = (-90 + i * 2.5) * DEG; pts.push([-r * Math.cos(a), -r * Math.sin(a)]); }
      pts.forEach((p, i) => { rd += `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`; });
      this.ref.setAttribute('d', rd + 'Z');
      this.ref.style.display = '';
    } else this.ref.style.display = 'none';
  }
}
