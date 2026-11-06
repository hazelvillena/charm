import { Vector3 } from 'three';
import type { Store } from './store';
import type { ShapeEngine } from './geometry/engine';
import type { ShapeInfo } from './geometry/shapeMap';
import type { SceneView } from './scene/scene';
import type { Toolbar } from './ui/toolbar';
import type { Panel } from './ui/panel';
import type { OutputsPanel } from './ui/outputs';
import type { CheckResult } from './checks/fit';
import type { Placement } from './geometry/features';
import { buildCasing, simplifyMesh, AcceptError, Casing } from './geometry/solids';
import { stepFromBodies } from './io/exportStep';
import { ExplodedView } from './scene/exploded';
import { buildSpec, Spec } from './spec/spec';
import { bounds } from './geometry/mesh';
import { binaryStl } from './io/exportStl';
import { download } from './ui/download';
import { toast } from './ui/toast';

export type AcceptCtx = {
  store: Store; engine: ShapeEngine; view: SceneView; toolbar: Toolbar; panel: Panel; outputs: OutputsPanel;
  getCage: () => Float32Array; getInfo: () => ShapeInfo | null; getChecks: () => CheckResult[]; getPlace: () => Placement | null;
  getHeight: () => number; getMinWall: () => number; settleNow: () => void; resume: () => void; openOutputs: () => void;
};

export function setupAccept(ctx: AcceptCtx) {
  const { store, engine, view, toolbar, panel, outputs } = ctx;
  let exploded: ExplodedView | null = null;
  let casing: Casing | null = null;
  let spec: Spec | null = null;
  let busy = false;

  const specJson = () => { if (spec) download(`${spec.name}.spec.json`, JSON.stringify(spec, null, 2), 'application/json'); };

  outputs.onBuild = async () => {
    if (busy || store.state.mode !== 'explore') return;
    busy = true; outputs.setBusy(true);
    try {
      ctx.settleNow(); // make sure checks and level-3 are current
      const info = ctx.getInfo(), place = ctx.getPlace();
      if (!info || !place) throw new AcceptError('shape', new Error('no valid shape yet'));
      const s = store.state;
      const outerPos = new Float32Array(engine.smoothVertCount(3) * 3); engine.smoothInto(ctx.getCage(), 3, outerPos);
      const innerPos = new Float32Array(engine.smoothVertCount(3) * 3);
      if (!engine.innerSurface(outerPos, 3, s.params.wall, innerPos)) throw new AcceptError('inner shell', new Error('could not be built'));
      const c = await buildCasing({ outerPos, innerPos, faces: engine.smoothFaces(3), params: s.params, place });
      casing = c;
      const b = bounds(outerPos);
      const name = s.name || 'Custom';
      spec = buildSpec({
        name, params: s.params, outline: s.outline, casing: c, outerBounds: b, checks: ctx.getChecks(), minWall: ctx.getMinWall(),
        cageVerts: engine.qs.vertCount, cageFaces: engine.qs.faces.length / 4, level: 3,
      });
      exploded?.dispose(); view.stageGroup.clear();
      exploded = new ExplodedView(c, place, s.params, view.shellMat, view.eyeMat, { w: b.size[0], h: b.size[1] });
      view.stageGroup.add(exploded.group);
      view.stageGroup.visible = true; view.setExploreVisible(false);
      s.mode = 'accepted'; s.exploded = true;
      panel.lock(true); toolbar.setMode(true); toolbar.setExploded(true);
      outputs.setCasing(spec, c.ms); // outputs is docked on wide screens; in drawer mode leave the exploded view uncovered
      {
        // frame the exploded set, nudged so the callout text on the right has room
        const target = new Vector3(0, ctx.getHeight() * 0.45, 6), pos = new Vector3(285, 100, 182);
        const right = target.clone().sub(pos).normalize().cross(new Vector3(0, 1, 0)).normalize().multiplyScalar(-6);
        view.flyTo(pos.clone().add(right), target.clone().add(right), 900);
      }
      toast(`Preview ready · ${Math.round(c.ms)} ms`);
    } catch (e) {
      console.error(e);
      const step = e instanceof AcceptError ? e.step : 'unknown';
      toast(`Build failed at ${step}`, 'error');
      outputs.setCasing(null);
    } finally { busy = false; if (store.state.mode === 'explore') outputs.setBusy(false); }
  };

  toolbar.onEdit = () => {
    store.state.mode = 'explore';
    exploded?.dispose(); exploded = null; view.stageGroup.clear(); view.stageGroup.visible = false; view.setExploreVisible(true);
    panel.lock(false); toolbar.setMode(false); outputs.setCasing(null); casing = null; spec = null;
    view.flyTo(new Vector3(110, 62, 172), new Vector3(0, ctx.getHeight() * 0.46, 0), 700);
    ctx.resume();
  };
  toolbar.onExplode = () => { store.state.exploded = !store.state.exploded; exploded?.setExploded(store.state.exploded); toolbar.setExploded(store.state.exploded); };

  return {
    async export(kind: string) {
      if (!casing || !spec) { await outputs.onBuild(); if (!casing || !spec) return; } // STL and STEP need the solids, so prepare the preview first
      const pr = casing.parts, hardware = [{ name: 'Core', mesh: pr.core }, ...pr.magnets.map((m, i) => ({ name: `Magnet ${i + 1}`, mesh: m })), ...pr.eyes.map((m, i) => ({ name: `Eye ${i + 1}`, mesh: m }))];
      if (kind === 'stl') {
        download(`${spec.name}-front.stl`, binaryStl(casing.front.positions, casing.front.tris, 'clayground front shell'));
        download(`${spec.name}-back.stl`, binaryStl(casing.back.positions, casing.back.tris, 'clayground back shell'));
        // the Core, magnets and eyes in one file (STL has no parts, so they travel together)
        let nv = 0, nt = 0; for (const h of hardware) { nv += h.mesh.positions.length; nt += h.mesh.tris.length; }
        const pos = new Float32Array(nv), tris = new Uint32Array(nt); let vo = 0, to = 0;
        for (const h of hardware) { pos.set(h.mesh.positions, vo); for (let i = 0; i < h.mesh.tris.length; i++) tris[to + i] = h.mesh.tris[i] + vo / 3; vo += h.mesh.positions.length; to += h.mesh.tris.length; }
        download(`${spec.name}-core-and-parts.stl`, binaryStl(pos, tris, 'clayground core, magnets and eyes'));
        toast('STL saved · shells and parts');
      } else if (kind === 'step') {
        toast('Preparing STEP…');
        const tol = 0.08; // mm: merges nearly coplanar facets and still reads back as the same shape in OpenCascade
        const [front, back, ...rest] = await Promise.all([simplifyMesh(casing.front, tol), simplifyMesh(casing.back, tol), ...hardware.map((h) => simplifyMesh(h.mesh, 0.03))]);
        const { text, stats } = stepFromBodies([{ name: 'Front shell', ...front }, { name: 'Back shell', ...back }, ...rest.map((m, i) => ({ name: hardware[i].name, ...m }))], { productName: spec.name, fileName: `${spec.name}.step`, description: `Clayground ${spec.name}: front and back shells, Core, magnets and eyes` });
        download(`${spec.name}.step`, text, 'application/step');
        toast(`STEP saved · shells, Core, magnets, eyes · ${(stats.bytes / 1048576).toFixed(0)} MB · faceted`, 'info', 6000);
      } else if (kind === 'spec') specJson();
    },
  };
}
