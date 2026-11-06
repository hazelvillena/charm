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

/**
 * The outline you see looking at the body from the side: at every height, the furthest the body reaches to the front (+z)
 * and to the back (-z) across ALL of it, not just the centre slice. (A slice at x = 0 runs between the feet and shows the
 * gap, not the body.) Returned as closed segment endpoints [x1,y1,z1,x2,y2,z2,...] with x = 0. Pure.
 */
export function sideSilhouette(pos: ArrayLike<number>, step = 0.5): Float32Array {
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 1; i < pos.length; i += 3) { if (pos[i] < ymin) ymin = pos[i]; if (pos[i] > ymax) ymax = pos[i]; }
  if (!(ymax > ymin)) return new Float32Array(0);
  const n = Math.max(3, Math.ceil((ymax - ymin) / step) + 1), front = new Float32Array(n).fill(-Infinity), back = new Float32Array(n).fill(Infinity);
  for (let i = 0; i < pos.length; i += 3) {
    const k = Math.min(n - 1, Math.round((pos[i + 1] - ymin) / step)), z = pos[i + 2];
    if (z > front[k]) front[k] = z; if (z < back[k]) back[k] = z;
  }
  const ys: number[] = [], f: number[] = [], b: number[] = [];
  for (let k = 0; k < n; k++) if (Number.isFinite(front[k]) && Number.isFinite(back[k])) { ys.push(ymin + k * step); f.push(front[k]); b.push(back[k]); }
  const soft = (a: number[]) => a.map((v, i) => (i === 0 || i === a.length - 1 ? v : 0.25 * a[i - 1] + 0.5 * v + 0.25 * a[i + 1])); // removes vertex-spacing jitter, keeps the ends
  const F = soft(f), B = soft(b), out: number[] = [];
  const seg = (y1: number, z1: number, y2: number, z2: number) => out.push(0, y1, z1, 0, y2, z2);
  for (let i = 0; i + 1 < ys.length; i++) { seg(ys[i], F[i], ys[i + 1], F[i + 1]); seg(ys[i], B[i], ys[i + 1], B[i + 1]); }
  const last = ys.length - 1;
  seg(ys[0], F[0], ys[0], B[0]); seg(ys[last], F[last], ys[last], B[last]);
  return new Float32Array(out);
}
