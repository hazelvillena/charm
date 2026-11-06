import { edgeKey } from './mesh';

const edgeCache = new WeakMap<Uint32Array, Uint32Array>();
function uniqueEdges(faces: Uint32Array): Uint32Array {
  let e = edgeCache.get(faces);
  if (e) return e;
  const seen = new Set<number>(), list: number[] = [];
  for (let f = 0; f < faces.length; f += 4) for (let i = 0; i < 4; i++) {
    const a = faces[f + i], b = faces[f + ((i + 1) & 3)], k = a < b ? a * 1048576 + b : b * 1048576 + a;
    if (!seen.has(k)) { seen.add(k); list.push(a, b); }
  }
  e = new Uint32Array(list); edgeCache.set(faces, e); return e;
}

/** Local radius of curvature per vertex (mm), from how fast the normal turns along each edge. Infinity = flat. */
export function curvatureRadii(pos: ArrayLike<number>, nor: ArrayLike<number>, faces: Uint32Array): Float32Array {
  const n = pos.length / 3, kappa = new Float32Array(n), e = uniqueEdges(faces);
  for (let k = 0; k < e.length; k += 2) {
    const a = e[k], b = e[k + 1];
    const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
    const dn = Math.hypot(nor[a * 3] - nor[b * 3], nor[a * 3 + 1] - nor[b * 3 + 1], nor[a * 3 + 2] - nor[b * 3 + 2]);
    const c = dn / Math.max(1e-6, Math.hypot(dx, dy, dz));
    if (c > kappa[a]) kappa[a] = c; if (c > kappa[b]) kappa[b] = c;
  }
  return kappa.map((c) => (c < 1e-4 ? Infinity : 1 / c));
}

