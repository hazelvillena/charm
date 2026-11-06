import { h } from './dom';
import { Iteration } from '../library';

/** Popover grid of saved iterations. Thumbnails, size and check status stay live when global params change. */
export class LibraryPanel {
  readonly el: HTMLElement;
  private grid = h('div', { class: 'lib-grid' });
  private empty = h('div', { class: 'ui-tag-note empty-note' }, h('span', { text: 'Empty. ' }), h('button', { type: 'button', class: 'link-btn', text: 'Add the starter shapes', onClick: () => this.onStarters() }));
  onStarters: () => void = () => {};
  onSave: () => void = () => {};
  onLoad: (id: string) => void = () => {};
  onDelete: (id: string) => void = () => {};
  onStar: (id: string) => void = () => {};
  private currentId: string | null = null;
  private note = h('div', { class: 'ui-tag-note lib-note hidden' });
  private saveBtn = h('button', { type: 'button', class: 'ui-btn primary hidden', text: 'Save as new', onClick: () => this.onSave() }) as HTMLButtonElement;
  private busy = h('span', { class: 'lib-busy ui-tag hidden', text: 'updating…' });

  constructor() {
    this.el = h('div', { class: 'lib-pop ui-float closed' },
      h('div', { class: 'lib-head' }, h('b', { text: 'Library' }), this.busy, this.saveBtn),
      this.note, this.grid, this.empty);
    document.addEventListener('pointerdown', (e) => { const t = e.target as HTMLElement; if (!t.closest('.lib-pop') && !t.closest('.lib-btn')) this.hide(); });
  }
  /** only offered when there is genuinely something to save */
  setCanSave(on: boolean) { this.saveBtn.classList.toggle('hidden', !on); }
  toggle() { this.el.classList.toggle('closed'); }
  hide() { this.el.classList.add('closed'); }
  setBusy(b: boolean) { this.busy.classList.toggle('hidden', !b); }
  setCurrent(id: string | null) { this.currentId = id; this.grid.querySelectorAll('.lib-card').forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.id === id)); }

  render(items: Iteration[]) {
    this.empty.classList.toggle('hidden', items.length > 0);
    // when every shape fails together the cause is a shared setting (Core size, wall), so say that once instead of turning every card red
    const shared = items.length > 1 && items.every((it) => it.failing && it.failing.length > 0);
    this.note.classList.toggle('hidden', !shared); this.note.textContent = shared ? 'None of these fit with the current Core and Wall settings.' : '';
    this.grid.replaceChildren(...items.map((it) => {
      const img = h('div', { class: 'lib-thumb' }); if (it.thumb) img.style.backgroundImage = `url(${it.thumb})`;
      const ok = shared || !it.failing || it.failing.length === 0;
      const del = h('button', { type: 'button', class: 'lib-del', title: 'Delete', text: '×', onClick: (e: Event) => { e.stopPropagation(); this.onDelete(it.id); } });
      const star = h('button', { type: 'button', class: 'lib-star' + (it.starred ? ' on' : ''), title: it.starred ? 'Unstar (remove from the top bar)' : 'Star (keep in the top bar)', 'aria-label': 'Star', onClick: (e: Event) => { e.stopPropagation(); this.onStar(it.id); } });
      star.innerHTML = '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M10 2.8l2.1 4.5 4.9.6-3.6 3.4.9 4.9L10 13.7 5.7 16.2l.9-4.9L3 7.9l4.9-.6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="currentColor" fill-opacity="0"/></svg>';
      const card = h('div', { class: 'lib-card' + (it.id === this.currentId ? ' on' : ''), 'data-id': it.id, tabindex: '0', title: ok ? 'All checks pass' : `Failing: ${it.failing!.join(', ')}`, onClick: () => this.onLoad(it.id) },
        img, del, star,
        h('div', { class: 'lib-meta' }, h('b', { text: it.name }), h('small', { class: ok ? '' : 'bad' }, h('i', { class: ok ? 'ok' : 'bad' }), it.sizeMm ? `${it.material ?? it.params.material} · ${Math.round(it.sizeMm[0])} × ${Math.round(it.sizeMm[1])}` : (it.material ?? it.params.material), ok ? '' : ` · ${it.failing!.length} failing`)));
      return card;
    }));
  }
}
