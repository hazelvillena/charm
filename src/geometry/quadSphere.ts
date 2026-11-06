import { QuadMesh, signedVolume } from './mesh';

export type QuadSphere = {
  N: number;
  faces: Uint32Array;
  unit: Float32Array; // unit-sphere positions (x, y, z), +Z is the puck side
  vertCount: number;
};

/** Welded, equiangular cube-sphere: all quads, no poles, 8 valence-3 corners. +Z face center is a vertex (N even). */
export function buildQuadSphere(N = 8): QuadSphere {
  const idx = new Map<number, number>();
  const unit: number[] = [];
  const key = (i: number, j: number, k: number) => (i * (N + 1) + j) * (N + 1) + k;
  const vert = (i: number, j: number, k: number) => {
    const kk = key(i, j, k);
    let id = idx.get(kk);
    if (id === undefined) {
      id = unit.length / 3; idx.set(kk, id);
      const c = [i, j, k].map((q) => Math.tan((Math.PI / 4) * ((2 * q) / N - 1)));
      const l = Math.hypot(c[0], c[1], c[2]);
      unit.push(c[0] / l, c[1] / l, c[2] / l);
    }
    return id;
  };
  const faces: number[] = [];
  for (let a = 0; a < 3; a++) for (const s of [0, N]) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const P = (di: number, dj: number) => {
        const c = [0, 0, 0]; c[a] = s; c[u] = i + di; c[v] = j + dj; return vert(c[0], c[1], c[2]);
      };
      const q = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
      if (s === 0) q.reverse();
      faces.push(...q);
    }
  }
  const f = new Uint32Array(faces);
  const u = new Float32Array(unit);
  if (signedVolume(u, f) < 0) for (let i = 0; i < f.length; i += 4) { const t = f[i + 1]; f[i + 1] = f[i + 3]; f[i + 3] = t; }
  return { N, faces: f, unit: u, vertCount: u.length / 3 };
}

export const asQuadMesh = (qs: QuadSphere): QuadMesh => ({ positions: qs.unit, faces: qs.faces });
