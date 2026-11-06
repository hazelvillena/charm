import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { quadObj, parseObj } from '../src/io/exportObj';
import { binaryStl } from '../src/io/exportStl';
import { encodeShare, decodeShare } from '../src/io/share';
import { closureReport, signedVolume } from '../src/geometry/mesh';
import { PRESETS, presetParams } from '../src/params/presets';
import { clampOutline } from '../src/params/outline';
import { buildAll, engine } from './helpers';
import { buildCasing } from '../src/geometry/solids';
import { defaultParams } from '../src/params/schema';

describe('cage OBJ round trip (our own check, Rhino unverified)', () => {
  it('re-imports as closed outward quads with the same vertex count', () => {
    const pr = PRESETS[0], params = presetParams(pr), outline = clampOutline(pr.outline, params.wall);
    const a = buildAll(outline, params, 2);
    const txt = quadObj('charmer_cage', a.cage, engine.qs.faces, engine.qs.vertCount);
    const back = parseObj(txt);
    expect(back.positions.length / 3).toBe(engine.qs.vertCount);
    expect(back.faces.every((f) => f.length === 4)).toBe(true);
    const faces = new Uint32Array(back.faces.flat());
    const r = closureReport(faces, back.positions.length / 3);
    expect(r.closed).toBe(true); expect(r.euler).toBe(2);
    expect(signedVolume(back.positions, faces)).toBeGreaterThan(0);
    for (let i = 0; i < a.cage.length; i++) expect(Math.abs(back.positions[i] - a.cage[i])).toBeLessThan(1e-4);
  });
});

describe('STL', () => {
  it('writes a valid binary STL for the accepted shells', async () => {
    const pr = PRESETS[1], params = presetParams(pr), outline = clampOutline(pr.outline, params.wall);
    const a = buildAll(outline, params, 3);
    const c = await buildCasing({ outerPos: a.outer, innerPos: a.inner, faces: a.faces, params, place: a.place });
    const stl = binaryStl(c.front.positions, c.front.tris);
    const dv = new DataView(stl.buffer);
    expect(stl.byteLength).toBe(84 + dv.getUint32(80, true) * 50);
    expect(dv.getUint32(80, true)).toBe(c.front.tris.length / 3);
  }, 30000);
});

describe('share link', () => {
  it('round-trips an identity exactly', () => {
    const pr = PRESETS[2], params = presetParams(pr), outline = clampOutline(pr.outline, params.wall);
    const d = decodeShare(encodeShare(params, outline))!;
    expect(d).not.toBeNull();
    expect(d.params).toEqual(params);
    d.outline.r.forEach((r, i) => expect(r).toBeCloseTo(outline.r[i], 2));
    d.outline.phi.forEach((p, i) => expect(p).toBeCloseTo(outline.phi[i], 2));
  });
  it('rejects garbage without throwing and repairs out-of-range values', () => {
    expect(decodeShare('%%%')).toBeNull();
    expect(decodeShare(encodeShare({ ...defaultParams(), depth: 9999 } as any, PRESETS[0].outline))!.params.depth).toBeLessThanOrEqual(42);
  });
});

describe('architecture rule: reusable layers have no DOM or scene code', () => {
  const layers = ['params', 'geometry', 'checks', 'spec', 'io'];
  const banned = [/\bdocument\./, /\bwindow\./, /three\/addons\/(controls|renderers|environments)/, /from '\.\.\/(ui|scene)\//];
  it('holds', () => {
    for (const l of layers) {
      const dir = path.join(process.cwd(), 'src', l);
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
        const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
        for (const b of banned) expect(b.test(src), `${l}/${f} matches ${b}`).toBe(false);
      }
    }
  });
});

describe('OBJ parts (eyes and Core)', () => {
  it('writes eyes and the Core as separate closed, outward-facing objects', async () => {
    const { partsObj, parseObj } = await import('../src/io/exportObj');
    const { Vector3 } = await import('three');
    const n = new Vector3(0, 0, 1);
    const place: any = { eyes: [{ point: new Vector3(-5, 40, 20), normal: n }, { point: new Vector3(5, 40, 20), normal: n }], puck: { point: new Vector3(0, 25, 18), normal: n } };
    const txt = partsObj(0, { eyeSize: 2.4, eyeType: 'inset' }, place);
    expect(txt).toContain('o eye_1'); expect(txt).toContain('o eye_2'); expect(txt).toContain('o core'); expect(txt).toContain('o magnet_1'); expect(txt).toContain('o magnet_2');
    const core = txt.split('o core')[1].split('o magnet_1')[0];
    const p = parseObj('o core' + core);
    expect(p.faces.length).toBeGreaterThan(500);
    // signed volume of the core (relative indices differ from the file: it starts after the eyes)
    const eyesV = txt.split('o core')[0].split('\n').filter((l) => l.startsWith('v ')).length;
    let vol = 0; for (const f of p.faces) { const [a, b, c] = f.map((i) => i - eyesV); const A = [p.positions[a * 3], p.positions[a * 3 + 1], p.positions[a * 3 + 2]], B = [p.positions[b * 3], p.positions[b * 3 + 1], p.positions[b * 3 + 2]], C = [p.positions[c * 3], p.positions[c * 3 + 1], p.positions[c * 3 + 2]]; vol += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6; }
    expect(Math.abs(vol)).toBeGreaterThan(2000); // a 25 mm puck is about 4 cm3
    expect(vol).toBeGreaterThan(0); // outward faces
  });
});
