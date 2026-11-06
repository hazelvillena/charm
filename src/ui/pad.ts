import { h, svg } from './dom';
import { PadView } from './padView';
import { icon } from './icons';

/** a design-token length in px (see design/tokens.css, --pad-*) */
export const padPx = (name: string, fallback: number): number => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const ICONS = { trash: icon('trash', 12) };

/**
 * The drawing pad every canvas editor is built from (front outline, side profile, and any future one):
 * an SVG stage with zoom and pan, a top control row (points, delete), corner tools (revert, zoom, fit),
 * and a bottom overlay for modal controls. All sizes come from the --pad-* tokens; nothing here is editor specific.
 */
export class Pad {
  readonly el: HTMLElement;
  readonly svg: SVGSVGElement;
  readonly view: PadView;
  readonly top = h('div', { class: 'ui-pad-top' });
  readonly hud = h('div', { class: 'ui-pad-hud' });
  /** quiet options along the bottom edge, inside the container (Original, Reset) */
  readonly foot = h('div', { class: 'ui-pad-foot' });
  private deleteBtn: HTMLButtonElement; private minW = 100; private minH = 100;
  onRevert: () => void = () => {};
  onDelete: () => void = () => {};

  constructor(opts: { base: { cx: number; cy: number; w: number; h: number }; label: string; shape?: 'square' | 'tall' }) {
    this.svg = svg('svg', { class: `ui-pad-svg ${opts.shape ?? 'square'}`, 'aria-label': opts.label, tabindex: 0, viewBox: `${opts.base.cx - opts.base.w / 2} ${opts.base.cy - opts.base.h / 2} ${opts.base.w} ${opts.base.h}` }) as SVGSVGElement;
    this.view = new PadView(this.svg, opts.base); this.minW = opts.base.w; this.minH = opts.base.h;
    this.deleteBtn = Pad.iconButton(ICONS.trash, 'Delete the selected point', () => this.onDelete());
    this.deleteBtn.disabled = true;
    const reset = h('button', { type: 'button', class: 'ui-pad-link', text: 'Reset', title: 'Back to how this canvas was when loaded or last saved', onClick: () => this.onRevert() });
    this.foot.append(reset);
    this.top.append(this.deleteBtn);
    const grip = h('div', { class: 'ui-pad-grip', title: 'Drag to make this canvas taller or shorter (double-click to reset)', role: 'separator', 'aria-orientation': 'horizontal' });
    this.el = h('div', { class: 'ui-pad' }, h('div', { class: 'ui-pad-bar' }, this.top, this.view.controls), this.svg, this.hud, this.foot, grip);
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch { /* optional */ }
      const y0 = e.clientY, h0 = this.svg.getBoundingClientRect().height; grip.classList.add('drag');
      const move = (ev: PointerEvent) => { const hgt = Math.round(Math.min(720, Math.max(140, h0 + ev.clientY - y0))); this.svg.style.height = `${hgt}px`; this.svg.style.aspectRatio = 'auto'; this.svg.style.maxHeight = 'none'; };
      const up = () => { grip.classList.remove('drag'); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    grip.addEventListener('dblclick', () => { this.svg.style.height = ''; this.svg.style.aspectRatio = ''; this.svg.style.maxHeight = ''; });
  }

  /** the delete button is enabled only while a deletable point is selected */
  setCanDelete(on: boolean) { this.deleteBtn.disabled = !on; }

  /**
   * Let the drawing area follow the canvas shape: the width stays fixed in drawing units and the height grows or shrinks with
   * the canvas, so a taller canvas shows (or, for the side profile, spreads out) more height. `top` anchors the top edge.
   */
  fitAspect(top?: number): boolean {
    const r = this.svg.getBoundingClientRect(); if (r.width < 20 || r.height < 20) return false;
    const base = this.view.baseSize, asp = r.height / r.width, w = Math.max(this.minW, this.minH / asp), hh = w * asp; // always keeps the whole drawing area in view
    if (Math.abs(hh - base.h) < 0.4 && Math.abs(w - base.w) < 0.4) return false;
    this.view.setBase({ cx: base.cx, cy: top === undefined ? base.cy : top + hh / 2, w, h: hh }); return true;
  }

  /** unit: svg units per screen pixel. Sizes a point so it stays the same on screen at any zoom. */
  unit() { return this.view.unit(); }

  static iconButton(html: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'ui-pad-btn', title, 'aria-label': title, onClick: (e: Event) => { e.stopPropagation(); onClick(); } }) as HTMLButtonElement;
    b.innerHTML = html; return b;
  }

  /** a labelled − n + control for the top row. `step(-1 | 1)` adds or removes a point. */
  static stepper(label: string, step: (d: -1 | 1) => void) {
    const count = h('b', { class: 'ui-pad-count' });
    const minus = h('button', { type: 'button', class: 'ui-pad-step', text: '−', title: `Remove a ${label.toLowerCase()} point`, onClick: () => step(-1) }) as HTMLButtonElement;
    const plus = h('button', { type: 'button', class: 'ui-pad-step', text: '+', title: `Add a ${label.toLowerCase()} point`, onClick: () => step(1) }) as HTMLButtonElement;
    const el = h('div', { class: 'ui-pad-stepper' }, h('span', { class: 'ui-pad-label', text: label }), minus, count, plus);
    return { el, set(n: number, min: number, max: number) { count.textContent = String(n); minus.disabled = n <= min; plus.disabled = n >= max; } };
  }

  /** an interactive point: a generous invisible hit target, a selection ring, and the dot itself */
  static point(index: number, mirror = false): SVGGElement {
    const g = svg('g', { class: 'ui-pad-pt' + (mirror ? ' mirror' : ''), 'data-i': index }) as SVGGElement;
    g.append(svg('circle', { class: 'hit' }), svg('circle', { class: 'ring' }), svg('circle', { class: 'dot' }));
    return g;
  }
  static placePoint(g: SVGGElement, x: number, y: number, u: number, mirror = false) {
    const [hit, ring, dot] = Array.from(g.children) as SVGCircleElement[];
    for (const c of [hit, ring, dot]) { c.setAttribute('cx', x.toFixed(2)); c.setAttribute('cy', y.toFixed(2)); }
    hit.setAttribute('r', (padPx('--pad-hit', 9) * u).toFixed(3));
    ring.setAttribute('r', (padPx('--pad-ring', 6) * u).toFixed(3));
    dot.setAttribute('r', ((mirror ? padPx('--pad-dot-mirror', 1.3) : padPx('--pad-dot', 2.5)) * u).toFixed(3));
  }
}
