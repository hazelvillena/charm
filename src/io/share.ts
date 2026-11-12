import { Outline, clampOutline, isOutlineValid } from '../params/outline';
import { Params, sanitizeParams } from '../params/schema';
import { DEFAULT_LOOK, FINISHES, Look, isHex, finishAllowed, defaultFinishFor } from '../../design/finishes';

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeShare(params: Params, outline: Outline, look: Look = DEFAULT_LOOK, name = ''): string {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return b64(JSON.stringify({ v: 2, p: params, o: { phi: outline.phi.map(r), r: outline.r.map(r), s: r(outline.smooth ?? 1), ...(outline.left ? { lp: outline.left.phi.map(r), lr: outline.left.r.map(r) } : {}) }, l: look, n: name.slice(0, 40) }));
}

/** Returns null when the payload is missing or unusable; always returns repaired, in-range values otherwise. */
export function decodeShare(code: string): { params: Params; outline: Outline; look: Look; name: string } | null {
  try {
    const j = JSON.parse(unb64(code));
    const params = sanitizeParams(j.p);
    const o: Outline = { phi: Array.from(j.o?.phi ?? []), r: Array.from(j.o?.r ?? []), smooth: typeof j.o?.s === 'number' ? j.o.s : 1 };
    if (Array.isArray(j.o?.lp) && Array.isArray(j.o?.lr)) o.left = { phi: Array.from(j.o.lp), r: Array.from(j.o.lr) }; // an outline with its own left half (not mirrored)
    if (!isOutlineValid(o)) return null;
    const look: Look = {
      color: isHex(j.l?.color) ? j.l.color : DEFAULT_LOOK.color,
      finish: FINISHES.some((f) => f.id === j.l?.finish) ? j.l.finish : DEFAULT_LOOK.finish,
    };
    if (!finishAllowed(params.material, look.finish)) look.finish = defaultFinishFor(params.material);
    return { params, outline: clampOutline(o, params.wall), look, name: typeof j.n === 'string' ? j.n.slice(0, 40) : '' };
  } catch { return null; }
}
