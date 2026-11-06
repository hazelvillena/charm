import { h } from './dom';
let host: HTMLElement | null = null;
export function toast(msg: string, kind: 'info' | 'warn' | 'error' = 'info', ms = 4200) {
  if (!host) { host = h('div', { class: 'toasts' }); document.body.appendChild(host); }
  const t = h('div', { class: `toast ${kind}`, text: msg });
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}
