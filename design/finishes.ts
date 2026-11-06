/** Material finishes and palette: the single source for how the shell looks. Data only (no three.js). */
export type Finish = {
  id: string; label: string; note: string;
  roughness: number; metalness: number; clearcoat: number; clearcoatRoughness: number;
  sheen: number; sheenRoughness: number; iridescence: number;
  transmission: number; thickness: number; ior: number; envIntensity: number;
};

const base = { metalness: 0, clearcoat: 0, clearcoatRoughness: 0.1, sheen: 0, sheenRoughness: 0.5, iridescence: 0, transmission: 0, thickness: 0, ior: 1.5, envIntensity: 1 };

export const FINISHES: Finish[] = [
  { ...base, id: 'gloss', label: 'Gloss', note: 'Gloss', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, envIntensity: 1 },
  { ...base, id: 'matte', label: 'Matte', note: 'Matte', roughness: 0.52, sheen: 0.25, sheenRoughness: 0.6, envIntensity: 0.85 },
  { ...base, id: 'soft', label: 'Soft-touch', note: 'Soft-touch', roughness: 0.7, sheen: 1, sheenRoughness: 0.45, envIntensity: 0.75 },
  { ...base, id: 'frost', label: 'Frosted', note: 'Frosted', roughness: 0.34, transmission: 0.55, thickness: 8, ior: 1.42, envIntensity: 0.95 },
  { ...base, id: 'chrome', label: 'Chrome', note: 'Chrome', roughness: 0.07, metalness: 1, envIntensity: 1.25 },
  { ...base, id: 'satin', label: 'Satin', note: 'Satin', roughness: 0.36, metalness: 1, envIntensity: 1.1 },
];

export type MaterialId = 'PC/ABS' | 'Silicone' | 'Metal';
/** What the part is actually made of. Drives weight AND which finishes are plausible (and so the shader). */
export const MATERIALS: { id: MaterialId; label: string; densityGcm3: number; note: string; finishes: string[] }[] = [
  { id: 'PC/ABS', label: 'PC/ABS', densityGcm3: 1.15, note: 'Rigid, painted', finishes: ['gloss', 'matte'] },
  { id: 'Silicone', label: 'Silicone', densityGcm3: 1.15, note: 'Soft', finishes: ['soft', 'frost'] },
  { id: 'Metal', label: 'Metal', densityGcm3: 6.6, note: 'Zinc, plated', finishes: ['chrome', 'satin'] },
];
export const materialById = (id: string) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
export const finishAllowed = (material: string, finish: string) => materialById(material).finishes.includes(finish);
export const defaultFinishFor = (material: string) => materialById(material).finishes[0];

export const SWATCHES = [
  { id: 'frost', label: 'Frost', hex: '#B8C8DB' },
  { id: 'lavender', label: 'Lavender', hex: '#C9C3F2' },
  { id: 'sky', label: 'Sky', hex: '#A9C4F5' },
  { id: 'mint', label: 'Mint', hex: '#BFE8D2' },
  { id: 'butter', label: 'Butter', hex: '#F4D35E' },
  { id: 'blush', label: 'Blush', hex: '#F6C1B5' },
  { id: 'cream', label: 'Cream', hex: '#F3EEE3' },
  { id: 'ink', label: 'Ink', hex: '#2B2D3A' },
  { id: 'silver', label: 'Silver', hex: '#E4E6EA' },
];

export type Look = { color: string; finish: string };
export const DEFAULT_LOOK: Look = { color: '#B8C8DB', finish: 'gloss' }; // frost blue-gray
export const finishById = (id: string) => FINISHES.find((f) => f.id === id) ?? FINISHES[0];
export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
