import { Outline, cloneOutline } from './params/outline';
import { Params } from './params/schema';
import { cloneSide } from './params/side';
import { Look, MaterialId } from '../design/finishes';
import { STARTERS, starterParams } from './params/starters';
import { PRESETS, presetParams, DEFAULT_EYE_SIZE } from './params/presets';

/** Global (hardware / manufacturing) fields are shared by every iteration; everything else belongs to the iteration. */
export const GLOBAL_PARAM_KEYS = ['wall', 'splitZ'] as const; // material is per iteration, so the library keeps its variety

export type Iteration = {
  id: string; name: string; created: number;
  params: Params; outline: Outline; look: Look;
  starred?: boolean;                       // starred iterations are anchored in the pill at the top of the canvas
  thumb?: string; weightG?: number | null; sizeMm?: [number, number]; material?: string; failing?: string[];
};

const KEY = 'charmer-playground:v1';
const VERSION = 11; // 2 = presets live in the library (starred); 3 = default eyes 2.4 mm; 4 = a varied material per built-in iteration; 5 = the attachment loop is off by default; 6-7 = thumbnails show the Core and eyes, in each item's own material (re-rendered)
const cloneParams = (p: Params): Params => ({ ...p, side: cloneSide(p.side) });
const newId = () => 'it_' + Math.random().toString(36).slice(2, 9);
const make = (name: string, params: Params, outline: Outline, look: Look, starred: boolean): Iteration =>
  ({ id: newId(), name, created: Date.now(), params: cloneParams(params), outline: cloneOutline(outline), look: { ...look }, starred });

/** Each built-in iteration has its own material and finish, so the library shows the range of what the tool can do. */
const SEED_MATERIALS: Record<string, { material: MaterialId; look: Look }> = {
  Charmer: { material: 'PC/ABS', look: { color: '#B8C8DB', finish: 'gloss' } },
  Blob: { material: 'Silicone', look: { color: '#BFE8D2', finish: 'soft' } },
  Star: { material: 'PC/ABS', look: { color: '#F6C1B5', finish: 'gloss' } },
  Triangle: { material: 'Metal', look: { color: '#E4E6EA', finish: 'satin' } },
  Drop: { material: 'Silicone', look: { color: '#A9C4F5', finish: 'frost' } },
  Arch: { material: 'PC/ABS', look: { color: '#F3EEE3', finish: 'matte' } },
  Seed: { material: 'Metal', look: { color: '#E4E6EA', finish: 'chrome' } },
  Trefoil: { material: 'PC/ABS', look: { color: '#BFE8D2', finish: 'gloss' } },
  Clover: { material: 'Silicone', look: { color: '#F6C1B5', finish: 'soft' } },
  Gem: { material: 'PC/ABS', look: { color: '#F4D35E', finish: 'matte' } },
  Pillow: { material: 'Silicone', look: { color: '#F3EEE3', finish: 'frost' } },
  Sprout: { material: 'Metal', look: { color: '#2B2D3A', finish: 'satin' } },
  Peanut: { material: 'PC/ABS', look: { color: '#E4E6EA', finish: 'gloss' } },
};
const seeded = (name: string, params: Params, look: Look): { params: Params; look: Look } => {
  const m = SEED_MATERIALS[name]; return m ? { params: { ...params, material: m.material }, look: { ...m.look } } : { params, look };
};

/** The built-in presets (starred, so they start in the pill) and the smooth starter shapes. */
const presetItems = () => PRESETS.map((p) => { const v = seeded(p.name, presetParams(p), { color: '#B8C8DB', finish: 'gloss' }); return make(p.name, v.params, p.outline, v.look, p.name !== 'Blob'); }); // Blob is a plain study; the pill starts with Charmer, Star, Triangle, Drop and Clover
const starterItems = () => STARTERS.map((st) => { const v = seeded(st.name, starterParams(st), st.look); return make(st.name, v.params, st.outline, v.look, st.name === 'Clover'); });

export class Library {
  items: Iteration[] = [];
  private onChange: () => void;
  private seeded = false; private version = 0;
  constructor(onChange: () => void = () => {}) {
    this.onChange = onChange; this.load();
    if (this.items.length === 0 && !this.seeded) { this.items = [...presetItems(), ...starterItems()]; this.seeded = true; this.save(); }
    else if (this.version < VERSION) {
      if (this.version < 2) { // returning user: add the built-in presets they do not have yet, starred, without touching their own items
        const have = new Set(this.items.map((i) => i.name));
        this.items = [...presetItems().filter((i) => !have.has(i.name)), ...this.items];
      }
      // the new default eyes: bring built-in items that still carry an old default eye size up to it (never touch a size you chose)
      const builtin = new Set([...PRESETS.map((p) => p.name), ...STARTERS.map((s) => s.name)]);
      for (const it of this.items) if (builtin.has(it.name) && [1.8, 1.3].includes(it.params.eyeSize)) it.params.eyeSize = DEFAULT_EYE_SIZE;
      if (this.version < 4) { // give built-in iterations that still have the single default material their own
        for (const it of this.items) { const m = SEED_MATERIALS[it.name]; if (m && it.params.material === 'PC/ABS') { it.params.material = m.material; it.look = { ...m.look }; } }
      }
      if (this.version < 5) for (const it of this.items) if (SEED_MATERIALS[it.name]) it.params.loop = false; // built-ins start without the attachment loop
      if (this.version < 8) for (const it of this.items) { it.thumb = undefined; if (it.look?.finish === 'pearl') it.look = { ...it.look, finish: 'gloss' }; } // pearl is gone; redraw thumbnails // redraw thumbnails with the Core and eyes
      if (this.version < 9) { // Ghost is now Charmer; the round Pebble (too close to Blob) becomes the flat-based Arch
        const arch = starterItems().find((i) => i.name === 'Arch');
        for (const it of this.items) {
          if (it.name === 'Ghost') it.name = 'Charmer';
          if (it.name === 'Pebble' && arch) { it.name = 'Arch'; it.outline = arch.outline; it.params = arch.params; it.look = arch.look; }
          it.thumb = undefined;
        }
      }
      if (this.version < 10) for (const it of this.items) { if (it.name === 'Arch') it.starred = false; if (it.name === 'Clover') it.starred = true; } // Clover is the favourite, not Arch
      if (this.version < 11) { // the flat core seat is off by default; Charmer and Arch get the small shape tweak that keeps the Core inside them without it
        const charmer = presetItems().find((i) => i.name === 'Charmer'), arch = starterItems().find((i) => i.name === 'Arch');
        for (const it of this.items) {
          if (!SEED_MATERIALS[it.name]) continue;
          it.params.corePlateau = false; it.thumb = undefined;
          if (it.name === 'Charmer' && charmer) it.params.side = cloneSide(charmer.params.side);
          if (it.name === 'Arch' && arch) it.outline = arch.outline;
        }
      }
      this.version = VERSION; this.save();
    }
  }

  /** put the built-in presets and the smooth starter shapes back (from the empty-library prompt) */
  addDefaults() { const have = new Set(this.items.map((i) => i.name)); const made = [...presetItems(), ...starterItems()].filter((i) => !have.has(i.name)); this.items = [...made, ...this.items]; this.persist(); return made; }

  add(name: string, params: Params, outline: Outline, look: Look): Iteration { const it = make(name || 'Untitled', params, outline, look, false); this.items.unshift(it); this.persist(); return it; }
  /** overwrite an existing iteration with the current state */
  update(id: string, name: string, params: Params, outline: Outline, look: Look) { const it = this.get(id); if (!it) return null; it.name = name || it.name; it.params = cloneParams(params); it.outline = cloneOutline(outline); it.look = { ...look }; this.persist(); return it; }
  get(id: string) { return this.items.find((i) => i.id === id); }
  remove(id: string) { this.items = this.items.filter((i) => i.id !== id); this.persist(); }
  rename(id: string, name: string) { const it = this.get(id); if (it) { it.name = name || 'Untitled'; this.persist(); } }
  toggleStar(id: string) { const it = this.get(id); if (it) { it.starred = !it.starred; this.persist(); } return !!it?.starred; }
  starred() { return this.items.filter((i) => i.starred); }

  private save(core?: Record<string, number>) {
    try {
      const prev = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      localStorage.setItem(KEY, JSON.stringify({ items: this.items, core: core ?? prev.core, seeded: true, v: VERSION }));
    } catch { /* storage may be unavailable (private window, quota): the library then lives for this session only */ }
  }
  persist(core?: Record<string, number>) { this.save(core); this.onChange(); }
  savedCore(): Record<string, number> | null { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}').core ?? null; } catch { return null; } }
  private load() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      if (Array.isArray(j.items)) this.items = j.items.filter((i: any) => i && i.id && i.params && i.outline && i.look);
      this.seeded = !!j.seeded || this.items.length > 0; // a returning user's library is never re-seeded behind their back
      this.version = typeof j.v === 'number' ? j.v : this.items.length ? 1 : 0;
    } catch { this.items = []; }
  }
}
