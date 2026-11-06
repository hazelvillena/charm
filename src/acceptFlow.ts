import { Vector3 } from 'three';
import type { Store } from './store';
import type { ShapeEngine } from './geometry/engine';
import type { ShapeInfo } from './geometry/shapeMap';
import type { SceneView } from './scene/scene';
import type { Toolbar } from './ui/toolbar';
import type { Panel } from './ui/panel';
import type { CheckResult } from './checks/fit';
import type { Placement } from './geometry/features';
import { buildCasing, AcceptError, Casing } from './geometry/solids';
import { ExplodedView } from './scene/exploded';
import { SpecCard } from './ui/specCard';
import { buildSpec, Spec } from './spec/spec';
import { PRESETS } from './params/presets';
import { bounds } from './geometry/mesh';
import { binaryStl } from './io/exportStl';
import { download } from './ui/download';
import { toast } from './ui/toast';

export type AcceptCtx = {
  store: Store; engine: ShapeEngine; view: SceneView; toolbar: Toolbar; panel: Panel; stage: HTMLElement;
  getCage: () => Float32Array; getInfo: () => ShapeInfo | null; getChecks: () => CheckResult[]; getPlace: () => Placement | null;
  getHeight: () => number; getMinWall: () => number; settleNow: () => void; resume: () => void;
};

export function setupAccept(ctx: AcceptCtx) {
  const { store, engine, view, toolbar, panel, stage } = ctx;
  const card = new SpecCard();
  stage.append(card.el);
  let exploded: ExplodedView | null = null;
  let casing: Casing | null = null;
  let spec: Spec | null = null;
  let busy = false;

  const specJson = () => { if (spec) download(`${spec.name}.spec.json`, JSON.stringify(spec, null, 2), 'application/json'); };

  toolbar.onAccept = async () => {
    if (busy || store.state.mode !== 'explore') return;
    busy = true; toolbar.setBusy(true);
    try {
      ctx.settleNow(); // make sure checks and L3 are current
      const info = ctx.getInfo(), place = ctx.getPlace();
      if (!info || !place) throw new AcceptError('shape', new Error('no valid shape yet'));
      const s = store.state;
      const outerPos = new Float32Array(engine.smoothVertCount(3) * 3); engine.smoothInto(ctx.getCage(), 3, outerPos);
      const innerCage = new Float32Array(engine.qs.vertCount * 3);
      if (!engine.buildInnerCage(s.outline, s.params, info.shiftY, innerCage)) throw new AcceptError('inner shell', new Error('could not be built'));
      const innerPos = new Float32Array(engine.smoothVertCount(3) * 3); engine.smoothInto(innerCage, 3, innerPos);
      const c = await buildCasing({ outerPos, innerPos, faces: engine.smoothFaces(3), params: s.params, place });
      casing = c;
      const b = bounds(outerPos);
      const name = PRESETS.find((p) => p.id === s.presetId)?.name ?? 'Custom';
      spec = buildSpec({
        name, params: s.params, outline: s.outline, casing: c, outerBounds: b, checks: ctx.getChecks(), minWall: ctx.getMinWall(),
        cageVerts: engine.qs.vertCount, cageFaces: engine.qs.faces.length / 4, level: 3,
      });
      // switch to accepted view
      exploded?.dispose(); view.stageGroup.clear();
      exploded = new ExplodedView(c, place, s.params, view.shellMat, view.eyeMat, { w: b.size[0], h: b.size[1] });
      view.stageGroup.add(exploded.group);
      view.stageGroup.visible = true; view.setExploreVisible(false);
      s.mode = 'accepted'; s.exploded = true;
      panel.lock(true); toolbar.setMode(true); toolbar.setExploded(true);
      card.show(spec, specJson);
      view.flyTo(new Vector3(235, 85, 150), new Vector3(0, ctx.getHeight() * 0.45, 6), 900);
      toast(`Casing built in ${Math.round(c.ms)} ms`);
    } catch (e) {
      console.error(e);
      const step = e instanceof AcceptError ? e.step : 'unknown';
      toast(`Accept failed at "${step}". Explore is unchanged; adjust the shape and try again.`, 'error');
    } finally { busy = false; toolbar.setBusy(false); }
  };

  toolbar.onEdit = () => {
    store.state.mode = 'explore';
    exploded?.dispose(); exploded = null; view.stageGroup.clear(); view.stageGroup.visible = false; view.setExploreVisible(true);
    panel.lock(false); toolbar.setMode(false); card.hide();
    view.flyTo(new Vector3(75, 70, 190), new Vector3(0, ctx.getHeight() * 0.46, 0), 700);
    ctx.resume();
  };
  toolbar.onExplode = () => { store.state.exploded = !store.state.exploded; exploded?.setExploded(store.state.exploded); toolbar.setExploded(store.state.exploded); };

  return {
    export(kind: string) {
      if (!casing || !spec) { toast('Accept the design first to export shells and the spec.', 'warn'); return; }
      if (kind === 'stl') {
        download(`${spec.name}-front.stl`, binaryStl(casing.front.positions, casing.front.tris, 'charmer front shell'));
        download(`${spec.name}-back.stl`, binaryStl(casing.back.positions, casing.back.tris, 'charmer back shell'));
        toast('Front and back shell STL saved (mm).');
      } else if (kind === 'spec') specJson();
    },
  };
}
