/**
 * STEP (ISO 10303-21, AP214) writer for FACETED solids. Each triangle becomes a planar face
 * (MANIFOLD_SOLID_BREP, ADVANCED_FACE on a PLANE, shared EDGE_CURVEs), the form every CAD kernel reads
 * (verified by round-tripping through OpenCascade in the tests; the POLY_LOOP "faceted_brep" form is silently
 * dropped by OpenCascade, so it is not used). CAD tools (Creo, Rhino, SolidWorks, Fusion) import the result as
 * a solid body for reference, mass properties and assembly. It is faceted, NOT NURBS: for true smooth surfaces use
 * exportNurbs.ts (STEP with bicubic B-spline patches) or take the cage OBJ to Rhino (ToSubD, then ToNURBS). Pure function, no DOM.
 */
export type StepBody = { name: string; positions: ArrayLike<number>; tris: ArrayLike<number> };
export type StepStats = { bodies: number; faces: number; points: number; edges: number; bytes: number };

const q = (s: string) => s.replace(/'/g, "''").replace(/[^\x20-\x7e]/g, '?');
const num = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(5);

export function stepFromBodies(bodies: StepBody[], opts: { productName: string; description?: string; fileName?: string; timestamp?: string }): { text: string; stats: StepStats } {
  const out: string[] = [];
  let id = 0;
  const e = (body: string) => { id += 1; out.push(`#${id}=${body};`); return id; };
  const r = (n: number) => `#${n}`;

  // ---- context and units (millimetres) ----
  const appCtx = e("APPLICATION_CONTEXT('core data for automotive_design')");
  e(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${r(appCtx)})`);
  const len = e('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
  const ang = e('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
  const sa = e('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
  const unc = e(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),${r(len)},'distance_accuracy_value','confusion accuracy')`);
  const ctx = e(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${r(unc)})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${r(len)},${r(ang)},${r(sa)})) REPRESENTATION_CONTEXT('Context3D','3D Context with UNIT and UNCERTAINTY') )`);

  // ---- bodies: closed shells of planar triangular faces with shared edges ----
  const solids: number[] = [];
  let faces = 0, points = 0, edgesTotal = 0;
  for (const b of bodies) {
    const P = b.positions, T = b.tris;
    const vp = new Map<number, { c: number; v: number }>();
    const vertex = (i: number) => {
      let v = vp.get(i);
      if (!v) { const c = e(`CARTESIAN_POINT('',(${num(P[i * 3])},${num(P[i * 3 + 1])},${num(P[i * 3 + 2])}))`); v = { c, v: e(`VERTEX_POINT('',${r(c)})`) }; vp.set(i, v); points++; }
      return v;
    };
    const edges = new Map<number, number>(); // canonical (min -> max) edge key -> EDGE_CURVE
    const edge = (x: number, y: number) => {
      const lo = Math.min(x, y), hi = Math.max(x, y), key = lo * 4294967296 + hi;
      let ec = edges.get(key);
      if (ec === undefined) {
        const a = vertex(lo), c = vertex(hi);
        const dx = P[hi * 3] - P[lo * 3], dy = P[hi * 3 + 1] - P[lo * 3 + 1], dz = P[hi * 3 + 2] - P[lo * 3 + 2], L = Math.hypot(dx, dy, dz) || 1;
        const dir = e(`DIRECTION('',(${(dx / L).toFixed(7)},${(dy / L).toFixed(7)},${(dz / L).toFixed(7)}))`);
        const vec = e(`VECTOR('',${r(dir)},${num(L)})`);
        const line = e(`LINE('',${r(a.c)},${r(vec)})`);
        ec = e(`EDGE_CURVE('',${r(a.v)},${r(c.v)},${r(line)},.T.)`); edges.set(key, ec); edgesTotal++;
      }
      return { ec, forward: x < y };
    };
    const faceIds: number[] = [];
    for (let t = 0; t < T.length; t += 3) {
      const a = T[t], c = T[t + 1], d = T[t + 2];
      if (a === c || c === d || a === d) continue;
      const ux = P[c * 3] - P[a * 3], uy = P[c * 3 + 1] - P[a * 3 + 1], uz = P[c * 3 + 2] - P[a * 3 + 2];
      const wx = P[d * 3] - P[a * 3], wy = P[d * 3 + 1] - P[a * 3 + 1], wz = P[d * 3 + 2] - P[a * 3 + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-9) continue; // zero-area sliver
      nx /= nl; ny /= nl; nz /= nl;
      const ul = Math.hypot(ux, uy, uz) || 1;
      const dn = e(`DIRECTION('',(${nx.toFixed(7)},${ny.toFixed(7)},${nz.toFixed(7)}))`);
      const dr = e(`DIRECTION('',(${(ux / ul).toFixed(7)},${(uy / ul).toFixed(7)},${(uz / ul).toFixed(7)}))`);
      const ax = e(`AXIS2_PLACEMENT_3D('',${r(vertex(a).c)},${r(dn)},${r(dr)})`);
      const plane = e(`PLANE('',${r(ax)})`);
      const oes = [[a, c], [c, d], [d, a]].map(([x, y]) => { const ed = edge(x, y); return e(`ORIENTED_EDGE('',*,*,${r(ed.ec)},${ed.forward ? '.T.' : '.F.'})`); });
      const loop = e(`EDGE_LOOP('',(${oes.map(r).join(',')}))`);
      const bound = e(`FACE_OUTER_BOUND('',${r(loop)},.T.)`);
      faceIds.push(e(`ADVANCED_FACE('',(${r(bound)}),${r(plane)},.T.)`));
    }
    faces += faceIds.length;
    const shell = e(`CLOSED_SHELL('',(${faceIds.map(r).join(',')}))`);
    solids.push(e(`MANIFOLD_SOLID_BREP('${q(b.name)}',${r(shell)})`));
  }

  // ---- product structure ----
  const pctx = e(`PRODUCT_CONTEXT('',${r(appCtx)},'mechanical')`);
  const prod = e(`PRODUCT('${q(opts.productName)}','${q(opts.productName)}','${q(opts.description ?? '')}',(${r(pctx)}))`);
  const pdf = e(`PRODUCT_DEFINITION_FORMATION('','',${r(prod)})`);
  const pdc = e(`PRODUCT_DEFINITION_CONTEXT('part definition',${r(appCtx)},'design')`);
  const pd = e(`PRODUCT_DEFINITION('design','',${r(pdf)},${r(pdc)})`);
  const pds = e(`PRODUCT_DEFINITION_SHAPE('','',${r(pd)})`);
  const rep = e(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${solids.map(r).join(',')}),${r(ctx)})`);
  e(`SHAPE_DEFINITION_REPRESENTATION(${r(pds)},${r(rep)})`);

  const header = [
    'ISO-10303-21;', 'HEADER;',
    `FILE_DESCRIPTION(('${q(opts.description ?? 'Clayground casing, faceted B-rep (not NURBS)')}'),'2;1');`,
    `FILE_NAME('${q(opts.fileName ?? 'charmer.step')}','${opts.timestamp ?? new Date().toISOString().slice(0, 19)}',('Clayground'),(''),'Clayground','Clayground','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;',
  ];
  const text = [...header, ...out, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
  return { text, stats: { bodies: bodies.length, faces, points, edges: edgesTotal, bytes: text.length } };
}
