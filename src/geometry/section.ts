/** Intersect a quad mesh with the plane (axis = value). Returns flat segment endpoints [x1,y1,z1,x2,y2,z2,...]. Pure. */
export function sectionSegments(pos: ArrayLike<number>, faces: Uint32Array, axis: 0 | 1 | 2, value: number): Float32Array {
  const out: number[] = [];
  const tri = (a: number, b: number, c: number) => {
    const d = [pos[a * 3 + axis] - value, pos[b * 3 + axis] - value, pos[c * 3 + axis] - value];
    const idx = [a, b, c], pts: number[][] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if ((d[i] < 0) !== (d[j] < 0)) {
        const t = d[i] / (d[i] - d[j]), p = idx[i] * 3, q = idx[j] * 3;
        pts.push([pos[p] + (pos[q] - pos[p]) * t, pos[p + 1] + (pos[q + 1] - pos[p + 1]) * t, pos[p + 2] + (pos[q + 2] - pos[p + 2]) * t]);
      }
    }
    if (pts.length === 2) out.push(...pts[0], ...pts[1]);
  };
  for (let f = 0; f < faces.length; f += 4) { tri(faces[f], faces[f + 1], faces[f + 2]); tri(faces[f], faces[f + 2], faces[f + 3]); }
  return new Float32Array(out);
}

/** the body seen from the side: at each height (mm, bottom = 0 upward) how far it reaches to the front (+z) and the back (-z) */
export type SideProfileCurve = { ys: number[]; front: number[]; back: number[] };

/**
 * The outline you see looking at the body from the side: at every height, the furthest it reaches to the front and to the
 * back across ALL of it, not just the centre slice (a slice at x = 0 runs between the feet and shows the gap, not the body).
 * Exact for a polygon mesh: every edge is sampled along its length (not just its corners), so the result has no
 * vertex-spacing jaggedness; a light smoothing then removes the remaining stair-steps. Pure.
 */
export function sideProfileOf(pos: ArrayLike<number>, faces: Uint32Array, step = 0.4): SideProfileCurve {
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 1; i < pos.length; i += 3) { if (pos[i] < ymin) ymin = pos[i]; if (pos[i] > ymax) ymax = pos[i]; }
  if (!(ymax > ymin)) return { ys: [], front: [], back: [] };
  const n = Math.max(3, Math.ceil((ymax - ymin) / step) + 1), front = new Float32Array(n).fill(-Infinity), back = new Float32Array(n).fill(Infinity);
  const touch = (y: number, z: number) => { const k = Math.min(n - 1, Math.max(0, Math.round((y - ymin) / step))); if (z > front[k]) front[k] = z; if (z < back[k]) back[k] = z; };
  const edge = (a: number, b: number) => {
    const y0 = pos[a * 3 + 1], z0 = pos[a * 3 + 2], y1 = pos[b * 3 + 1], z1 = pos[b * 3 + 2], len = Math.hypot(y1 - y0, z1 - z0), m = Math.max(1, Math.ceil(len / (step * 0.5)));
    for (let k = 0; k <= m; k++) { const t = k / m; touch(y0 + (y1 - y0) * t, z0 + (z1 - z0) * t); }
  };
  for (let f = 0; f < faces.length; f += 4) for (let i = 0; i < 4; i++) edge(faces[f + i], faces[f + ((i + 1) & 3)]);
  const ys: number[] = [], F: number[] = [], B: number[] = [];
  for (let k = 0; k < n; k++) if (Number.isFinite(front[k]) && Number.isFinite(back[k])) { ys.push(ymin + k * step - ymin); F.push(front[k]); B.push(back[k]); }
  const soft = (a: number[]) => { // binomial smoothing, twice, ends held
    let cur = a;
    for (let pass = 0; pass < 2; pass++) { const nx = cur.slice(); for (let i = 2; i < cur.length - 2; i++) nx[i] = (cur[i - 2] + 4 * cur[i - 1] + 6 * cur[i] + 4 * cur[i + 1] + cur[i + 2]) / 16; cur = nx; }
    return cur;
  };
  return { ys, front: soft(F), back: soft(B) };
}

/** the same outline as closed segment endpoints [x1,y1,z1,x2,y2,z2,...] (x = 0). Pure. */
export function sideSilhouette(pos: ArrayLike<number>, faces?: Uint32Array, step = 0.5): Float32Array {
  if (!faces) return new Float32Array(0);
  const c = sideProfileOf(pos, faces, step), out: number[] = [], seg = (y1: number, z1: number, y2: number, z2: number) => out.push(0, y1, z1, 0, y2, z2);
  for (let i = 0; i + 1 < c.ys.length; i++) { seg(c.ys[i], c.front[i], c.ys[i + 1], c.front[i + 1]); seg(c.ys[i], c.back[i], c.ys[i + 1], c.back[i + 1]); }
  const last = c.ys.length - 1; if (last > 0) { seg(c.ys[0], c.front[0], c.ys[0], c.back[0]); seg(c.ys[last], c.front[last], c.ys[last], c.back[last]); }
  return new Float32Array(out);
}
