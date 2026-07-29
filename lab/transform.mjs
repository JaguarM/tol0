// transform.mjs — the producer's glyph TRANSPORT LAW, applied to a stock face.
//
//   node lab/transform.mjs <in.ttf> <out.ttf> [--stalehmtx] [--rup] [--noround]
//
// Some producers do not rasterize the shipped outline. EFTA01150379
// (lab/families.mjs `dejavuserif786`) is the measured case: stock DejaVu Serif
// 2.34 was run through a quad→cubic→quad round trip on the 2048 integer grid
// before it reached the rasterizer, which perturbs curves by 1–2 font units and
// leaves straight segments untouched. That is a fifth axis of a producer's
// identity — (face, size, pen lattice, blend law, TRANSPORT law) — and this file
// is where a measured transport law is written down as code, the way a blend law
// lives in families.mjs `LAWS`.
//
// THE LAW, per contour (default flags — the `dejavuserif786law` pool's font):
//   1. materialize each implied on-curve midpoint at its exact half-integer,
//      rounded HALF-UP onto the grid (`half`);
//   2. elevate each quad to a cubic, C1 = P + ⅔(Q−P), C2 = R + ⅔(Q−R), each
//      control rounded half-up;
//   3. convert back per segment with three arithmetic shifts —
//         q1 = (3·C1 − P) >> 1;  q2 = (3·C2 − R) >> 1;  Q' = (q1 + q2) >> 1;
//   4. leave hmtx STALE (`--stalehmtx`): the producer recomputed each glyph's
//      bbox and did not touch its advance, so a renderer that positions by lsb
//      translates the glyph by (lsb − xMin_new). Baked into the outline here
//      because ftclone ignores hmtx. Full-font shift set {6,C,O,Q,S,d,e,g,q}.
// Straight segments never enter steps 2–3, so a glyph with no off-curve points
// is BYTE-IDENTICAL to stock — which is why K L T X Y Z w x are the control.
//
// WHY THESE EXACT ROUNDINGS, and not the family of near-misses around them:
//   --noround  drops every rounding. Elevation∘back-conversion is then the
//              algebraic identity, so the output equals stock — the change guard
//              that proves the whole effect is the grid rounding, nothing this
//              file does incidentally. (Verified: returns to baseline exactly.)
//   --rup      rounds each back-conversion arm half-up instead of >>1 (floor).
//              This is what the archived ubuntu-kit/gridtrip.py did; it scores
//              51.8% where the floor rule scores 98.5% on the isolated census.
//              The corpus discriminates the two by 46 points — the pin is not an
//              equivalence class. Kept so a wrong rule can be re-refuted, never
//              defaulted (../docs/METHOD.md: tolerance is part of the proof).
// The default (floor arms, no --rup) is concordant with ubuntu-kit/backlaw.py
// cell `two-hdn` on all three pre-registered predictions — glyf byte-identical
// on 65/65 base64 glyphs, the same stale set, every score cell.
//
// Reproduce the shipped font (sha256 75707371a24d48cf…):
//   node lab/transform.mjs fonts/DejaVuSerif.ttf out.ttf --stalehmtx
import { readFileSync, writeFileSync } from 'node:fs';

const IN = process.argv[2], OUT = process.argv[3];
if (!IN || !OUT) { console.error('usage: node lab/transform.mjs <in.ttf> <out.ttf> [--stalehmtx] [--rup] [--noround]'); process.exit(2); }
const NOROUND = process.argv.includes('--noround');
const STALE = process.argv.includes('--stalehmtx');
const RUP = process.argv.includes('--rup');
const b = readFileSync(IN);
const numTables = b.readUInt16BE(4);
const dir = [];
for (let i = 0; i < numTables; i++) {
  const o = 12 + i * 16;
  dir.push({ tag: b.toString('latin1', o, o + 4), csum: b.readUInt32BE(o + 4),
             off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) });
}
const T = Object.fromEntries(dir.map(d => [d.tag, d]));
const head = T.head.off;
const longLoca = b.readInt16BE(head + 50) === 1;
const numGlyphs = b.readUInt16BE(T.maxp.off + 4);
const loca = i => longLoca ? b.readUInt32BE(T.loca.off + i * 4) : b.readUInt16BE(T.loca.off + i * 2) * 2;

const half = v => Math.floor(v + 0.5);              // round half-UP
const sh1 = v => Math.floor(v / 2);                 // >>1, arithmetic (floor)

function transformContour(pts) {
  // pts: [{x,y,on}] in glyf order. Build explicit on/off alternation, with
  // implied midpoints materialized (and rounded half-up unless --noround).
  const n = pts.length;
  if (!n) return pts;
  const exp = [];
  for (let i = 0; i < n; i++) {
    const cur = pts[i], nxt = pts[(i + 1) % n];
    exp.push(cur);
    if (!cur.on && !nxt.on) {
      const mx = (cur.x + nxt.x) / 2, my = (cur.y + nxt.y) / 2;
      exp.push({ x: NOROUND ? mx : half(mx), y: NOROUND ? my : half(my), on: true });
    }
  }
  // rotate so exp[0] is on-curve
  let s = exp.findIndex(p => p.on);
  if (s < 0) return pts;
  const seq = exp.slice(s).concat(exp.slice(0, s));
  const out = [];
  for (let i = 0; i < seq.length;) {
    const P = seq[i];
    out.push({ x: P.x, y: P.y, on: true });
    const Q = seq[(i + 1) % seq.length];
    if (Q.on) { i += 1; continue; }                  // straight: untouched
    const R = seq[(i + 2) % seq.length];
    const el = (p, q) => {
      const v = p + 2 * (q - p) / 3;
      return NOROUND ? v : half(v);
    };
    const c1x = el(P.x, Q.x), c1y = el(P.y, Q.y);
    const c2x = el(R.x, Q.x), c2y = el(R.y, Q.y);
    const arm = RUP ? (v => half(v / 2)) : (v => sh1(v));
    const q1x = arm(3 * c1x - P.x), q1y = arm(3 * c1y - P.y);
    const q2x = arm(3 * c2x - R.x), q2y = arm(3 * c2y - R.y);
    out.push({ x: RUP ? half((q1x + q2x) / 2) : sh1(q1x + q2x),
               y: RUP ? half((q1y + q2y) / 2) : sh1(q1y + q2y), on: false });
    i += 2;
  }
  return out;
}

function encodeGlyph(contours, xMin, yMin, xMax, yMax) {
  const nc = contours.length;
  const all = [].concat(...contours);
  const endPts = [];
  let acc = -1;
  for (const c of contours) { acc += c.length; endPts.push(acc); }
  const parts = [];
  const hdr = Buffer.alloc(10);
  hdr.writeInt16BE(nc, 0);
  hdr.writeInt16BE(xMin, 2); hdr.writeInt16BE(yMin, 4);
  hdr.writeInt16BE(xMax, 6); hdr.writeInt16BE(yMax, 8);
  parts.push(hdr);
  const ep = Buffer.alloc(nc * 2 + 2);
  endPts.forEach((e, i) => ep.writeUInt16BE(e, i * 2));
  ep.writeUInt16BE(0, nc * 2);                        // instructionLength = 0
  parts.push(ep);
  const flags = Buffer.alloc(all.length);
  all.forEach((p, i) => { flags[i] = p.on ? 1 : 0; }); // no repeat, no short
  parts.push(flags);
  const xs = Buffer.alloc(all.length * 2), ys = Buffer.alloc(all.length * 2);
  let px = 0, py = 0;
  all.forEach((p, i) => { xs.writeInt16BE(p.x - px, i * 2); px = p.x;
                          ys.writeInt16BE(p.y - py, i * 2); py = p.y; });
  parts.push(xs, ys);
  let out = Buffer.concat(parts);
  if (out.length % 4) out = Buffer.concat([out, Buffer.alloc(4 - (out.length % 4))]);
  return out;
}

const newGlyphs = [];
let changed = 0;
for (let g = 0; g < numGlyphs; g++) {
  const a = loca(g), z = loca(g + 1);
  if (z <= a) { newGlyphs.push(Buffer.alloc(0)); continue; }
  const go = T.glyf.off + a;
  const nc = b.readInt16BE(go);
  if (nc < 0) { newGlyphs.push(b.subarray(go, T.glyf.off + z)); continue; }  // composite
  let p = go + 10;
  const endPts = [];
  for (let i = 0; i < nc; i++) { endPts.push(b.readUInt16BE(p)); p += 2; }
  const npts = nc ? endPts[nc - 1] + 1 : 0;
  const il = b.readUInt16BE(p); p += 2 + il;
  const flags = [];
  while (flags.length < npts) { const f = b[p++]; flags.push(f); if (f & 8) { let r = b[p++]; while (r-- > 0) flags.push(f); } }
  const xs = []; let x = 0;
  for (let i = 0; i < npts; i++) { const f = flags[i];
    if (f & 2) { const d = b[p++]; x += (f & 16) ? d : -d; } else if (!(f & 16)) { x += b.readInt16BE(p); p += 2; }
    xs.push(x); }
  const ys = []; let y = 0;
  for (let i = 0; i < npts; i++) { const f = flags[i];
    if (f & 4) { const d = b[p++]; y += (f & 32) ? d : -d; } else if (!(f & 32)) { y += b.readInt16BE(p); p += 2; }
    ys.push(y); }
  const contours = [];
  let st = 0;
  for (let ci = 0; ci < nc; ci++) {
    const e = endPts[ci];
    const pts = [];
    for (let i = st; i <= e; i++) pts.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
    contours.push(transformContour(pts));
    st = e + 1;
  }
  let flat = [].concat(...contours);
  if (STALE && flat.length) {
    const origXMin = b.readInt16BE(go + 2);
    const newXMin0 = Math.min(...flat.map(q => q.x));
    const d = origXMin - newXMin0;
    if (d) for (const c of contours) for (const q of c) q.x += d;
    flat = [].concat(...contours);
  }
  const nxMin = Math.min(...flat.map(q => q.x)), nxMax = Math.max(...flat.map(q => q.x));
  const nyMin = Math.min(...flat.map(q => q.y)), nyMax = Math.max(...flat.map(q => q.y));
  newGlyphs.push(encodeGlyph(contours, nxMin, nyMin, nxMax, nyMax));
  changed++;
}

// rebuild glyf + loca (long format)
const glyf = Buffer.concat(newGlyphs);
const locaBuf = Buffer.alloc((numGlyphs + 1) * 4);
let off = 0;
newGlyphs.forEach((g, i) => { locaBuf.writeUInt32BE(off, i * 4); off += g.length; });
locaBuf.writeUInt32BE(off, numGlyphs * 4);

const keep = dir.filter(d => d.tag !== 'glyf' && d.tag !== 'loca');
const tables = keep.map(d => ({ tag: d.tag, csum: d.csum, data: b.subarray(d.off, d.off + d.len) }))
  .concat([{ tag: 'glyf', csum: 0, data: glyf }, { tag: 'loca', csum: 0, data: locaBuf }])
  .sort((a, c) => (a.tag < c.tag ? -1 : 1));

const N = tables.length;
const headerLen = 12 + N * 16;
let pos = headerLen;
const outParts = [];
const hdr = Buffer.alloc(headerLen);
b.copy(hdr, 0, 0, 12);
hdr.writeUInt16BE(N, 4);
tables.forEach((t, i) => {
  const o = 12 + i * 16;
  hdr.write(t.tag, o, 'latin1');
  hdr.writeUInt32BE(t.csum, o + 4);
  hdr.writeUInt32BE(pos, o + 8);
  hdr.writeUInt32BE(t.data.length, o + 12);
  pos += t.data.length;
  if (pos % 4) pos += 4 - (pos % 4);
});
outParts.push(hdr);
let cur = headerLen;
for (const t of tables) {
  outParts.push(t.data); cur += t.data.length;
  if (cur % 4) { const pad = 4 - (cur % 4); outParts.push(Buffer.alloc(pad)); cur += pad; }
}
const outBuf = Buffer.concat(outParts);
// indexToLocFormat = 1 (long): patch the head table's field in the OUTPUT
const headTblOff = outBuf.readUInt32BE(12 + tables.findIndex(t => t.tag === 'head') * 16 + 8);
outBuf.writeInt16BE(1, headTblOff + 50);
writeFileSync(OUT, outBuf);
console.log(`${changed} simple glyphs transformed -> ${OUT} (${outBuf.length} bytes)` +
            `${NOROUND ? '  [--noround: identity control]' : ''}${RUP ? '  [--rup: r_up arms, refuted variant]' : ''}${STALE ? '  [--stalehmtx]' : ''}`);
