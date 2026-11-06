// Extracts the body of charmerv1.obj into a lean welded quad OBJ + meta json.
// usage: node scripts/extractReference.mjs "<path to charmerv1.obj>"
import fs from 'node:fs';
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/extractReference.mjs <obj>'); process.exit(1); }
const v = [], objs = []; let cur = null;
for (const l of fs.readFileSync(src, 'utf8').split('\n')) {
  const t = l.trim().split(/\s+/);
  if (t[0] === 'o') { cur = { name: t[1], f: [] }; objs.push(cur); }
  else if (t[0] === 'v') v.push([+t[1], +t[2], +t[3]]);
  else if (t[0] === 'f') cur.f.push(t.slice(1).map((x) => parseInt(x.split('/')[0]) - 1));
}
const stats = (o) => {
  const ids = new Set(o.f.flat()); const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const i of ids) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i][k]); mx[k] = Math.max(mx[k], v[i][k]); }
  return { name: o.name, faces: o.f.length, min: mn, max: mx, size: mx.map((m, k) => m - mn[k]) };
};
const all = objs.map(stats);
const body = objs.reduce((a, b) => (b.f.length < a.f.length ? b : a)); // smallest quad object = body
const bs = stats(body);
const eyes = objs.filter((o) => o !== body).map(stats);
// weld, recenter: x,z centered, y bottom = 0; front stays +Z
const key = (p) => p.map((c) => c.toFixed(4)).join(',');
const map = new Map(), verts = [];
const idx = (i) => { const k = key(v[i]); if (!map.has(k)) { map.set(k, verts.length); verts.push(v[i]); } return map.get(k); };
const faces = body.f.map((f) => f.map(idx));
const cx = (bs.min[0] + bs.max[0]) / 2, cz = (bs.min[2] + bs.max[2]) / 2, y0 = bs.min[1];
let out = '# charmer body (welded quads, recentered: x,z center, y bottom=0, front=+Z)\n';
for (const p of verts) out += `v ${(p[0] - cx).toFixed(5)} ${(p[1] - y0).toFixed(5)} ${(p[2] - cz).toFixed(5)}\n`;
for (const f of faces) out += `f ${f.map((i) => i + 1).join(' ')}\n`;
fs.mkdirSync('reference', { recursive: true });
fs.writeFileSync('reference/charmer-body.obj', out);
const eyeInfo = eyes.length >= 2 ? {
  width: eyes[0].size[0], height: eyes[0].size[1], depth: eyes[0].size[2],
  centerXs: eyes.map((e) => (e.min[0] + e.max[0]) / 2 - cx),
  centerY: (eyes[0].min[1] + eyes[0].max[1]) / 2 - y0,
} : null;
fs.writeFileSync('reference/charmer-meta.json', JSON.stringify({
  source: 'charmerv1.obj', units: 'file units (scale unknown)', size: bs.size,
  verts: verts.length, quads: faces.length, eyes: eyeInfo,
}, null, 2));
console.log('objects', all.map((a) => `${a.name}:${a.faces}`).join(' '), '\nbody verts', verts.length, 'quads', faces.length, '\nsize', bs.size.map((s) => s.toFixed(2)));
