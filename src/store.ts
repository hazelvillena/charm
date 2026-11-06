import { Outline, cloneOutline } from './params/outline';
import { Params, defaultParams } from './params/schema';
import { PRESETS, presetParams } from './params/presets';
import { DEFAULT_LOOK, Look } from '../design/finishes';

export type Mode = 'explore' | 'accepted';
export type ViewMode = 'shaded' | 'ghost' | 'section' | 'cage';
export type Analysis = 'none' | 'draft' | 'curvature' | 'zebra';
export type ChangeKind = 'shape' | 'view' | 'mode' | 'checks' | 'result';

export type State = {
  params: Params;
  outline: Outline;
  presetId: string | null;
  mode: Mode;
  view: ViewMode;
  analysis: Analysis;
  exploded: boolean;
  refGhost: boolean;
  showSplit: boolean;
  look: Look;
  name: string;            // the iteration's name (editable on the stage)
  libraryId: string | null; // set when this iteration was saved to / loaded from the library
  dirty: boolean;          // edited since it was loaded or saved (shows the Save button)
};

export function initialState(): State {
  const g = PRESETS[0];
  return {
    params: presetParams(g), outline: cloneOutline(g.outline), presetId: g.id,
    mode: 'explore', view: 'shaded', analysis: 'none', exploded: true, refGhost: false, showSplit: true, look: { ...DEFAULT_LOOK }, name: g.name, libraryId: null, dirty: false,
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
