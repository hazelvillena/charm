import { icon } from './icons';
import { h, unroll } from './dom';
import { ViewMode, Analysis } from '../store';

export const ANALYSES: { id: Analysis; label: string; note: string }[] = [
  { id: 'none', label: 'Off', note: '' },
  { id: 'draft', label: 'Mold release', note: 'undercuts' },
  { id: 'curvature', label: 'Curvature', note: 'tight radii' },
  { id: 'zebra', label: 'Zebra', note: 'surface flow' },
];

/** Stage controls: preset chips (top), view / analyze / split (bottom). Accepted mode swaps in Back to edit / Explode. */
export class Toolbar {
  readonly el: HTMLElement;
  readonly chips: HTMLElement;
  private viewBtns: Record<string, HTMLButtonElement> = {};
  private analyzeBtn: HTMLButtonElement;
  readonly layers: HTMLElement;
  private eyeRoll!: ReturnType<typeof unroll>;
  private menu: HTMLElement; private layersRoll!: ReturnType<typeof unroll>;
  private split: HTMLButtonElement;
  private edit: HTMLButtonElement;
  private expl: HTMLButtonElement;
  private exploreBits: HTMLElement;
  private acceptBits: HTMLElement;
  private chipBtns = new Map<string, HTMLButtonElement>();
  readonly libBtn: HTMLButtonElement;
  private chipsRow!: HTMLElement;
  onView: (v: ViewMode) => void = () => {};
  onAnalysis: (a: Analysis) => void = () => {};
  onSplit: () => void = () => {};
  onEdit: () => void = () => {};
  onExplode: () => void = () => {};
  onChip: (id: string) => void = () => {};
  onLibrary: () => void = () => {};
  onTurntable: (on: boolean) => void = () => {};

  constructor() {
    this.chips = h('div', { class: 'chips ui-float' });
    this.chipsRow = h('div', { class: 'chips-row' });
    this.libBtn = h('button', { type: 'button', class: 'ui-chip lib-btn', title: 'Library: saved iterations', 'aria-label': 'Library', onClick: () => this.onLibrary() }) as HTMLButtonElement;
    this.libBtn.innerHTML = icon('library', 16);
    this.chips.append(this.chipsRow, h('span', { class: 'chip-sep' }), this.libBtn);

    const seg = h('div', { class: 'ui-seg ui-fit' });
    ([['shaded', 'Shaded'], ['ghost', 'Ghost'], ['section', 'Section'], ['cage', 'Wire']] as [ViewMode, string][]).forEach(([v, label]) => {
      const b = h('button', { type: 'button', text: label, onClick: () => this.onView(v) }) as HTMLButtonElement; this.viewBtns[v] = b; seg.append(b);
    });
    // analysis layers: the layers button spins and the options unroll beside it
    this.menu = h('div', { class: 'ui-seg ui-fit' }, ...ANALYSES.map((a) => h('button', { type: 'button', 'data-id': a.id, title: a.note, text: a.label, onClick: () => { this.layersRoll.set(false); this.onAnalysis(a.id); } })));
    this.analyzeBtn = h('button', { type: 'button', class: 'ui-btn ui-float layers-btn', title: 'Analysis layers', 'aria-label': 'Analysis layers' }) as HTMLButtonElement;
    this.analyzeBtn.innerHTML = icon('layers', 18);
    this.layersRoll = unroll(this.analyzeBtn, [this.menu], { closeOnOutside: true, side: 'down' });
    this.layers = this.layersRoll.el; this.layers.classList.add('layers');
    this.split = h('button', { type: 'button', class: 'ui-btn', text: 'Split line', title: 'Split line', onClick: () => this.onSplit() }) as HTMLButtonElement;
    this.edit = h('button', { type: 'button', class: 'ui-btn', text: '← Back to edit', onClick: () => this.onEdit() }) as HTMLButtonElement;
    this.expl = h('button', { type: 'button', class: 'ui-btn', text: 'Assemble', onClick: () => this.onExplode() }) as HTMLButtonElement;
    // the eye: the view modes roll out to its side (open by default)
    const eye = h('button', { type: 'button', class: 'ui-btn eye-btn', title: 'View modes', 'aria-label': 'View modes' }) as HTMLButtonElement;
    eye.innerHTML = icon('eye', 18);
    const eyeRoll = unroll(eye, [seg, this.split], { open: true, onToggle: (o) => eye.classList.toggle('on', o) });
    const turn = h('button', { type: 'button', class: 'ui-btn eye-btn turn-btn ui-spin-live', title: 'Turntable: slowly rotate the model', 'aria-label': 'Turntable', onClick: () => { const o = turn.classList.toggle('on'); this.onTurntable(o); if (!o) { turn.classList.add('ui-spin-once'); setTimeout(() => turn.classList.remove('ui-spin-once'), 700); } } }) as HTMLButtonElement;
    turn.innerHTML = icon('turntable', 18);
    this.eyeRoll = eyeRoll;
    eyeRoll.el.insertBefore(turn, eyeRoll.el.querySelector('.ui-unroll-body')); // the turntable sits right beside the eye
    this.exploreBits = h('div', { class: 'tb-group view-wrap' }, eyeRoll.el);
    this.acceptBits = h('div', { class: 'tb-group hidden' }, this.edit, this.expl);
    this.el = h('div', { class: 'toolbar ui-float' }, this.exploreBits, this.acceptBits);
  }

  setView(v: ViewMode) { for (const k in this.viewBtns) this.viewBtns[k].classList.toggle('on', k === v); }
  setAnalysis(a: Analysis) {
    const info = ANALYSES.find((x) => x.id === a)!;
    this.analyzeBtn.classList.toggle('on', a !== 'none'); this.analyzeBtn.title = a === 'none' ? 'Analysis layers' : `Analysis: ${info.label}`;
    this.menu.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.id === a));
  }
  setSplit(on: boolean) { this.split.classList.toggle('on', on); }
  /** the starred library iterations, anchored in the pill; the active one is highlighted */
  setChips(items: { id: string; name: string }[], activeId: string | null) {
    this.chipBtns.clear(); this.chipsRow.replaceChildren();
    items.forEach((it) => { const b = h('button', { type: 'button', class: 'ui-chip', text: it.name, title: it.name, onClick: () => this.onChip(it.id) }) as HTMLButtonElement; this.chipBtns.set(it.id, b); this.chipsRow.append(b); });
    this.setPreset(activeId);
  }
  setPreset(id: string | null) { this.chipBtns.forEach((b, k) => b.classList.toggle('on', k === id)); }
  setLibraryCount(n: number) { this.libBtn.title = `Library: ${n} saved`; this.libBtn.classList.toggle('has', n > 0); }
  /**
   * Pin the view toolbar so the eye never moves: it is placed where the fully open toolbar would be centred, and
   * opening or closing only grows or shrinks it to the right. Call after it is in the page and when the window changes.
   */
  layout() {
    if (!this.el.isConnected || this.el.classList.contains('hidden')) return;
    const body = this.eyeRoll.el.querySelector('.ui-unroll-body') as HTMLElement, inner = body.firstElementChild as HTMLElement;
    const open = this.el.offsetWidth - body.getBoundingClientRect().width + inner.scrollWidth;
    this.el.style.setProperty('--toolbar-w', `${Math.round(open)}px`);
  }
  setMode(accepted: boolean) {
    this.el.classList.toggle('anchored', !accepted);
    this.exploreBits.classList.toggle('hidden', accepted);
    this.acceptBits.classList.toggle('hidden', !accepted);
    this.chips.classList.toggle('hidden', accepted);
    this.layers.classList.toggle('hidden', accepted);
  }
  setExploded(ex: boolean) { this.expl.textContent = ex ? 'Assemble' : 'Explode'; }
}
