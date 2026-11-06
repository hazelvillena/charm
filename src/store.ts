import { Outline, cloneOutline } from './params/outline';
import { Params, defaultParams } from './params/schema';
import { PRESETS, presetParams } from './params/presets';

export type Mode = 'explore' | 'accepted';
export type ViewMode = 'smooth' | 'cage' | 'both';
export type ChangeKind = 'shape' | 'view' | 'mode' | 'checks' | 'result';

export const COLORS: { id: string; label: string; hex: string; metal?: boolean }[] = [
  { id: 'lavender', label: 'Lavender', hex: '#C9C3F2' },
  { id: 'sky', label: 'Sky', hex: '#A9C4F5' },
  { id: 'butter', label: 'Butter', hex: '#F4D35E' },
  { id: 'blush', label: 'Blush', hex: '#F6C1B5' },
  { id: 'cream', label: 'Cream', hex: '#F3EEE3' },
  { id: 'chrome', label: 'Chrome', hex: '#E4E6EA', metal: true },
];

export type State = {
  params: Params;
  outline: Outline;
  presetId: string | null;
  mode: Mode;
  view: ViewMode;
  heatmap: boolean;
  exploded: boolean;
  refGhost: boolean;
  color: string;
};

export function initialState(): State {
  const g = PRESETS[0];
  return {
    params: presetParams(g), outline: cloneOutline(g.outline), presetId: g.id,
    mode: 'explore', view: 'smooth', heatmap: false, exploded: true, refGhost: false, color: 'lavender',
  };
}

type Listener = (kind: ChangeKind) => void;
export class Store {
  state: State = initialState();
  private ls: Listener[] = [];
  subscribe(l: Listener) { this.ls.push(l); }
  emit(kind: ChangeKind) { for (const l of this.ls) l(kind); }
  set(patch: Partial<State>, kind: ChangeKind) { Object.assign(this.state, patch); this.emit(kind); }
}
export { defaultParams };
