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
