import { h } from './dom';
import { icon } from './icons';

/**
 * Zoom and pan for an SVG drawing pad: mouse wheel zooms about the pointer, a background drag pans,
 * small + / − / fit buttons sit in the corner for precise work. Strokes use non-scaling widths (CSS) and the
 * editors size their handles with `unit()` (svg units per screen pixel) so points stay small at any zoom.
 */
export class PadView {
  readonly controls: HTMLElement;
  onChange: () => void = () => {};
  private zoom = 1; private cx: number; private cy: number;
  private pan: { x: number; y: number; cx: number; cy: number; id: number } | null = null;
  static readonly MIN = 0.3; static readonly MAX = 12;

  constructor(private s: SVGSVGElement, private base: { cx: number; cy: number; w: number; h: number }) {
    this.cx = base.cx; this.cy = base.cy; this.apply();
    const btn = (label: string, title: string, on: () => void, html?: string) => {
      const b = h('button', { type: 'button', class: 'ui-pad-btn', title, 'aria-label': title, text: html ? undefined : label, onClick: (e: Event) => { e.stopPropagation(); on(); } }) as HTMLButtonElement;
      if (html) b.innerHTML = html; return b;
    };
    this.controls = h('div', { class: 'ui-pad-tools' },
      btn('', 'Zoom in', () => this.zoomAbout(this.cx, this.cy, 1.4), icon('plus', 12)),
      btn('', 'Zoom out', () => this.zoomAbout(this.cx, this.cy, 1 / 1.4), icon('minus', 12)),
      btn('', 'Fit', () => this.reset(), icon('fit', 12)));
    s.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [px, py] = this.toSvg(e.clientX, e.clientY);
      this.zoomAbout(px, py, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
    }, { passive: false });
    // middle / right button, or shift + drag, pans anywhere (editors also call startPan for background drags)
    s.addEventListener('pointerdown', (e) => { if (e.button === 1 || e.button === 2 || e.shiftKey) { e.stopPropagation(); e.preventDefault(); this.startPan(e); } }, true);
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    s.addEventListener('pointermove', (e) => this.movePan(e), true);
    const end = (e: PointerEvent) => this.endPan(e);
    s.addEventListener('pointerup', end, true); s.addEventListener('pointercancel', end, true);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.onChange()).observe(s);
  }

  private get w() { return this.base.w / this.zoom; }
  private get hh() { return this.base.h / this.zoom; }
  private apply() { this.s.setAttribute('viewBox', `${this.cx - this.w / 2} ${this.cy - this.hh / 2} ${this.w} ${this.hh}`); }
  get zoomLevel() { return this.zoom; }
  /** change the drawing area (e.g. a taller canvas shows more height); the view re-centres when not zoomed */
  setBase(base: { cx: number; cy: number; w: number; h: number }) {
    const first = this.zoom === 1; this.base = base; if (first) { this.cx = base.cx; this.cy = base.cy; } this.apply();
  }
  get baseSize() { return this.base; }
  /** svg units per screen pixel (use for handle radii so they stay the same size on screen) */
  unit(): number { const r = this.s.getBoundingClientRect(); const ppu = Math.min(r.width / this.w, r.height / this.hh); return ppu > 0 ? 1 / ppu : 1; }
  private toSvg(x: number, y: number): [number, number] {
    const m = this.s.getScreenCTM(); if (!m) return [this.cx, this.cy];
    const pt = this.s.createSVGPoint(); pt.x = x; pt.y = y; const p = pt.matrixTransform(m.inverse()); return [p.x, p.y];
  }
  zoomAbout(px: number, py: number, f: number) {
    const z = Math.min(PadView.MAX, Math.max(PadView.MIN, this.zoom * f)), k = this.zoom / z;
    this.cx = px + (this.cx - px) * k; this.cy = py + (this.cy - py) * k; this.zoom = z; this.apply(); this.onChange();
  }
  /** move the view centre (svg units), e.g. to keep the shape still while the Core is dragged */
  setCenter(cx: number, cy: number) { this.cx = cx; this.cy = cy; this.apply(); this.onChange(); }
  get center(): [number, number] { return [this.cx, this.cy]; }
  reset() { this.zoom = 1; this.cx = this.base.cx; this.cy = this.base.cy; this.apply(); this.onChange(); }

  startPan(e: PointerEvent) {
    this.pan = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, id: e.pointerId };
    try { this.s.setPointerCapture(e.pointerId); } catch { /* optional */ }
    this.s.classList.add('panning');
  }
  private movePan(e: PointerEvent) {
    if (!this.pan || e.pointerId !== this.pan.id) return;
    e.stopPropagation();
    const u = this.unit(); this.cx = this.pan.cx - (e.clientX - this.pan.x) * u; this.cy = this.pan.cy - (e.clientY - this.pan.y) * u; this.apply(); this.onChange();
  }
  private endPan(e: PointerEvent) {
    if (!this.pan || e.pointerId !== this.pan.id) return;
    this.pan = null; this.s.classList.remove('panning'); try { this.s.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    e.stopPropagation();
  }
  get panning() { return !!this.pan; }
}
