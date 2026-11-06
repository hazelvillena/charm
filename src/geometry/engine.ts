import { Outline } from '../params/outline';
import { Params } from '../params/schema';
import { buildQuadSphere, QuadSphere } from './quadSphere';
import { Subdivider } from './catmullClark';
import { mapShape, ShapeInfo } from './shapeMap';
import { allFinite } from './mesh';

export const QUAD_N = 8;
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

  constructor() {
    this.qs = buildQuadSphere(QUAD_N);
    this.sub = new Subdivider(this.qs.faces, this.qs.vertCount, MAX_LEVEL);
    this.tmpCage = new Float32Array(this.qs.vertCount * 3);
    this.tmpInner = new Float32Array(this.qs.vertCount * 3);
  }

  /** Builds the outer cage into `cageOut`; returns null if the result is invalid (caller keeps last valid state). */
  buildCage(outline: Outline, p: Params, cageOut: Float32Array): ShapeInfo | null {
    try {
      const info = mapShape(this.qs, outline, p, this.tmpCage);
      if (!info.ok || !allFinite(this.tmpCage)) return null;
      cageOut.set(this.tmpCage);
      return info;
    } catch { return null; }
  }

  buildInnerCage(outline: Outline, p: Params, shiftY: number, out: Float32Array): boolean {
    try {
      const info = mapShape(this.qs, outline, p, this.tmpInner, p.wall, shiftY);
      if (!info.ok || !allFinite(this.tmpInner)) return false;
      out.set(this.tmpInner);
      return true;
    } catch { return false; }
  }

  smoothInto(cage: Float32Array, level: number, dst: Float32Array) { this.sub.evaluateInto(cage, level, dst); }
  smoothFaces(level: number) { return this.sub.faces(level); }
  smoothVertCount(level: number) { return this.sub.vertCount(level); }
}
