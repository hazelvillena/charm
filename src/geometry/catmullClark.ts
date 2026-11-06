import { edgeKey } from './mesh';

/** One topological refinement step with cached index tables. Only positions change per evaluation. */
class Level {
  readonly vertCount: number;
  readonly faceCount: number;
  readonly edgeCount: number;
  readonly outFaces: Uint32Array;
  readonly outVertCount: number;
  // tables
  private faceVerts: Uint32Array;
  private edgeVerts: Uint32Array; // 2 per edge
  private edgeFaces: Uint32Array; // 2 per edge
  private vFaceStart: Uint32Array; private vFaceList: Uint32Array;
  private vEdgeStart: Uint32Array; private vEdgeList: Uint32Array;

  constructor(faces: Uint32Array, vertCount: number) {
    this.faceVerts = faces; this.vertCount = vertCount; this.faceCount = faces.length / 4;
    const edgeId = new Map<number, number>();
    const ev: number[] = [], ef: number[] = [];
    const faceEdges = new Uint32Array(this.faceCount * 4);
    for (let f = 0; f < this.faceCount; f++) for (let i = 0; i < 4; i++) {
      const a = faces[f * 4 + i], b = faces[f * 4 + ((i + 1) & 3)];
      const k = edgeKey(a, b);
      let e = edgeId.get(k);
      if (e === undefined) { e = ev.length / 2; edgeId.set(k, e); ev.push(a, b); ef.push(f, f); }
      else ef[e * 2 + 1] = f;
      faceEdges[f * 4 + i] = e;
    }
    this.edgeCount = ev.length / 2;
    this.edgeVerts = new Uint32Array(ev); this.edgeFaces = new Uint32Array(ef);
    // vertex -> faces, edges
    const vf: number[][] = Array.from({ length: vertCount }, () => []);
    const ve: number[][] = Array.from({ length: vertCount }, () => []);
    for (let f = 0; f < this.faceCount; f++) for (let i = 0; i < 4; i++) vf[faces[f * 4 + i]].push(f);
    for (let e = 0; e < this.edgeCount; e++) { ve[ev[e * 2]].push(e); ve[ev[e * 2 + 1]].push(e); }
    const flat = (lists: number[][]) => {
      const start = new Uint32Array(vertCount + 1); let n = 0;
      lists.forEach((l, i) => { start[i] = n; n += l.length; }); start[vertCount] = n;
      const out = new Uint32Array(n); let p = 0; for (const l of lists) for (const x of l) out[p++] = x;
      return [start, out] as const;
    };
    [this.vFaceStart, this.vFaceList] = flat(vf);
    [this.vEdgeStart, this.vEdgeList] = flat(ve);
    // output faces: vertex ids = [old verts][edge points][face points]
    const eo = vertCount, fo = vertCount + this.edgeCount;
    this.outVertCount = vertCount + this.edgeCount + this.faceCount;
    const out = new Uint32Array(this.faceCount * 16);
    for (let f = 0; f < this.faceCount; f++) {
      const v = [0, 1, 2, 3].map((i) => faces[f * 4 + i]);
      const e = [0, 1, 2, 3].map((i) => eo + faceEdges[f * 4 + i]);
      const fp = fo + f;
      out.set([v[0], e[0], fp, e[3], v[1], e[1], fp, e[0], v[2], e[2], fp, e[1], v[3], e[3], fp, e[2]], f * 16);
    }
    this.outFaces = out;
  }

  apply(inp: Float32Array, out: Float32Array, scratch: Float32Array) {
    const V = this.vertCount, E = this.edgeCount, F = this.faceCount;
    const eo = V * 3, fo = (V + E) * 3;
    // face points -> out[fo..]
    for (let f = 0; f < F; f++) {
      const a = this.faceVerts[f * 4] * 3, b = this.faceVerts[f * 4 + 1] * 3, c = this.faceVerts[f * 4 + 2] * 3, d = this.faceVerts[f * 4 + 3] * 3;
      for (let k = 0; k < 3; k++) out[fo + f * 3 + k] = (inp[a + k] + inp[b + k] + inp[c + k] + inp[d + k]) * 0.25;
    }
    // edge points -> out[eo..], also edge midpoints in scratch
    for (let e = 0; e < E; e++) {
      const a = this.edgeVerts[e * 2] * 3, b = this.edgeVerts[e * 2 + 1] * 3;
      const f1 = fo + this.edgeFaces[e * 2] * 3, f2 = fo + this.edgeFaces[e * 2 + 1] * 3;
      for (let k = 0; k < 3; k++) {
        const mid = (inp[a + k] + inp[b + k]) * 0.5;
        scratch[e * 3 + k] = mid;
        out[eo + e * 3 + k] = (inp[a + k] + inp[b + k] + out[f1 + k] + out[f2 + k]) * 0.25;
      }
    }
    // vertex points
    for (let v = 0; v < V; v++) {
      const fs = this.vFaceStart[v], fe = this.vFaceStart[v + 1], es = this.vEdgeStart[v];
      const n = fe - fs;
      const qx = [0, 0, 0], rx = [0, 0, 0];
      for (let i = fs; i < fe; i++) { const f = fo + this.vFaceList[i] * 3; for (let k = 0; k < 3; k++) qx[k] += out[f + k]; }
      for (let i = 0; i < n; i++) { const e = this.vEdgeList[es + i] * 3; for (let k = 0; k < 3; k++) rx[k] += scratch[e + k]; }
      for (let k = 0; k < 3; k++) out[v * 3 + k] = (qx[k] / n + (2 * rx[k]) / n + (n - 3) * inp[v * 3 + k]) / n;
    }
  }
}

/** Multi-level Catmull-Clark with cached tables. evaluate(basePositions, level) -> positions. */
export class Subdivider {
  readonly levels: Level[] = [];
  readonly faceTable: Uint32Array[] = []; // faces at level L (index 0 = base)
  readonly vertTable: number[] = [];
  private buffers: Float32Array[] = [];
  private scratch: Float32Array;

  constructor(baseFaces: Uint32Array, baseVerts: number, maxLevel: number) {
    this.faceTable.push(baseFaces); this.vertTable.push(baseVerts);
    let faces = baseFaces, v = baseVerts, maxEdges = 0;
    for (let l = 0; l < maxLevel; l++) {
      const lv = new Level(faces, v);
      this.levels.push(lv);
      maxEdges = Math.max(maxEdges, lv.edgeCount);
      faces = lv.outFaces; v = lv.outVertCount;
      this.faceTable.push(faces); this.vertTable.push(v);
    }
    for (let l = 1; l <= maxLevel; l++) this.buffers.push(new Float32Array(this.vertTable[l] * 3));
    this.scratch = new Float32Array(maxEdges * 3);
  }

  faces(level: number) { return this.faceTable[level]; }
  vertCount(level: number) { return this.vertTable[level]; }

  /** Returns an internal buffer (valid until next call). Copy it if you need to keep it. */
  evaluate(base: Float32Array, level: number): Float32Array {
    if (level === 0) return base;
    let cur = base;
    for (let l = 0; l < level; l++) { this.levels[l].apply(cur, this.buffers[l], this.scratch); cur = this.buffers[l]; }
    return cur;
  }

  /** Evaluate into a caller-owned destination buffer. */
  evaluateInto(base: Float32Array, level: number, dst: Float32Array) {
    const r = this.evaluate(base, level);
    dst.set(r.subarray(0, this.vertTable[level] * 3));
  }
}
