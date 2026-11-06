import { Outline, OUTLINE_POINTS, clampOutline, isOutlineValid } from '../params/outline';
import { Params, sanitizeParams } from '../params/schema';

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeShare(params: Params, outline: Outline): string {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return b64(JSON.stringify({ v: 1, p: params, o: { phi: outline.phi.map(r), r: outline.r.map(r) } }));
}

/** Returns null when the payload is missing or unusable; always returns repaired, in-range values otherwise. */
export function decodeShare(code: string): { params: Params; outline: Outline } | null {
  try {
    const j = JSON.parse(unb64(code));
    const params = sanitizeParams(j.p);
    const o: Outline = { phi: Array.from(j.o?.phi ?? []), r: Array.from(j.o?.r ?? []) } as Outline;
    if (o.phi.length !== OUTLINE_POINTS || !isOutlineValid(o)) return null;
    return { params, outline: clampOutline(o, params.wall) };
  } catch { return null; }
}
