import '@fontsource-variable/instrument-sans';
import { h } from './ui/dom';
import { brandMarkSvg, BRAND_NAME } from '../design/brand';

/**
 * A soft gate in front of the app: a white page asking for the password. The password is only stored as a SHA-256 hash and
 * the app itself is loaded only after it is entered. This keeps casual visitors out; it is not real security (anything the
 * browser can load can be read), so do not rely on it for anything private.
 */
const HASH = 'f1360b532051d802dda4750e0c807c07f0730db3220f84c76890a994b12a5d39';
const KEY = 'clayground:unlocked';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const remembered = () => { try { return sessionStorage.getItem(KEY) === HASH; } catch { return false; } };

function ask(): Promise<void> {
  return new Promise((resolve) => {
    const mark = h('div', { class: 'ui-gate-mark' }); mark.innerHTML = brandMarkSvg('gt');
    const input = h('input', { type: 'password', class: 'ui-dialog-input ui-gate-input', placeholder: 'Password', 'aria-label': 'Password', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const note = h('div', { class: 'ui-gate-note', 'aria-live': 'polite' });
    const go = h('button', { type: 'submit', class: 'ui-btn primary', text: 'Enter' }) as HTMLButtonElement;
    const form = h('form', { class: 'ui-gate-form' }, input, go);
    const page = h('div', { class: 'ui-gate' }, h('div', { class: 'ui-gate-card' }, mark, h('h1', { class: 'ui-gate-title', text: BRAND_NAME }), form, note));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); go.disabled = true; note.textContent = '';
      let ok = false;
      try { ok = (await sha256(input.value.trim())) === HASH; } catch { ok = false; }
      go.disabled = false;
      if (!ok) { note.textContent = 'Not quite. Try again.'; input.select(); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); return; }
      try { sessionStorage.setItem(KEY, HASH); } catch { /* optional */ }
      page.classList.add('leaving'); setTimeout(() => { page.remove(); resolve(); }, 380);
    });
    document.body.append(page);
    input.focus();
  });
}

(async () => {
  if (!remembered()) await ask();
  await import('./main');
})();
