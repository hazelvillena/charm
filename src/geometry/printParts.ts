import type { MeshOut } from './solids';

const bboxOf = (m: MeshOut) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = m.positions[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  return { lo, hi };
};

/**
 * Lays the parts on a build plate in a row: each lies on z = 0, centred on y = 0, `gap` mm apart, the whole row centred on x = 0.
 * `flip` turns a part over (180 degrees about y, which keeps it a proper solid) so its seam face goes down.
 */
export function layoutFlat(parts: { name: string; mesh: MeshOut; flip?: boolean }[], gap: number): { name: string; mesh: MeshOut }[] {
  const turned = parts.map((p) => {
    const src = p.mesh.positions, pos = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) { pos[i] = p.flip ? -src[i] : src[i]; pos[i + 1] = src[i + 1]; pos[i + 2] = p.flip ? -src[i + 2] : src[i + 2]; }
    return { name: p.name, mesh: { positions: pos, tris: p.mesh.tris } as MeshOut };
  });
  const boxes = turned.map((p) => bboxOf(p.mesh));
  const total = boxes.reduce((s, b) => s + (b.hi[0] - b.lo[0]), 0) + gap * (turned.length - 1);
  let x = -total / 2;
  return turned.map((p, i) => {
    const b = boxes[i], dx = x - b.lo[0], dy = -(b.lo[1] + b.hi[1]) / 2, dz = -b.lo[2];
    x += b.hi[0] - b.lo[0] + gap;
    const pos = p.mesh.positions; for (let k = 0; k < pos.length; k += 3) { pos[k] += dx; pos[k + 1] += dy; pos[k + 2] += dz; }
    return p;
  });
}
