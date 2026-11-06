import { icon } from './icons';
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined) el.append(c as any);
  return el;
}
export function svg(tag: string, attrs: Record<string, any> = {}): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** A small icon button that folds every card in a panel (or opens them all when none is open). */
export function collapseAllButton(scope: () => HTMLElement): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'ui-btn icon-btn collapse-all', title: 'Collapse or expand all sections', 'aria-label': 'Collapse or expand all sections' }) as HTMLButtonElement;
  b.innerHTML = icon('collapseAll', 17);
  b.addEventListener('click', () => {
    const cards = Array.from(scope().querySelectorAll('details.ui-card')) as HTMLDetailsElement[];
    const anyOpen = cards.some((c) => c.open); cards.forEach((c) => { c.open = !anyOpen; });
  });
  return b;
}

/**
 * The unroll pattern (see design/components.css): a trigger button whose icon spins once while `content` rolls out beside it.
 * Returns the wrapper to place in the page, plus set/isOpen. `closeOnOutside` closes it when the user clicks elsewhere.
 */
export function unroll(trigger: HTMLElement, content: Node[], opts: { open?: boolean; closeOnOutside?: boolean; side?: 'right' | 'down'; onToggle?: (open: boolean) => void } = {}) {
  const el = h('div', { class: 'ui-unroll' }, trigger, h('div', { class: 'ui-unroll-body' }, h('div', { class: 'ui-unroll-inner' }, h('div', { class: 'ui-unroll-card' }, ...content))));
  trigger.classList.add('ui-unroll-btn'); if (opts.side === 'down') el.classList.add('toward-down');
  const set = (open: boolean, animate = true) => {
    const was = el.classList.contains('open'); el.classList.toggle('open', open); trigger.setAttribute('aria-expanded', String(open)); opts.onToggle?.(open);
    if (animate && was !== open) { // one full turn of the icon, every time
      trigger.classList.remove('spin-open', 'spin-close'); void trigger.offsetWidth; trigger.classList.add(open ? 'spin-open' : 'spin-close');
      const done = () => { trigger.classList.remove('spin-open', 'spin-close'); trigger.removeEventListener('animationend', done, true); };
      trigger.addEventListener('animationend', done, true);
    }
  };
  trigger.addEventListener('click', () => set(!el.classList.contains('open')));
  if (opts.closeOnOutside) document.addEventListener('pointerdown', (e) => { if (!el.contains(e.target as Node)) set(false); });
  set(!!opts.open, false);
  return { el, set: (o: boolean) => set(o), isOpen: () => el.classList.contains('open') };
}
