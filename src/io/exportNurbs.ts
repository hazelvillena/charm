import { interpolation, patchControlPoints, curveControlPoints } from '../geometry/nurbs';

/**
 * STEP (ISO 10303-21, AP214) with TRUE NURBS: one bicubic B_SPLINE_SURFACE_WITH_KNOTS per cage quad, joined along shared
 * B_SPLINE_CURVE edges into one closed MANIFOLD_SOLID_BREP. Opens in Creo, Rhino, SolidWorks and Fusion as smooth,
 * editable surfaces (they can shell, offset and fillet it), not as thousands of flat facets. Pure function, no DOM.
 */
const q = (s: string) => s.replace(/'/g, "''").replace(/[^\x20-\x7e]/g, '?');
const num = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(6);
const list = (a: number[]) => `(${a.map((x) => num(x)).join(',')})`;

export type NurbsStats = { patches: number; edges: number; points: number; bytes: number };

export function nurbsBodyStep(cageFaces: Uint32Array, grids: Float64Array[], level: number, opts: { productName: string; description?: string; fileName?: string; timestamp?: string }): { text: string; stats: NurbsStats } {
  const m = 2 ** level, it = interpolation(m), n = it.n, out: string[] = [];
  let id = 0;
  const e = (body: string) => { id += 1; out.push(`#${id}=${body};`); return id; };
  const r = (k: number) => `#${k}`;

  const appCtx = e("APPLICATION_CONTEXT('core data for automotive_design')");
  e(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${r(appCtx)})`);
  const len = e('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
  const ang = e('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
  const sa = e('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
  const unc = e(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),${r(len)},'distance_accuracy_value','confusion accuracy')`);
  const ctx = e(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${r(unc)})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${r(len)},${r(ang)},${r(sa)})) REPRESENTATION_CONTEXT('Context3D','3D Context with UNIT and UNCERTAINTY') )`);

  let points = 0;
  const pt = (x: number, y: number, z: number) => { points++; return e(`CARTESIAN_POINT('',(${num(x)},${num(y)},${num(z)}))`); };
  const knotsText = `${'(' + it.mult.join(',') + ')'},${list(it.distinct)}`;

  // vertices (cage corners) and shared edge curves
  const verts = new Map<number, number>(); // cage vertex -> VERTEX_POINT
  const vertex = (cv: number, p: [number, number, number]) => { let v = verts.get(cv); if (v === undefined) { v = e(`VERTEX_POINT('',${r(pt(p[0], p[1], p[2]))})`); verts.set(cv, v); } return v; };
  const edges = new Map<number, number>();
  const sample = (g: Float64Array, idx: number): [number, number, number] => [g[idx * 3], g[idx * 3 + 1], g[idx * 3 + 2]];
  // grid index of the t-th sample (0..m) along each of the quad's four edges, in the quad's own direction
  const along = [(t: number) => t * (m + 1), (t: number) => m * (m + 1) + t, (t: number) => (m - t) * (m + 1) + m, (t: number) => m - t];

  const faceIds: number[] = [];
  for (let f = 0; f < grids.length; f++) {
    const g = grids[f], cv = [0, 1, 2, 3].map((i) => cageFaces[f * 4 + i]);
    const oes: number[] = [];
    for (let s = 0; s < 4; s++) {
      const a = cv[s], b = cv[(s + 1) & 3], lo = Math.min(a, b), hi = Math.max(a, b), key = lo * 4294967296 + hi;
      let ec = edges.get(key);
      if (ec === undefined) {
        const pts = new Float64Array(n * 3);
        for (let t = 0; t < n; t++) { const src = a === lo ? t : m - t; const p = sample(g, along[s](src)); pts[t * 3] = p[0]; pts[t * 3 + 1] = p[1]; pts[t * 3 + 2] = p[2]; } // always run from the lower to the higher vertex id
        const cp = curveControlPoints(pts, it), ids: number[] = [];
        for (let t = 0; t < n; t++) ids.push(pt(cp[t * 3], cp[t * 3 + 1], cp[t * 3 + 2]));
        const v1 = vertex(lo, [pts[0], pts[1], pts[2]]), v2 = vertex(hi, [pts[(n - 1) * 3], pts[(n - 1) * 3 + 1], pts[(n - 1) * 3 + 2]]);
        const curve = e(`B_SPLINE_CURVE_WITH_KNOTS('',3,(${ids.map(r).join(',')}),.UNSPECIFIED.,.F.,.F.,${knotsText},.UNSPECIFIED.)`);
        ec = e(`EDGE_CURVE('',${r(v1)},${r(v2)},${r(curve)},.T.)`); edges.set(key, ec);
      }
      oes.push(e(`ORIENTED_EDGE('',*,*,${r(ec)},${a === lo ? '.T.' : '.F.'})`));
    }
    const cp = patchControlPoints(g, it), rows: string[] = [];
    for (let i = 0; i < n; i++) { const row: number[] = []; for (let j = 0; j < n; j++) row.push(pt(cp[(i * n + j) * 3], cp[(i * n + j) * 3 + 1], cp[(i * n + j) * 3 + 2])); rows.push(`(${row.map(r).join(',')})`); }
    const surf = e(`B_SPLINE_SURFACE_WITH_KNOTS('',3,3,(${rows.join(',')}),.UNSPECIFIED.,.F.,.F.,.F.,(${it.mult.join(',')}),(${it.mult.join(',')}),${list(it.distinct)},${list(it.distinct)},.UNSPECIFIED.)`);
    const loop = e(`EDGE_LOOP('',(${oes.map(r).join(',')}))`);
    const bound = e(`FACE_OUTER_BOUND('',${r(loop)},.T.)`);
    faceIds.push(e(`ADVANCED_FACE('',(${r(bound)}),${r(surf)},.T.)`));
  }
  const shell = e(`CLOSED_SHELL('',(${faceIds.map(r).join(',')}))`);
  const solid = e(`MANIFOLD_SOLID_BREP('${q(opts.productName)}',${r(shell)})`);

  const pctx = e(`PRODUCT_CONTEXT('',${r(appCtx)},'mechanical')`);
  const prod = e(`PRODUCT('${q(opts.productName)}','${q(opts.productName)}','${q(opts.description ?? '')}',(${r(pctx)}))`);
  const pdf = e(`PRODUCT_DEFINITION_FORMATION('','',${r(prod)})`);
  const pdc = e(`PRODUCT_DEFINITION_CONTEXT('part definition',${r(appCtx)},'design')`);
  const pd = e(`PRODUCT_DEFINITION('design','',${r(pdf)},${r(pdc)})`);
  const pds = e(`PRODUCT_DEFINITION_SHAPE('','',${r(pd)})`);
  const rep = e(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${r(solid)}),${r(ctx)})`);
  e(`SHAPE_DEFINITION_REPRESENTATION(${r(pds)},${r(rep)})`);

  const header = [
    'ISO-10303-21;', 'HEADER;',
    `FILE_DESCRIPTION(('${q(opts.description ?? 'Clayground body, NURBS surfaces (bicubic patches)')}'),'2;1');`,
    `FILE_NAME('${q(opts.fileName ?? 'charmer-nurbs.step')}','${opts.timestamp ?? new Date().toISOString().slice(0, 19)}',('Clayground'),(''),'Clayground','Clayground','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;',
  ];
  const text = [...header, ...out, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
  return { text, stats: { patches: grids.length, edges: edges.size, points, bytes: text.length } };
}
