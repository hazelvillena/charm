import { SideProfile, defaultSide, clampSide } from './side';
import { MATERIALS, MaterialId } from '../../design/finishes';

export type GroupId = 'body' | 'face' | 'attach' | 'mfg' | 'look';
export type ParamDef = {
  id: keyof Params; label: string; group: GroupId;
  kind: 'range' | 'enum' | 'toggle';
  min?: number; max?: number; step?: number; options?: string[];
  default: number | string | boolean; unit?: 'mm' | ''; hint?: string;
};

export type Params = {
  depth: number; belly: number; backFlat: number; plateau: number; corePlateau: boolean;
  scaleW: number; scaleH: number; // the whole outline scaled across and up (the Core keeps its size)
  eyes: 'two' | 'one' | 'none'; eyeSize: number; eyeSpacing: number; eyeHeight: number; eyeX: number; eyeType: 'inset' | 'raised' | 'flush';
  wall: number; splitZ: number; material: MaterialId;
  side: SideProfile;
};

export const GROUPS: { id: GroupId; label: string; open: boolean }[] = [
  { id: 'body', label: 'Body volume', open: true },
  { id: 'face', label: 'Identity', open: true },
  { id: 'attach', label: 'Attachment', open: false },
  { id: 'mfg', label: 'Shell', open: true },
];

export const SCHEMA: ParamDef[] = [
  { id: 'depth', label: 'Depth', group: 'body', kind: 'range', min: 10, max: 42, step: 0.5, default: 30, unit: 'mm' },
  { id: 'scaleW', label: 'Width', group: 'body', kind: 'range', min: 0.6, max: 1.6, step: 0.01, default: 1, hint: 'Scale the shape across. The Core keeps its size, so it stops fitting if the body gets too small' },
  { id: 'scaleH', label: 'Height', group: 'body', kind: 'range', min: 0.6, max: 1.6, step: 0.01, default: 1, hint: 'Scale the shape up and down. The Core keeps its size, so it stops fitting if the body gets too small' },
  { id: 'belly', label: 'Belly', group: 'body', kind: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
  { id: 'backFlat', label: 'Back flatness', group: 'body', kind: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
  { id: 'corePlateau', label: 'Flat core seat', group: 'attach', kind: 'toggle', default: false, hint: 'Flat seat and core curvature' },
  { id: 'plateau', label: 'Seat size', group: 'attach', kind: 'range', min: 0, max: 1, step: 0.05, default: 0.8 },
  { id: 'eyes', label: 'Eyes', group: 'face', kind: 'enum', options: ['two', 'one', 'none'], default: 'two', hint: 'Two eyes, a single centred eye, or none' },
  { id: 'eyeSize', label: 'Eye size', group: 'face', kind: 'range', min: 1, max: 4, step: 0.2, default: 2.4, unit: 'mm' },
  { id: 'eyeSpacing', label: 'Eye spacing', group: 'face', kind: 'range', min: 3, max: 12, step: 0.5, default: 5.5, unit: 'mm' },
  { id: 'eyeHeight', label: 'Eye height', group: 'face', kind: 'range', min: 0.3, max: 0.95, step: 0.005, default: 0.78, hint: 'Where the eyes sit up the body. Drag them on the canvas too' },
  { id: 'eyeX', label: 'Eye position', group: 'face', kind: 'range', min: -25, max: 25, step: 0.5, default: 0, unit: 'mm', hint: 'Slide the eyes left or right, independent of the Core' },
  { id: 'eyeType', label: 'Eye type', group: 'face', kind: 'enum', options: ['inset', 'raised', 'flush'], default: 'inset' },
  { id: 'wall', label: 'Wall thickness', group: 'mfg', kind: 'range', min: 1.2, max: 2.5, step: 0.1, default: 1.6, unit: 'mm' },
  { id: 'splitZ', label: 'Split line', group: 'mfg', kind: 'range', min: -0.5, max: 0.5, step: 0.05, default: 0 },
  { id: 'material', label: 'Material', group: 'look', kind: 'enum', options: MATERIALS.map((m) => m.id), default: 'PC/ABS' },
];

export function defaultParams(): Params {
  const p: any = {};
  for (const d of SCHEMA) p[d.id] = d.default;
  p.side = defaultSide();
  return p as Params;
}

/** Clamp/repair any untrusted params object (share links, presets). */
export function sanitizeParams(raw: any): Params {
  const out = defaultParams() as any;
  if (!raw || typeof raw !== 'object') return out;
  for (const d of SCHEMA) {
    const v = raw[d.id];
    if (d.kind === 'range') {
      if (typeof v === 'number' && Number.isFinite(v)) out[d.id] = Math.min(d.max!, Math.max(d.min!, v));
    } else if (d.kind === 'toggle') {
      if (typeof v === 'boolean') out[d.id] = v;
    } else if (typeof v === 'string' && d.options!.includes(v)) out[d.id] = v;
  }
  out.side = clampSide(raw.side);
  return out as Params;
}
