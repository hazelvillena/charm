import { h } from './dom';
import { ViewMode } from '../store';
import { CheckResult } from '../checks/fit';

export class Toolbar {
  readonly el: HTMLElement;
  readonly chips: HTMLElement;
  private pills: HTMLElement;
  private viewBtns: Record<string, HTMLButtonElement> = {};
  private heat: HTMLButtonElement;
  private accept: HTMLButtonElement;
  private edit: HTMLButtonElement;
  private expl: HTMLButtonElement;
  private exportBtn: HTMLButtonElement;
  private exportMenu: HTMLElement;
  private exploreBits: HTMLElement;
  private acceptBits: HTMLElement;
  private chipBtns = new Map<string, HTMLButtonElement>();
  onView: (v: ViewMode) => void = () => {};
  onHeat: () => void = () => {};
  onAccept: () => void = () => {};
  onEdit: () => void = () => {};
  onExplode: () => void = () => {};
  onShare: () => void = () => {};
  onExport: (kind: string) => void = () => {};
  onPreset: (id: string) => void = () => {};

  constructor(presets: { id: string; name: string }[]) {
    this.chips = h('div', { class: 'chips' });
    presets.forEach((p) => { const b = h('button', { type: 'button', class: 'chip', text: p.name, onClick: () => this.onPreset(p.id) }); this.chipBtns.set(p.id, b); this.chips.append(b); });

    const seg = h('div', { class: 'seg compact' });
    (['smooth', 'cage', 'both'] as ViewMode[]).forEach((v) => {
      const b = h('button', { type: 'button', text: v[0].toUpperCase() + v.slice(1), onClick: () => this.onView(v) });
      this.viewBtns[v] = b; seg.append(b);
    });
    this.heat = h('button', { type: 'button', class: 'btn ghost', text: 'Wall heatmap', onClick: () => this.onHeat() });
    this.pills = h('div', { class: 'pills' });
    this.accept = h('button', { type: 'button', class: 'btn primary', text: 'Accept', onClick: () => this.onAccept() });
    this.exportMenu = h('div', { class: 'menu' });
    const items: [string, string][] = [['cage', 'Cage OBJ (quads, Rhino SubD)'], ['smooth', 'Smooth OBJ'], ['stl', 'Shells STL (after Accept)'], ['spec', 'Spec JSON (after Accept)']];
    items.forEach(([k, label]) => this.exportMenu.append(h('button', { type: 'button', text: label, 'data-k': k, onClick: () => { this.exportMenu.classList.remove('open'); this.onExport(k); } })));
    this.exportBtn = h('button', { type: 'button', class: 'btn', text: 'Export ▾', onClick: () => this.exportMenu.classList.toggle('open') });
    const share = h('button', { type: 'button', class: 'btn', text: 'Share link', onClick: () => this.onShare() });
    this.edit = h('button', { type: 'button', class: 'btn', text: '← Edit', onClick: () => this.onEdit() });
    this.expl = h('button', { type: 'button', class: 'btn', text: 'Assembled', onClick: () => this.onExplode() });

    this.exploreBits = h('div', { class: 'tb-group' }, seg, this.heat, this.pills, this.accept);
    this.acceptBits = h('div', { class: 'tb-group hidden' }, this.edit, this.expl);
    this.el = h('div', { class: 'toolbar' }, this.exploreBits, this.acceptBits, h('div', { class: 'tb-sep' }), h('div', { class: 'tb-group' }, share, h('div', { class: 'menu-wrap' }, this.exportBtn, this.exportMenu)));
    document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.menu-wrap')) this.exportMenu.classList.remove('open'); });
  }

  setView(v: ViewMode) { for (const k in this.viewBtns) this.viewBtns[k].classList.toggle('on', k === v); }
  setHeat(on: boolean) { this.heat.classList.toggle('on', on); }
  setPreset(id: string | null) { this.chipBtns.forEach((b, k) => b.classList.toggle('on', k === id)); }
  setMode(accepted: boolean) {
    this.exploreBits.classList.toggle('hidden', accepted);
    this.acceptBits.classList.toggle('hidden', !accepted);
    this.chips.classList.toggle('hidden', accepted);
    this.exportMenu.querySelectorAll('button').forEach((b) => { const k = (b as HTMLElement).dataset.k; if (k === 'stl' || k === 'spec') (b as HTMLButtonElement).disabled = !accepted; });
  }
  setExploded(ex: boolean) { this.expl.textContent = ex ? 'Assemble' : 'Explode'; }
  setBusy(b: boolean) { this.accept.disabled = b; this.accept.textContent = b ? 'Building casing…' : 'Accept'; }
  setWarn(w: boolean) { this.accept.classList.toggle('warn', w); this.accept.title = w ? 'Some checks fail. Accept is still allowed so the failure is visible in the spec.' : ''; }
  setChecks(list: CheckResult[], pending: boolean) {
    this.pills.replaceChildren(...(pending && !list.length ? [h('span', { class: 'pill wait', text: 'Checking…' })] : list.map((c) =>
      h('span', { class: 'pill ' + (c.ok ? 'ok' : 'bad'), title: c.detail }, h('i'), c.label))));
  }
  detail(list: CheckResult[]) { return list; }
}
