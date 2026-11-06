import { eyeShapes, frameOf, type Placement } from '../geometry/features';
import type { Params } from '../params/schema';
import { CORE } from '../params/core';
import { coreProfile } from '../geometry/coreProfile';

/** Quad OBJ writers. Pure functions (no DOM). */
export function quadObj(name: string, positions: ArrayLike<number>, faces: Uint32Array, vertCount: number, comment = ''): string {
  const out: string[] = [`# ${comment || name}`, `o ${name}`];
  for (let i = 0; i < vertCount; i++) out.push(`v ${positions[i * 3].toFixed(5)} ${positions[i * 3 + 1].toFixed(5)} ${positions[i * 3 + 2].toFixed(5)}`);
  for (let f = 0; f < faces.length; f += 4) out.push(`f ${faces[f] + 1} ${faces[f + 1] + 1} ${faces[f + 2] + 1} ${faces[f + 3] + 1}`);
  return out.join('\n') + '\n';
}

export type ParsedObj = { positions: Float32Array; faces: number[][] };
export function parseObj(text: string): ParsedObj {
  const v: number[] = [], faces: number[][] = [];
  for (const l of text.split('\n')) {
    const t = l.trim().split(/\s+/);
    if (t[0] === 'v') v.push(+t[1], +t[2], +t[3]);
    else if (t[0] === 'f') faces.push(t.slice(1).map((x) => parseInt(x.split('/')[0]) - 1));
  }
  return { positions: new Float32Array(v), faces };
}

/**
 * The parts that sit in the casing, as extra OBJ objects (triangles): the two eyes, the Core (revolved profile, seated
 * in its recess) and the magnets (behind the floor of the seat). Indices continue after `startVert` vertices already written.
 */
export function partsObj(startVert: number, params: Pick<Params, 'eyeSize' | 'eyeType'>, place: Pick<Placement, 'eyes' | 'puck'>): string {
  const out: string[] = []; let base = startVert;
  const emit = (name: string, verts: number[][], faces: number[][]) => {
    out.push(`o ${name}`);
    for (const v of verts) out.push(`v ${v[0].toFixed(5)} ${v[1].toFixed(5)} ${v[2].toFixed(5)}`);
    for (const f of faces) out.push('f ' + f.map((i) => i + 1 + base).join(' '));
    base += verts.length;
  };
  eyeShapes(place, params).forEach((e, k) => {
    const LAT = 10, LON = 16, verts: number[][] = [], faces: number[][] = [];
    for (let i = 0; i <= LAT; i++) for (let j = 0; j < LON; j++) {
      const th = (i / LAT) * Math.PI, ph = (j / LON) * Math.PI * 2, sx = Math.sin(th) * Math.cos(ph) * e.rx, sy = Math.sin(th) * Math.sin(ph) * e.ry, sz2 = Math.cos(th) * e.rz;
      verts.push([e.c.x + e.x.x * sx + e.y.x * sy + e.z.x * sz2, e.c.y + e.x.y * sx + e.y.y * sy + e.z.y * sz2, e.c.z + e.x.z * sx + e.y.z * sy + e.z.z * sz2]);
    }
    for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) { const a = i * LON + j, b = i * LON + ((j + 1) % LON), c2 = (i + 1) * LON + ((j + 1) % LON), d = (i + 1) * LON + j; if (i > 0) faces.push([a, b, c2]); if (i < LAT - 1) faces.push([a, c2, d]); }
    emit(`eye_${k + 1}`, verts, faces);
  });
  if (place.puck) {
    const f = frameOf(place.puck.normal), p0 = place.puck.point, d = CORE.puckDepth / 2;
    const c = { x: p0.x - f.z.x * d, y: p0.y - f.z.y * d, z: p0.z - f.z.z * d };
    const prof = coreProfile(), SEG = 72, verts: number[][] = [], faces: number[][] = [];
    for (const [r, h] of prof) for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2, x = r * Math.cos(a), y = r * Math.sin(a);
      verts.push([c.x + f.x.x * x + f.y.x * y + f.z.x * h, c.y + f.x.y * x + f.y.y * y + f.z.y * h, c.z + f.x.z * x + f.y.z * y + f.z.z * h]);
    }
    for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < SEG; j++) {
      const a = i * SEG + j, b = i * SEG + ((j + 1) % SEG), c2 = (i + 1) * SEG + ((j + 1) % SEG), d2 = (i + 1) * SEG + j;
      if (prof[i][0] > 1e-6) faces.push([a, b, c2]);
      if (prof[i + 1][0] > 1e-6) faces.push([a, c2, d2]);
    }
    emit('core', verts, faces);
    // magnets: a vertical pair behind the floor of the seat, sealed by the gap
    const { count, spacing, diameter, thickness, gap } = CORE.magnet, zc = p0.z - CORE.puckDepth - gap - thickness / 2, SG = 32;
    for (let m = 0; m < count; m++) {
      const my = p0.y + (m - (count - 1) / 2) * spacing, mv: number[][] = [], mf: number[][] = [];
      for (const dz of [-thickness / 2, thickness / 2]) for (let j = 0; j < SG; j++) { const a = (j / SG) * Math.PI * 2; mv.push([p0.x + (diameter / 2) * Math.cos(a), my + (diameter / 2) * Math.sin(a), zc + dz]); }
      mv.push([p0.x, my, zc - thickness / 2], [p0.x, my, zc + thickness / 2]);
      for (let j = 0; j < SG; j++) { const j2 = (j + 1) % SG; mf.push([j, j2, SG + j2], [j, SG + j2, SG + j], [2 * SG, j2, j], [2 * SG + 1, SG + j, SG + j2]); }
      emit(`magnet_${m + 1}`, mv, mf);
    }
  }
  return out.join('\n') + (out.length ? '\n' : '');
}
