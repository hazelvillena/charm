// Fits the Ghost preset (outline + depth profile) to the reference body.
// usage: node scripts/fitReference.mjs   (reads reference/charmer-body.obj + charmer-meta.json)
import fs from 'node:fs';

const SCALE = 1.78;          // keep in sync with params/core.ts REFERENCE_SCALE
const CENTER_FRAC = 0.40;    // puck center C at 40% of the reference height
const WALL = 1.6, R_MIN = 12.7 + 0.3 + WALL + 1.5, R_MAX = 60;

const verts = []; const faces = [];
for (const l of fs.readFileSync('reference/charmer-body.obj', 'utf8').split('\n')) {
  const t = l.trim().split(/\s+/);
  if (t[0] === 'v') verts.push([+t[1] * SCALE, +t[2] * SCALE, +t[3] * SCALE]);
  else if (t[0] === 'f') faces.push(t.slice(1).map((x) => +x - 1));
}
const meta = JSON.parse(fs.readFileSync('reference/charmer-meta.json', 'utf8'));
let minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9, minX = 1e9, maxX = -1e9;
for (const v of verts) { minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]); minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]); minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]); }
const H = maxY - minY, Cy = minY + CENTER_FRAC * H;
const DEG = Math.PI / 180;

// ---- silhouette R(phi) in 1 degree bins ----
const bins = new Array(360).fill(0);
const polar = verts.map((v) => { const x = v[0], y = v[1] - Cy; return { phi: Math.atan2(y, x), r: Math.hypot(x, y), z: v[2] }; });
for (const p of polar) { const b = Math.floor((((p.phi / DEG) + 360) % 360)); bins[b] = Math.max(bins[b], p.r); }
const Rraw = (deg) => { const d = ((deg % 360) + 360) % 360; const b0 = Math.floor(d), f = d - b0; return bins[b0] * (1 - f) + bins[(b0 + 1) % 360] * f; };
const Rsil = (deg) => { let m = 0; for (let o = -1.5; o <= 1.5; o += 0.5) m = Math.max(m, Rraw(deg + o)); return m; };
const Rsym = (deg) => (Rsil(deg) + Rsil(180 - deg)) / 2;

// ---- spline evaluator (same math as src/geometry/profile.ts) ----
function makeSpline(anglesDeg, radii) {
  const n0 = anglesDeg.length; const a = [], r = [];
  for (let i = 0; i < n0; i++) { a.push(anglesDeg[i] * DEG); r.push(radii[i]); }
  for (let i = n0 - 2; i >= 1; i--) { a.push(Math.PI - anglesDeg[i] * DEG); r.push(radii[i]); }
  const n = a.length, TWO = Math.PI * 2;
  const h = (k) => (k === n - 1 ? a[0] + TWO - a[n - 1] : a[k + 1] - a[k]);
  const d = (k) => (r[(k + 1) % n] - r[k]) / h(k);
  const m = a.map((_, k) => { const d0 = d((k + n - 1) % n), d1 = d(k); return d0 * d1 <= 0 ? 0 : (2 * d0 * d1) / (d0 + d1); });
  return (deg) => {
    let p = (deg * DEG - a[0]) % TWO; if (p < 0) p += TWO; p += a[0];
    let k = n - 1; for (let i = 0; i < n - 1; i++) if (p < a[i + 1]) { k = i; break; }
    const hh = h(k), t = (p - a[k]) / hh, k1 = (k + 1) % n, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * r[k] + (t3 - 2 * t2 + t) * m[k] * hh + (-2 * t3 + 3 * t2) * r[k1] + (t3 - t2) * m[k1] * hh;
  };
}

// ---- greedy angle selection (7 right-half points incl. -90 and 90) ----
const cand = []; for (let a = -85; a <= 85; a += 5) cand.push(a);
let angles = [-90, 90];
const evalErr = (ang) => {
  const rad = ang.map((a) => Rsym(a));
  const s = makeSpline(ang, rad); let worst = 0, at = 0;
  for (let a = -90; a <= 90; a += 1) { const e = Math.abs(s(a) - Rsym(a)); if (e > worst) { worst = e; at = a; } }
  return { worst, at };
};
while (angles.length < 7) {
  const { at } = evalErr(angles);
  let best = null, bd = 1e9;
  for (const c of cand) { if (angles.some((a) => Math.abs(a - c) < 8)) continue; const dd = Math.abs(c - at); if (dd < bd) { bd = dd; best = c; } }
  angles = [...angles, best].sort((a, b) => a - b);
}
let radii = angles.map((a) => Rsym(a));
const clamped = radii.map((r) => Math.min(Math.max(r, R_MIN), R_MAX));
const err = evalErr(angles).worst;
radii = clamped;

// ---- depth profile ----
let zsum = 0, zn = 0;
for (const p of polar) { const R = Rsym(p.phi / DEG); if (p.r >= 0.97 * R) { zsum += p.z; zn++; } }
const zEq = zsum / zn;
const zf = maxZ - zEq, zb = zEq - minZ, depth = zf + zb;
const belly = Math.min(1, Math.max(0, (zf / depth - 0.45) / 0.2));
const fitN = (front) => {
  let best = 2, be = 1e9;
  for (let n = 2; n <= 4.6; n += 0.1) {
    let e = 0, c = 0;
    for (const p of polar) {
      const isF = p.z > zEq; if (isF !== front) continue;
      const R = Rsym(p.phi / DEG); const rho = Math.min(1, p.r / R);
      const zrel = Math.abs(p.z - zEq) / (front ? zf : zb);
      const model = Math.pow(Math.max(0, 1 - Math.pow(rho, n)), 1 / n);
      e += (zrel - model) ** 2; c++;
    }
    if (e / c < be) { be = e / c; best = n; }
  }
  return { n: best, rms: Math.sqrt(be) };
};
const nBack = fitN(false), nFront = fitN(true);
const backFlat = Math.min(1, Math.max(0, (nBack.n - 2) / 2.6));

const e = meta.eyes;
const eyeW = e.width * SCALE, eyeSpacing = (Math.abs(e.centerXs[0]) + Math.abs(e.centerXs[1])) * SCALE;
const eyeHeight = (e.centerY * SCALE) / H;

const out = {
  scale: SCALE, centerFrac: CENTER_FRAC,
  anglesDeg: angles, radii: radii.map((r) => +r.toFixed(2)),
  depth: +depth.toFixed(2), belly: +belly.toFixed(2), backFlat: +backFlat.toFixed(2),
  zEq: +zEq.toFixed(3),
  height: +H.toFixed(2), width: +(maxX - minX).toFixed(2),
  eyeSize: +eyeW.toFixed(2), eyeSpacing: +eyeSpacing.toFixed(2), eyeHeight: +eyeHeight.toFixed(3),
  // dense silhouette for the 2D reference overlay (every 5 deg, symmetric)
  silhouette: Array.from({ length: 73 }, (_, i) => +Rsym(-90 + i * 2.5).toFixed(2)),
  fitMaxErrorMm: +err.toFixed(2), nFront: +nFront.n.toFixed(1), nBack: +nBack.n.toFixed(1),
};
fs.writeFileSync('src/params/presets.generated.ts',
  `// GENERATED by scripts/fitReference.mjs from reference/charmer-body.obj. Do not edit by hand.\nexport const GHOST_FIT = ${JSON.stringify(out, null, 2)} as const;\n`);
console.log(JSON.stringify({ ...out, silhouette: undefined }, null, 1));
