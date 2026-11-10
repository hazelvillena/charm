/**
 * Slicers and CAD tools weld vertices by position, then expect a closed, consistently wound solid:
 * every edge belongs to exactly two triangles, running in opposite directions.
 * Returns how many edges break that (open = not shared by exactly two, flipped = wound the same way twice).
 * Collapsed sliver triangles are ignored (slicers drop them). Pure function: used by tests and as a guard at export time.
 */
export function meshHealth(m: { positions: ArrayLike<number>; tris: ArrayLike<number> }, weld = 1e4): { open: number; flipped: number } {
  const ids = new Map<string, number>();
  const id = (i: number) => { const k = [0, 1, 2].map((j) => Math.round(m.positions[i * 3 + j] * weld)).join(','); let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } return v; };
  const edges = new Map<string, number[]>();
  for (let t = 0; t < m.tris.length; t += 3) {
    const v = [id(m.tris[t]), id(m.tris[t + 1]), id(m.tris[t + 2])];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let k = 0; k < 3; k++) {
      const x = v[k], y = v[(k + 1) % 3], key = x < y ? `${x}_${y}` : `${y}_${x}`;
      let a = edges.get(key); if (!a) edges.set(key, a = []); a.push(x < y ? 1 : -1);
    }
  }
  let open = 0, flipped = 0;
  for (const a of edges.values()) { if (a.length !== 2) open++; else if (a[0] === a[1]) flipped++; }
  return { open, flipped };
}
