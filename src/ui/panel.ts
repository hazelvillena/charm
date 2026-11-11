import { h, collapseAllButton } from './dom';
import { icon } from './icons';
import { GROUPS, Params, SCHEMA, ParamDef } from '../params/schema';
import { CORE, CORE_RANGES, CoreKey, getCore } from '../params/core';
import { SWATCHES, FINISHES, Look, isHex, materialById, DEFAULT_LOOK } from '../../design/finishes';
import { BRAND_NAME, brandMarkSvg } from '../../design/brand';

const decimals = (step = 1) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);
/** A labelled slider that snaps to its step (with faint ticks) and whose value can be typed. */
function rangeControl(o: { label: string; min: number; max: number; step: number; unit?: string; value: number; hint?: string; onInput: (v: number) => void; onChange: (v: number) => void }) {
  const dec = decimals(o.step), snap = (v: number) => Math.min(o.max, Math.max(o.min, Math.round((v - o.min) / o.step) * o.step + o.min));
  const num = h('input', { type: 'text', inputmode: 'decimal', class: 'ui-num-input', 'aria-label': `${o.label} value`, spellcheck: 'false' }) as HTMLInputElement;
  const unit = o.unit ? h('span', { class: 'ui-unit', text: o.unit }) : null;
  const input = h('input', { type: 'range', class: 'ui-range', min: o.min, max: o.max, step: o.step, value: o.value, 'aria-label': o.label }) as HTMLInputElement;
  const n = Math.round((o.max - o.min) / o.step); if (n <= 24) { input.classList.add('ticked'); input.style.setProperty('--n', String(n)); }
  const show = (v: number) => { num.value = v.toFixed(dec); num.style.width = `${Math.max(2, num.value.length) + 0.4}ch`; };
  const paint = (v: number) => input.style.setProperty('--p', `${((v - o.min) / (o.max - o.min)) * 100}%`);
  const pulse = () => { num.classList.remove('tick'); void num.offsetWidth; num.classList.add('tick'); };
  input.addEventListener('input', () => { const v = +input.value; paint(v); show(v); pulse(); o.onInput(v); });
  input.addEventListener('change', () => o.onChange(+input.value));
  const commit = () => { const t = parseFloat(num.value.replace(',', '.')); if (!Number.isFinite(t)) { show(+input.value); return; } const v = snap(t); input.value = String(v); paint(v); show(v); pulse(); o.onInput(v); o.onChange(v); };
  num.addEventListener('focus', () => num.select());
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { num.blur(); } else if (e.key === 'Escape') { show(+input.value); num.blur(); } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const v = snap(+input.value + (e.key === 'ArrowUp' ? 1 : -1) * o.step); input.value = String(v); paint(v); show(v); pulse(); o.onInput(v); o.onChange(v); } });
  num.addEventListener('change', commit);
  const set = (v: number) => { input.value = String(v); paint(v); show(v); };
  set(o.value);
  const el = h('div', { class: 'ui-field', title: o.hint ?? '' }, h('div', { class: 'ui-field-top' }, h('label', { text: o.label }), h('span', { class: 'ui-val' }, num, unit)), input);
  return { el, set };
}


/** Inputs column: everything the designer controls. Built from the param schema + the design system. */
export class Panel {
  readonly el: HTMLElement;
  private inputs = new Map<string, { set: (v: any) => void }>();
  onParam: (id: keyof Params, value: number | string, final: boolean) => void = () => {};
  onLook: (look: Look) => void = () => {};
  private swatchBtns: HTMLButtonElement[] = [];
  private finishBtns: HTMLButtonElement[] = [];
  private colorInput = h('input', { type: 'color', class: 'color-input', title: 'Custom color' }) as HTMLInputElement;
  private hexInput = h('input', { type: 'text', class: 'hex-input ui-num', maxlength: '7', spellcheck: 'false', 'aria-label': 'Hex color' }) as HTMLInputElement;
  private look: Look = { ...DEFAULT_LOOK };
  private material = 'PC/ABS';
  private body: HTMLElement;

  constructor(parts: { outline: HTMLElement; side: HTMLElement }) {
    const mark = h('div', { class: 'brand-mark' }); mark.innerHTML = brandMarkSvg('pm');
    this.body = h('div', { class: 'panel-body' });
    const collapse = h('button', { type: 'button', class: 'ui-btn icon-btn collapse-btn', title: 'Collapse this panel', 'aria-label': 'Collapse inputs panel', onClick: () => this.onCollapse() });
    collapse.innerHTML = icon('panelLeft', 17);
    this.el = h('aside', { class: 'inputs ui-root' },
      h('header', { class: 'brand' }, mark, h('div', { class: 'brand-name', text: 'Iteration' }), h('div', { class: 'head-tools' }, collapseAllButton(() => this.body), collapse)),
      this.body);
    // one Canvas section: the front outline pad and the side profile pad (both move to the canvas when expanded)
    this.expandBtn = h('button', { type: 'button', class: 'ui-btn icon-btn card-tool', 'aria-label': 'Expand the canvas', onClick: (e: Event) => { e.preventDefault(); e.stopPropagation(); this.onExpand(); } }) as HTMLButtonElement;
    this.setExpanded(false);
    this.body.append(this.card('Canvas', true, h('div', { class: 'canvas-stack' }, h('div', { class: 'canvas-slot' }, parts.outline), h('div', { class: 'canvas-slot' }, parts.side)), undefined, [this.expandBtn]));
    for (const g of GROUPS) this.body.append(this.card(g.label, g.open, h('div', { class: 'ui-card-body' }, ...SCHEMA.filter((d) => d.group === g.id).map((d) => this.row(d)))));
    this.body.append(this.card('Material', true, this.materialBody()));
    this.body.append(this.card('Core', false, this.coreBody(), 'global'));
    [...this.body.querySelectorAll(':scope > .ui-card')].slice(0, 1).forEach((c) => c.classList.add('sketch-card')); // Canvas (both pads) moves to the canvas when expanded
  }

  private expandBtn!: HTMLButtonElement;
  onExpand: () => void = () => {};
  /** one control expands both canvases into the stage */
  setExpanded(on: boolean) {
    this.expandBtn.innerHTML = icon(on ? 'shrink' : 'expand', 15);
    this.expandBtn.title = on ? 'Back to the panel' : 'Expand into the canvas';
  }

  private card(title: string, open: boolean, content: HTMLElement, tag?: string, tools?: HTMLElement[]) {
    return h('details', { class: 'ui-card', open: open ? true : undefined },
      h('summary', { class: tools ? 'has-tools' : undefined }, h('span', { text: title }), tag ? h('span', { class: 'ui-tag', text: tag }) : null, tools ? h('span', { class: 'card-tools' }, ...tools) : null), h('div', { class: 'ui-card-body' }, content));
  }

  private fields = new Map<string, HTMLElement>();

  private row(d: ParamDef) {
    if (d.kind === 'toggle') {
      const input = h('input', { type: 'checkbox', class: 'ui-switch-input', 'aria-label': d.label }) as HTMLInputElement;
      input.addEventListener('change', () => { this.dimDependents(d.id as string, input.checked); this.onParam(d.id, input.checked as any, true); });
      this.inputs.set(d.id, { set: (v: boolean) => { input.checked = !!v; this.dimDependents(d.id as string, !!v); } });
      return h('label', { class: 'ui-field ui-switch-row', title: d.hint ?? '' }, h('span', { class: 'ui-switch-label', text: d.label }), input, h('span', { class: 'ui-switch' }));
    }
    if (d.kind === 'range') {
      const rc = rangeControl({ label: d.label, min: d.min!, max: d.max!, step: d.step!, unit: d.unit, value: d.default as number, hint: d.hint, onInput: (v) => this.onParam(d.id, v, false), onChange: (v) => this.onParam(d.id, v, true) });
      this.inputs.set(d.id, { set: rc.set });
      this.fields.set(d.id as string, rc.el);
      return rc.el;
    }
    const seg = h('div', { class: 'ui-seg' });
    const btns = d.options!.map((o) => h('button', { type: 'button', text: o, onClick: () => { this.inputs.get(d.id)!.set(o); if (d.id === 'material') { this.material = o; this.refreshFinishes(); } this.onParam(d.id, o, true); } }));
    btns.forEach((b) => seg.append(b));
    this.inputs.set(d.id, { set: (v: string) => { btns.forEach((b) => b.classList.toggle('on', b.textContent === v)); if (d.id === 'eyes') this.dimEyes(v); } });
    const eField = h('div', { class: 'ui-field' }, h('div', { class: 'ui-field-top' }, h('label', { text: d.label })), seg);
    this.fields.set(d.id as string, eField);
    return eField;
  }

  private materialBody() {
    const sw = h('div', { class: 'swatches' });
    SWATCHES.forEach((c) => {
      const b = h('button', { type: 'button', class: 'ui-swatch', title: c.label, style: `--c:${c.hex}`, onClick: () => this.setColor(c.hex, true) }) as HTMLButtonElement;
      b.dataset.hex = c.hex.toLowerCase(); this.swatchBtns.push(b); sw.append(b);
    });
    this.colorInput.addEventListener('input', () => this.setColor(this.colorInput.value, true));
    this.hexInput.addEventListener('change', () => {
      const v = this.hexInput.value.startsWith('#') ? this.hexInput.value : '#' + this.hexInput.value;
      if (isHex(v)) this.setColor(v, true); else this.hexInput.value = this.look.color;
    });
    const fin = h('div', { class: 'ui-seg finish-seg' });
    FINISHES.forEach((f) => {
      const b = h('button', { type: 'button', text: f.label, title: f.note, onClick: () => { this.look.finish = f.id; this.paintLook(); this.onLook({ ...this.look }); } }) as HTMLButtonElement;
      b.dataset.id = f.id; this.finishBtns.push(b); fin.append(b);
    });
    const matRow = this.row(SCHEMA.find((d) => d.id === 'material')!); matRow.querySelector('.ui-field-top')?.remove(); // the card is already called Material
    return h('div', { class: 'ui-card-body material-body' }, matRow, fin, h('div', { class: 'swatches' }, ...Array.from(sw.children), this.colorInput));
  }

  /** the plateau slider only matters while the flat core seat is on */
  private dimDependents(id: string, on: boolean) { if (id === 'corePlateau') this.fields.get('plateau')?.classList.toggle('dim', !on); }
  /** the eye controls only matter for the eyes that exist */
  private dimEyes(mode: string) { for (const k of ['eyeSize', 'eyeHeight', 'eyeType']) this.fields.get(k)?.classList.toggle('dim', mode === 'none'); this.fields.get('eyeSpacing')?.classList.toggle('dim', mode !== 'two'); }

  /** only finishes that are plausible for the chosen material are offered */
  private refreshFinishes() {
    const m = materialById(this.material);
    this.finishBtns.forEach((b) => b.classList.toggle('hidden', !m.finishes.includes(b.dataset.id!)));
  }

  private coreSliders = new Map<CoreKey, { set: (v: number) => void }>();
  onCore: (k: CoreKey, v: number, final: boolean) => void = () => {};
  onCollapse: () => void = () => {};

  private coreRow(k: CoreKey) {
    const r = CORE_RANGES[k];
    const rc = rangeControl({ label: r.label, min: r.min, max: r.max, step: r.step, unit: 'mm', value: getCore(k), onInput: (v) => this.onCore(k, v, false), onChange: (v) => this.onCore(k, v, true) });
    this.coreSliders.set(k, { set: rc.set });
    return rc.el;
  }
  /** sync the core sliders with the current CORE values (e.g. after the clamp in setCore) */
  setCoreValues() { for (const [k, c] of this.coreSliders) c.set(getCore(k)); }

  private coreBody() {
    return h('div', { class: 'ui-card-body' }, ...(['puckDiameter', 'puckDepth', 'domeHeight', 'edgeRadius', 'magnetGap'] as CoreKey[]).map((k) => this.coreRow(k)));
  }

  private setColor(hex: string, emit: boolean) {
    this.look.color = hex.toUpperCase(); this.paintLook();
    if (emit) this.onLook({ ...this.look });
  }
  private paintLook() {
    const hex = this.look.color.toLowerCase();
    this.colorInput.value = hex; this.hexInput.value = this.look.color;
    this.swatchBtns.forEach((b) => b.classList.toggle('on', b.dataset.hex === hex));
    this.finishBtns.forEach((b) => b.classList.toggle('on', b.dataset.id === this.look.finish));
    this.refreshFinishes();
  }
  setLook(look: Look) { this.look = { ...look }; this.paintLook(); }
  setParams(p: Params) { for (const [k, v] of Object.entries(p)) this.inputs.get(k)?.set(v as any); this.material = p.material; this.refreshFinishes(); }
  lock(on: boolean) { this.el.classList.toggle('locked', on); }
}
