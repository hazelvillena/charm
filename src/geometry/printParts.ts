import type { ManifoldApi } from './kernel';
import type { MeshOut } from './solids';

type Track = <T extends { delete(): void }>(x: T) => T;
type CS = InstanceType<ManifoldApi['CrossSection']>;

/** x of the right-most edge of a region on the horizontal line y (null when the region does not reach it) */
function rightmost(polys: ReadonlyArray<ReadonlyArray<ArrayLike<number>>>, y: number): number | null {
  let best: number | null = null;
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
      const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
      if (best === null || x > best) best = x;
    }
  }
  return best;
}

/**
 * Where the rim magnets go: the shape is mirrored, so spots come as a left/right pair at one height.
 * `room` is the region where a pocket's centre may sit (clear of the rim band, the Core seat and the notch).
 * Picks the height where the pair can sit furthest apart; returns [] when there is no room.
 */
export function closureSpots(room: CS, minX: number): { x: number; y: number }[] {
  if (room.isEmpty()) return []; // a very small shape leaves no room (an empty region has infinite bounds)
  const polys = room.toPolygons(), bb = room.bounds();
  let bestX = -1, bestY = 0;
  for (let y = bb.min[1]; y <= bb.max[1]; y += 0.5) {
    const x = rightmost(polys, y);
    if (x !== null && x > bestX + 1e-6) { bestX = x; bestY = y; }
  }
  if (bestX < minX) return [];
  const x = Math.floor(bestX * 10) / 10 - 0.05; // a hair inside the region
  return [{ x, y: bestY }, { x: -x, y: bestY }];
}

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
