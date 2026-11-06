export type GroupId = 'body' | 'face' | 'attach' | 'mfg';
export type ParamDef = {
  id: keyof Params; label: string; group: GroupId;
  kind: 'range' | 'enum';
  min?: number; max?: number; step?: number; options?: string[];
  default: number | string; unit?: 'mm' | ''; hint?: string;
};

export type Params = {
  depth: number; belly: number; backFlat: number; plateau: number;
  eyeSize: number; eyeSpacing: number; eyeHeight: number; eyeType: 'inset' | 'raised' | 'flush';
  nookPos: 'top' | 'top-left' | 'top-right';
  wall: number; splitZ: number; material: 'PC' | 'ABS' | 'Silicone' | 'Zinc';
};

export const GROUPS: { id: GroupId; label: string; open: boolean }[] = [
  { id: 'body', label: 'Body volume', open: true },
  { id: 'face', label: 'Face', open: true },
  { id: 'attach', label: 'Attachment', open: false },
  { id: 'mfg', label: 'Manufacturing', open: true },
];

export const SCHEMA: ParamDef[] = [
  { id: 'depth', label: 'Depth', group: 'body', kind: 'range', min: 10, max: 42, step: 0.5, default: 30, unit: 'mm', hint: 'overall front to back' },
  { id: 'belly', label: 'Belly', group: 'body', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.5, hint: 'shifts depth toward the front' },
  { id: 'backFlat', label: 'Back flatness', group: 'body', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.5, hint: 'flatter back sits against a bag' },
  { id: 'plateau', label: 'Puck plateau', group: 'body', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.8, hint: 'flat area around the puck seat' },
  { id: 'eyeSize', label: 'Eye size', group: 'face', kind: 'range', min: 1, max: 4, step: 0.1, default: 1.8, unit: 'mm' },
  { id: 'eyeSpacing', label: 'Eye spacing', group: 'face', kind: 'range', min: 3, max: 12, step: 0.1, default: 5.5, unit: 'mm' },
  { id: 'eyeHeight', label: 'Eye height', group: 'face', kind: 'range', min: 0.55, max: 0.92, step: 0.005, default: 0.78, hint: 'fraction of height' },
  { id: 'eyeType', label: 'Eye type', group: 'face', kind: 'enum', options: ['inset', 'raised', 'flush'], default: 'inset' },
  { id: 'nookPos', label: 'Nook position', group: 'attach', kind: 'enum', options: ['top', 'top-left', 'top-right'], default: 'top' },
  { id: 'wall', label: 'Wall thickness', group: 'mfg', kind: 'range', min: 1.2, max: 2.5, step: 0.05, default: 1.6, unit: 'mm' },
  { id: 'splitZ', label: 'Split line', group: 'mfg', kind: 'range', min: -0.5, max: 0.5, step: 0.01, default: 0, hint: 'fraction of depth, 0 = widest plane' },
  { id: 'material', label: 'Material', group: 'mfg', kind: 'enum', options: ['PC', 'ABS', 'Silicone', 'Zinc'], default: 'PC' },
];

export function defaultParams(): Params {
  const p: any = {};
  for (const d of SCHEMA) p[d.id] = d.default;
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
    } else if (typeof v === 'string' && d.options!.includes(v)) out[d.id] = v;
  }
  return out as Params;
}
