import { h } from './dom';

/**
 * Quiet modal dialogs over a soft blur (design/components.css: .ui-scrim, .ui-dialog). Each returns a promise;
 * Esc or a click outside cancels (null), Enter confirms.
 */
function open<T>(build: (done: (v: T | null) => void, card: HTMLElement) => HTMLElement[], focusSel?: string): Promise<T | null> {
  return new Promise((resolve) => {
    const card = h('div', { class: 'ui-dialog', role: 'dialog', 'aria-modal': 'true' });
    const scrim = h('div', { class: 'ui-scrim' }, card);
    const prevFocus = document.activeElement as HTMLElement | null;
    let closed = false;
    const done = (v: T | null) => {
      if (closed) return; closed = true;
      scrim.classList.remove('shown'); document.removeEventListener('keydown', onKey, true);
      setTimeout(() => { scrim.remove(); prevFocus?.focus?.(); }, 260); resolve(v);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) done(null); });
    card.append(...build(done, card));
    document.body.append(scrim);
    requestAnimationFrame(() => { scrim.classList.add('shown'); (card.querySelector(focusSel ?? 'button.primary') as HTMLElement | null)?.focus(); });
  });
}

const btn = (text: string, cls: string, on: () => void) => h('button', { type: 'button', class: `ui-btn ${cls}`.trim(), text, onClick: on }) as HTMLButtonElement;

/** the iteration already exists: replace it, keep it and add a new one, or leave */
export function replaceOrNew(name: string): Promise<'replace' | 'new' | null> {
  return open<'replace' | 'new'>((done) => [
    h('h3', { class: 'ui-dialog-title', text: `Replace “${name}”?` }),
    h('p', { class: 'ui-dialog-text', text: 'This overwrites the saved version with what you have now.' }),
    h('div', { class: 'ui-dialog-actions' }, btn('Cancel', 'quiet', () => done(null)), btn('Save as new', '', () => done('new')), btn('Replace', 'primary', () => done('replace'))),
  ]);
}

/** a new iteration: name it, and optionally keep it in the favourites bar */
export function nameNew(defaultName: string): Promise<{ name: string; starred: boolean } | null> {
  return open<{ name: string; starred: boolean }>((done) => {
    const input = h('input', { type: 'text', class: 'ui-dialog-input', maxlength: '40', value: defaultName, placeholder: 'Name this iteration', 'aria-label': 'Iteration name', spellcheck: 'false' }) as HTMLInputElement;
    const star = h('input', { type: 'checkbox', class: 'ui-switch-input', 'aria-label': 'Add to favourites' }) as HTMLInputElement;
    const row = h('label', { class: 'ui-switch-row ui-dialog-row' }, h('span', { class: 'ui-switch-label', text: 'Add to favourites' }), star, h('span', { class: 'ui-switch' }));
    const ok = () => done({ name: input.value.trim() || defaultName || 'Untitled', starred: star.checked });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    setTimeout(() => { input.focus(); input.select(); }, 60);
    return [
      h('h3', { class: 'ui-dialog-title', text: 'Save as new' }),
      input, row,
      h('div', { class: 'ui-dialog-actions' }, btn('Cancel', 'quiet', () => done(null)), btn('Save', 'primary', ok)),
    ];
  }, 'input.ui-dialog-input');
}
