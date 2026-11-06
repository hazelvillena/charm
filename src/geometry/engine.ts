import { Outline } from '../params/outline';
import { Params } from '../params/schema';
import { buildQuadSphere, QuadSphere } from './quadSphere';
import { Subdivider } from './catmullClark';
import { mapShape, ShapeInfo } from './shapeMap';
import { allFinite, vertexNormals } from './mesh';
import { curvatureRadii } from './curvature';
import { PoissonInflator } from './inflate';

export const QUAD_N = 10;
export const MAX_LEVEL = 3;

export type BuiltShape = {
  cage: Float32Array;           // base cage positions (copy)
  info: ShapeInfo;
};

/** Owns topology (built once) and evaluates cage + limit-ish smooth meshes. No DOM, no scene. */
export class ShapeEngine {
  readonly qs: QuadSphere;
  readonly sub: Subdivider;
  private tmpCage: Float32Array;
  private tmpInner: Float32Array;
  private inflOuter = new PoissonInflator(); private inflInner = new PoissonInflator();

  constructor() {
    this.qs = buildQuadSphere(QUAD_N);
    this.sub = new Subdivider(this.qs.faces, this.qs.vertCount, MAX_LEVEL);
    this.tmpCage = new Float32Array(this.qs.vertCount * 3);
    this.tmpInner = new Float32Array(this.qs.vertCount * 3);
  }

  /** Builds the outer cage into `cageOut`; returns null if the result is invalid (caller keeps last valid state). */
  /** quality 'live' = a few warm-started sweeps while dragging; 'final' = fully converged membrane (use on release / for checks and export) */
  buildCage(outline: Outline, p: Params, cageOut: Float32Array, quality: 'live' | 'final' = 'final'): ShapeInfo | null {
    try {
      const info = mapShape(this.qs, outline, p, this.tmpCage, 0, undefined, { inflator: this.inflOuter, iterations: quality === 'live' ? 30 : 500 });
      if (!info.ok || !allFinite(this.tmpCage)) return null;
      cageOut.set(this.tmpCage);
      return info;
    } catch { return null; }
  }

  buildInnerCage(outline: Outline, p: Params, outer: ShapeInfo, out: Float32Array, quality: 'live' | 'final' = 'final'): boolean {
    try {
      const info = mapShape(this.qs, outline, p, this.tmpInner, p.wall, outer, { inflator: this.inflInner, iterations: quality === 'live' ? 30 : 500 });
      if (!info.ok || !allFinite(this.tmpInner)) return false;
      out.set(this.tmpInner);
      return true;
    } catch { return false; }
  }

  /**
   * Inner (hollow) surface at a subdivision level: the outer surface offset inward along its normals by the wall.
   * The offset is clamped to 85% of the local radius of curvature so it can never fold over on a tight spot
   * (the wall then simply gets thinner there and the Wall / Tightest-radius checks say so). Same topology as the outer.
   */
  innerSurface(outer: Float32Array, level: number, wall: number, dst: Float32Array): boolean {
    const faces = this.sub.faces(level), n = this.sub.vertCount(level);
    const nor = vertexNormals(outer, faces, n), rad = curvatureRadii(outer, nor, faces);
    for (let i = 0; i < n; i++) {
      const off = Math.min(wall, 0.85 * rad[i]);
      dst[i * 3] = outer[i * 3] - nor[i * 3] * off; dst[i * 3 + 1] = outer[i * 3 + 1] - nor[i * 3 + 1] * off; dst[i * 3 + 2] = outer[i * 3 + 2] - nor[i * 3 + 2] * off;
    }
    return allFinite(dst.subarray(0, n * 3));
  }

  smoothInto(cage: Float32Array, level: number, dst: Float32Array) { this.sub.evaluateInto(cage, level, dst); }
  smoothFaces(level: number) { return this.sub.faces(level); }
  smoothVertCount(level: number) { return this.sub.vertCount(level); }
}
