import { h } from './dom';
import { GROUPS, Params, SCHEMA, ParamDef } from '../params/schema';
import { CORE } from '../params/core';
import { COLORS } from '../store';

const decimals = (step = 1) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

export class Panel {
  readonly el: HTMLElement;
  private inputs = new Map<string, { set: (v: any) => void }>();
  onParam: (id: keyof Params, value: number | string, final: boolean) => void = () => {};
  onColor: (id: string) => void = () => {};
  private swatches: HTMLElement[] = [];
  private body: HTMLElement;

  constructor(editorEl: HTMLElement) {
    this.body = h('div', { class: 'panel-body' });
    this.el = h('aside', { class: 'panel' },
      h('header', { class: 'brand' }, h('div', { class: 'brand-mark' }), h('div', {}, h('div', { class: 'brand-name', text: 'Charmer Lab' }), h('div', { class: 'brand-sub', text: 'Concept casing · prefab preview' }))),
      this.body);
    this.body.append(this.section('Outline', true, h('div', {}, editorEl)));
    for (const g of GROUPS) {
      const rows = SCHEMA.filter((d) => d.group === g.id).map((d) => this.row(d));
      this.body.append(this.section(g.label, g.open, h('div', { class: 'rows' }, ...rows)));
    }
    this.body.append(this.section('Core interface', false, this.coreRows(), true));
    this.body.append(this.section('View color', true, this.colorRow()));
  }

  private section(title: string, open: boolean, content: HTMLElement, locked = false) {
    const d = h('details', { class: 'group' + (locked ? ' locked-group' : ''), open: open ? true : undefined },
      h('summary', {}, h('span', { text: title }), locked ? h('span', { class: 'lock', text: '🔒 locked · TBD' }) : null), content);
    return d;
  }

  private row(d: ParamDef) {
    if (d.kind === 'range') {
      const dec = decimals(d.step);
      const val = h('span', { class: 'val' });
      const input = h('input', { type: 'range', min: d.min, max: d.max, step: d.step, value: d.default }) as HTMLInputElement;
      const fmt = (v: number) => v.toFixed(dec) + (d.unit ? ' ' + d.unit : '');
      input.addEventListener('input', () => { val.textContent = fmt(+input.value); this.onParam(d.id, +input.value, false); });
      input.addEventListener('change', () => this.onParam(d.id, +input.value, true));
      this.inputs.set(d.id, { set: (v: number) => { input.value = String(v); val.textContent = fmt(v); } });
      return h('div', { class: 'row', title: d.hint ?? '' }, h('div', { class: 'row-top' }, h('label', { text: d.label }), val), input);
    }
    const seg = h('div', { class: 'seg' });
    const btns = d.options!.map((o) => h('button', { type: 'button', text: o, onClick: () => { this.onParam(d.id, o, true); } }));
    btns.forEach((b) => seg.append(b));
    this.inputs.set(d.id, { set: (v: string) => btns.forEach((b) => b.classList.toggle('on', b.textContent === v)) });
    return h('div', { class: 'row' }, h('div', { class: 'row-top' }, h('label', { text: d.label })), seg);
  }

  private coreRows() {
    const r = (k: string, v: string) => h('div', { class: 'core-row' }, h('span', { text: k }), h('span', { class: 'mono', text: v }));
    return h('div', { class: 'rows core' },
      r('Puck diameter', `${CORE.puckDiameter} mm (1 in)`), r('Puck depth', `${CORE.puckDepth} mm`), r('Ring clearance', `${CORE.puckClearance} mm`),
      r('Magnets', `${CORE.magnet.count} × Ø${CORE.magnet.diameter} × ${CORE.magnet.thickness} mm`), r('Magnet spacing', `${CORE.magnet.spacing} mm`),
      r('Notch', `${CORE.notch.width} × ${CORE.notch.depth} mm`), r('Loop hole', `Ø${CORE.loop.holeDiameter} mm, boss ${CORE.loop.boss} mm`),
      h('div', { class: 'tbd-note', text: 'Placeholder values. Replace in params/core.ts when real dims arrive.' }));
  }

  private colorRow() {
    const wrap = h('div', { class: 'swatches' });
    COLORS.forEach((c) => {
      const b = h('button', { type: 'button', class: 'swatch', title: c.label, style: `--c:${c.hex}`, onClick: () => { this.setColor(c.id); this.onColor(c.id); } });
      if (c.metal) b.classList.add('metal');
      b.dataset.id = c.id; this.swatches.push(b); wrap.append(b);
    });
    return wrap;
  }
  setColor(id: string) { this.swatches.forEach((s) => s.classList.toggle('on', s.dataset.id === id)); }
  setParams(p: Params) { for (const [k, v] of Object.entries(p)) this.inputs.get(k)?.set(v as any); }
  lock(on: boolean) { this.el.classList.toggle('locked', on); }
}
