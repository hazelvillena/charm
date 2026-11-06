export type QuadMesh = { positions: Float32Array; faces: Uint32Array };

export function edgeKey(a: number, b: number): number { return a < b ? a * 4194304 + b : b * 4194304 + a; }

/** Every edge shared by exactly 2 faces, no degenerate faces, Euler characteristic 2 (sphere). */
export function closureReport(faces: Uint32Array, vertCount: number) {
  const E = new Map<number, number>();
  const F = faces.length / 4;
  for (let f = 0; f < F; f++) for (let i = 0; i < 4; i++) {
    const a = faces[f * 4 + i], b = faces[f * 4 + ((i + 1) & 3)];
    if (a === b) return { closed: false, euler: NaN, edges: E.size, degenerate: true };
    const k = edgeKey(a, b); E.set(k, (E.get(k) ?? 0) + 1);
  }
  let closed = true;
  for (const c of E.values()) if (c !== 2) { closed = false; break; }
  return { closed, euler: vertCount - E.size + F, edges: E.size, degenerate: false };
}

export function triangulate(faces: Uint32Array): Uint32Array {
  const F = faces.length / 4, t = new Uint32Array(F * 6);
  for (let f = 0; f < F; f++) {
    const a = faces[f * 4], b = faces[f * 4 + 1], c = faces[f * 4 + 2], d = faces[f * 4 + 3];
    t.set([a, b, c, a, c, d], f * 6);
  }
  return t;
}

/** signed volume of the triangulated quad mesh (positive when faces point outward) */
export function signedVolume(pos: ArrayLike<number>, faces: Uint32Array): number {
  let v = 0;
  const F = faces.length / 4;
  const P = (i: number) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  for (let f = 0; f < F; f++) {
    const [a, b, c, d] = [0, 1, 2, 3].map((k) => P(faces[f * 4 + k]));
    for (const [p, q, r] of [[a, b, c], [a, c, d]]) {
      v += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6;
    }
  }
  return v;
}

export function minFaceArea(pos: ArrayLike<number>, faces: Uint32Array): number {
  let min = Infinity;
  const F = faces.length / 4;
  for (let f = 0; f < F; f++) {
    const i = [0, 1, 2, 3].map((k) => faces[f * 4 + k] * 3);
    // area of quad via two triangles
    let area = 0;
    for (const [p, q, r] of [[0, 1, 2], [0, 2, 3]]) {
      const ux = pos[i[q]] - pos[i[p]], uy = pos[i[q] + 1] - pos[i[p] + 1], uz = pos[i[q] + 2] - pos[i[p] + 2];
      const vx = pos[i[r]] - pos[i[p]], vy = pos[i[r] + 1] - pos[i[p] + 1], vz = pos[i[r] + 2] - pos[i[p] + 2];
      area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    }
    if (area < min) min = area;
  }
  return min;
}

export function allFinite(a: ArrayLike<number>): boolean {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}

export function bounds(pos: ArrayLike<number>) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
    const v = pos[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v;
  }
  return { min: mn, max: mx, size: mx.map((m, k) => m - mn[k]) };
}
