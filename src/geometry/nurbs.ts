/**
 * Exact NURBS from the SubD cage. The cage's Catmull-Clark limit surface is sampled on a regular grid inside every cage
 * quad (exact limit positions, from the subdivided mesh), and each quad becomes one bicubic NURBS patch that interpolates
 * those samples. Neighbouring patches share exactly the same boundary samples, so they meet with no gaps and no T-junctions.
 * Pure functions, no DOM.
 */

/** Exact limit-surface position of every vertex of a closed quad mesh (Halstead et al. stencil). Returns xyz as doubles. */
export function limitPositions(pos: ArrayLike<number>, faces: Uint32Array, vertCount: number): Float64Array {
  const n = new Uint32Array(vertCount), E = new Float64Array(vertCount * 3), F = new Float64Array(vertCount * 3);
  for (let f = 0; f < faces.length; f += 4) for (let i = 0; i < 4; i++) {
    const v = faces[f + i], nx = faces[f + ((i + 1) & 3)], op = faces[f + ((i + 2) & 3)];
    n[v]++;
    for (let k = 0; k < 3; k++) { E[v * 3 + k] += pos[nx * 3 + k]; F[v * 3 + k] += pos[op * 3 + k]; } // each edge neighbour is the "next" corner of exactly one incident face
  }
  const out = new Float64Array(vertCount * 3);
  for (let v = 0; v < vertCount; v++) {
    const m = n[v] || 1, d = m * (m + 5);
    for (let k = 0; k < 3; k++) out[v * 3 + k] = (m * m * pos[v * 3 + k] + 4 * E[v * 3 + k] + F[v * 3 + k]) / d;
  }
  return out;
}

/**
 * For every cage quad, the (m+1)^2 limit points on its parameter grid, m = 2^level. Index [i * (m + 1) + j]: i along
 * v0 -> v1 (u), j along v0 -> v3 (v). `levelFaces` are the faces of the cage subdivided `level` times; Catmull-Clark
 * children of face p are 4p..4p+3, child k being [v_k, edge_k, centre, edge_k-1].
 */
export function cageFaceGrids(cageFaceCount: number, level: number, levelFaces: Uint32Array, limit: Float64Array): Float64Array[] {
  const m = 2 ** level, per = 4 ** level, grids: Float64Array[] = [];
  for (let cf = 0; cf < cageFaceCount; cf++) {
    const g = new Float64Array((m + 1) * (m + 1) * 3);
    for (let s = 0; s < per; s++) {
      let P: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let d = level - 1; d >= 0; d--) { // digits of s, most significant first
        const k = Math.floor(s / 4 ** d) % 4, a = P[k], b = P[(k + 1) & 3], c = P[(k + 3) & 3];
        const mid = (p: [number, number], q: [number, number]): [number, number] => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        P = [a, mid(a, b), [(P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4], mid(c, a)];
      }
      const face = cf * per + s;
      for (let c = 0; c < 4; c++) {
        const i = Math.round(P[c][0] * m), j = Math.round(P[c][1] * m), v = levelFaces[face * 4 + c];
        for (let k = 0; k < 3; k++) g[(i * (m + 1) + j) * 3 + k] = limit[v * 3 + k];
      }
    }
    grids.push(g);
  }
  return grids;
}

/** Cubic B-spline interpolation through m+1 uniformly spaced samples: knot vector and the inverse of the basis matrix. */
export function interpolation(m: number) {
  const n = m + 1, p = 3, t = Array.from({ length: n }, (_, i) => i / m);
  const U: number[] = [0, 0, 0, 0];
  for (let j = 1; j <= n - p - 1; j++) U.push((t[j] + t[j + 1] + t[j + 2]) / 3);
  U.push(1, 1, 1, 1);
  const span = (u: number) => { if (u >= 1) return n - 1; let s = p; while (s < n - 1 && u >= U[s + 1]) s++; return s; };
  const basis = (u: number): number[] => { // Cox-de Boor, the p + 1 non-zero functions
    const s = span(u), N = [1], L: number[] = [], R: number[] = [], out = new Array<number>(n).fill(0);
    for (let j = 1; j <= p; j++) {
      L[j] = u - U[s + 1 - j]; R[j] = U[s + j] - u; let saved = 0; const nn = new Array<number>(j + 1).fill(0);
      for (let r = 0; r < j; r++) { const tmp = N[r] / (R[r + 1] + L[j - r]); nn[r] = saved + R[r + 1] * tmp; saved = L[j - r] * tmp; }
      nn[j] = saved; for (let r = 0; r <= j; r++) N[r] = nn[r];
    }
    for (let r = 0; r <= p; r++) out[s - p + r] = N[r];
    return out;
  };
  const A = t.map((u) => basis(u));
  // invert A (small, well conditioned) by Gauss-Jordan
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c]; for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k]; }
  }
  const inv = M.map((row) => row.slice(n));
  // distinct knots and their multiplicities, as STEP wants them
  const distinct: number[] = [], mult: number[] = [];
  for (const u of U) { if (distinct.length && Math.abs(distinct[distinct.length - 1] - u) < 1e-12) mult[mult.length - 1]++; else { distinct.push(u); mult.push(1); } }
  return { n, knots: U, distinct, mult, inv };
}
export type Interp = ReturnType<typeof interpolation>;

/** control points (n x n x 3, [i][j]) of the bicubic patch through a sample grid */
export function patchControlPoints(grid: Float64Array, it: Interp): Float64Array {
  const { n, inv } = it, tmp = new Float64Array(n * n * 3), cp = new Float64Array(n * n * 3);
  for (let i = 0; i < n; i++) for (let l = 0; l < n; l++) for (let k = 0; k < 3; k++) { let s = 0; for (let q = 0; q < n; q++) s += inv[i][q] * grid[(q * n + l) * 3 + k]; tmp[(i * n + l) * 3 + k] = s; } // along u
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < 3; k++) { let s = 0; for (let l = 0; l < n; l++) s += inv[j][l] * tmp[(i * n + l) * 3 + k]; cp[(i * n + j) * 3 + k] = s; } // along v
  return cp;
}

/** control points (n x 3) of the curve through n samples (an edge shared by two patches) */
export function curveControlPoints(points: Float64Array, it: Interp): Float64Array {
  const { n, inv } = it, cp = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { let s = 0; for (let q = 0; q < n; q++) s += inv[i][q] * points[q * 3 + k]; cp[i * 3 + k] = s; }
  return cp;
}

/** evaluate a patch (for tests): clamped cubic B-spline surface at (u, v) */
export function evalPatch(cp: Float64Array, it: Interp, u: number, v: number): [number, number, number] {
  const { n, knots: U } = it, p = 3;
  const N = (x: number): number[] => {
    const out = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) { // Cox-de Boor recursion, straightforward form
      const f = (i0: number, d: number): number => {
        if (d === 0) return (x >= U[i0] && x < U[i0 + 1]) || (x === 1 && U[i0] < 1 && U[i0 + 1] === 1) ? 1 : 0;
        const a = U[i0 + d] - U[i0], b = U[i0 + d + 1] - U[i0 + 1];
        return (a > 0 ? ((x - U[i0]) / a) * f(i0, d - 1) : 0) + (b > 0 ? ((U[i0 + d + 1] - x) / b) * f(i0 + 1, d - 1) : 0);
      };
      out[i] = f(i, p);
    }
    return out;
  };
  const Nu = N(u), Nv = N(v); const r: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const w = Nu[i] * Nv[j]; if (w) for (let k = 0; k < 3; k++) r[k] += w * cp[(i * n + j) * 3 + k]; }
  return r;
}
