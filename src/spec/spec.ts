import { Params } from '../params/schema';
import { Outline } from '../params/outline';
import { CORE } from '../params/core';
import { DENSITY_G_CM3 } from './materials';
import { Casing } from '../geometry/solids';
import { bounds } from '../geometry/mesh';
import { CheckResult } from '../checks/fit';

export type Spec = ReturnType<typeof buildSpec>;

export function paramHash(params: Params, outline: Outline): string {
  const s = JSON.stringify([params, outline.phi.map((x) => +x.toFixed(3)), outline.r.map((x) => +x.toFixed(2)), outline.left ? [outline.left.phi.map((x) => +x.toFixed(3)), outline.left.r.map((x) => +x.toFixed(2))] : 0, outline.curve ?? 0]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).slice(0, 4).padStart(4, '0');
}

export function buildSpec(args: {
  name: string; params: Params; outline: Outline; casing: Casing; outerBounds: ReturnType<typeof bounds>;
  checks: CheckResult[]; minWall: number; cageVerts: number; cageFaces: number; level: number;
}) {
  const { params, casing } = args;
  const dens = DENSITY_G_CM3[params.material];
  const shellCm3 = casing.shellVolume / 1000;
  return {
    name: `${args.name}-${paramHash(params, args.outline)}`,
    disclaimer: 'Concept casing and prefab preview. Not class-A surfacing, not production-ready. Core dimensions are placeholders (TBD).',
    dimensionsMm: { width: +args.outerBounds.size[0].toFixed(1), height: +args.outerBounds.size[1].toFixed(1), depth: +args.outerBounds.size[2].toFixed(1) },
    volumeCm3: { outer: +(casing.outerVolume / 1000).toFixed(2), shell: +shellCm3.toFixed(2), front: +(casing.frontVolume / 1000).toFixed(2), back: +(casing.backVolume / 1000).toFixed(2) },
    material: params.material, densityGcm3: dens, weightG: +(shellCm3 * dens).toFixed(1),
    wallMm: { target: params.wall, measuredMin: Number.isFinite(args.minWall) ? +args.minWall.toFixed(2) : null },
    splitZMm: +casing.splitOffset.toFixed(2),
    core: { ...CORE, status: 'placeholder / TBD' },
    checks: args.checks.map((c) => ({ id: c.id, ok: c.ok, detail: c.detail })),
    cage: { vertices: args.cageVerts, quads: args.cageFaces, subdivisionLevel: args.level },
    notes: ['Eyes are separate parts (not cut into the shells).', 'Cage OBJ is designed to open as SubD in Rhino (ToSubD); round trip not yet verified.'],
    params, outline: { phi: args.outline.phi, r: args.outline.r, ...(args.outline.left ? { left: args.outline.left } : {}), ...(args.outline.curve ? { curve: args.outline.curve } : {}) },
  };
}
