import { h, collapseAllButton } from './dom';
import { icon } from './icons';
import { CheckResult } from '../checks/fit';
import { Spec } from '../spec/spec';

export type LiveStats = { w: number; h: number; d: number; shellCm3: number | null; weightG: number | null; material: string; splitZ: number };

/** Outputs column: live results that react as the inputs change, plus the casing build and exports. */
/** how each check works, in a few plain sentences (shown from the i beside each row) */
const CHECK_HOW: Record<string, string> = {
  fit: 'Makes sure the body is big enough to wrap the Core. We find the narrowest spot between the Core and the outside edge, and check there is room for the Core\'s recess plus a solid wall around it, and enough depth behind it.',
  wall: 'Imagine pushing a pin straight in from the outside at every point on the surface. We measure how far it travels before it reaches the inside. The shortest distance is your thinnest wall, and it has to be at least 80% of the wall thickness you chose.',
  draft: 'Plastic parts are made in a two-piece mold that opens to the front and the back. We look at every bit of surface: anything that faces the wrong way would catch on the mold and stop the part from coming out. The split line is where the two halves meet.',
  nook: 'We measure how thick the body is at the loop, front to back, and check there is enough material around it to hold a loop without breaking.',
};
export class OutputsPanel {
  readonly el: HTMLElement;
  private tiles: Record<string, HTMLElement> = {};
  private checks = h('div', { class: 'checks' });
  private build = h('button', { type: 'button', class: 'ui-btn primary block', text: 'Preview' }) as HTMLButtonElement;
  private casingBody = h('div', { class: 'ui-card-body' });
  private exportBtns = new Map<string, HTMLButtonElement>();
  private exportMenu!: HTMLElement; private exportBtn!: HTMLButtonElement; private permaBtn!: HTMLButtonElement; private collapseBtn!: HTMLButtonElement;
  private imperial = false; private lastLive: LiveStats | null = null; private lastChecks: { list: CheckResult[]; pending: boolean } | null = null;
  private unitBtns: HTMLButtonElement[] = [];
  onBuild: () => void = () => {};
  onExport: (kind: string) => void = () => {};
  onShare: () => void = () => {};
  onClose: () => void = () => {};

  constructor() {
    const tile = (key: string, label: string) => { const v = h('b'); this.tiles[key] = v; return h('div', { class: 'ui-tile' }, h('small', { text: label }), v); };
    const live = h('div', { class: 'ui-card-body' },
      h('div', { class: 'tiles' }, tile('w', 'Width'), tile('h', 'Height'), tile('d', 'Depth'), tile('weight', 'Weight')),
      h('div', { class: 'unit-toggle', role: 'group', 'aria-label': 'Units' }, ...(['mm', 'in'] as const).map((u) => { const bt = h('button', { type: 'button', text: u, onClick: () => this.setUnits(u === 'in') }) as HTMLButtonElement; this.unitBtns.push(bt); return bt; })));
    try { this.imperial = localStorage.getItem('clayground:units') === 'in'; } catch { /* optional */ }
    this.paintUnits();
    this.build.addEventListener('click', () => this.onBuild());
    this.casingBody.append(this.build);
    // export: just the formats
    const TITLES: Record<string, string> = { cage: 'Quad control mesh for Rhino ToSubD, plus the eyes, Core and magnets as separate objects', smooth: 'Finished body plus the eyes, Core and magnets as separate objects', stl: 'Front and back shells, plus the Core, magnets and eyes', step: 'Shells, Core, magnets and eyes as separate solids (faceted)' };
    const FORMATS: [string, string, string][] = [['cage', 'OBJ', 'SubD'], ['smooth', 'OBJ', 'Mesh'], ['stl', 'STL', ''], ['step', 'STEP', '']];
    this.exportMenu = h('div', { class: 'exp-menu hidden' }, ...FORMATS.map(([kind, title, ext]) => { const b = h('button', { type: 'button', class: 'exp-item', title: TITLES[kind] ?? '', onClick: () => { this.exportMenu.classList.add('hidden'); this.onExport(kind); } }, h('span', { text: title }), h('em', { text: ext })) as HTMLButtonElement; this.exportBtns.set(kind, b); return b; }));
    this.exportBtn = h('button', { type: 'button', class: 'ui-btn export-btn', onClick: () => this.exportMenu.classList.toggle('hidden') }) as HTMLButtonElement;
    this.exportBtn.innerHTML = icon('download', 15) + '<span>Export</span>' + icon('chevronUp', 12);
    this.permaBtn = h('button', { type: 'button', class: 'ui-btn icon-btn', title: 'Copy permalink', 'aria-label': 'Copy permalink', onClick: () => this.onShare() }) as HTMLButtonElement;
    this.permaBtn.innerHTML = icon('link', 17);
    this.collapseBtn = h('button', { type: 'button', class: 'ui-btn icon-btn', title: 'Collapse', 'aria-label': 'Collapse outputs panel', onClick: () => this.onClose() }) as HTMLButtonElement;
    this.collapseBtn.innerHTML = icon('panelRight', 17);
    document.addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('.check-info, .check-how')) this.closeHows(); });
    document.addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('.exp-wrap')) this.exportMenu.classList.add('hidden'); });

    this.el = h('aside', { class: 'outputs ui-root' },
      h('div', { class: 'col-head' }, h('span', { class: 'brand-name', text: 'Overview' }), h('div', { class: 'head-tools' }, collapseAllButton(() => this.el), this.collapseBtn)),
      h('div', { class: 'panel-body' },
        h('div', { class: 'ui-group' }, live), this.card('Sanity check', true, h('div', { class: 'ui-card-body' }, this.checks)),
        this.card('Preview', true, this.casingBody)),
      h('div', { class: 'out-foot' }, h('div', { class: 'exp-wrap' }, this.exportBtn, this.exportMenu)));
    this.setExportState(false); this.setChecks([], true);
  }

  private card(title: string, open: boolean, content: HTMLElement) {
    return h('details', { class: 'ui-card', open: open ? true : undefined }, h('summary', {}, h('span', { text: title })), content);
  }

  /** one shared popover, attached to the page (not the panel) so nothing can cover or clip it */
  private how = h('div', { class: 'check-how ui-pop closed', role: 'note' }, h('b'), h('span'));
  private howFor: HTMLElement | null = null;
  private closeHows() { this.how.classList.add('closed'); this.howFor = null; }
  private showHow(btn: HTMLElement, c: CheckResult) {
    if (this.howFor === btn) { this.closeHows(); return; }
    this.howFor = btn;
    (this.how.children[0] as HTMLElement).textContent = c.label; (this.how.children[1] as HTMLElement).textContent = CHECK_HOW[c.id] ?? '';
    if (!this.how.isConnected) document.body.append(this.how);
    const r = btn.getBoundingClientRect(), w = Math.min(290, window.innerWidth - 16);
    this.how.style.width = `${w}px`; this.how.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
    this.how.classList.remove('closed');
    const hgt = this.how.offsetHeight; this.how.style.top = `${r.bottom + 8 + hgt > window.innerHeight - 8 ? Math.max(8, r.top - 8 - hgt) : r.bottom + 8}px`;
  }
  private paintUnits() { this.unitBtns.forEach((bt, i) => bt.classList.toggle('on', (i === 1) === this.imperial)); }
  setUnits(imperial: boolean) {
    this.imperial = imperial; try { localStorage.setItem('clayground:units', imperial ? 'in' : 'mm'); } catch { /* optional */ }
    this.paintUnits(); if (this.lastLive) this.setLive(this.lastLive); if (this.lastChecks) this.setChecks(this.lastChecks.list, this.lastChecks.pending);
  }
  /** display only: the model always stays in mm */
  private txt(t: string) { return this.imperial ? t.replace(/(\d+(?:\.\d+)?) mm/g, (_, n) => `${(+n / 25.4).toFixed(2)} in`) : t; }
  setLive(s: LiveStats) {
    this.lastLive = s;
    const put = (k: string, v: string, unit: string) => this.tiles[k].replaceChildren(v, h('em', { text: unit }));
    const L = (mm: number) => this.imperial ? [(mm / 25.4).toFixed(2), 'in'] : [mm.toFixed(1), 'mm'];
    put('w', L(s.w)[0], L(s.w)[1]); put('h', L(s.h)[0], L(s.h)[1]); put('d', L(s.d)[0], L(s.d)[1]);
    put('weight', s.weightG === null ? '…' : this.imperial ? (s.weightG / 28.3495).toFixed(2) : s.weightG.toFixed(1), this.imperial ? 'oz' : 'g');
    this.tiles.weight.parentElement!.title = `Estimate, ${s.material}`;
  }

  onFocus: (c: CheckResult) => void = () => {};
  setChecks(list: CheckResult[], pending: boolean) {
    this.lastChecks = { list, pending };
    if (!list.length) { this.checks.replaceChildren(h('div', { class: 'ui-tag-note', text: pending ? 'Checking…' : 'No results' })); return; }
    this.checks.replaceChildren(...list.map((c) => {
      const point = !c.ok && (c.at || c.angleDeg !== undefined);
      const info = h('button', { type: 'button', class: 'check-info', title: 'How this is checked', 'aria-label': `How ${c.label} is checked`, text: 'i' }) as HTMLButtonElement;
      info.addEventListener('click', (e) => { e.stopPropagation(); this.showHow(info, c); });
      return h('div', { class: 'check ' + (c.ok ? 'ok' : 'bad') + (point ? ' point' : ''), title: point ? 'Show where' : '', onClick: point ? () => this.onFocus(c) : undefined },
        h('i'), h('div', { class: 'check-text' }, h('b', { text: c.label }), h('small', { text: this.txt(!c.ok && c.fix ? c.fix : c.detail) })), info);
    }));
  }

  setBusy(b: boolean) { this.build.disabled = b; this.build.textContent = b ? 'Preparing preview…' : this.built ? 'Refresh preview' : 'Preview'; }
  setWarn(w: boolean) { this.build.classList.toggle('warn', w); this.build.title = w ? 'Some checks fail' : ''; }
  private built = false;
  setCasing(spec: Spec | null, ms?: number) {
    this.built = !!spec; this.setExportState(!!spec);
    this.build.textContent = spec ? 'Refresh preview' : 'Preview';
    this.build.disabled = !!spec; // while viewing the built result, use "Back to edit"
    this.casingBody.replaceChildren(this.build);
    if (spec) this.casingBody.append(h('div', { class: 'built' }, h('b', { text: spec.name }), h('small', { text: ms ? `${Math.round(ms)} ms` : '' })));
  }
  setExportState(built: boolean) {
    for (const k of ['stl', 'step']) { const b = this.exportBtns.get(k); if (b) b.title = built ? (b.title.replace(' · prepares a preview first', '')) : (b.title.includes('prepares') ? b.title : b.title + ' · prepares a preview first'); }
  }
}
