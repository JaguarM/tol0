// resample-fit.mjs — fit the producer's downscale against EVERY known glyph on
// a page, not one.
//
//   node monospace-lab/resample-fit.mjs --null          # certify the harness
//   node monospace-lab/resample-fit.mjs                 # default fit
//   node monospace-lab/resample-fit.mjs --em 2500,2600,8 --fy 2.88,3.00,0.04
//   node monospace-lab/resample-fit.mjs --pen 16,8,4,2 --dump
//   node monospace-lab/resample-fit.mjs --solve-joint --solve-phase --phase-halves
//   node monospace-lab/resample-fit.mjs --solve-joint --solve-phase --joint-dump
//   node monospace-lab/resample-fit.mjs --synth --synth-ramp 0.206929 ...   # its controls
//   node monospace-lab/resample-fit.mjs --synth --synth-phi-sample 0.206929 # commutation
//   node monospace-lab/resample-fit.mjs --synth --synth-tapq 64 --synth-qy 16
//
// TRAP, and it cost three verdicts before it was caught (2026-08-03e): SWEEPING
// A SCALE FACTOR DOES NOT SWEEP ONLY THE SCALE. Kernel widths are carried in
// SOURCE px and glyph size in em64, so --fx / --fy also move the physical filter
// footprint (k/f output px) and the physical glyph size (em·aspect/f). Every
// "sharp interior minimum" in a scale factor this file has reported was those
// two. Hold the physics — x geometry untouched, --aspect f/f0, ky ∝ f — and the
// objective goes flat, because a shape fit cannot see a source LATTICE at all.
// Only a repeat can (the Δcol=48 byte-identity, which is why fx has a
// denominator and fy has nothing).
//
// WHY THIS EXISTS. The `page-downscale-816x1073` family (lab/families.mjs) is a
// page resampled after rendering, so no (face, em64, pen, law) reproduces it
// and no roster sweep can close it. The only route is a forward model:
// rasterize at the source resolution, apply the producer's resample, compare.
//
// The shape of the problem, not the search range, is what makes it tractable.
// Every line of these documents starts with '>', so a page carries ~60
// instances of a KNOWN character in a KNOWN column — they share ONE source
// x-pen while the y-pen walks the line lattice. Three numbers (X0, Y0, pitch)
// must explain sixty glyphs at sixty different y phases. A shallow valley
// cannot survive that; a single glyph provably cannot separate kernel width
// from pen shift.
//
// SUPERSEDES the 2026-07-31 model this file used to carry (one gaussian sigma
// per axis, uniform y scale 3300/1073). Both were refuted 2026-08-02:
//   - the kernels are TENTS, not gaussians and not boxes (score curves plus a
//     non-parametric least-squares solve for the taps, which agree);
//   - the geometry is ANISOTROPIC — x factor 3.125 (pinned by the Δcol=48
//     byte-identity), y factor 2.92-2.96 measured with an interior minimum.
// Assuming a uniform scale is what made every earlier fit inflate em64 to
// whatever bound it was given: it was buying vertical scale with size.
//
// Three stages, deliberately separate:
//   A  FIT     per instance the pen floats inside a small box, so a wrong
//              (em64, factor, kernel) cannot hide behind one lucky alignment.
//   B  LINE    those pens must collapse onto ONE line, robustly (2σ rejection
//              then a refinement over X0, Y0, pitch). The line is the physics.
//   C  SCORE   re-score with pens PREDICTED from that line, allowing only a
//              small nudge. This number, not stage A's, is the objective.
//
// TRAP, and it invalidated numbers inside a session before it was caught: the
// pen-line stage is FRAGILE. Place the line on too few markers and one marker
// whose free-pen search fell into a wrong local minimum drags it further than
// stage C's nudge can recover — the same physics scored 817 per glyph on 6
// markers and 205 on 8, 12 or 57. Fewer than 8 markers is instrument noise,
// and this file refuses to report a score from fewer.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { decodePage } from './src/raster-node.mjs';
import { detectRows, detectColumns } from './src/lines.mjs';
import { FTClone } from '../ftclone/ftclone.mjs';

const require = createRequire(import.meta.url);
const LAB = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(LAB, '..');
const engine = require(join(REPO, 'engine', 'ocr-engine.js'));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const flag = n => argv.includes(`--${n}`);

// ---- the shift kernels' moments, VERIFIED rather than quoted -----------------
// The whole (b) vs (b′) discriminator is six closed forms. CLAUDE.md rule 1
// applies to algebra written in an entry as much as to a constant: re-derive it
// from the taps before building on it. This costs milliseconds and runs before
// the page is even opened.
if (flag('shift-algebra')) {
  const lin = d => [[0, 1 - d], [1, d]];
  const cr = d => [[-1, -0.5 * d + d * d - 0.5 * d ** 3], [0, 1 - 2.5 * d * d + 1.5 * d ** 3],
    [1, 0.5 * d + 2 * d * d - 1.5 * d ** 3], [2, -0.5 * d * d + 0.5 * d ** 3]];
  const mom = (taps, n, c) => taps.reduce((s, [j, w]) => s + w * (j - c) ** n, 0);
  let worst = 0;
  const chk = (name, got, want) => {
    const e = Math.abs(got - want); if (e > worst) worst = e;
    return `${name} ${got.toFixed(9)} vs ${want.toFixed(9)}  ${e < 1e-12 ? 'ok' : 'MISMATCH'}`;
  };
  console.log('SHIFT-KERNEL ALGEBRA — closed forms checked against the taps themselves\n');
  for (const d of [0, 0.1, 0.2113, 0.25, 0.5, 0.75, 0.9, 1]) {
    const L = lin(d), C = cr(d);
    const o = d * (1 - d) * (1 - 2 * d);
    console.log(`  δ = ${d.toFixed(4)}`);
    console.log(`    lin  ${chk('Σw', mom(L, 0, 0), 1)}  ${chk('μ₁', mom(L, 1, 0), d)}` +
      `  ${chk('μ₂', mom(L, 2, d), d * (1 - d))}  ${chk('μ₃', mom(L, 3, d), o)}`);
    console.log(`    cr   ${chk('Σw', mom(C, 0, 0), 1)}  ${chk('μ₁', mom(C, 1, 0), d)}` +
      `  ${chk('μ₂', mom(C, 2, d), 0)}  ${chk('μ₃', mom(C, 3, d), o)}` +
      `  ${chk('μ₄', mom(C, 4, d), -9 * d * d * (1 - d) ** 2)}`);
  }
  // The sd's over δ ~ U(0,1) that turn a measured modulation into g/σ.
  const N = 2000001; let s2 = 0, s3 = 0, s4 = 0, q2 = 0, q3 = 0, q4 = 0;
  for (let n = 0; n < N; n++) {
    const d = (n + 0.5) / N, a = d * (1 - d), c = a * (1 - 2 * d), e = 9 * d * d * (1 - d) ** 2;
    s2 += a; q2 += a * a; s3 += c; q3 += c * c; s4 += e; q4 += e * e;
  }
  const sdOf = (s, q) => Math.sqrt(q / N - (s / N) ** 2);
  console.log(`\n  over δ ~ U(0,1):  sd[δ(1−δ)] ${sdOf(s2, q2).toFixed(5)} (entry: 0.07454)` +
    `   sd[δ(1−δ)(1−2δ)] ${sdOf(s3, q3).toFixed(5)} (entry: 0.06901)` +
    `\n                    sd[9δ²(1−δ)²] ${sdOf(s4, q4).toFixed(5)} (entry: 0.1964)` +
    `   mean[9δ²(1−δ)²] ${(s4 / N).toFixed(5)} (entry: 0.3 = 9/30)`);
  console.log(`\n  worst absolute error over all checks: ${worst.toExponential(2)} — ` +
    `${worst < 1e-12 ? 'EVERY CLOSED FORM CONFIRMED' : 'THE ALGEBRA IS WRONG, STOP'}`);
  process.exit(worst < 1e-12 ? 0 : 1);
}

// ---- the null ----------------------------------------------------------------
// At scale 1 with box(1) kernels the resample is the identity, so the whole
// path — render, fz composite, resample, pen line, scoring — must reproduce a
// NATIVE courier page byte-exactly. It does (65/65 leading '>' on
// corpus-cour832 p2, pen phase x 0.00 / y 0.00). Re-run this before trusting
// any fit: it is the one step known to be exact, and it is what makes a
// non-zero score on the suspect mean something.
const NULL = flag('null');
const DOC = opt('doc', NULL ? 'lab/base64/corpus-cour832/EFTA00434905.pdf'
                            : 'lab/base64/courir-strech/EFTA02154109.pdf');
const PNO = +opt('page', 2);
// The Δcol=48 byte-identity pins this factor's DENOMINATOR to 8 — 48 output px
// is 6 periods of 8 — but NOT its numerator: 24/8, 25/8 and 26/8 all satisfy
// it. 25/8 is the assumption every session has carried; --fx is how you test it.
let FX = NULL ? 1 : +opt('fx', String(25 / 8));
// Rounding is NOT certified by the null: at scale 1 the resample is the
// identity, so every value is already an integer and no rule can show itself.
const ROUND = opt('round', 'half-up');
const roundBy = ROUND === 'trunc' ? a => Math.floor(a)
  : ROUND === 'half-even' ? a => { const f = Math.floor(a), r = a - f;
      return r > 0.5 ? f + 1 : r < 0.5 ? f : (f % 2 ? f + 1 : f); }
  : a => Math.floor(a + 0.5);
const FYS = NULL ? [1] : range(opt('fy', '2.88,3.00,0.02'));
const EMS = NULL ? [832] : range(opt('em', '2500,2600,10'));
const KX = NULL ? 'box:1' : opt('kx', 'tri:3.125');
const KY = NULL ? 'box:1' : opt('ky', 'tri:2.63');
const PENS = opt('pen', '16').split(',').map(Number);   // 1/64 source px steps
const NMARK = +opt('markers', '57');
const CP = (opt('char', '>')).codePointAt(0);
const PADX = +opt('padx', '2'), PADY = +opt('pady', '3');
// The glyph measures ~5% taller than Courier New at the advance-pinned width.
// TWO different physics produce that, and they are not the same experiment:
//   --fy   <  fx    the PAGE was resampled anisotropically (a uniform render,
//                   squeezed vertically afterwards);
//   --aspect > 1    the TEXT MATRIX was anisotropic (the outline was stretched
//                   BEFORE rasterization, then the page resampled uniformly).
// For '>' — a glyph that is nothing but diagonals — these put the arm edges on
// different sub-pixel positions, so the page can tell them apart. Sweep one
// with the other held at its uniform value; sweeping both is degenerate in the
// bounding box and only the arm interiors break the tie.
const ASPECTS = NULL ? [1] : range(opt('aspect', '1.0'));
// Pen quantum, in 1/PENQ source px: 1 = whole source pixels (a grid-fitting
// renderer), 2 = ½ px, 64 = free (the default, and what every fit before
// 2026-08-03 assumed without ever saying so). NQ is how many quanta the
// per-marker search may move; keep it at 1 so the model stays constrained.
const PENQ = NULL ? 64 : +opt('penq', '64');
const NQ = +opt('nq', '1');
const QAX = opt('penq-axis', 'y');
const QAX_X = QAX.includes('x'), QAX_Y = QAX.includes('y');

function range(s) {
  const p = s.split(',').map(Number);
  if (p.length < 3) return p;
  const [a, b, st] = p, out = [];
  for (let v = a; v <= b + 1e-9; v += st) out.push(+v.toFixed(6));
  return out;
}

// ---- the page and its markers ------------------------------------------------
const page = decodePage(resolve(REPO, DOC), PNO);
const det = detectRows(page, engine);
const col = detectColumns(page, det.mask, det.rows);
console.log(`${DOC} p${PNO} ${page.w}×${page.h} — ${det.rows.length} rows, ` +
  `col pitch ${col.pitch.toFixed(4)}, row pitch ${det.yGrid.pitch.toFixed(4)}`);

const inst = [];
for (const r of det.rows) {
  let x0 = -1;
  for (let x = 0; x < page.w && x0 < 0; x++)
    for (let y = r.top; y < r.top + det.rowH; y++)
      if (page.gray[y * page.w + x] < 255 && !det.mask[y * page.w + x]) { x0 = x; break; }
  if (x0 < 0) continue;
  let x1 = x0, blank = 0;
  for (let x = x0; x < x0 + 16; x++) {
    let ink = false;
    for (let y = r.top; y < r.top + det.rowH; y++)
      if (page.gray[y * page.w + x] < 255 && !det.mask[y * page.w + x]) { ink = true; break; }
    if (ink) { x1 = x; blank = 0; } else if (++blank >= 2) break;
  }
  let y0 = 1e9, y1 = -1;
  for (let y = r.top; y < r.top + det.rowH; y++)
    for (let x = x0; x <= x1; x++)
      if (page.gray[y * page.w + x] < 255 && !det.mask[y * page.w + x]) {
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  if (y1 < y0) continue;
  inst.push({ k: r.k, x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
}
const mode = (arr, f) => {
  const m = new Map();
  for (const a of arr) m.set(f(a), (m.get(f(a)) ?? 0) + 1);
  return [...m.entries()].sort((p, q) => q[1] - p[1])[0][0];
};
const MX = mode(inst, i => i.x0);
// The marker's own height varies with y phase (8 or 9 px on the suspect), so
// height is NOT a filter — filtering on it would keep one phase and throw the
// evidence away. Only the column is a filter: a row whose first ink is not in
// the marker column is not a marker.
const good = inst.filter(i => i.x0 === MX && i.w <= 10);
console.log(`  line-start markers: ${inst.length} rows with ink, ${good.length} at the modal ` +
  `column x=${MX}  (heights ${[...new Set(good.map(i => i.h))].sort().join('/')} — the y phase, visible)`);
if (good.length < 8) { console.error('FEWER THAN 8 MARKERS — any score from this is instrument noise, not a measurement.'); process.exit(2); }
const used = good.slice(0, NMARK);

// Fixed output window: same size for every marker, paper on all four sides.
// Anchored on the modal column and on each marker's own ink top, so the window
// follows the y phase instead of clipping it.
const TW = 2 * PADX + mode(used, i => i.w), TH = 2 * PADY + Math.max(...used.map(i => i.h));
for (const i of used) {
  i.TX0 = MX - PADX; i.TY0 = i.y0 - PADY;
  i.target = new Uint8Array(TW * TH);
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++)
      i.target[y * TW + x] = page.gray[(i.TY0 + y) * page.w + i.TX0 + x];
}
let inkBytes = used.reduce((s, i) => s + i.target.reduce((a, v) => a + (v < 255 ? 1 : 0), 0), 0);
const countInk = () => used.reduce((s, i) => s + i.target.reduce((a, v) => a + (v < 255 ? 1 : 0), 0), 0);
console.log(`  window ${TW}×${TH} = ${TW * TH} bytes per marker, ${used.length} markers, ` +
  `${inkBytes} ink bytes total`);
{ // paper must be exactly 255 with zero variance, or the window has a neighbour in it
  let bad = 0;
  for (const i of used) for (let x = 0; x < TW; x++)
    if (i.target[x] !== 255 || i.target[(TH - 1) * TW + x] !== 255) bad++;
  if (bad) console.log(`  WARNING: ${bad} non-paper bytes on the window's top/bottom edge`);
}

// ---- kernels -----------------------------------------------------------------
// box(w): the fractional overlap of [c-w/2, c+w/2] with source pixel [s, s+1].
//         At w = f this is the exact area average, and at f = 1 it is identity.
// tri(w): the tent max(0, 1-|s+0.5-c|/w) sampled at the source pixel CENTRE.
//         At w = f this IS bilinear resampling by f.
function parseK(spec) {
  const [type, w] = spec.split(':');
  if (type !== 'box' && type !== 'tri') throw new Error(`kernel must be box:w or tri:w, got ${spec}`);
  return { type, w: +w };
}
// `off`, when given, is the resampler's ROW-MAPPING ERROR: an extra source-px
// displacement of output row i's sampling centre, as a function of that row's
// absolute output coordinate. A resampler whose row mapping is exactly f·Y has
// off = null; --synth-ramp is what a mapping that carries a slowly accumulating,
// wrapping error looks like. It is deliberately a function of ABSOLUTE y, not of
// the line index, because that is the whole difference between the two
// mechanisms the half-window test separates.
// `q`, when given, is a PHASE-QUANTISED resampler: a fixed-point scaler holds
// its accumulator in n.m format and indexes a filter table by the top bits of
// the fraction, so the sampling centre lands on a lattice of 1/q source px
// instead of wherever the exact ratio puts it. That is not a pen effect and not
// a kernel-shape effect — it displaces each OUTPUT ROW's sampling by its own
// error of up to 0.5/q src px, which no per-marker constant can absorb and no
// fixed kernel can express. --synth-qy / --synth-qx generate it.
// `tq`, when given, is an INTEGER FILTER TABLE: the taps are held as integers
// summing to exactly tq (256, 128, 64 — a power of two so the divide is a
// shift), which is how essentially every shipped scaler stores its filter. The
// error it makes is Σδw·(Sⱼ − S̄): EXACTLY ZERO wherever the source is flat,
// because the taps still sum to one, and proportional to local contrast where it
// is not. It is a function of the PHASE, so it differs marker to marker and no
// per-marker constant absorbs it. That is the page's residual signature.
function axisW(o0, n, f, s0, sN, K, off, q, tq) {
  const T = [];
  for (let i = 0; i < n; i++) {
    let c = (o0 + i + 0.5) * f + (off ? off(o0 + i + 0.5) : 0);
    if (q) c = Math.floor(c) + Math.round((c - Math.floor(c)) * q) / q;
    const lo = Math.floor(c - K.w), hi = Math.ceil(c + K.w);
    const idx = [], wt = []; let sum = 0;
    for (let s = lo; s <= hi; s++) {
      let w;
      if (K.type === 'box') w = Math.max(0, Math.min(s + 1, c + K.w / 2) - Math.max(s, c - K.w / 2));
      else w = Math.max(0, 1 - Math.abs(s + 0.5 - c) / K.w);
      if (w <= 0) continue;
      const li = s - s0;
      if (li < 0 || li >= sN) continue;   // clipped: source window too small
      idx.push(li); wt.push(w); sum += w;
    }
    for (let j = 0; j < wt.length; j++) wt[j] /= sum;
    // Largest-remainder rounding, so the integer taps sum to exactly tq and the
    // filter stays unit-gain — which is what makes the error vanish on paper.
    if (tq) {
      const iv = wt.map(w => Math.floor(w * tq)), rem = wt.map((w, j) => w * tq - iv[j]);
      let left = tq - iv.reduce((a, v) => a + v, 0);
      const ord = rem.map((r, j) => [r, j]).sort((a, c) => c[0] - a[0]);
      for (let j = 0; j < ord.length && left > 0; j++, left--) iv[ord[j][1]]++;
      for (let j = 0; j < wt.length; j++) wt[j] = iv[j] / tq;
    }
    T.push({ idx: Int32Array.from(idx), wt: Float64Array.from(wt) });
  }
  return T;
}

// ---- the forward model -------------------------------------------------------
const FONTDIRS = [`${process.env.WINDIR ?? 'C:/Windows'}/Fonts`,
                  `${process.env.LOCALAPPDATA}/Microsoft/Windows/Fonts`,
                  join(REPO, 'fonts'), join(REPO, 'lab', '.fontstage')];
const FONTNAME = opt('font', 'cour.ttf');
let FONT = null;
for (const d of FONTDIRS) if (existsSync(join(d, FONTNAME))) { FONT = join(d, FONTNAME); break; }
if (!FONT) { console.error(`font ${FONTNAME} not found in ${FONTDIRS.join(', ')}`); process.exit(2); }

const M = 12;                                    // source margin, px
let SW = 0, SH = 0;
function geometry(fy) {
  for (const i of used) {
    i.SX0 = Math.floor(i.TX0 * FX) - M;
    i.SY0 = Math.floor(i.TY0 * fy) - M;
  }
  SW = Math.ceil(TW * FX) + 2 * M + 2;
  SH = Math.ceil(TH * fy) + 2 * M + 2;
}
const clone = new FTClone(FONT, 1, 1);
if (clone.cff) {
  const mupdf = await import('mupdf');
  const { readFileSync } = await import('node:fs');
  const f = new mupdf.Font('F', readFileSync(FONT));
  clone.setGidMap(new Map([[CP, f.encodeCharacter(CP)]]));
}
let src = new Uint8Array(0);
let EMY = 0;                                     // set per config from --aspect
// VERTICAL GRID-FIT — hinting in the form that actually matters here. A hinted
// render does not move the PEN (that is --penq, and it is refuted); it snaps
// the OUTLINE so the glyph's top and bottom land on whole device rows, leaving
// the pen fractional. Two conditions, two unknowns: the vertical scale em64y
// and the pen py64 are solved so the outline's extents land on integers. The
// glyph's height then becomes a whole number of source pixels — which is what
// an alignment zone does, and the only mechanism yet named that moves ink BY
// FEATURE rather than uniformly.
let GF = null;
function initGridfit() {
  if (!flag('gridfit')) return;
  const o = clone.ttf?.rawOutline?.(CP);
  if (!o) { console.error('--gridfit needs a TrueType outline'); process.exit(2); }
  let lo = Infinity, hi = -Infinity;
  for (const c of o.contours) for (const p of c) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; }
  const pre = u => Math.round(u * clone.scale16 / 65536);
  GF = { A: pre(hi), B: pre(lo) };               // 26.6 at ppem 1024; A is the top
}
// SUPERSAMPLING — the rasterizer axis, never varied. FTClone computes EXACT
// AREA coverage, because that is what FreeType/mupdf do and the null certifies
// it against the control's producer. But the suspect's SOURCE render came from
// an unknown upstream, and many RIPs supersample instead: render bitonal at K×
// and box-average. On a glyph that is nothing but diagonals the two disagree
// on the greys while agreeing on the extent — which is exactly what the
// phase-averaged residual looks like. --super 1 is exact area (the default).
const SUPER = +opt('super', '1');
const LAWF = { fz: c => (255 * (256 - (c + (c >> 7)))) >> 8, src: c => 255 - c,
  fzLin: c => { const b = (255 * (256 - (c + (c >> 7)))) >> 8; return b >= 128 && b <= 254 ? b + 1 : b; },
  srcLin: c => { const b = 255 - c; return b >= 128 && b <= 254 ? b + 1 : b; } }[opt('law', 'fz')];
if (!LAWF) { console.error('--law must be one of fz, src, fzLin, srcLin'); process.exit(2); }
function render(em, px64, py64) {
  let emy = EMY, py = py64;
  if (GF) {
    const tyTop = -GF.A * EMY / 65536 + py64, tyBot = -GF.B * EMY / 65536 + py64;
    const T = Math.round(tyTop / 64), Bo = Math.round(tyBot / 64);
    if (Bo <= T) return null;
    emy = Math.round((64 * (Bo - T) * 65536 / (GF.A - GF.B)) * 32) / 32;
    py = Math.round(64 * T + GF.A * emy / 65536);
    if (py < 0) return null;
  }
  if (SUPER > 1) {
    const K = SUPER;
    const cov = clone.coverage(CP, em * K, emy * K, px64 * K, py * K);
    if (!cov) return null;
    const KW = SW * K;
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        let on = 0;
        for (let b = 0; b < K; b++) {
          const row = (y * K + b) * KW + x * K;
          for (let a = 0; a < K; a++) if (cov[row + a] > 127) on++;   // bitonal at K×
        }
        const g = Math.round(on * 255 / (K * K));
        src[y * SW + x] = g ? LAWF(g) : 255;
      }
    }
    return src;
  }
  const cov = clone.coverage(CP, em, emy, px64, py);
  if (!cov) return null;
  for (let n = 0; n < cov.length; n++) {
    const g = cov[n];
    src[n] = g ? LAWF(g) : 255;
  }
  return src;
}
// separable: source -> (TW × SH) -> (TW × TH), then round-half-up and compare
let tmp = new Float64Array(0);
function score(i, WX, WY) {
  for (let y = 0; y < SH; y++) {
    const row = y * SW;
    for (let x = 0; x < TW; x++) {
      const { idx, wt } = WX[x];
      let a = 0;
      for (let j = 0; j < idx.length; j++) a += src[row + idx[j]] * wt[j];
      tmp[y * TW + x] = a;
    }
  }
  let diff = 0, exact = true;
  for (let y = 0; y < TH; y++) {
    const { idx, wt } = WY[y];
    for (let x = 0; x < TW; x++) {
      let a = 0;
      for (let j = 0; j < idx.length; j++) a += tmp[idx[j] * TW + x] * wt[j];
      let v = roundBy(a); v = v < 0 ? 0 : v > 255 ? 255 : v;
      const d = Math.abs(v - i.target[y * TW + x]);
      if (d) { diff += d; exact = false; }
    }
  }
  return { diff, exact };
}

// ---- one config: stages A, B, C ----------------------------------------------
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
const median = a => { const b = [...a].sort((p, q) => p - q); return b[b.length >> 1]; };

const COARSE = +opt('coarse', '16');            // stage A lattice, 1/64 src px
function runConfig(em, fy, kx, ky, fineStep, aspect, verbose) {
  const penStep = COARSE;
  EMY = Math.round(em * aspect * 32) / 32;      // em64 is fractional in 1/32 steps
  geometry(fy);
  if (src.length !== SW * SH) {
    src = new Uint8Array(SW * SH);
    clone.W = SW * SUPER; clone.H = SH * SUPER;   // the raster is at K× when supersampling
  }
  if (tmp.length !== TW * SH) tmp = new Float64Array(TW * SH);
  clone.cache.clear();
  for (const i of used) {
    i.WX = axisW(i.TX0, TW, FX, i.SX0, SW, kx);
    i.WY = axisW(i.TY0, TH, fy, i.SY0, SH, ky);
  }

  // ---- A: free pen inside a small box, per instance --------------------------
  // The expected pen: the ink's left edge is the pen plus the left side
  // bearing, and '>' sits above the baseline, so the box is asymmetric.
  const pens = [];
  for (const i of used) {
    const ex = Math.round(i.x0 * FX - i.SX0), ey = Math.round((i.y1 + 1) * fy - i.SY0);
    let bi = null;
    for (let px64 = (ex - 8) * 64; px64 <= (ex + 4) * 64; px64 += penStep)
      for (let py64 = (ey - 3) * 64; py64 <= (ey + 12) * 64; py64 += penStep) {
        if (px64 < 0 || py64 < 0) continue;
        if (!render(em, px64, py64)) continue;
        const { diff } = score(i, i.WX, i.WY);
        if (!bi || diff < bi.d) bi = { d: diff, px64, py64 };
      }
    if (!bi) return null;
    pens.push({ k: i.k, d: bi.d, absX: bi.px64 / 64 + i.SX0, absY: bi.py64 / 64 + i.SY0 });
  }

  // ---- B: the pens must be ONE line, fitted robustly --------------------------
  let keep = pens, line = null;
  for (let pass = 0; pass < 3; pass++) {
    const ks = keep.map(p => p.k), ys = keep.map(p => p.absY);
    const mk = mean(ks), my = mean(ys);
    let num = 0, den = 0;
    for (let j = 0; j < ks.length; j++) { num += (ks[j] - mk) * (ys[j] - my); den += (ks[j] - mk) ** 2; }
    const b = num / den, a = my - b * mk;
    const res = keep.map((p, j) => ys[j] - (a + b * ks[j]));
    const s = sd(res) || 1e-9;
    line = { X0: median(keep.map(p => p.absX)), Y0: a, P: b, sdX: sd(keep.map(p => p.absX)), sdR: s, n: keep.length };
    const next = keep.filter((p, j) => Math.abs(res[j]) <= 2 * s);
    if (next.length === keep.length || next.length < 8) break;
    keep = next;
  }

  // ---- B2: refine (X0, Y0, P) against the stage-C objective -------------------
  // Least squares on stage-A pens minimises pen error, which is not the thing
  // we care about; this minimises the pixels.
  //
  // The nudge lattice is DELIBERATELY separate from stage A's. Stage A searches
  // a 12×15 source-px box, so refining it costs (box/step)² renders per marker
  // and is unaffordable below ¼ px; the nudge searches ±¼ px, so it is cheap at
  // any step. Keeping them one number is what would hide a pen-quantisation
  // residual behind an unaffordable stage A.
  const nudge = +opt('nudge', '16');
  const fine = fineStep;
  // PEN QUANTISATION — the grid-fit hypothesis in testable form. A renderer
  // that grid-fits does not place the pen on a continuous line: it snaps to a
  // coarser lattice, so the true pen departs from ANY straight line by up to
  // half a quantum, in a way that depends on the y phase. A continuous line
  // plus a ±¼ px nudge structurally cannot express that, which is why every
  // fit so far has had to leave it on the table. --penq 1 is whole source
  // pixels, 2 is ½ px, 64 (default) is free.
  const Q64 = Math.max(1, Math.round(64 / PENQ));
  const snapX = v => (QAX_X && Q64 > 1 ? Math.round(v / Q64) * Q64 : v);
  const snapY = v => (QAX_Y && Q64 > 1 ? Math.round(v / Q64) * Q64 : v);
  // --nudgey widens the Y nudge ALONE. The default ±¼ px was set when the pen
  // was believed to be on one line to within a quarter pixel; the per-line
  // wobble measured 2026-08-03d has sd 0.267 and a full-source-pixel range, so
  // a ±¼ px nudge structurally CANNOT absorb it and every score taken with it
  // charges the wobble to whatever model is under test. Comparing two geometries
  // is exactly the case where that matters, because neither predicts the wobble.
  // X stays narrow: all 57 markers share one column, so there is nothing there.
  const nudgeY = +opt('nudgey', String(nudge));
  const offs = (on, span) => {
    const o = [];
    if (on && Q64 > 1) { for (let m = -NQ; m <= NQ; m++) o.push(m * Q64); return o; }
    for (let d = -span; d <= span; d += fine) o.push(d);
    return o;
  };
  const OFFX = offs(QAX_X, nudge), OFFY = offs(QAX_Y, nudgeY);
  const scoreLine = (X0, Y0, P) => {
    let tot = 0;
    for (const i of used) {
      const px64 = snapX(Math.round((X0 - i.SX0) * 64));
      const py64 = snapY(Math.round((Y0 + P * i.k - i.SY0) * 64));
      let bd = Infinity;
      for (const dx of OFFX)
        for (const dy of OFFY) {
          if (px64 + dx < 0 || py64 + dy < 0) continue;
          if (!render(em, px64 + dx, py64 + dy)) continue;
          const { diff } = score(i, i.WX, i.WY);
          if (diff < bd) bd = diff;
        }
      if (bd === Infinity) return Infinity;
      tot += bd;
    }
    return tot;
  };
  let bestLine = { ...line, tot: scoreLine(line.X0, line.Y0, line.P) };
  for (const step of [0.25, 0.0625]) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dX, dY, dP] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0],
                                  [0, 0, step / 32], [0, 0, -step / 32]]) {
        const c = { X0: bestLine.X0 + dX, Y0: bestLine.Y0 + dY, P: bestLine.P + dP };
        const t = scoreLine(c.X0, c.Y0, c.P);
        if (t < bestLine.tot) { bestLine = { ...bestLine, ...c, tot: t }; moved = true; }
      }
    }
  }

  // ---- C: score with pens PREDICTED from the refined line ---------------------
  const per = [], resid = [];
  let tot = 0, nExact = 0;
  let worstMap = null, worstPB = -1;
  for (const i of used) {
    const px64 = snapX(Math.round((bestLine.X0 - i.SX0) * 64));
    const py64 = snapY(Math.round((bestLine.Y0 + bestLine.P * i.k - i.SY0) * 64));
    let bd = Infinity, bp = null;
    for (const dx of OFFX)
      for (const dy of OFFY) {
        if (px64 + dx < 0 || py64 + dy < 0) continue;
        if (!render(em, px64 + dx, py64 + dy)) continue;
        const r = score(i, i.WX, i.WY);
        if (r.diff < bd) { bd = r.diff; bp = { dx, dy, exact: r.exact }; }
      }
    tot += bd; per.push(bd); if (bp?.exact) nExact++;
    resid.push(bp ? bp.dy / 64 : 0);
    if (verbose && bd / (TW * TH) > worstPB) { worstPB = bd / (TW * TH); worstMap = { i, px64: px64 + bp.dx, py64: py64 + bp.dy }; }
  }
  per.sort((a, b) => a - b);
  return {
    em, fy, kx, ky, aspect, emy: EMY, penStep: fineStep, tot, perGlyph: tot / used.length,
    perInk: tot / inkBytes, nExact, n: used.length,
    best: per[0], median: per[per.length >> 1], worst: per[per.length - 1],
    line: bestLine, nudgeSd: sd(resid), worstMap,
  };
}

// ---- OFAT: which variables actually move the needle? --------------------------
// One factor at a time around a baseline, every factor scored on the SAME
// objective so the numbers are comparable. What matters is not the best value
// of each knob but its SHAPE:
//   sharp interior minimum -> the page identifies this variable
//   flat                   -> the page does not constrain it, and a fit that
//                             claims a value for it is reporting noise
//   monotone to the edge    -> the plausible interval is wrong, not the optimum
// This is the honest way to say "the residual is not in the resample": every
// resample knob is flat or shallow, and none of them reaches zero.
initGridfit();
if (flag('ofat')) {
  const base ={ em: +opt('em0', '2540'), fy: +opt('fy0', '2.92'), fx: 25 / 8,
                 kx: 'tri:3.125', ky: 'tri:2.63', aspect: 1, round: 'half-up' };
  const fine = +opt('pen0', '16');
  const run = o => {
    const c = { ...base, ...o };
    FX = c.fx;
    const r = runConfig(c.em, c.fy, parseK(c.kx), parseK(c.ky), fine, c.aspect, false);
    FX = base.fx;
    return r ? r.perGlyph : NaN;
  };
  const FACTORS = [
    ['em64',        v => ({ em: v }),     [2460, 2480, 2500, 2520, 2540, 2560, 2580, 2600, 2620]],
    ['fy',          v => ({ fy: v }),     [2.84, 2.88, 2.92, 2.96, 3.00, 3.04, 3.08, 3.125]],
    ['fx',          v => ({ fx: v }),     [23 / 8, 24 / 8, 25 / 8, 26 / 8, 27 / 8]],
    ['aspect',      v => ({ aspect: v }), [1.00, 1.02, 1.04, 1.06, 1.08]],
    ['kx width',    v => ({ kx: `tri:${v}` }), [2.5, 2.75, 3.125, 3.5, 3.75, 4.0]],
    ['ky width',    v => ({ ky: `tri:${v}` }), [2.0, 2.25, 2.5, 2.63, 2.75, 3.0, 3.25]],
    ['kx type',     v => ({ kx: `${v}:3.125` }), ['box', 'tri']],
    ['ky type',     v => ({ ky: `${v}:2.63` }),  ['box', 'tri']],
  ];
  console.log(`\nOFAT SENSITIVITY — baseline em64 ${base.em}, fy ${base.fy}, fx ${base.fx.toFixed(4)}, ` +
    `${base.kx} / ${base.ky}, pen 1/${64 / fine}\n`);
  console.log('  factor      values -> Σ|Δ| per glyph');
  const summary = [];
  for (const [name, mk, vals] of FACTORS) {
    const out = vals.map(v => ({ v, s: run(mk(v)) })).filter(o => Number.isFinite(o.s));
    if (!out.length) continue;
    const lo = Math.min(...out.map(o => o.s)), hi = Math.max(...out.map(o => o.s));
    const bestAt = out.find(o => o.s === lo).v;
    const interior = out.length > 2 && out[0].v !== bestAt && out[out.length - 1].v !== bestAt;
    console.log(`  ${name.padEnd(11)} ${out.map(o => `${o.v}:${o.s.toFixed(0)}`).join('  ')}`);
    summary.push({ name, lo, hi, span: hi - lo, bestAt, interior, n: out.length });
  }
  summary.sort((a, b) => b.span - a.span);
  console.log('\n  RANKED BY HOW MUCH THE VARIABLE MOVES THE SCORE:');
  console.log('  factor        best      span   shape');
  for (const s of summary)
    console.log(`  ${s.name.padEnd(12)} ${String(s.bestAt).padEnd(8)} ${s.span.toFixed(0).padStart(5)}   ` +
      `${s.interior ? 'interior minimum — the page IDENTIFIES this'
        : s.n <= 2 ? 'two-valued' : 'minimum AT AN EDGE — interval wrong, or unconstrained'}`);
  console.log(`\n  Baseline itself: ${run({}).toFixed(1)} per glyph. Nothing above reaches 0, and`);
  console.log('  no combination can: these are the same knobs the free-kernel solve already');
  console.log('  bounded. Read the spans as "how much slack this variable has", not as a hunt.');
  process.exit(0);
}

// ---- the sweep ---------------------------------------------------------------
const kx = parseK(KX), ky = parseK(KY);
console.log(`\nmodel: ${FONTNAME}  x factor ${FX} kernel ${KX}  |  y factor swept, kernel ${KY}` +
  `\n  em64 ${EMS.length === 1 ? EMS[0] : `${EMS[0]}..${EMS[EMS.length - 1]}`}` +
  `  fy ${FYS.length === 1 ? FYS[0] : `${FYS[0]}..${FYS[FYS.length - 1]}`}` +
  `  pen step ${PENS.map(p => `1/${64 / p}`).join(', ')} source px\n`);
console.log('  em64  aspect    fy    pen    Σ|Δ|/glyph  /ink byte  exact  best/med/worst   pen line (X0, Y0, pitch)');
let overall = null;
const t0 = Date.now();
for (const fineStep of PENS) for (const em of EMS) for (const aspect of ASPECTS) for (const fy of FYS) {
  const r = runConfig(em, fy, kx, ky, fineStep, aspect, flag('dump'));
  if (!r) { console.log(`  ${em}  ${fy}  — no raster`); continue; }
  if (!overall || r.tot < overall.tot) overall = r;
  console.log(`  ${String(em).padStart(5)}  ${aspect.toFixed(4)}  ${r.fy.toFixed(3)}  1/${String(64 / fineStep).padStart(2)}  ` +
    `${r.perGlyph.toFixed(1).padStart(9)}  ${r.perInk.toFixed(2).padStart(9)}  ` +
    `${String(r.nExact).padStart(3)}/${r.n}  ${r.best}/${r.median}/${r.worst}   ` +
    `${r.line.X0.toFixed(3)}, ${r.line.Y0.toFixed(3)}, ${r.line.P.toFixed(4)}` +
    (r.tot === 0 ? '   *** BYTE-EXACT ***' : ''));
}
console.log(`\n[${((Date.now() - t0) / 1000).toFixed(0)}s]`);

// ---- the verdict -------------------------------------------------------------
let b = overall;
console.log(`BEST  em64 ${b.em}${b.aspect === 1 ? '' : ` (x) / ${b.emy} (y), aspect ${b.aspect}`}  ` +
  `fy ${b.fy}  ${KX} / ${KY}  pen 1/${64 / b.penStep} px`);
console.log(`  Σ|Δ| ${b.tot} over ${b.n} glyphs = ${b.perGlyph.toFixed(1)} per glyph, ` +
  `${b.perInk.toFixed(2)} per ink byte;  ${b.nExact} of ${b.n} BYTE-EXACT`);
console.log(`  pen line: x sd ${b.line.sdX.toFixed(3)} src px (one column, so this must be ~0), ` +
  `pitch ${b.line.P.toFixed(4)} src px = ${(b.line.P / b.fy).toFixed(4)} output px ` +
  `(page row pitch ${det.yGrid.pitch.toFixed(4)})`);
console.log(`  line residual sd ${b.line.sdR.toFixed(3)} src px on ${b.line.n} of ${b.n} markers after 2σ rejection`);
const pitchOK = Math.abs(b.line.P / b.fy - det.yGrid.pitch) < 0.15;
console.log(`  ${b.line.sdX < 0.3 && pitchOK
  ? 'PHYSICS CONSISTENT — one pen origin and one pitch place every marker, and the pitch was not told to it.'
  : 'PHYSICS INCONSISTENT — this config buys its score with free pens' + (pitchOK ? '' : ', and the fitted pitch does not match the page') + ', so it is not the producer.'}`);

if (NULL) {
  const ok = b.tot === 0 && b.nExact === b.n;
  console.log(`\nNULL ${ok ? 'CERTIFIED' : 'FAILED'} — a native courier page at scale 1 must reproduce ` +
    `byte-exactly, ${b.nExact}/${b.n} did.`);
  if (!ok) console.log('  Until this is 0, no number this harness prints about the suspect means anything.');
  process.exit(ok ? 0 : 1);
}

// ---- SYNTHETIC TARGETS: the positive control the structural solves need -------
// The null certifies the forward path at SCALE 1, where the resample is the
// identity — so it says nothing about the two structural solves, which live
// entirely inside the resample. Each rests on an approximation the null cannot
// reach: the kernel taps are binned every ¼ source px against phases that are
// continuous, and 57 markers are folded onto ONE raster. Either could floor a
// solve well above zero on data that a downscale explains perfectly, and a
// negative result from an uncalibrated solve is not a refutation — it is an
// unread instrument.
//
// So replace every target with the forward model's OWN output at a known
// configuration, and re-run. The answer is then known and each solve must find
// it. --synth-kx / --synth-ky generate through a kernel the solve is not told
// about (leave them off and the fit should score ~0 by construction, which is
// the cheapest check that generation itself is sound). --synth-jitter scatters
// the pen off the line by a given sd in source px: that is the ONE departure
// from the shared-raster premise the real page is known to carry, at 0.27 src
// px measured by stage B, and it is how you find out what the free-source
// floor of ~3.85 bytes is actually made of.
// SRCF, when set, replaces the byte source for ONE generator: the interpolated
// shift below, whose whole question is what happens at the [0,255] boundary.
// Everything else reads `src` and must stay on bytes.
let SRCF = null;
function forward(i, WX, WY) {
  const out = new Uint8Array(TW * TH);
  const S = SRCF ?? src;
  for (let y = 0; y < SH; y++) {
    const row = y * SW;
    for (let x = 0; x < TW; x++) {
      const { idx, wt } = WX[x];
      let a = 0;
      for (let j = 0; j < idx.length; j++) a += S[row + idx[j]] * wt[j];
      tmp[y * TW + x] = a;
    }
  }
  for (let y = 0; y < TH; y++) {
    const { idx, wt } = WY[y];
    for (let x = 0; x < TW; x++) {
      let a = 0;
      for (let j = 0; j < idx.length; j++) a += tmp[idx[j] * TW + x] * wt[j];
      const v = roundBy(a);
      out[y * TW + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return out;
}
let SYNTH = null;
if (flag('synth')) {
  const skx = parseK(opt('synth-kx', KX)), sky = parseK(opt('synth-ky', KY));
  const sem = +opt('synth-em', String(b.em));
  const jit = +opt('synth-jitter', '0');
  const jitx = +opt('synth-jitter-x', '0');
  const PHI = +opt('synth-phi', '0');
  const PHIS = +opt('synth-phi-sample', '0');
  const QY = +opt('synth-qy', '0'), QX = +opt('synth-qx', '0');
  const TQ = +opt('synth-tapq', '0');
  // --synth-vscale / --synth-vscale-saw: PER-LINE VERTICAL SCALE, the one class
  // the --joint-dump signature still admits. Every other generator here moves a
  // line RIGIDLY, which a per-marker offset can absorb by construction; a scale
  // is the SECOND moment and no offset can touch it. Physically it is what a
  // renderer that recomputes the glyph per line from a fractional size or a
  // fractional device transform emits: em64y varies with k, the pen does not,
  // so the glyph is re-rasterised at a different height about its own origin.
  //   --synth-vscale <sd>       RANDOM per-line scale, relative sd (0.005 = 0.5%)
  //                             — the negative control, uncorrelated with k.
  //   --synth-vscale-saw <sd>   DETERMINISTIC, the SAME sawtooth as the measured
  //                             wobble: s_k = sd·√12·(frac(k·phi) − ½). If the
  //                             page's scales scan to the same phi as its
  //                             offsets, the wobble and the residual are one
  //                             mechanism seen in two moments.
  // --synth-outq <denom>: the producer carries the transformed outline at a
  // quantum of 1/denom SOURCE px instead of FreeType's 1/64. Applied after the
  // pen translate, so each line's sub-pixel position rounds its points
  // differently and every line is a genuinely different SHAPE — second-moment
  // and higher, which is what distinguishes it from --penq (which moved the pen,
  // i.e. the first moment, and is absorbed entirely by the phase block) and from
  // --gridfit (which snapped extrema to whole rows, q = 1, far too coarse).
  // Prediction to hit: the perturbation is a deterministic function of the phase,
  // so it must inflate the SAWTOOTH-SCAN residual above the 0.011 instrument
  // floor as well as carrying RMS. Two statistics, one quantum.
  const OUTQ = +opt('synth-outq', '0');
  const QPENY = +opt('synth-peny-lattice', '0');   // src px; see the pen block below
  const VSC = +opt('synth-vscale', '0');
  const VSCS = +opt('synth-vscale-saw', '0');
  const VPHI = +opt('synth-vscale-phi', String(PHI || 0.206929));
  const P42 = +opt('pitch', '42');
  const PSRC = +opt('synth-pitch', String(P42));
  // --synth-ramp: the same observed per-line sawtooth produced by a completely
  // different mechanism. The PEN stays on an exact integer-pitch line and the
  // wobble is put in the RESAMPLER'S ROW MAPPING instead — a wrapping error that
  // accumulates with absolute y at RATE per line, i.e. RATE·fy/P42 source px per
  // output row. Sampled once per line the two are observationally identical;
  // inside a marker window they are not, because a mapping error is a function
  // of y and therefore RAMPS ACROSS THE GLYPH while a pen offset is constant.
  // That is the only thing separating them, and --phase-halves is what reads it.
  // --synth-shift <lin|cr>: THE MECHANISM THE 08-03s SQUEEZE LEFT STANDING —
  // "applied once per glyph, as a function of the pen's grid residue, deforming
  // the glyph without translating it". The producer rasterises (or caches) the
  // glyph on a lattice of spacing g and composites it at the exact position by
  // an INTERPOLATED SHIFT of δ_k = frac(k·phi) cells.
  //
  // Generated EXACTLY, and that is the point of doing it this way: the two- or
  // four-tap convolution Σⱼ wⱼ(δ)·S(y − j·g) is computed by RENDERING the glyph
  // at each tap position and blending, never by resampling a raster. So the
  // moments below are the kernel's own closed forms and not a discretisation of
  // them, and any departure the solves see is the producer story rather than the
  // generator's arithmetic. (Tap positions quantise to 1/64 src px, which for
  // g ≈ 1 is 1.6% of one tap spacing and four orders under the effects here.)
  //
  //   lin  taps at j = 0,1     w = [1−δ, δ]
  //        μ₁ = δg   μ₂ = δ(1−δ)g²   μ₃ = δ(1−δ)(1−2δ)g³
  //   cr   taps at j = −1..2   Catmull-Rom
  //        μ₁ = δg   μ₂ ≡ 0 IDENTICALLY   μ₃ = δ(1−δ)(1−2δ)g³   μ₄ = −9δ²(1−δ)²g⁴
  //
  // All six of those are re-derived and checked numerically by --shift-algebra;
  // they are the whole discriminator, since the two families share one μ₃ curve
  // and differ ONLY in whether a width modulation rides along with it.
  //
  // The pen goes on an EXACT integer-pitch line and the wobble is produced BY
  // THE SHIFT — the centroid lands at line + δ_k·g, so the measured per-line
  // sawtooth and the shape residual become ONE mechanism rather than two. That
  // is the hypothesis; g is then fixed by the page's own wobble amplitude,
  // which spans one source px, rather than being free.
  const SHIFT = opt('synth-shift', '');
  const SHG = +opt('synth-shift-g', '1');
  const SHPHI = +opt('synth-shift-phi', String(PHI || 0.206929));
  const SHAX = opt('synth-shift-axis', 'y');
  // Clamping is NOT cosmetic here. Catmull-Rom overshoots on the bright side of
  // an edge, so paper-adjacent samples exceed 255 and clamp INVISIBLY (the page
  // measures paper at exactly 255, zero variance), while the undershoot lands on
  // the ink side. Clamping is nonlinear and voids μ₂ ≡ 0 locally, so how much of
  // μ₃ survives it at real edge contrasts is a measurement, not an assumption —
  // that is row 4, and --synth-shift-noclamp is its other arm.
  const SHNC = flag('synth-shift-noclamp');
  const ADDBUF = opt('synth-add', '')
    ? (b2 => new Float64Array(b2.buffer, b2.byteOffset, b2.length / 8))(
        require('node:fs').readFileSync(resolve(REPO, opt('synth-add', ''))))
    : null;
  let addIdx = 0;
  if (SHIFT && SHIFT !== 'lin' && SHIFT !== 'cr') {
    console.error('--synth-shift must be lin or cr'); process.exit(2);
  }
  const shiftTaps = d => SHIFT === 'cr'
    ? [[-1, -0.5 * d + d * d - 0.5 * d * d * d], [0, 1 - 2.5 * d * d + 1.5 * d * d * d],
       [1, 0.5 * d + 2 * d * d - 1.5 * d * d * d], [2, -0.5 * d * d + 0.5 * d * d * d]]
    : [[0, 1 - d], [1, d]];
  let shiftBuf = null;
  // Render the glyph as the weighted blend of renders at the tap positions.
  // Returns false exactly when a plain render would have.
  const renderShift = (em, px64, py64, d) => {
    if (!SHIFT) return !!render(em, px64, py64);
    if (!shiftBuf || shiftBuf.length !== SW * SH) shiftBuf = new Float64Array(SW * SH);
    shiftBuf.fill(0);
    const g64 = SHG * 64;
    for (const [j, w] of shiftTaps(d)) {
      if (!w) continue;
      const dx = SHAX.includes('x') ? Math.round(j * g64) : 0;
      const dy = SHAX.includes('y') ? Math.round(j * g64) : 0;
      if (px64 + dx < 0 || py64 + dy < 0) return false;
      if (!render(em, px64 + dx, py64 + dy)) return false;
      for (let n = 0; n < shiftBuf.length; n++) shiftBuf[n] += w * src[n];
    }
    if (SHNC) { SRCF = shiftBuf; return true; }     // the exact-algebra arm
    SRCF = null;                                     // clamp to a real byte raster
    for (let n = 0; n < shiftBuf.length; n++) {
      const v = Math.round(shiftBuf[n]);
      src[n] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    return true;
  };
  const RAMP = +opt('synth-ramp', '0');
  const BOUT = RAMP * b.fy / P42;                 // src px of phase per output row
  const RPHI0 = +opt('synth-ramp-phi0', '0');
  const rampOff = RAMP ? (Yc => { const u = BOUT * Yc + RPHI0; return u - Math.floor(u); }) : null;
  EMY = Math.round(sem * b.aspect * 32) / 32;
  const EMY0 = EMY;
  // The quantum belongs to the GENERATOR only. It is cleared before the re-fit
  // below, so the solve keeps assuming one shared raster at 1/64 — which is the
  // whole experiment: what does a shared-raster solve make of a page whose lines
  // are each a slightly different shape?
  if (OUTQ) clone.outQ64 = 64 / OUTQ;
  geometry(b.fy);
  if (src.length !== SW * SH) { src = new Uint8Array(SW * SH); clone.W = SW * SUPER; clone.H = SH * SUPER; }
  if (tmp.length !== TW * SH) tmp = new Float64Array(TW * SH);
  clone.cache.clear();
  // The pen goes on an EXACT line with an EXACT integer pitch, so the markers
  // share one source raster by construction — that is the premise under test,
  // and --synth-jitter is how you break it by a known amount.
  let seed = 20260803 >>> 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  for (const i of used) {
    // Four distinct generators, and telling them apart is the whole point:
    //   --synth-jitter  RANDOM per-line scatter — the negative control for the
    //                   pitch scan, which must NOT find a fractional pitch.
    //   --synth-pitch   a genuine non-integer SOURCE PITCH. Line k moves to
    //                   Y0 + P·k, so the departure from the model's 42·k fold is
    //                   a LINEAR DRIFT of (P−42)·k — 12 px over this page at
    //                   P = 42.207, not a sub-pixel effect at all.
    //   --synth-phi     a WRAPPED sawtooth frac(k·phi) about an integer pitch:
    //                   sub-pixel per-line wobble, which is a different physics
    //                   from --synth-pitch and the one the scan actually fits.
    //   --synth-jitter-x  the same random scatter on the PEN's X, which is what
    //                   certifies --solve-phase-x. All 57 markers share one
    //                   column, so on the real page this must come back at ~0.
    const dj = PHI ? Math.round((PHI * i.k - Math.round(PHI * i.k)) * 64)
      : jit ? Math.round((rnd() * 2 - 1) * Math.sqrt(3) * jit * 64) : 0;
    const djx = jitx ? Math.round((rnd() * 2 - 1) * Math.sqrt(3) * jitx * 64) : 0;
    // --synth-phi-sample: the SAME per-line sawtooth as --synth-phi, injected as
    // a constant shift of the RESAMPLE's sampling centres over ONE shared raster
    // instead of as a pen move. Σⱼ w(j−c−φ)·S(j) against Σⱼ w(j−c)·C(j−φ):
    // sampling and a tent do not commute, and the difference is second-order in
    // the coverage curvature, i.e. largest at the apex and the stroke tips. The
    // solve's phase block is the FIRST form; --synth-phi generates the SECOND.
    // Running both is how the commutation term becomes a number instead of an
    // argument. Sign: a pen move of +d displaces the glyph down in the source,
    // which is the same as sampling at c − d.
    const ds = PHIS ? PHIS * i.k - Math.round(PHIS * i.k) : 0;
    const WXs = axisW(i.TX0, TW, FX, i.SX0, SW, skx, null, QX, TQ);
    const WYs = axisW(i.TY0, TH, b.fy, i.SY0, SH, sky,
      rampOff ?? (PHIS ? () => -ds : null), QY, TQ);
    const px64 = Math.round((b.line.X0 - i.SX0) * 64) + djx;
    // --synth-peny-lattice <a>: the producer asks for a continuous pen y and the
    // renderer SNAPS it to a lattice of a source px. That is what mupdf's glyph
    // cache does to upright text (fz_subpixel_adjust puts the vertical axis on
    // qmin = 0, i.e. whole DEVICE pixels, at any size >= 8), and it is the positive
    // control for the lattice scan in the phase block: injected with a wobble that
    // would otherwise be continuous, the scan must recover THIS spacing. Without it
    // the scan is an unread instrument reporting "no lattice" against no zero.
    let absY = b.line.Y0 + PSRC * i.k + dj / 64;
    if (QPENY) absY = Math.round(absY / QPENY) * QPENY;
    const py64 = Math.round((absY - i.SY0) * 64);
    // The per-line vertical SCALE goes in here, as a real re-rasterisation at a
    // different em64y — not as a stretch of one shared raster. em64 is carried in
    // 1/32 steps, which at em 2540 quantises the scale to 1.2e-5 relative: four
    // orders below the 0.5% this is built to inject, so the generator is exact
    // for the purpose. The pen is NOT moved, so the glyph scales about its own
    // origin and the first-moment part of that lands in the phase block — which
    // is correct, and is why the scale block must be read beside it.
    const sK = VSCS ? VSCS * Math.sqrt(12) * (VPHI * i.k - Math.floor(VPHI * i.k) - 0.5)
      : VSC ? (rnd() * 2 - 1) * Math.sqrt(3) * VSC : 0;
    i.injS = sK;
    EMY = sK ? Math.round(EMY0 * (1 + sK) * 32) / 32 : EMY0;
    // The shift's δ is the pen's residue on its own grid, which for the y axis
    // IS the measured sawtooth: frac(k·phi). The glyph is NOT moved by it — the
    // blend moves it, by exactly δ·g, which is the whole claim.
    const dsh = SHIFT ? (SHPHI * i.k - Math.floor(SHPHI * i.k)) : 0;
    i.injD = dsh;
    if (!renderShift(sem, px64, py64, dsh)) { console.error('synth: no raster'); process.exit(2); }
    i.target = forward(i, WXs, WYs);
    SRCF = null;
    // --synth-add: add a per-marker map to the generated target. Built for the
    // ABSORPTION-DRIFT test: quantity (2) — what the free source and kernel leave
    // of the commutation misfit — is measured on synth where NO QUARRY competes
    // for those degrees of freedom, while on the page quarry sits at ~5x the
    // template's amplitude. Injecting quarry-like structure into BOTH synth arms
    // leaves the data-domain template unchanged (it is a difference of the two
    // targets, and the same map is added to each) while giving the solve
    // something else to spend its freedom on. If the absorption holds, quantity
    // (2) transfers to the page; if it drifts, the drift IS the projection bound.
    if (ADDBUF) {
      const off = addIdx * TW * TH;
      for (let c = 0; c < TW * TH; c++) {
        const v = Math.round(i.target[c] + ADDBUF[off + c]);
        i.target[c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    addIdx++;
    // Kept so --solve-phase can be scored against the truth: the jitter is a
    // real pen shift, which RE-RASTERISES the glyph, while the solve models a
    // shift of the SAMPLING against a fixed raster. Whether those are the same
    // thing to 0.02 px is exactly what this control decides.
    //
    // Under --synth-ramp there is no pen offset at all: the truth a per-marker
    // CONSTANT can express is the ramp at the window's middle, and the sign is
    // negated because the ramp displaces the SAMPLING while dY displaces the
    // source under it. What a constant cannot express is the slope, which is the
    // point of the experiment. --synth-phi-sample displaces the sampling too, so
    // the offset a per-marker constant should recover is +ds by the same sign.
    // The shift displaces the glyph's centroid by exactly δ·g (μ₁ = δ for both
    // families, verified), so THAT is what a per-marker constant should recover
    // — and what is left over after it is the deformation, which is the quarry.
    i.injY = rampOff ? -rampOff(i.TY0 + TH / 2) : PHIS ? ds : absY - (b.line.Y0 + PSRC * i.k);
    if (SHIFT && SHAX.includes('y')) i.injY += dsh * SHG;
    i.injX = djx / 64 + (SHIFT && SHAX.includes('x') ? dsh * SHG : 0);
  }
  clone.outQ64 = 0;                    // the solve is NOT told about the quantum
  clone.cache.clear();
  inkBytes = countInk();
  SYNTH = { skx: opt('synth-kx', KX), sky: opt('synth-ky', KY), sem, jit };
  console.log(`\n*** SYNTHETIC TARGETS — THIS IS A CONTROL, NOT A MEASUREMENT OF THE PAGE ***`);
  console.log(`  generated: em64 ${sem}, fy ${b.fy}, x ${SYNTH.skx} / y ${SYNTH.sky}, ` +
    `pen ${RAMP ? `on an EXACT pitch-${PSRC} line, with the RESAMPLER'S ROW MAPPING carrying a `
        + `wrapping error of ${BOUT.toFixed(6)} src px per output row (= ${RAMP} per line, `
        + `wrapping every ${(1 / BOUT).toFixed(1)} output rows = ${(1 / RAMP).toFixed(2)} lines)`
      : PHI ? `on pitch ${PSRC} src px plus a WRAPPED sawtooth frac(k·${PHI})`
      : PHIS ? `on an EXACT pitch-${PSRC} line — ONE SHARED RASTER — with the wobble `
        + `frac(k·${PHIS}) put in the SAMPLING instead of the pen (the commutation control)`
      : `on a source pitch of ${PSRC} src px, jitter sd ${jit} src px`}` +
    (jitx ? `, plus a RANDOM PEN-X jitter of sd ${jitx} src px` : '') +
    (OUTQ ? `, with the transformed OUTLINE POINTS quantised to 1/${OUTQ} src px after the pen translate` : '') +
    (QPENY ? `, with the PEN Y then SNAPPED to a lattice of ${QPENY} src px (the glyph-cache control)` : '') +
    (VSC ? `, plus a RANDOM PER-LINE VERTICAL SCALE of relative sd ${VSC} (re-rasterised at em64y·(1+s))` : '') +
    (VSCS ? `, plus a DETERMINISTIC PER-LINE VERTICAL SCALE, sd ${VSCS}, sawtooth frac(k·${VPHI})` : '') +
    (QY || QX ? `, sampling PHASE-QUANTISED to 1/${QY || '-'} src px in y and 1/${QX || '-'} in x` : '') +
    (TQ ? `, filter taps held as INTEGERS summing to ${TQ} on both axes` : '') +
    (SHIFT ? `, then SHIFTED into place on the ${SHAX} axis by ${SHIFT === 'cr' ? 'CATMULL-ROM' : 'LINEAR'} ` +
      `interpolation, δ_k = frac(k·${SHPHI}), tap spacing g = ${SHG} src px ` +
      `(so the glyph moves δ·g and DEFORMS by the kernel's own μ₂/μ₃/μ₄)` +
      (SHNC ? ', UNCLAMPED (exact algebra, not a byte raster)' : ', clamped+rounded to bytes') : ''));
  console.log(`  the solves below are told x ${KX} / y ${KY} and must recover the rest.`);
  // --target-out: the generated TARGETS, before any solve touches them. Needed to
  // build the commutation template in the DATA domain: target(--synth-phi) minus
  // target(--synth-phi-sample) is the pen-move-vs-sampling-shift difference by
  // construction, from an instrument that contains no quarry at all. Differencing
  // RESIDUALS instead would be circular — the same tautology that sank
  // "pinned maps minus the pin-induced delta", which is just the free maps.
  if (opt('target-out', '')) {
    const buf = Buffer.alloc(used.length * TW * TH);
    used.forEach((i, m) => Buffer.from(i.target).copy(buf, m * TW * TH));
    require('node:fs').writeFileSync(resolve(REPO, opt('target-out', '')), buf);
    console.log(`  targets written to ${opt('target-out', '')} (${used.length}x${TW}x${TH} bytes)`);
  }
  // Re-fit on the synthetic page: everything downstream reads b.line, so the
  // control must go through the same three stages the real data does.
  const r = runConfig(b.em, b.fy, kx, ky, b.penStep, b.aspect, false);
  b = r;
  console.log(`  re-fit on the control: ${r.perGlyph.toFixed(1)} per glyph, ${r.nExact}/${r.n} byte-exact, ` +
    `pen line ${r.line.X0.toFixed(3)}, ${r.line.Y0.toFixed(3)}, ${r.line.P.toFixed(4)}`);
}

// ---- THE SHARED NONNEGATIVE TENT, FITTED THROUGH A PER-LINE KERNEL WALK ------
// Row 3 of the discriminator, and it is a different experiment from anything
// else in this file: the question is not what the kernel IS but what the WIDTH
// ESTIMATOR REPORTS when the truth is a kernel that walks per line.
//
// The 10% y/x filter asymmetry (0.93 output px against x's 1.00) has been an
// unexplained fact since 2026-08-03g. Under an interpolated shift the effective
// vertical filter is tent ⊗ CR(δ_k), which VARIES line to line, and 08-03t's
// claim is that a shared NONNEGATIVE tent fitted through all of them lands
// narrow — because narrowing is the only way a nonnegative tent can imitate a
// kernel with negative lobes.
//
// Fit the SHARED family through ALL the lines, never against the mean kernel:
// averaged over δ the CR lobes cancel to almost nothing (mean μ₂ ≡ 0, mean
// μ₃ = 0, mean μ₄ = −0.3g⁴) and the mean kernel is structureless, so a test run
// against it probes the wrong object. em is free at every width, since em and
// kernel width trade and pinning em would charge that trade to the width.
if (opt('tent-sweep', '')) {
  const WS = range(opt('tent-sweep', '0.85,1.10,0.025'));      // OUTPUT px
  const ems = range(opt('tent-em', `${b.em - 60},${b.em + 60},20`));
  console.log(`\nSHARED NONNEGATIVE TENT SWEEP — widths in OUTPUT px, em free over ` +
    `${ems[0]}..${ems[ems.length - 1]} at every width.`);
  console.log(`  targets: ${SYNTH ? 'the SYNTHETIC control above' : 'THE PAGE'};  ` +
    `nudge y ±${(+opt('nudgey', '16') / 64).toFixed(3)} src px`);
  console.log('   width(out px)   ky(src px)   Σ|Δ|/glyph   em64');
  let bw = null;
  for (const w of WS) {
    const kyw = parseK(`tri:${(w * b.fy).toFixed(6)}`);
    let bst = null;
    for (const em of ems) {
      const r = runConfig(em, b.fy, kx, kyw, b.penStep, b.aspect, false);
      if (r && (!bst || r.tot < bst.tot)) { bst = r; bst.em = em; }
    }
    if (!bst) continue;
    if (!bw || bst.tot < bw.tot) { bw = bst; bw.w = w; }
    console.log(`   ${w.toFixed(4).padStart(9)}   ${(w * b.fy).toFixed(4).padStart(9)}   ` +
      `${bst.perGlyph.toFixed(1).padStart(9)}   ${bst.em}`);
  }
  console.log(`  MINIMUM at ${bw.w.toFixed(4)} output px (${bw.perGlyph.toFixed(1)} per glyph, em64 ${bw.em}).`);
  console.log(`  The page's own reading is 0.929; bilinear is 1.000. A control generated at 1.000`);
  console.log(`  that reads ~0.93 here reclassifies the asymmetry as the estimator's honest`);
  console.log(`  compromise across a per-line kernel walk. One that reads ~1.00 leaves it unexplained.`);
  process.exit(0);
}

// ---- THE MODEL-FREE SECOND MOMENT --------------------------------------------
// Pick the statistic that separates the hypotheses BEFORE fitting either one.
// This family has twice been fooled by a mechanism that reproduced a magnitude
// and none of the fingerprints, so a per-line vertical SCALE gets its own
// model-free test before any solve is allowed to report one.
//
// A per-line vertical OFFSET moves a marker's ink profile bodily: it changes the
// FIRST moment and leaves the second CENTRAL moment alone. A per-line vertical
// SCALE changes the second moment and nothing else to first order. So:
//
//   p_k(y) = Σ_x (255 − byte)          the vertical ink profile of marker k
//   V_k    = Σ p(y)(y−ȳ)² / Σ p(y)     its second central moment, output px²
//   scale (1+s)  =>  V -> V·(1+s)²  =>  s ≈ ½·ΔV/V
//
// No renderer, no kernel, no pen line. The window's integer anchor cancels
// because the moment is CENTRAL, provided the glyph is fully contained — which
// is checked and reported, not assumed.
//
// THE ESTIMATOR HAS ITS OWN PHASE BIAS and this number is meaningless without
// it: a continuous profile sampled at integer output rows has a second moment
// that wobbles with sub-pixel phase, so V_k varies across markers even when
// every line is identical. That bias is a smooth FUNCTION of the phase, so it
// is removed by regressing V on two harmonics of ψ_k = frac(k·phi) — and
// whatever scatter survives that is the part a phase cannot explain. Read the
// page's surviving scatter against --synth --synth-phi (offset only, no scale),
// which is the same instrument with a known answer of zero.
if (flag('moments')) {
  const MPHI = +opt('moments-phi', '0.206929');
  let clipped = 0;
  const V = [], C = [], PSI = [], KS = [], SK = [], KU = [];
  for (const i of used) {
    const p = new Float64Array(TH);
    let tot = 0;
    for (let y = 0; y < TH; y++) {
      let s = 0;
      for (let x = 0; x < TW; x++) s += 255 - i.target[y * TW + x];
      p[y] = s; tot += s;
    }
    if (!tot) continue;
    // Containment: the profile must die before the window edge, or the moment is
    // measuring the cut instead of the glyph.
    if (p[0] > 0.005 * tot || p[TH - 1] > 0.005 * tot) clipped++;
    let m1 = 0;
    for (let y = 0; y < TH; y++) m1 += (y + 0.5) * p[y];
    m1 /= tot;
    let m2 = 0, m3 = 0, m4 = 0;
    for (let y = 0; y < TH; y++) {
      const d = y + 0.5 - m1;
      m2 += p[y] * d * d; m3 += p[y] * d * d * d; m4 += p[y] * d * d * d * d;
    }
    m2 /= tot; m3 /= tot; m4 /= tot;
    V.push(m2); C.push(m1 + i.TY0); KS.push(i.k);
    // STANDARDIZED, because that is the unit the discriminator's predictions are
    // in: μ₃/σ³ modulates by sd[δ(1−δ)(1−2δ)]·(g/σ)³ and μ₄/σ⁴ by
    // sd[9δ²(1−δ)²]·(g/σ)⁴, so a measured modulation reads straight off as g/σ.
    SK.push(m3 / m2 ** 1.5); KU.push(m4 / (m2 * m2));
    const u = MPHI * i.k; PSI.push(u - Math.floor(u));
  }
  const n = V.length;
  // The first moment, as a cross-check that these are the markers the rest of
  // the file is talking about: the centroid line and its pitch, model-free.
  let sk = 0, sy = 0, skk = 0, sky = 0;
  for (let j = 0; j < n; j++) { sk += KS[j]; sy += C[j]; skk += KS[j] * KS[j]; sky += KS[j] * C[j]; }
  const pitch = (n * sky - sk * sy) / (n * skk - sk * sk);
  const c0 = (sy - pitch * sk) / n;
  let cres = 0;
  for (let j = 0; j < n; j++) cres += (C[j] - c0 - pitch * KS[j]) ** 2;
  cres = Math.sqrt(cres / n);
  // Second moment, phase bias removed by two harmonics of ψ.
  const design = j => [1, Math.cos(2 * Math.PI * PSI[j]), Math.sin(2 * Math.PI * PSI[j]),
    Math.cos(4 * Math.PI * PSI[j]), Math.sin(4 * Math.PI * PSI[j])];
  const NP = 5, A = [], bb = new Float64Array(NP);
  for (let a = 0; a < NP; a++) A.push(new Float64Array(NP));
  for (let j = 0; j < n; j++) {
    const d = design(j);
    for (let a = 0; a < NP; a++) { bb[a] += d[a] * V[j]; for (let c = 0; c < NP; c++) A[a][c] += d[a] * d[c]; }
  }
  for (let a = 0; a < NP; a++) {          // Gaussian elimination, NP = 5
    let piv = a;
    for (let r = a + 1; r < NP; r++) if (Math.abs(A[r][a]) > Math.abs(A[piv][a])) piv = r;
    [A[a], A[piv]] = [A[piv], A[a]]; const t = bb[a]; bb[a] = bb[piv]; bb[piv] = t;
    for (let r = a + 1; r < NP; r++) {
      const f = A[r][a] / A[a][a];
      for (let c = a; c < NP; c++) A[r][c] -= f * A[a][c];
      bb[r] -= f * bb[a];
    }
  }
  const co = new Float64Array(NP);
  for (let a = NP - 1; a >= 0; a--) {
    let s = bb[a];
    for (let c = a + 1; c < NP; c++) s -= A[a][c] * co[c];
    co[a] = s / A[a][a];
  }
  const Vm = mean(V), raw = sd(V);
  let fres = 0;
  const sImp = [];
  for (let j = 0; j < n; j++) {
    const d = design(j);
    let f = 0; for (let a = 0; a < NP; a++) f += co[a] * d[a];
    fres += (V[j] - f) ** 2;
    sImp.push((V[j] - f) / (2 * Vm));      // implied per-line scale, first order
  }
  fres = Math.sqrt(fres / n);
  console.log(`\nMODEL-FREE VERTICAL MOMENTS (${n} markers, no renderer/kernel/pen in this):`);
  console.log(`  containment: ${clipped} of ${n} markers carry >0.5% of their ink on a window edge` +
    `${clipped ? '  <-- the moment is measuring the CUT, not the glyph' : '  (clean)'}`);
  console.log(`  1st moment: centroid pitch ${pitch.toFixed(5)} output px, scatter ${cres.toFixed(4)} px` +
    `   (the model-free pitch, for cross-check)`);
  console.log(`  2nd moment: mean ${Vm.toFixed(5)} output px², raw sd ${raw.toFixed(5)} ` +
    `(= ${(raw / (2 * Vm) * 100).toFixed(3)}% implied scale if ALL of it were scale)`);
  console.log(`  after removing 2 harmonics of psi = frac(k·${MPHI}) — the estimator's own phase bias —`);
  console.log(`    residual sd ${fres.toFixed(5)} output px²  =>  PER-LINE SCALE sd ${(fres / (2 * Vm) * 100).toFixed(3)}%`);
  console.log(`    the phase harmonics themselves account for ${(100 * (1 - (fres / raw) ** 2)).toFixed(1)}% of the variance`);
  if (used[0].injS !== undefined && used.some(i => i.injS)) {
    const inj = used.map(i => i.injS);
    console.log(`  INJECTED (this is a control): scale sd ${(sd(inj) * 100).toFixed(3)}%`);
    let sxy = 0, sxx = 0, syy = 0;
    const mi = mean(inj), ms = mean(sImp);
    for (let j = 0; j < n; j++) { sxy += (inj[j] - mi) * (sImp[j] - ms); sxx += (inj[j] - mi) ** 2; syy += (sImp[j] - ms) ** 2; }
    console.log(`  RECOVERY: slope ${(sxy / sxx).toFixed(3)} (1.000 = exact), r ${(sxy / Math.sqrt(sxx * syy)).toFixed(4)}`);
  }

  // ---- THE ODD AND EVEN CHANNELS, KEYED TO ψ ---------------------------------
  // The y twin of the x skew probe (2026-08-03r), and the μ₄ channel 08-03t
  // asked for. Here ψ is NOT a nuisance to be regressed out — it is the KEYING
  // VARIABLE, since the y grid residue IS the sawtooth phase frac(k·phi). So the
  // same harmonics that de-bias the μ₂ channel above are the SIGNAL here, and
  // the number that means anything is this instrument's reading on a control,
  // never its reading against zero.
  //
  // THE NULL IS NOT ZERO AND THAT IS THE WHOLE CARE OF IT: five basis functions
  // over ~57 markers explain 5/57 = 8.8% of ANYTHING. So the null is ψ PERMUTED,
  // which destroys the pairing and keeps every other property of the series.
  const NPERM = +opt('perms', '200');
  let pseed = 20260804 >>> 0;
  const prnd = () => { pseed = (pseed * 1103515245 + 12345) >>> 0; return pseed / 4294967296; };
  const solve5 = (D, yv) => {                       // least squares on the 5-col design
    const A = [], bv = new Float64Array(5);
    for (let a = 0; a < 5; a++) A.push(new Float64Array(5));
    for (let j = 0; j < yv.length; j++) {
      const d = D[j];
      for (let a = 0; a < 5; a++) { bv[a] += d[a] * yv[j]; for (let c = 0; c < 5; c++) A[a][c] += d[a] * d[c]; }
    }
    for (let a = 0; a < 5; a++) {
      let piv = a;
      for (let r = a + 1; r < 5; r++) if (Math.abs(A[r][a]) > Math.abs(A[piv][a])) piv = r;
      [A[a], A[piv]] = [A[piv], A[a]]; const t = bv[a]; bv[a] = bv[piv]; bv[piv] = t;
      if (!A[a][a]) continue;
      for (let r = a + 1; r < 5; r++) {
        const f = A[r][a] / A[a][a];
        for (let c = a; c < 5; c++) A[r][c] -= f * A[a][c];
        bv[r] -= f * bv[a];
      }
    }
    const co = new Float64Array(5);
    for (let a = 4; a >= 0; a--) {
      let s = bv[a];
      for (let c = a + 1; c < 5; c++) s -= A[a][c] * co[c];
      co[a] = A[a][a] ? s / A[a][a] : 0;
    }
    return co;
  };
  const basis = ps => ps.map(p => [1, Math.cos(2 * Math.PI * p), Math.sin(2 * Math.PI * p),
    Math.cos(4 * Math.PI * p), Math.sin(4 * Math.PI * p)]);
  const r2 = (ps, yv) => {
    const D = basis(ps), co = solve5(D, yv), m = mean(yv);
    let ss = 0, tt = 0;
    for (let j = 0; j < yv.length; j++) {
      let f = 0; for (let a = 0; a < 5; a++) f += co[a] * D[j][a];
      ss += (yv[j] - f) ** 2; tt += (yv[j] - m) ** 2;
    }
    return tt ? 1 - ss / tt : 0;
  };
  const detrendK = yv => {                          // remove any drift down the page
    let sk2 = 0, sy2 = 0, skk2 = 0, sky2 = 0;
    for (let j = 0; j < yv.length; j++) { sk2 += KS[j]; sy2 += yv[j]; skk2 += KS[j] ** 2; sky2 += KS[j] * yv[j]; }
    const sl = (n * sky2 - sk2 * sy2) / (n * skk2 - sk2 * sk2), ic = (sy2 - sl * sk2) / n;
    return yv.map((v, j) => v - ic - sl * KS[j]);
  };
  const NBIN = +opt('bins', '10');
  const channel = (name, raw, pred) => {
    const yv = detrendK(raw);
    const obs = r2(PSI, yv);
    const nulls = [];
    for (let p = 0; p < NPERM; p++) {
      const sh = PSI.slice();
      for (let a = sh.length - 1; a > 0; a--) { const t = Math.floor(prnd() * (a + 1)); [sh[a], sh[t]] = [sh[t], sh[a]]; }
      nulls.push(r2(sh, yv));
    }
    nulls.sort((a, c) => a - c);
    const med = nulls[nulls.length >> 1], p95 = nulls[Math.floor(nulls.length * 0.95)], mx = nulls[nulls.length - 1];
    console.log(`\n  ${name}`);
    console.log(`    per-marker sd ${sd(yv).toExponential(3)}   ` +
      `ψ-keyed R² ${(100 * obs).toFixed(1)}%  against a PERMUTED-ψ null of ` +
      `median ${(100 * med).toFixed(1)}% / 95th ${(100 * p95).toFixed(1)}% / max ${(100 * mx).toFixed(1)}%` +
      `   ${obs > p95 ? '<-- KEYED' : 'at or below its own null — no ψ-keyed structure'}`);
    if (pred) console.log(`    ${pred}`);
    const bs = Array.from({ length: NBIN }, () => []);
    for (let j = 0; j < yv.length; j++) bs[Math.min(NBIN - 1, Math.floor(PSI[j] * NBIN))].push(yv[j]);
    console.log(`    transfer curve, binned means over ψ (± SE, n per bin):`);
    console.log('      ' + bs.map((v, j) => {
      if (!v.length) return `[${(j / NBIN).toFixed(1)}] --`;
      const m = mean(v), se = v.length > 1 ? sd(v) / Math.sqrt(v.length - 1) : NaN;
      return `[${(j / NBIN).toFixed(1)}] ${m >= 0 ? '+' : ''}${m.toExponential(2)}±${se.toExponential(1)}(${v.length})`;
    }).join('  '));
    return { obs, med, p95, mx, sd: sd(yv) };
  };
  const sigma = Math.sqrt(Vm);
  console.log(`\n  ψ-KEYED CHANNELS (ψ = frac(k·${MPHI}), which for the y axis IS the grid residue).`);
  console.log(`  ink scale σ = √mean(μ₂) = ${sigma.toFixed(4)} output px — the denominator every g/σ below uses.`);
  // μ₂ HAS TO BE RE-READ HERE AND THE REPORT ABOVE CANNOT DO IT. That report
  // regresses TWO HARMONICS OF ψ OUT of the width series, because it was built
  // (2026-08-03g) to hunt a per-line scale that was NOT expected to be ψ-keyed.
  // The (b)-vs-(b′) discriminator is the opposite question: linear interpolation
  // carries a width modulation δ(1−δ)g² which IS a function of ψ, so the
  // de-biasing step removes exactly the signature it is being asked to vote on.
  // Same series, same permuted-ψ null as the odd channels, no detrend.
  const chV = channel('μ₂  implied per-line scale (NO ψ detrend — see the note above)',
    V.map(v => v / (2 * Vm)),
    'prediction: (b) modulates by ½·0.07454·(g/σ)² and is ψ-KEYED; (b′) has μ₂ ≡ 0 identically and predicts NOTHING here.');
  const chSK = channel('μ₃  standardized skewness', SK,
    'prediction, both (b) and (b′): modulation sd = 0.06901·(g/σ)³, an ODD sawtooth-ish curve, zero-crossing at δ = ½.');
  const chKU = channel('μ₄  standardized kurtosis', KU,
    "prediction, (b′) only: modulation sd = 0.19640·(g/σ)⁴, EVEN in δ, zero at the wrap and peaked at δ = ½. (b) predicts no such term of this form.");
  console.log(`\n  IMPLIED g/σ, read off each channel's modulation (valid only if that channel is KEYED):`);
  console.log(`    from μ₂: (g/σ)² = ${(2 * chV.sd / 0.07454).toFixed(5)}  =>  g/σ = ${Math.sqrt(2 * chV.sd / 0.07454).toFixed(4)}` +
    `  =>  g = ${(Math.sqrt(2 * chV.sd / 0.07454) * sigma).toFixed(4)} output px = ${(Math.sqrt(2 * chV.sd / 0.07454) * sigma * b.fy).toFixed(4)} src px   [(b) only]`);
  console.log(`    from μ₃: (g/σ)³ = ${(chSK.sd / 0.06901).toFixed(5)}  =>  g/σ = ${Math.cbrt(chSK.sd / 0.06901).toFixed(4)}` +
    `  =>  g = ${(Math.cbrt(chSK.sd / 0.06901) * sigma).toFixed(4)} output px = ${(Math.cbrt(chSK.sd / 0.06901) * sigma * b.fy).toFixed(4)} src px`);
  console.log(`    from μ₄: (g/σ)⁴ = ${(chKU.sd / 0.19640).toFixed(5)}  =>  g/σ = ${Math.pow(chKU.sd / 0.19640, 0.25).toFixed(4)}` +
    `  =>  g = ${(Math.pow(chKU.sd / 0.19640, 0.25) * sigma).toFixed(4)} output px = ${(Math.pow(chKU.sd / 0.19640, 0.25) * sigma * b.fy).toFixed(4)} src px`);
  console.log(`    THE TWO MUST AGREE if one interpolated shift produces both. They are also both`);
  console.log(`    UPPER bounds while the channel's own floor is unmeasured — run --synth --synth-phi`);
  console.log(`    (offset, no deformation) to read the floor, and --synth-shift to read a known g back.`);
  if (used.some(i => i.injD !== undefined && i.injD)) {
    const inj = used.map(i => i.injD).slice(0, n);
    console.log(`\n  INJECTED (this is a control): δ walk sd ${sd(inj).toFixed(4)}, ` +
      `so ψ and δ should coincide — the channels above must fire.`);
  }
  console.log(`\n  READ THIS AGAINST A CONTROL, NOT AGAINST ZERO: --synth --synth-phi 0.206929 injects the`);
  console.log(`  measured per-line OFFSET and no scale at all, so whatever it reports here is the floor.`);
  process.exit(0);
}

// ---- IS IT THE RESAMPLE AT ALL? ----------------------------------------------
// Every kernel tried so far is a two-parameter guess (box or tent, one width).
// This bounds the WHOLE family at once: let the vertical kernel be an arbitrary
// non-parametric function of the source-pixel offset and solve for it by least
// squares. The downscale is LINEAR in its taps, so this is exact, and the 57
// markers supply 57 distinct y phases — which is what identifies a kernel that
// a single glyph provably cannot.
//
// The verdict is structural, not a score to beat:
//   residual collapses -> the kernel was wrong, and this reads off the right one
//   residual holds     -> NO vertical resample whatsoever explains the page, so
//                         the missing term is UPSTREAM of the downscale and
//                         every remaining kernel hypothesis is dead.
if (flag('solve-y') || flag('solve-x')) {
  const AX = flag('solve-x') ? 'x' : 'y';
  // TAP NODES, and how a source pixel is assigned to them. The kernel is a
  // continuous function of the offset between a source pixel and the output
  // pixel's centre; the solve can only carry it at a finite set of nodes. The
  // first version of this solve assigned each source pixel to its NEAREST node,
  // which quantises that offset by up to half a node spacing — a phase-dependent
  // error that no choice of taps can absorb, and it floors the solve well above
  // zero on data a tent explains exactly (53.7 per glyph in y, 23.2 in x,
  // measured with --synth). LINEAR INTERPOLATION between the two straddling
  // nodes removes it to second order and is what makes the free-kernel verdict
  // readable. Keep --tap-nearest only to reproduce the old numbers.
  const BW = +opt('tapw', '0.25');
  const NB = 2 * Math.round(5 / BW) + 1, B0 = -(NB - 1) / 2 * BW;
  const NEAREST = flag('tap-nearest');
  const lam = +opt('lambda', '30');
  const spread = (row, u, v) => {
    if (NEAREST) { const bi = Math.round(u); if (bi >= 0 && bi < NB) row[bi] += v; return; }
    const b0 = Math.floor(u), f = u - b0;
    if (b0 >= 0 && b0 < NB) row[b0] += v * (1 - f);
    if (b0 + 1 >= 0 && b0 + 1 < NB) row[b0 + 1] += v * f;
  };
  EMY = b.emy;
  geometry(b.fy);
  clone.cache.clear();
  for (const j of used) { j.WX = axisW(j.TX0, TW, FX, j.SX0, SW, kx); j.WY = axisW(j.TY0, TH, b.fy, j.SY0, SH, ky); }
  const nudge = +opt('nudge', '16');

  // design matrix over (marker, output pixel): rows of tap-bin sums
  const A = [], rhs = [];
  for (const i of used) {
    const px64 = Math.round((b.line.X0 - i.SX0) * 64);
    const py64 = Math.round((b.line.Y0 + b.line.P * i.k - i.SY0) * 64);
    let bd = Infinity, bdx = 0, bdy = 0;
    for (let dx = -nudge; dx <= nudge; dx += b.penStep)
      for (let dy = -nudge; dy <= nudge; dy += b.penStep) {
        if (px64 + dx < 0 || py64 + dy < 0) continue;
        if (!render(b.em, px64 + dx, py64 + dy)) continue;
        const r = score(i, i.WX, i.WY);
        if (r.diff < bd) { bd = r.diff; bdx = dx; bdy = dy; }
      }
    render(b.em, px64 + bdx, py64 + bdy);
    // Resample the OTHER axis fully, leaving the solved axis untouched; then
    // each output pixel's design row is the free axis's source line, binned.
    if (AX === 'y') {
      const mid = new Float64Array(SH * TW);              // x done, y free
      for (let y = 0; y < SH; y++) {
        const row = y * SW;
        for (let x = 0; x < TW; x++) {
          const { idx, wt } = i.WX[x];
          let a = 0;
          for (let j = 0; j < idx.length; j++) a += src[row + idx[j]] * wt[j];
          mid[y * TW + x] = a;
        }
      }
      for (let Y = 0; Y < TH; Y++) {
        const c = (i.TY0 + Y + 0.5) * b.fy - i.SY0;
        for (let X = 0; X < TW; X++) {
          const row = new Float64Array(NB);
          for (let s = 0; s < SH; s++) spread(row, (s + 0.5 - c - B0) / BW, mid[s * TW + X]);
          A.push(row); rhs.push(i.target[Y * TW + X]);
        }
      }
    } else {
      const mid = new Float64Array(TH * SW);              // y done, x free
      for (let Y = 0; Y < TH; Y++) {
        const { idx, wt } = i.WY[Y];
        for (let x = 0; x < SW; x++) {
          let a = 0;
          for (let j = 0; j < idx.length; j++) a += src[idx[j] * SW + x] * wt[j];
          mid[Y * SW + x] = a;
        }
      }
      for (let Y = 0; Y < TH; Y++) {
        for (let X = 0; X < TW; X++) {
          const c = (i.TX0 + X + 0.5) * FX - i.SX0;
          const row = new Float64Array(NB);
          for (let s = 0; s < SW; s++) spread(row, (s + 0.5 - c - B0) / BW, mid[Y * SW + s]);
          A.push(row); rhs.push(i.target[Y * TW + X]);
        }
      }
    }
  }
  // normal equations + second-difference smoothing
  const N = NB, M = Array.from({ length: N }, () => new Float64Array(N + 1));
  for (let r = 0; r < A.length; r++) {
    const a = A[r], y = rhs[r];
    for (let p = 0; p < N; p++) {
      if (!a[p]) continue;
      for (let q = 0; q < N; q++) if (a[q]) M[p][q] += a[p] * a[q];
      M[p][N] += a[p] * y;
    }
  }
  for (let p = 0; p < N; p++) {
    const add = (q, v) => { if (q >= 0 && q < N) M[p][q] += v; };
    add(p, 2 * lam); add(p - 1, -lam); add(p + 1, -lam);
  }
  // Gaussian elimination with partial pivoting
  for (let c0 = 0; c0 < N; c0++) {
    let piv = c0;
    for (let r = c0 + 1; r < N; r++) if (Math.abs(M[r][c0]) > Math.abs(M[piv][c0])) piv = r;
    [M[c0], M[piv]] = [M[piv], M[c0]];
    const d = M[c0][c0] || 1e-12;
    for (let r = c0 + 1; r < N; r++) {
      const f = M[r][c0] / d;
      if (!f) continue;
      for (let q = c0; q <= N; q++) M[r][q] -= f * M[c0][q];
    }
  }
  const h = new Float64Array(N);
  for (let r = N - 1; r >= 0; r--) {
    let s = M[r][N];
    for (let q = r + 1; q < N; q++) s -= M[r][q] * h[q];
    h[r] = s / (M[r][r] || 1e-12);
  }
  // evaluate WITH rounding, exactly as the producer would
  const evalTaps = t => {
    let tot = 0, nExact = 0;
    for (let r = 0, m = 0; m < used.length; m++) {
      let bad = false;
      for (let p = 0; p < TW * TH; p++, r++) {
        let a = 0;
        for (let q = 0; q < N; q++) a += A[r][q] * t[q];
        let v = roundBy(a); v = v < 0 ? 0 : v > 255 ? 255 : v;
        const d = Math.abs(v - rhs[r]);
        tot += d; if (d) bad = true;
      }
      if (!bad) nExact++;
    }
    return { tot, nExact };
  };
  // LIKE FOR LIKE, and the lack of it is what produced the claim that a free
  // kernel "cannot even beat the two-parameter tent". The tent's 186.8 is
  // scored through axisW's exact continuous weights; the free kernel is scored
  // through tap nodes. Those are different objectives. Score the ANALYTIC
  // kernel through this very design matrix so the two numbers mean the same
  // thing, and read the free kernel against THAT.
  const kRef = AX === 'y' ? ky : kx;
  const hRef = new Float64Array(NB);
  for (let q = 0; q < NB; q++) {
    const t = B0 + q * BW;
    hRef[q] = kRef.type === 'tri' ? Math.max(0, 1 - Math.abs(t) / kRef.w) / kRef.w
      : (Math.abs(t) < kRef.w / 2 ? 1 / kRef.w : 0);
  }
  // axisW normalises its weights to sum to 1 for EACH output pixel; the tap
  // model cannot, because one tap vector serves every phase. That is a pure
  // gain difference, so give the analytic kernel its best single scale factor
  // before comparing — otherwise the reference is penalised for something the
  // free kernel is not being asked to reproduce.
  {
    let num = 0, den = 0;
    for (let r = 0; r < A.length; r++) {
      let a = 0;
      for (let q = 0; q < N; q++) a += A[r][q] * hRef[q];
      num += a * rhs[r]; den += a * a;
    }
    const alpha = den ? num / den : 1;
    for (let q = 0; q < N; q++) hRef[q] *= alpha;
  }
  const ref = evalTaps(hRef);
  const { tot, nExact } = evalTaps(h);
  const sumH = h.reduce((s, v) => s + v, 0);
  let m1 = 0, m2 = 0;
  for (let q = 0; q < N; q++) { const t = B0 + q * BW; m1 += h[q] * t; m2 += h[q] * t * t; }
  console.log(`\nFREE ${AX === 'y' ? 'VERTICAL' : 'HORIZONTAL'} KERNEL (${NB} taps every ${BW} src px, ` +
    `${NEAREST ? 'NEAREST-node' : 'linear-interpolated'}, smoothing λ ${lam}), ` +
    `${AX === 'y' ? `x held at ${KX}` : `y held at ${KY}`}, fy ${b.fy}:`);
  console.log(`  Σ|Δ| ${tot} = ${(tot / used.length).toFixed(1)} per glyph, ` +
    `${(tot / inkBytes).toFixed(2)} per ink byte;  ${nExact} of ${used.length} byte-exact`);
  console.log(`  the SAME design matrix scored with the analytic ${AX === 'y' ? KY : KX}: ` +
    `${(ref.tot / used.length).toFixed(1)} per glyph, ${ref.nExact} byte-exact  <- the like-for-like comparison`);
  // Source rows are 1 px apart but the taps are binned every BW, so any one
  // output pixel uses only every (1/BW)th tap: the normalisation is 1/BW, not 1.
  console.log(`  kernel: Σtaps ${sumH.toFixed(4)} (must be ~${(1 / BW).toFixed(0)}), centroid ${(m1 / sumH).toFixed(3)}, ` +
    `sd ${Math.sqrt(m2 / sumH - (m1 / sumH) ** 2).toFixed(3)} src px ` +
    (f => `(box(${f.toFixed(2)}) would be ${(f / Math.sqrt(12)).toFixed(3)}, tent ${(f / Math.sqrt(6)).toFixed(3)})`)(AX === 'y' ? b.fy : FX));
  let sh = '  taps: ';
  for (let q = 0; q < N; q++) if (Math.abs(h[q]) > 0.002) sh += `${(B0 + q * BW).toFixed(2)}:${h[q].toFixed(3)}  `;
  console.log(sh);
  console.log(`  VERDICT: ${tot / used.length < 40
    ? 'the kernel WAS the missing term — read it off above.'
    : `no ${AX === 'y' ? 'vertical' : 'horizontal'} kernel ALONE explains this page: an arbitrary ` +
      'one, fitted with every advantage, still cannot reach it, and against the analytic ' +
      'reference above it buys little or nothing. Read that against --synth, whose floor here ' +
      'is 6.0 per glyph in y and 1.2 in x — NOT against zero. It does not follow that the ' +
      'downscale is refuted: with the SOURCE freed too (--solve-joint) the tents come back.'}`);
}

// ---- IS IT A DOWNSCALE OF ANY SOURCE IMAGE AT ALL? ---------------------------
// The free-kernel solve bounded the FILTER. This bounds the SOURCE. The
// downscale is linear in the source pixels just as it is in the taps, and all
// 57 markers share ONE source raster — the row pitch is exactly 42 source px,
// an integer, so every marker sits at the same fractional pen phase and only
// the output sampling phase differs. So: solve for the source raster itself,
// completely free, by least squares over all 57 markers at once.
//
// This is the strongest possible statement about the geometry, because it
// grants the source render EVERY degree of freedom it could ever have:
//   residual -> 0   the geometry and kernels are RIGHT and only cour.ttf's
//                   raster is wrong; the solved raster then SHOWS what the
//                   source render actually produced, which is a picture of the
//                   answer rather than another refutation
//   residual >> 0   no single source image explains all 57 markers under this
//                   downscale, so the geometry itself is wrong in a way the
//                   per-axis kernel solve could not see
if (flag('solve-src')) {
  EMY = b.emy;
  geometry(b.fy);
  clone.cache.clear();
  for (const j of used) { j.WX = axisW(j.TX0, TW, FX, j.SX0, SW, kx); j.WY = axisW(j.TY0, TH, b.fy, j.SY0, SH, ky); }
  const P42 = +opt('pitch', '42');            // exact integer pitch, per the layout law
  const X0 = b.line.X0, Y0 = b.line.Y0;

  // Absolute source taps per equation, folded into a raster shared by all
  // markers via s_rel = s_abs - P42·k (exact, because P42 is an integer).
  const eqs = [], rhs = [];
  let sLo = 1e9, sHi = -1e9, cLo = 1e9, cHi = -1e9;
  for (const i of used) {
    for (let Y = 0; Y < TH; Y++) {
      const wy = i.WY[Y];
      for (let X = 0; X < TW; X++) {
        const wx = i.WX[X];
        const taps = [];
        for (let a = 0; a < wy.idx.length; a++)
          for (let c = 0; c < wx.idx.length; c++) {
            const sAbs = wy.idx[a] + i.SY0, cAbs = wx.idx[c] + i.SX0;
            const sRel = sAbs - P42 * i.k;
            if (sRel < sLo) sLo = sRel; if (sRel > sHi) sHi = sRel;
            if (cAbs < cLo) cLo = cAbs; if (cAbs > cHi) cHi = cAbs;
            taps.push(sRel, cAbs, wy.wt[a] * wx.wt[c]);
          }
        eqs.push(taps); rhs.push(i.target[Y * TW + X]);
      }
    }
  }
  const NR = sHi - sLo + 1, NC = cHi - cLo + 1, NU = NR * NC;
  for (const t of eqs) for (let j = 0; j < t.length; j += 3) t[j] = (t[j] - sLo) * NC + (t[j + 1] - cLo);

  // start from what cour.ttf actually renders, so the solve reports a DELTA
  const S = new Float64Array(NU).fill(255);
  const px0 = Math.round((X0 - used[0].SX0) * 64), py0 = Math.round((Y0 + b.line.P * used[0].k - used[0].SY0) * 64);
  render(b.em, px0, py0);
  for (let s = 0; s < SH; s++)
    for (let c = 0; c < SW; c++) {
      const sRel = s + used[0].SY0 - P42 * used[0].k - sLo, cRel = c + used[0].SX0 - cLo;
      if (sRel >= 0 && sRel < NR && cRel >= 0 && cRel < NC) S[sRel * NC + cRel] = src[s * SW + c];
    }
  const S0 = Float64Array.from(S);
  const apply = v => { const o = new Float64Array(eqs.length);
    for (let e = 0; e < eqs.length; e++) { const t = eqs[e]; let a = 0;
      for (let j = 0; j < t.length; j += 3) a += v[t[j]] * t[j + 2]; o[e] = a; } return o; };
  const applyT = r => { const o = new Float64Array(NU);
    for (let e = 0; e < eqs.length; e++) { const t = eqs[e], re = r[e];
      for (let j = 0; j < t.length; j += 3) o[t[j]] += re * t[j + 2]; } return o; };
  // Conjugate gradient on the normal equations.
  //
  // The number to watch is the CONTINUOUS residual, not the rounded one. A
  // downscale is low-pass, so the normal equations are ill-conditioned: many
  // source rasters give nearly the same output and CG happily amplifies the
  // components the data does not constrain (visible as ±70 ringing along the
  // arms). That ringing inflates the ROUNDED L1 score while the L2 residual it
  // is actually minimising keeps falling — so a large rounded score here is a
  // statement about conditioning, NOT about whether a source image exists.
  // RMS -> 0 means the geometry CAN express the page; RMS stuck high means it
  // cannot, and only that second case is a refutation.
  const rmsOf = v => { const Av = apply(v); let s = 0;
    for (let e = 0; e < eqs.length; e++) s += (Av[e] - rhs[e]) ** 2;
    return Math.sqrt(s / eqs.length); };
  const rms0 = rmsOf(S);
  const trace = [];
  let Ax = apply(S);
  let r = applyT(rhs.map((y, e) => y - Ax[e]));
  let p = Float64Array.from(r), rs = r.reduce((s, v) => s + v * v, 0);
  const NIT = +opt('cg', '400');
  for (let it = 0; it < NIT && rs > 1e-12; it++) {
    const Ap = applyT(apply(p));
    let pAp = 0; for (let j = 0; j < NU; j++) pAp += p[j] * Ap[j];
    if (pAp <= 0) break;
    const al = rs / pAp;
    for (let j = 0; j < NU; j++) { S[j] += al * p[j]; r[j] -= al * Ap[j]; }
    const rs2 = r.reduce((s, v) => s + v * v, 0);
    for (let j = 0; j < NU; j++) p[j] = r[j] + (rs2 / rs) * p[j];
    rs = rs2;
    if (it === 24 || it === 99 || it === NIT - 1) trace.push(`${it + 1}:${rmsOf(S).toFixed(3)}`);
  }
  console.log(`\n  continuous RMS residual (bytes): cour.ttf ${rms0.toFixed(3)} -> ` +
    `free source ${trace.join('  ')}   [<0.5 means the geometry CAN reproduce the page]`);
  // evaluate WITH rounding and clamping, exactly as the producer would
  let tot = 0, nExact = 0;
  for (let e = 0, m = 0; m < used.length; m++) {
    let bad = false;
    for (let q = 0; q < TW * TH; q++, e++) {
      const t = eqs[e]; let a = 0;
      for (let j = 0; j < t.length; j += 3) a += Math.max(0, Math.min(255, S[t[j]])) * t[j + 2];
      let v = roundBy(a); v = v < 0 ? 0 : v > 255 ? 255 : v;
      const d = Math.abs(v - rhs[e]); tot += d; if (d) bad = true;
    }
    if (!bad) nExact++;
  }
  console.log(`\nFREE SOURCE RASTER (${NR}×${NC} = ${NU} unknowns, ${eqs.length} equations, ` +
    `pitch pinned ${P42}, kernels ${KX}/${KY}, fy ${b.fy}):`);
  console.log(`  Σ|Δ| ${tot} = ${(tot / used.length).toFixed(1)} per glyph, ` +
    `${(tot / inkBytes).toFixed(2)} per ink byte;  ${nExact} of ${used.length} byte-exact`);
  console.log(`  (the rounded score above is inflated by CG ringing and is NOT the verdict —` +
    ` read the RMS line, which is what the solve minimises.)`);
  console.log('  THIS FLOOR IS NOT STRUCTURAL, and that is now measured rather than argued: on a' +
    '\n  --synth control it is 0.133 with a perfect shared raster and 3.904 once a per-line' +
    '\n  sub-pixel phase scatter of ONE SOURCE PIXEL is injected and nothing else is wrong.' +
    '\n  The page reads 3.851. So this solve measures its own PREMISE — that all 57 markers' +
    '\n  share one source raster — which is also why it returns ~3.85 at EVERY geometry while' +
    '\n  cour.ttf\'s own residual swings 4.5-6.1. Read nothing structural into it.');
  // where the free raster departs from cour.ttf
  let mx = 0, sum = 0, n = 0;
  for (let j = 0; j < NU; j++) { const d = Math.max(0, Math.min(255, S[j])) - S0[j];
    if (Math.abs(d) > Math.abs(mx)) mx = d; sum += Math.abs(d); n++; }
  console.log(`  free raster vs cour.ttf: mean |Δ| ${(sum / n).toFixed(2)}, worst ${mx.toFixed(1)} bytes`);
  const r0 = Math.max(0, Math.round((Y0 - P42 * used[0].k) - sLo) - 2);
  console.log(`  delta (free − cour.ttf), source px, rows ${r0}..${r0 + 27} of the glyph:`);
  for (let s = r0; s < Math.min(NR, r0 + 28); s++) {
    let ln = '   ';
    for (let c = 0; c < Math.min(NC, 34); c++) {
      const d = Math.max(0, Math.min(255, S[s * NC + c])) - S0[s * NC + c];
      ln += Math.abs(d) < 8 ? '   .' : String(Math.round(d)).padStart(4);
    }
    console.log(ln);
  }
}

// ---- FREE SOURCE *AND* FREE KERNEL TOGETHER ----------------------------------
// The last corner of the downscale hypothesis space. --solve-y/--solve-x free
// the FILTER with the source held at cour.ttf; --solve-src frees the SOURCE
// with the filter held at a tent pair. Neither frees both, and a wrong source
// can always be partly absorbed by a wrong filter — so each of those solves
// could be reporting the other one's error. This frees both at once.
//
// The model is bilinear (out = K applied to S, linear in each separately), so
// alternating least squares: solve S by conjugate gradient with K held, solve K
// with S held, repeat. Both steps are exact; ALS descends monotonically.
// --k2d drops separability too, solving a full 2D kernel over the node grid —
// at which point the model is the MOST GENERAL LINEAR DOWNSCALE THERE IS: any
// source image whatsoever, through any fixed 2D filter whatsoever.
//
// READ IT AGAINST THE CONTROLS, NEVER AGAINST ZERO. This solve inherits
// --solve-src's premise (all 57 markers share one raster, folded at an integer
// source pitch) and therefore its floor, which is set by how well the markers
// actually agree — 0.133 bytes RMS on a perfect control, 3.64 with a 0.27 src
// px pen scatter injected. Run --synth alongside every real run.
if (flag('solve-joint')) {
  const BW = +opt('tapw', '0.25');
  const NB = 2 * Math.round(5 / BW) + 1, B0 = -(NB - 1) / 2 * BW, R = 5 - BW;
  const K2D = flag('k2d');
  const lam = +opt('lambda', '30');
  const P42 = +opt('pitch', '42');
  const ALS = +opt('als', '8'), CGS = +opt('cg', '300'), CGK = +opt('cgk', '200');
  // The fold need not assume an INTEGER pitch: round(P·k) puts the whole-pixel
  // part of any pitch into S's indexing and leaves the sub-pixel remainder to
  // the phase step. At integer P this is identical to the old fold, so nothing
  // before it changes.
  //
  // TRAP, and it produced a wrong result that stood for an hour: sweeping --pitch
  // while holding --fy is INCOHERENT. The two are not independent — the OUTPUT
  // row pitch is a property of the page, so P and fy must satisfy
  // P = 14.33868·fy, and moving P alone silently moves the implied output pitch.
  // That sweep shows a sharp "minimum" at P = 42 which is nothing but the
  // output-pitch mismatch it created. Swept coherently (fy = P/14.33868) the
  // objective is FLAT, because --solve-phase absorbs a fold error of δ per row
  // exactly. Freeing the phase DESTROYS the pitch information; the pitch is only
  // identifiable with the phases constrained.
  const fold = k => Math.round(P42 * k);
  // ---- --fine-y: THE SOURCE LATTICE, REFINED IN Y ONLY ----------------------
  // The pre-registered representation-error test (08-03m): if the 1.647 is a
  // fine-lattice truth fitted on a coarse grid, giving the free source more
  // resolution must make it fall — while a control whose truth LIVES on the
  // coarse lattice stays at its floor.
  //
  // Y ONLY, and that is a measured constraint rather than a preference. The
  // folded source is NR x NC = 43 x 55 = 2365 px against 10260 equations, but
  // the axes are not symmetric:
  //   y  15 output rows x 57 DISTINCT PHASES ~ 855 samples per column against
  //      43 rows — overdetermined ~20x, and still ~5x at 4x.
  //   x  12 output columns at ONE phase (all markers share the column; the
  //      measured x pen sd is 0.013 src px) — underdetermined already at 1x.
  // Refining both axes gives 9460 params at 2x and 37840 at 4x against 10260
  // equations: the RMS would fall to zero trivially and the row would be
  // vacuous. There is also no physics in it — no sampling diversity in x means
  // nothing for a finer x lattice to resolve.
  //
  // UNITS, deliberately: a fine row's centre is expressed in COARSE source px,
  // (m + 0.5)/RY, so the kernel node grid, the per-marker phases dY and every
  // reported kernel width stay in the units they have always been in and remain
  // comparable across refinements. Only S gains rows. The one consequence is
  // that each fine row carries 1/RY of the mass, so the recovered taps come back
  // scaled by 1/RY — which is why the tap sum is checked against 1/(BW·RY).
  const RY = Math.max(1, Math.round(+opt('fine-y', '1')));
  const foldF = k => Math.round(P42 * RY * k);       // exact while P42 is integral
  EMY = b.emy;
  geometry(b.fy);
  clone.cache.clear();

  // ---- the term list: one entry per (equation, source pixel) ----------------
  // Each source pixel lands between two kernel nodes on each axis and is split
  // between them linearly — the same interpolation that took the free-kernel
  // solve's floor from 53.7 to 6.0 per glyph.
  let sLo = 1e9, sHi = -1e9, cLo = 1e9, cHi = -1e9, nTerm = 0;
  const NEQ = used.length * TH * TW;
  const eqStart = new Int32Array(NEQ + 1);
  {
    let e = 0;
    for (const i of used) for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++, e++) {
      const cy = (i.TY0 + Y + 0.5) * b.fy, cx = (i.TX0 + X + 0.5) * FX;
      let n = 0;
      for (let m = Math.ceil((cy - R) * RY - 0.5); m <= Math.floor((cy + R) * RY - 0.5); m++) {
        const sRel = m - foldF(i.k);
        if (sRel < sLo) sLo = sRel; if (sRel > sHi) sHi = sRel;
        for (let sx = Math.ceil(cx - R - 0.5); sx <= Math.floor(cx + R - 0.5); sx++) {
          if (sx < cLo) cLo = sx; if (sx > cHi) cHi = sx;
          n++;
        }
      }
      eqStart[e + 1] = eqStart[e] + n; nTerm += n;
    }
  }
  const NR = sHi - sLo + 1, NC = cHi - cLo + 1, NU = NR * NC;
  const sIdx = new Int32Array(nTerm), byi = new Int32Array(nTerm), bxi = new Int32Array(nTerm);
  const fyf = new Float64Array(nTerm), fxf = new Float64Array(nTerm);
  // The node coordinate BEFORE any per-marker phase offset is applied. Keeping
  // it lets --solve-phase move a marker's sampling without rebuilding anything.
  const tyu = new Float64Array(nTerm), txu = new Float64Array(nTerm);
  const rhs = new Float64Array(NEQ);
  {
    let e = 0, t = 0;
    for (const i of used) for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++, e++) {
      const cy = (i.TY0 + Y + 0.5) * b.fy, cx = (i.TX0 + X + 0.5) * FX;
      rhs[e] = i.target[Y * TW + X];
      for (let m = Math.ceil((cy - R) * RY - 0.5); m <= Math.floor((cy + R) * RY - 0.5); m++) {
        // the fine row's centre, IN COARSE SOURCE PX — this is what keeps the
        // node grid, dY and the reported widths in their original units
        const uy = ((m + 0.5) / RY - cy - B0) / BW;
        const sRel = m - foldF(i.k) - sLo;
        for (let sx = Math.ceil(cx - R - 0.5); sx <= Math.floor(cx + R - 0.5); sx++, t++) {
          const ux = (sx + 0.5 - cx - B0) / BW;
          sIdx[t] = sRel * NC + (sx - cLo);
          tyu[t] = uy; txu[t] = ux;
        }
      }
    }
  }
  const eqOf = new Int32Array(nTerm), mkOf = new Int32Array(NEQ);
  for (let e = 0; e < NEQ; e++) {
    mkOf[e] = Math.floor(e / (TH * TW));
    for (let t = eqStart[e]; t < eqStart[e + 1]; t++) eqOf[t] = e;
  }
  // ---- per-marker sub-pixel phase ------------------------------------------
  // The one thing every multi-instance solve here holds FIXED, and the thing
  // that floors them all: markers are assumed to sit at exactly 42·k source px,
  // so any real departure shows up as residual no free source or kernel can
  // absorb. Freeing it turns that floor into a MEASUREMENT — dY is then each
  // marker's source-space offset, and its distribution is what says whether the
  // source row pitch is an integer.
  //
  // A pen shift really RE-RASTERISES the glyph; this models it as a shift of
  // the sampling against a fixed raster. --synth --synth-jitter scores that
  // approximation against a known truth rather than assuming it.
  //
  // --solve-phase-x frees the same thing on X as a FOURTH block. All 57 markers
  // are the leading '>' of their line and sit in one column, so a shared x pen is
  // not an assumption of convenience — it is the layout. If x really is shared,
  // the block must come back at ~0 and buy nothing; if it does not, the
  // marker-to-marker inconsistency that survives every other freedom is
  // horizontal, and that is a different producer bug from a vertical one.
  const PHASE = flag('solve-phase');
  // --pin-phase: hold the 57 offsets ON the certified sawtooth (rate fixed,
  // amplitude and origin free) instead of letting each float. See the projection
  // in the phase step for why a fine lattice makes this the decisive control.
  const PIN = flag('pin-phase');
  const PINPHI = +opt('pin-phi', '0.206929');
  let pinInfo = null;
  const PHASEX = flag('solve-phase-x');
  const dY = new Float64Array(used.length);
  const dX = new Float64Array(used.length);
  // ---- per-marker vertical SCALE, the fourth block --------------------------
  // Offsets fix the FIRST moment; a scale is the SECOND, and no offset can
  // absorb it. This is the one class the --joint-dump signature still admitted:
  // each line a different RASTERIZATION rather than the same one moved.
  //
  // Marker k's true source is the shared raster S stretched by (1+s) about an
  // anchor A. Changing variables from the stretched coordinate u to S's own v,
  // u = A + (v−A)(1+s), the kernel argument becomes (v+0.5−A)(1+s) + A − cy and
  // the sum picks up the Jacobian (1+s) — so in node units this is exactly the
  // phase block with the constant 1 replaced by the per-term lever arm
  // ryu[t] = v + 0.5 − A, plus a gain on the weight. A taller glyph really does
  // carry more ink, which is what that gain is.
  //
  // The anchor is the window's geometric middle. It does NOT affect the
  // recovered s — moving A only trades against the offset, which the phase block
  // is already free to absorb — it is chosen to keep the two blocks from
  // fighting each other during the alternation.
  const SCALE = flag('solve-scale');
  // A scale block ALONE would quietly eat the offsets: stretching about an
  // anchor moves the glyph as well as resizing it, so without the phase block
  // beside it the fitted "scale" is mostly first moment. Refuse rather than
  // report that — this family has enough withdrawn numbers.
  if (SCALE && !PHASE) { console.error('--solve-scale requires --solve-phase: a scale about an anchor carries an offset, and the offset block is what separates them.'); process.exit(2); }
  const dSc = new Float64Array(used.length);
  // The lever arm stays in COARSE src px like dY and the node grid, so the
  // fitted scale keeps its meaning (and its 0.211% certified floor) at every RY.
  const A0 = (sLo + sHi + 1) / (2 * RY);
  const ryu = new Float64Array(nTerm);
  for (let t = 0; t < nTerm; t++) ryu[t] = ((sIdx[t] / NC | 0) + sLo + 0.5) / RY - A0;
  const setNodes = () => {
    for (let t = 0; t < nTerm; t++) {
      const mk = mkOf[eqOf[t]];
      const uy = tyu[t] + (dY[mk] + dSc[mk] * ryu[t]) / BW, ux = txu[t] + dX[mk] / BW;
      let a = Math.floor(uy); if (a < 0) a = 0; else if (a > NB - 2) a = NB - 2;
      let c = Math.floor(ux); if (c < 0) c = 0; else if (c > NB - 2) c = NB - 2;
      byi[t] = a; fyf[t] = Math.max(0, Math.min(1, uy - a));
      bxi[t] = c; fxf[t] = Math.max(0, Math.min(1, ux - c));
    }
  };
  setNodes();

  // ---- the unknowns ---------------------------------------------------------
  // S starts at what cour.ttf actually renders, so the solve reports a delta;
  // the kernels start at the tent pair the fit settled on.
  const S = new Float64Array(NU).fill(255);
  {
    const px0 = Math.round((b.line.X0 - used[0].SX0) * 64);
    // At RY > 1 the init must be a GENUINELY FINE render, not an interpolation
    // of the coarse one — an interpolated start is smooth by construction and a
    // limited-iteration CG would stay near it, which is exactly the artifact
    // this row is trying to detect. Rendering with the vertical em and the pen
    // both scaled by RY onto an RY-times taller raster IS the fine source.
    if (RY === 1) {
      const py0 = Math.round((b.line.Y0 + b.line.P * used[0].k - used[0].SY0) * 64);
      render(b.em, px0, py0);
      for (let s = 0; s < SH; s++)
        for (let c = 0; c < SW; c++) {
          const sr = s + used[0].SY0 - fold(used[0].k) - sLo, cr = c + used[0].SX0 - cLo;
          if (sr >= 0 && sr < NR && cr >= 0 && cr < NC) S[sr * NC + cr] = src[s * SW + c];
        }
    } else {
      const SHf = SH * RY, saveW = clone.W, saveH = clone.H, saveEMY = EMY;
      clone.W = SW; clone.H = SHf;
      EMY = Math.round(b.emy * RY * 32) / 32;
      clone.cache.clear();
      const py0 = Math.round((b.line.Y0 + b.line.P * used[0].k - used[0].SY0) * RY * 64);
      const cov = clone.coverage(CP, b.em, EMY, px0, py0);
      if (!cov) { console.error(`--fine-y ${RY}: the fine render failed`); process.exit(2); }
      for (let s = 0; s < SHf; s++)
        for (let c = 0; c < SW; c++) {
          // fine row s sits at absolute fine index s + SY0·RY
          const sr = s + used[0].SY0 * RY - foldF(used[0].k) - sLo, cr = c + used[0].SX0 - cLo;
          if (sr >= 0 && sr < NR && cr >= 0 && cr < NC) {
            const g = cov[s * SW + c];
            S[sr * NC + cr] = g ? LAWF(g) : 255;
          }
        }
      clone.W = saveW; clone.H = saveH; EMY = saveEMY; clone.cache.clear();
    }
  }
  const S0 = Float64Array.from(S);
  const tapsOf = K => { const h = new Float64Array(NB);
    for (let q = 0; q < NB; q++) { const t = B0 + q * BW;
      h[q] = K.type === 'tri' ? Math.max(0, 1 - Math.abs(t) / K.w) / K.w
        : (Math.abs(t) < K.w / 2 ? 1 / K.w : 0); }
    return h; };
  // Each fine row carries 1/RY of the mass, so the kernel that reproduces unit
  // DC gain is the coarse tent divided by RY. Starting there rather than letting
  // ALS discover it keeps the first iteration from being RY times too bright.
  let hy = tapsOf(ky), hx = tapsOf(kx);
  if (RY > 1) for (let q = 0; q < NB; q++) hy[q] /= RY;
  let K2 = null;
  if (K2D) { K2 = new Float64Array(NB * NB);
    for (let a = 0; a < NB; a++) for (let c = 0; c < NB; c++) K2[a * NB + c] = hy[a] * hx[c]; }

  // per-term weight under the current kernel
  const wArr = new Float64Array(nTerm);
  const refreshW = () => {
    for (let t = 0; t < nTerm; t++) {
      const a = byi[t], c = bxi[t], u = fyf[t], v = fxf[t];
      if (K2D) wArr[t] = K2[a * NB + c] * (1 - u) * (1 - v) + K2[(a + 1) * NB + c] * u * (1 - v)
        + K2[a * NB + c + 1] * (1 - u) * v + K2[(a + 1) * NB + c + 1] * u * v;
      else wArr[t] = (hy[a] * (1 - u) + hy[a + 1] * u) * (hx[c] * (1 - v) + hx[c + 1] * v);
      if (SCALE) wArr[t] *= 1 + dSc[mkOf[eqOf[t]]];      // the stretch's Jacobian
    }
  };
  const model = () => { const o = new Float64Array(NEQ);
    for (let t = 0; t < nTerm; t++) o[eqOf[t]] += S[sIdx[t]] * wArr[t]; return o; };
  const rmsNow = clamp => {
    const o = new Float64Array(NEQ);
    for (let t = 0; t < nTerm; t++) {
      const s = clamp ? Math.max(0, Math.min(255, S[sIdx[t]])) : S[sIdx[t]];
      o[eqOf[t]] += s * wArr[t];
    }
    let q = 0; for (let e = 0; e < NEQ; e++) q += (o[e] - rhs[e]) ** 2;
    return Math.sqrt(q / NEQ);
  };
  const dot = (a, c) => { let s = 0; for (let j = 0; j < a.length; j++) s += a[j] * c[j]; return s; };
  const cgNormal = (applyN, rhsN, x0, iters) => {
    const n = x0.length, x = Float64Array.from(x0);
    const r = new Float64Array(n), Ax = applyN(x);
    for (let j = 0; j < n; j++) r[j] = rhsN[j] - Ax[j];
    let p = Float64Array.from(r), rs = dot(r, r);
    for (let it = 0; it < iters && rs > 1e-14; it++) {
      const Ap = applyN(p);
      const pAp = dot(p, Ap);
      if (pAp <= 0) break;
      const al = rs / pAp;
      for (let j = 0; j < n; j++) { x[j] += al * p[j]; r[j] -= al * Ap[j]; }
      const rs2 = dot(r, r);
      for (let j = 0; j < n; j++) p[j] = r[j] + (rs2 / rs) * p[j];
      rs = rs2;
    }
    return x;
  };

  // The cost of shifting ONE marker's sampling by d source px, over the window
  // rows [yLo, yHi) only. The row bounds are what make --phase-halves possible:
  // a per-marker CONSTANT offset (a pen that moved) fits both halves of a window
  // at the same d, while a ROW-DEPENDENT mapping error (a resampler whose row
  // mapping drifts with y) does not — the halves then want different d, by the
  // ramp's advance across the window. Everything else about the two mechanisms
  // is identical at line resolution, so this is the only cheap discriminator.
  const markerCost = (m, d, yLo, yHi, axis) => {
    let s = 0;
    const e0 = m * TH * TW + yLo * TW, e1 = m * TH * TW + yHi * TW;
    const dy = axis === 'y' ? d : dY[m], dx = axis === 'x' ? d : dX[m];
    const ds = axis === 'sc' ? d : (SCALE ? dSc[m] : 0);
    const jac = 1 + ds;
    const shx = dx / BW;
    for (let e = e0; e < e1; e++) {
      let a = 0;
      for (let t = eqStart[e]; t < eqStart[e + 1]; t++) {
        const uy = tyu[t] + (dy + ds * ryu[t]) / BW, ux = txu[t] + shx;
        let p = Math.floor(uy); if (p < 0) p = 0; else if (p > NB - 2) p = NB - 2;
        let q = Math.floor(ux); if (q < 0) q = 0; else if (q > NB - 2) q = NB - 2;
        const u = Math.max(0, Math.min(1, uy - p)), v = Math.max(0, Math.min(1, ux - q));
        a += S[sIdx[t]] * jac * (K2D
          ? K2[p * NB + q] * (1 - u) * (1 - v) + K2[(p + 1) * NB + q] * u * (1 - v)
            + K2[p * NB + q + 1] * (1 - u) * v + K2[(p + 1) * NB + q + 1] * u * v
          : (hy[p] * (1 - u) + hy[p + 1] * u) * (hx[q] * (1 - v) + hx[q + 1] * v));
      }
      s += (a - rhs[e]) ** 2;
    }
    return s;
  };
  // Offsets are searched over ±0.8 source px; a SCALE lives on a different scale
  // entirely (±5% covers ten times any plausible mechanism), so the span and the
  // refinement floor are per-axis or the search would never resolve it.
  const bestOffset = (m, seed, yLo, yHi, axis) => {
    const SC = axis === 'sc';
    const span = SC ? 0.05 : 0.8, step0 = SC ? 0.0025 : 0.05, fine = SC ? 2e-5 : 4e-4;
    let bd = Infinity, bv = seed;
    for (let d = -span; d <= span + 1e-9; d += step0) { const c = markerCost(m, d, yLo, yHi, axis); if (c < bd) { bd = c; bv = d; } }
    for (let step = step0 / 2; step > fine; step /= 2)
      for (const d of [bv - step, bv + step]) { const c = markerCost(m, d, yLo, yHi, axis); if (c < bd) { bd = c; bv = d; } }
    return bv;
  };

  // ---- ALS ------------------------------------------------------------------
  refreshW();
  console.log(`\nFREE SOURCE + FREE ${K2D ? 'NON-SEPARABLE 2D' : 'SEPARABLE'} KERNEL ` +
    `(${NU} source px = ${NR}x${NC} + ${K2D ? NB * NB : 2 * NB} kernel taps, ${NEQ} equations, ` +
    `nodes every ${BW} src px, pitch ${P42}, fy ${b.fy}` +
    (RY > 1 ? `, SOURCE LATTICE ${RY}x FINER IN Y` : '') +
    (PIN ? `, PHASES PINNED to the sawtooth frac(k·${PINPHI}) — 2 free parameters, not ${used.length}` : '') + `):`);
  if (RY > 1) {
    // Identifiability, printed rather than assumed — the y direction is what
    // this row rests on and it must stay overdetermined at every refinement.
    const ySamples = used.length * TH;
    console.log(`  --fine-y ${RY}: ${NR} folded source rows against ${ySamples} y-samples per column ` +
      `(${TH} output rows x ${used.length} distinct phases) = ${(ySamples / NR).toFixed(1)}x overdetermined in y.`);
    console.log(`    total ${NU} unknowns against ${NEQ} equations (ratio ${(NU / NEQ).toFixed(2)}); ` +
      `x is NOT refined and cannot be — one phase, 12 columns.`);
    if (NU > NEQ) console.log(`    WARNING: more unknowns than equations. The RMS can fall trivially; this row is unreadable.`);
  }
  console.log(`  start (cour.ttf through ${KX}/${KY}): RMS ${rmsNow(false).toFixed(3)} bytes`);
  for (let it = 0; it < ALS; it++) {
    // --- S step: kernel held ---
    {
      const applyN = v => {
        const o = new Float64Array(NEQ);
        for (let t = 0; t < nTerm; t++) o[eqOf[t]] += v[sIdx[t]] * wArr[t];
        const g = new Float64Array(NU);
        for (let t = 0; t < nTerm; t++) g[sIdx[t]] += o[eqOf[t]] * wArr[t];
        return g;
      };
      const rhsN = new Float64Array(NU);
      for (let t = 0; t < nTerm; t++) rhsN[sIdx[t]] += rhs[eqOf[t]] * wArr[t];
      const sol = cgNormal(applyN, rhsN, S, CGS);
      S.set(sol);
    }
    // --- K step: source held ---
    if (K2D) {
      const NK = NB * NB;
      const spread4 = (t, out, val) => {
        const a = byi[t], c = bxi[t], u = fyf[t], v = fxf[t];
        out[a * NB + c] += val * (1 - u) * (1 - v); out[(a + 1) * NB + c] += val * u * (1 - v);
        out[a * NB + c + 1] += val * (1 - u) * v; out[(a + 1) * NB + c + 1] += val * u * v;
      };
      const applyN = kv => {
        const o = new Float64Array(NEQ);
        for (let t = 0; t < nTerm; t++) {
          const a = byi[t], c = bxi[t], u = fyf[t], v = fxf[t];
          o[eqOf[t]] += S[sIdx[t]] * (kv[a * NB + c] * (1 - u) * (1 - v) + kv[(a + 1) * NB + c] * u * (1 - v)
            + kv[a * NB + c + 1] * (1 - u) * v + kv[(a + 1) * NB + c + 1] * u * v);
        }
        const g = new Float64Array(NK);
        for (let t = 0; t < nTerm; t++) spread4(t, g, S[sIdx[t]] * o[eqOf[t]]);
        for (let a = 0; a < NB; a++) for (let c = 0; c < NB; c++) {
          const j = a * NB + c;
          let L = 0;
          if (a > 0 && a < NB - 1) L += 2 * kv[j] - kv[j - NB] - kv[j + NB];
          if (c > 0 && c < NB - 1) L += 2 * kv[j] - kv[j - 1] - kv[j + 1];
          g[j] += lam * L;
        }
        return g;
      };
      const rhsN = new Float64Array(NK);
      for (let t = 0; t < nTerm; t++) spread4(t, rhsN, S[sIdx[t]] * rhs[eqOf[t]]);
      K2 = cgNormal(applyN, rhsN, K2, CGK);
    } else {
      // hy with hx held, then hx with hy held — each a 41-unknown normal system.
      // The design row must be accumulated PER EQUATION (an equation sums ~100
      // source pixels before it is compared), not per term.
      for (const axis of ['y', 'x']) {
        const M = Array.from({ length: NB }, () => new Float64Array(NB + 1));
        const row = new Float64Array(NB);
        for (let e = 0; e < NEQ; e++) {
          row.fill(0);
          for (let t = eqStart[e]; t < eqStart[e + 1]; t++) {
            const a = byi[t], c = bxi[t], u = fyf[t], v = fxf[t];
            const other = axis === 'y' ? (hx[c] * (1 - v) + hx[c + 1] * v)
              : (hy[a] * (1 - u) + hy[a + 1] * u);
            const g = S[sIdx[t]] * other;
            const n0 = axis === 'y' ? a : c, w0 = axis === 'y' ? 1 - u : 1 - v;
            row[n0] += g * w0; row[n0 + 1] += g * (1 - w0);
          }
          for (let p = 0; p < NB; p++) {
            if (!row[p]) continue;
            for (let q = 0; q < NB; q++) if (row[q]) M[p][q] += row[p] * row[q];
            M[p][NB] += row[p] * rhs[e];
          }
        }
        for (let p = 0; p < NB; p++) {
          const add = (q, v2) => { if (q >= 0 && q < NB) M[p][q] += v2; };
          add(p, 2 * lam); add(p - 1, -lam); add(p + 1, -lam);
        }
        for (let c0 = 0; c0 < NB; c0++) {
          let piv = c0;
          for (let r2 = c0 + 1; r2 < NB; r2++) if (Math.abs(M[r2][c0]) > Math.abs(M[piv][c0])) piv = r2;
          [M[c0], M[piv]] = [M[piv], M[c0]];
          const d = M[c0][c0] || 1e-12;
          for (let r2 = c0 + 1; r2 < NB; r2++) {
            const f = M[r2][c0] / d;
            if (!f) continue;
            for (let q = c0; q <= NB; q++) M[r2][q] -= f * M[c0][q];
          }
        }
        const out = new Float64Array(NB);
        for (let r2 = NB - 1; r2 >= 0; r2--) {
          let s = M[r2][NB];
          for (let q = r2 + 1; q < NB; q++) s -= M[r2][q] * out[q];
          out[r2] = s / (M[r2][r2] || 1e-12);
        }
        if (axis === 'y') hy = out; else hx = out;
      }
    }
    // --- phase step: source and kernel held, each marker's offset free ---
    if (PHASE || PHASEX || SCALE) {
      if (PHASE) for (let m = 0; m < used.length; m++) dY[m] = bestOffset(m, dY[m], 0, TH, 'y');
      // ---- --pin-phase: SPEND NO PHASE FIDELITY TO BUY RMS --------------------
      // At a fine source lattice the spacing approaches the scale of the phase
      // walk itself, so a shared source gains the freedom to encode phase-LIKE
      // structure — ridges in S that mimic per-line displacement when sampled at
      // different φ_k. The solver can then move the offsets off the true sawtooth
      // and let the source absorb the difference: a degeneracy between the phase
      // block and the source, which buys RMS while degrading the very statistic
      // that certifies the phases.
      //
      // That is testable for free. The phases are KNOWN to be one wrapped
      // sawtooth to 0.0212 src px at 1x, so PROJECT the 57 free offsets onto it
      // after every phase step: rate held at the certified value, amplitude and
      // origin fitted (2 parameters, not 57). If a fine lattice's RMS gain is
      // real structure it survives; if it was the degeneracy it collapses.
      if (PIN && PHASE) {
        let bc = 0, bA = 0, bs = Infinity;
        for (let ci = 0; ci < 400; ci++) {
          const c = ci / 400;
          let sxx = 0, sxy = 0, sx = 0, sy = 0;
          const w = used.map(i => { const u = PINPHI * i.k + c; return u - Math.floor(u) - 0.5; });
          for (let m = 0; m < used.length; m++) { sx += w[m]; sy += dY[m]; sxx += w[m] * w[m]; sxy += w[m] * dY[m]; }
          const n2 = used.length, den = n2 * sxx - sx * sx;
          if (!den) continue;
          const A = (n2 * sxy - sx * sy) / den, ic = (sy - A * sx) / n2;
          let r = 0; for (let m = 0; m < used.length; m++) r += (dY[m] - ic - A * w[m]) ** 2;
          if (r < bs) { bs = r; bA = A; bc = c; }
        }
        for (let m = 0; m < used.length; m++) {
          const u = PINPHI * used[m].k + bc;
          dY[m] = bA * (u - Math.floor(u) - 0.5);
        }
        pinInfo = { A: bA, c: bc, resid: Math.sqrt(bs / used.length) };
      }
      if (PHASEX) for (let m = 0; m < used.length; m++) dX[m] = bestOffset(m, dX[m], 0, TH, 'x');
      if (SCALE) for (let m = 0; m < used.length; m++) dSc[m] = bestOffset(m, dSc[m], 0, TH, 'sc');
      // The global shift on either axis is S's job, not the phase block's — and
      // a global SCALE is em64y's, so that mean comes out too. What is under
      // test is marker-to-marker inconsistency, never the common part.
      for (const v of [PHASE ? dY : null, PHASEX ? dX : null, SCALE ? dSc : null]) {
        if (!v) continue;
        let mu = 0; for (let m = 0; m < used.length; m++) mu += v[m];
        mu /= used.length;
        for (let m = 0; m < used.length; m++) v[m] -= mu;
      }
      setNodes();
    }
    refreshW();
    const sdOf = v => Math.sqrt(v.reduce((s, q) => s + q * q, 0) / v.length).toFixed(3);
    console.log(`  ALS ${String(it + 1).padStart(2)}: RMS ${rmsNow(false).toFixed(3)} free, ` +
      `${rmsNow(true).toFixed(3)} with the source clamped to [0,255]` +
      (PHASE ? `,  phase sd ${sdOf(dY)} src px` : '') +
      (PHASEX ? `,  x-phase sd ${sdOf(dX)} src px` : '') +
      (SCALE ? `,  y-scale sd ${(100 * +sdOf(dSc)).toFixed(3)}%` : ''));
  }

  // ---- report ---------------------------------------------------------------
  let tot = 0, nExact = 0;
  {
    const o = new Float64Array(NEQ);
    for (let t = 0; t < nTerm; t++) o[eqOf[t]] += Math.max(0, Math.min(255, S[sIdx[t]])) * wArr[t];
    for (let e = 0, m = 0; m < used.length; m++) {
      let bad = false;
      for (let q = 0; q < TW * TH; q++, e++) {
        let v = roundBy(o[e]); v = v < 0 ? 0 : v > 255 ? 255 : v;
        const d = Math.abs(v - rhs[e]); tot += d; if (d) bad = true;
      }
      if (!bad) nExact++;
    }
  }
  console.log(`  Σ|Δ| ${tot} = ${(tot / used.length).toFixed(1)} per glyph, ` +
    `${(tot / inkBytes).toFixed(2)} per ink byte;  ${nExact} of ${used.length} byte-exact`);
  // --resid-out: the per-equation residual, so two runs can be compared cell by
  // cell. Quadrature subtraction (pin cost = sqrt(pinned² − free²)) assumes the
  // pin-induced delta is ORTHOGONAL to the residual it is being subtracted from;
  // both are per-marker and interior, so that is an assumption, not a fact. Dump
  // both runs and correlate the delta against the free residual to certify it.
  if (opt('resid-out', '')) {
    const o = new Float64Array(NEQ);
    for (let t = 0; t < nTerm; t++) o[eqOf[t]] += S[sIdx[t]] * wArr[t];
    const r = new Float64Array(NEQ);
    for (let e = 0; e < NEQ; e++) r[e] = o[e] - rhs[e];
    require('node:fs').writeFileSync(resolve(REPO, opt('resid-out', '')), Buffer.from(r.buffer));
    console.log(`  residuals written to ${opt('resid-out', '')} (${NEQ} float64)`);
  }
  // --model-out / --k-out: the fitted MODEL images, and the marker LINE INDICES.
  // The k list is not cosmetic. Every phase analysis in this family keys on
  // frac(k·θ), and until this flag existed there was no way to read k out of the
  // solve at all — so scratch analyses ASSUMED the markers were consecutive from
  // the first one. They are not: a page whose detector drops a row leaves a gap,
  // and a gap silently misassigns the phase of every marker after it, which
  // ATTENUATES a real key rather than fabricating one. Dump k with the residuals
  // or the phase you compute is a different page's.
  if (opt('model-out', '')) {
    const o = new Float64Array(NEQ);
    for (let t = 0; t < nTerm; t++) o[eqOf[t]] += S[sIdx[t]] * wArr[t];
    require('node:fs').writeFileSync(resolve(REPO, opt('model-out', '')), Buffer.from(o.buffer));
    console.log(`  model images written to ${opt('model-out', '')} (${NEQ} float64, ${used.length}x${TH}x${TW})`);
  }
  if (opt('k-out', '')) {
    const ka = Int32Array.from(used.map(i => i.k));
    require('node:fs').writeFileSync(resolve(REPO, opt('k-out', '')), Buffer.from(ka.buffer));
    const gaps = [];
    for (let m = 1; m < ka.length; m++) if (ka[m] !== ka[m - 1] + 1) gaps.push(`${ka[m - 1]}->${ka[m]}`);
    console.log(`  marker k written to ${opt('k-out', '')} (${ka.length} int32, k = ${ka[0]}..${ka[ka.length - 1]}` +
      `, ${gaps.length ? `${gaps.length} GAP(S): ${gaps.join(' ')}` : 'consecutive, no gaps'})`);
  }
  if (pinInfo) console.log(`  PHASES PINNED: amplitude ${pinInfo.A.toFixed(4)} src px, origin ${pinInfo.c.toFixed(4)}, ` +
    `and the free offsets departed from that sawtooth by ${pinInfo.resid.toFixed(4)} src px before projection ` +
    `(the 1x certified departure is 0.0212 — a larger one here is the source buying RMS with phase fidelity).`);
  if (!K2D) {
    const m = h => { let s = 0, m1 = 0, m2 = 0;
      for (let q = 0; q < NB; q++) { const t = B0 + q * BW; s += h[q]; m1 += h[q] * t; m2 += h[q] * t * t; }
      return `Σ ${s.toFixed(3)} centroid ${(m1 / s).toFixed(3)} sd ${Math.sqrt(m2 / s - (m1 / s) ** 2).toFixed(3)}`; };
    // sd is scale-free, so it stays comparable across refinements; Σ is not —
    // each fine row carries 1/RY of the mass, so Σ must land near 1/(BW·RY).
    console.log(`  y kernel: ${m(hy)}   (tent ${KY} would be sd ${(ky.w / Math.sqrt(6)).toFixed(3)}` +
      (RY > 1 ? `; Σ must be ~${(1 / (BW * RY)).toFixed(3)} at --fine-y ${RY}, and sd is scale-free` : '') + `)`);
    console.log(`  x kernel: ${m(hx)}   (tent ${KX} would be sd ${(kx.w / Math.sqrt(6)).toFixed(3)})`);
  }
  let sum = 0, mx = 0;
  for (let j = 0; j < NU; j++) { const d = Math.max(0, Math.min(255, S[j])) - S0[j];
    sum += Math.abs(d); if (Math.abs(d) > Math.abs(mx)) mx = d; }
  console.log(`  free raster vs cour.ttf: mean |Δ| ${(sum / NU).toFixed(2)}, worst ${mx.toFixed(1)} bytes`);
  console.log(`  READ THIS AGAINST --synth, NOT AGAINST ZERO: the same solve on a control with a` +
    `\n  perfect shared raster floors near 0.13 bytes RMS, and near 3.6 once a 0.27 src px pen` +
    `\n  scatter is injected. Only a real run ABOVE the jittered control is structural.`);

  // ---- WHERE the joint residual lives ---------------------------------------
  // The solve reports one number; a missing TERM and an instrument floor look
  // identical in it and completely different here. Two views, both on the FREE
  // source (clamping adds a residual of its own that is not under test):
  //   per-CELL   — feature-localized (apex, stroke tips) says the model is wrong
  //                about the outline or about how a phase shift acts on it;
  //                flat-across-the-window says it is noise.
  //   per-MARKER — a residual carried by a handful of lines is a different fact
  //                from one spread evenly over all 57, and only this separates
  //                them.
  if (flag('joint-dump')) {
    const o = new Float64Array(NEQ);
    for (let t = 0; t < nTerm; t++) o[eqOf[t]] += S[sIdx[t]] * wArr[t];
    const sg = new Float64Array(TW * TH), ab = new Float64Array(TW * TH);
    const per = [];
    for (let m = 0; m < used.length; m++) {
      let q = 0;
      for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) {
        const e = m * TH * TW + Y * TW + X, r = o[e] - rhs[e];
        sg[Y * TW + X] += r; ab[Y * TW + X] += Math.abs(r); q += r * r;
      }
      per.push(Math.sqrt(q / (TW * TH)));
    }
    const n = used.length;
    console.log(`\n  RESIDUAL BY WINDOW CELL (free source; mean signed over ${n} markers, then mean |r|):`);
    for (let Y = 0; Y < TH; Y++)
      console.log(`    ${String(Y).padStart(2)} ` +
        Array.from({ length: TW }, (_, X) => (sg[Y * TW + X] / n).toFixed(1).padStart(6)).join(''));
    console.log(`  mean |r|:`);
    for (let Y = 0; Y < TH; Y++)
      console.log(`    ${String(Y).padStart(2)} ` +
        Array.from({ length: TW }, (_, X) => (ab[Y * TW + X] / n).toFixed(1).padStart(6)).join(''));
    const srt = [...per].sort((a, c) => a - c);
    console.log(`  RMS per marker: min ${srt[0].toFixed(2)}  q1 ${srt[n >> 2].toFixed(2)}  ` +
      `median ${srt[n >> 1].toFixed(2)}  q3 ${srt[(3 * n) >> 2].toFixed(2)}  max ${srt[n - 1].toFixed(2)}`);
    console.log(`    by marker: ${per.map(v => v.toFixed(1)).join(' ')}`);
    // ---- DOES THE RESIDUAL'S AMPLITUDE MODULATE ALONG ψ? ---------------------
    // The second half of the y-twin row, and it costs nothing because the 57 maps
    // are already here. Any mechanism keyed to the pen's grid residue must put
    // MORE deformation at some residues than others — an interpolated shift, for
    // instance, deforms by δ(1−δ)(1−2δ)g³ and so is quietest at δ = 0, ½ and 1.
    // So regress each marker's residual RMS on ψ_k. The null is ψ PERMUTED, for
    // the same reason it is everywhere else here: five basis functions over 57
    // markers explain 5/57 = 8.8% of anything at all.
    {
      const DPHI = +opt('dump-phi', '0.206929');
      const ps = used.map(i => { const u = DPHI * i.k; return u - Math.floor(u); });
      const bas = p => [1, Math.cos(2 * Math.PI * p), Math.sin(2 * Math.PI * p),
        Math.cos(4 * Math.PI * p), Math.sin(4 * Math.PI * p)];
      const fitR2 = pv => {
        const D = pv.map(bas), A = [], bb = new Float64Array(5);
        for (let a = 0; a < 5; a++) A.push(new Float64Array(5));
        for (let j = 0; j < per.length; j++) for (let a = 0; a < 5; a++) {
          bb[a] += D[j][a] * per[j];
          for (let c = 0; c < 5; c++) A[a][c] += D[j][a] * D[j][c];
        }
        for (let a = 0; a < 5; a++) {
          let pv2 = a;
          for (let r = a + 1; r < 5; r++) if (Math.abs(A[r][a]) > Math.abs(A[pv2][a])) pv2 = r;
          [A[a], A[pv2]] = [A[pv2], A[a]]; const t = bb[a]; bb[a] = bb[pv2]; bb[pv2] = t;
          if (!A[a][a]) continue;
          for (let r = a + 1; r < 5; r++) {
            const f = A[r][a] / A[a][a];
            for (let c = a; c < 5; c++) A[r][c] -= f * A[a][c];
            bb[r] -= f * bb[a];
          }
        }
        const co = new Float64Array(5);
        for (let a = 4; a >= 0; a--) {
          let s = bb[a];
          for (let c = a + 1; c < 5; c++) s -= A[a][c] * co[c];
          co[a] = A[a][a] ? s / A[a][a] : 0;
        }
        const mu = per.reduce((s, v) => s + v, 0) / per.length;
        let ss = 0, tt = 0;
        for (let j = 0; j < per.length; j++) {
          let f = 0; for (let a = 0; a < 5; a++) f += co[a] * D[j][a];
          ss += (per[j] - f) ** 2; tt += (per[j] - mu) ** 2;
        }
        return tt ? 1 - ss / tt : 0;
      };
      let sd2 = 20260805 >>> 0;
      const rr = () => { sd2 = (sd2 * 1103515245 + 12345) >>> 0; return sd2 / 4294967296; };
      const obs = fitR2(ps), nl = [];
      for (let p = 0; p < 200; p++) {
        const sh = ps.slice();
        for (let a = sh.length - 1; a > 0; a--) { const t = Math.floor(rr() * (a + 1)); [sh[a], sh[t]] = [sh[t], sh[a]]; }
        nl.push(fitR2(sh));
      }
      nl.sort((a, c) => a - c);
      console.log(`  AMPLITUDE vs ψ = frac(k·${DPHI}): R² ${(100 * obs).toFixed(1)}% against a permuted-ψ null of ` +
        `median ${(100 * nl[100]).toFixed(1)}% / 95th ${(100 * nl[190]).toFixed(1)}% / max ${(100 * nl[199]).toFixed(1)}%` +
        `   ${obs > nl[190] ? '<-- the residual is LOUDER at some grid residues than others'
          : '— flat in ψ: the residual does not know where the pen sits on its grid'}`);
    }
    // ---- THE ENERGY SPLIT, and it decides a whole class before any generator -
    // Decompose r_{m,c} into the marker-MEAN map r̄_c and what varies about it.
    // The two hypotheses for a marker-to-marker residual predict opposite
    // splits, and nothing needs to be built to ask:
    //   a SHARED systematic (a wrong outline, a wrong filter, anything that is
    //     the same on every line) puts its energy in the MEAN map — same sign,
    //     same place, every marker;
    //   a PHASE-DETERMINISTIC perturbation (outline-point quantisation, any
    //     rounding keyed to the sub-pixel position) cannot: the 57 phases are
    //     equidistributed over the unit interval, so its sign at a given cell
    //     varies from marker to marker and it CANCELS in the mean.
    // Mean-map energy is n·Σ_c r̄_c²; the rest is the varying part. The mean
    // pairwise correlation between two markers' maps is the same statistic seen
    // from the other side, so both are printed.
    {
      let eMean = 0, eTot = 0;
      for (let c = 0; c < TW * TH; c++) eMean += (sg[c] / n) ** 2;
      eMean *= n;
      for (let t = 0; t < NEQ; t++) eTot += (o[t] - rhs[t]) ** 2;
      const fMean = eMean / eTot;
      console.log(`  ENERGY SPLIT: ${(100 * fMean).toFixed(1)}% of the residual energy is in the ` +
        `marker-MEAN map, ${(100 * (1 - fMean)).toFixed(1)}% varies from marker to marker`);
      console.log(`    (mean pairwise correlation between two markers' maps ≈ ` +
        `${((fMean * n - 1) / (n - 1)).toFixed(3)})`);
      console.log(`    A shared systematic lives in the MEAN; anything keyed to the sub-pixel PHASE`);
      console.log(`    cannot, because the 57 phases are equidistributed and its sign cancels.`);
      // ---- WHERE the varying part lives, by window ROW -----------------------
      // The window is TH output rows against a pitch of ~14.34, so it is TALLER
      // THAN THE LINE PITCH and the neighbouring lines' glyphs are geometrically
      // nearby. The model renders ONE glyph on blank surround, so if real
      // neighbour ink reached the window it would be unmodelled — and it would
      // be marker-varying (through the neighbours' own phases), pairwise
      // uncorrelated, and invisible to every block here. That hypothesis makes a
      // sharp prediction the row profile tests outright: the energy would sit on
      // the TOP AND BOTTOM rows. A defect of the glyph itself sits in the
      // INTERIOR. Printed beside the target's own ink census, which says whether
      // any neighbour ink is present at all.
      const rowVar = new Float64Array(TH), rowInk = new Int32Array(TH);
      const rowMin = new Uint8Array(TH).fill(255);
      for (let m = 0; m < n; m++)
        for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) {
          const e = m * TH * TW + Y * TW + X;
          rowVar[Y] += ((o[e] - rhs[e]) - sg[Y * TW + X] / n) ** 2;
          const t = used[m].target[Y * TW + X];
          if (t !== 255) rowInk[Y]++;
          if (t < rowMin[Y]) rowMin[Y] = t;
        }
      let vTot = 0; for (let Y = 0; Y < TH; Y++) vTot += rowVar[Y];
      console.log(`  MARKER-VARYING ENERGY BY WINDOW ROW, beside the target's own ink census:`);
      console.log(`    row   % of varying energy   target bytes < 255 (of ${n * TW})   darkest byte`);
      for (let Y = 0; Y < TH; Y++)
        console.log(`    ${String(Y).padStart(3)} ${(100 * rowVar[Y] / vTot).toFixed(1).padStart(15)}% ` +
          `${String(rowInk[Y]).padStart(20)} ${String(rowMin[Y]).padStart(14)}`);
      console.log(`    EDGE rows (0-2, ${TH - 3}-${TH - 1}) carry ` +
        `${(100 * (rowVar[0] + rowVar[1] + rowVar[2] + rowVar[TH - 3] + rowVar[TH - 2] + rowVar[TH - 1]) / vTot).toFixed(1)}% ` +
        `of the varying energy.  A neighbouring line's ink would put it THERE; a defect of the glyph puts it INSIDE.`);
      // ---- IS THE VARYING PART A SMOOTH FUNCTION OF THE PHASE? --------------
      // The phase BUDGET (sqrt(scan² − floor²) = 0.0154 src px) prices only
      // mechanisms that move the fitted CENTROID. One that is a function of φ but
      // centroid-neutral — symmetric about the glyph middle, or living in a
      // higher moment — spends none of it and is not bounded by that argument at
      // all. Two members of that family are closed (scale, and commutation) but
      // not the family, so ask the question directly and without a mechanism:
      // regress the 57 markers' residuals, cell by cell, on a smooth basis in φ
      // and see how much of the varying energy is explained.
      //
      // This is the PCA question with the arbitrariness removed — instead of
      // extracting components and testing each one's coefficients for
      // smoothness, project every cell's marker-series onto the harmonic basis
      // at once. The null is not zero: 5 basis functions over 57 markers explain
      // 5/57 = 8.8% of anything, so the control is φ PERMUTED, which destroys
      // the pairing while keeping every other property of the data.
      // ---- IS THE PER-LINE INPUT ON A LATTICE? -----------------------------
      // If something upstream of the downscale works on a fixed block lattice of
      // the SOURCE page — a compression pass at 300 dpi is the obvious one — then
      // its error at a marker depends on where that marker's line falls against
      // the blocks. At a source pitch of 42 and a block of B, line k's block
      // phase is (42·k) mod B, which is PERIODIC IN k: for B = 8 the period is 4,
      // since 42·4 = 168 = 21·8 realigns exactly. Markers sharing a block phase
      // should then carry CORRELATED residual maps where all other pairs do not.
      //
      // Nothing else on the table predicts structure in Δk at all, so this is a
      // free and sharp test: group the 1596 pairwise correlations by Δk mod M and
      // look for one residue class standing above the others. The null is the
      // same statistic with the k labels PERMUTED across maps, which destroys the
      // pairing and keeps the maps and their mutual correlations exactly as they
      // are. M is scanned 2..8, because a lattice process need not be JPEG's 8.
      {
        // Remove the marker-MEAN map AND any component LINEAR IN k before
        // correlating, and this is not cosmetic — it is what makes the statistic
        // readable at all. A residual carrying a linear-in-k term r_k ≈ (k−k̄)·v
        // gives <r_a,r_c> ∝ (k_a−k̄)(k_c−k̄), which is positive for pairs on the
        // same side of the mean and negative for opposite sides: a monotone decay
        // in Δk that has nothing to do with any lattice. The no-defect control
        // shows exactly that (+0.33 at Δk=1 down to −0.14 at Δk=20), so without
        // this projection the test reads its own drift.
        const NC2 = TW * TH, U = [];
        const ksAll = used.map(i => i.k), kbar = mean(ksAll);
        let skk2 = 0; for (let m = 0; m < n; m++) skk2 += (ksAll[m] - kbar) ** 2;
        const raw2 = [];
        for (let m = 0; m < n; m++) {
          const v = new Float64Array(NC2);
          for (let c = 0; c < NC2; c++) v[c] = (o[m * TH * TW + c] - rhs[m * TH * TW + c]) - sg[c] / n;
          raw2.push(v);
        }
        for (let c = 0; c < NC2; c++) {                 // per cell, project out k
          let b2 = 0;
          for (let m = 0; m < n; m++) b2 += (ksAll[m] - kbar) * raw2[m][c];
          b2 /= skk2 || 1;
          for (let m = 0; m < n; m++) raw2[m][c] -= b2 * (ksAll[m] - kbar);
        }
        for (let m = 0; m < n; m++) {
          const v = raw2[m];
          let nn = 0; for (let c = 0; c < NC2; c++) nn += v[c] * v[c];
          nn = Math.sqrt(nn) || 1;
          for (let c = 0; c < NC2; c++) v[c] /= nn;
          U.push(v);
        }
        const CM = [];
        for (let a = 0; a < n; a++) { CM.push(new Float64Array(n));
          for (let c = 0; c < n; c++) { let s = 0; for (let q = 0; q < NC2; q++) s += U[a][q] * U[c][q]; CM[a][c] = s; } }
        const ks2 = used.map(i => i.k);
        const groupMeans = (lab, M) => {
          const sum = new Float64Array(M), cnt = new Int32Array(M);
          for (let a = 0; a < n; a++) for (let c = a + 1; c < n; c++) {
            const r = ((lab[a] - lab[c]) % M + M) % M;
            sum[r] += CM[a][c]; cnt[r]++;
          }
          return Array.from(sum, (s, r) => cnt[r] ? s / cnt[r] : 0);
        };
        let seed3 = 90210 >>> 0;
        const rnd3 = () => { seed3 = (seed3 * 1103515245 + 12345) >>> 0; return seed3 / 4294967296; };
        console.log(`  PER-LINE INPUT ON A LATTICE? pairwise map correlation grouped by Δk mod M`);
        console.log(`    (a source-side block lattice of B px at pitch ${P42} is periodic in k; B=8 gives period 4)`);
        for (let M = 2; M <= 8; M++) {
          const real = groupMeans(ks2, M);
          const nulls = Array.from({ length: M }, () => []);
          for (let t2 = 0; t2 < 200; t2++) {
            const p = [...ks2];
            for (let a = p.length - 1; a > 0; a--) { const j = Math.floor(rnd3() * (a + 1)); [p[a], p[j]] = [p[j], p[a]]; }
            const g = groupMeans(p, M);
            for (let r = 0; r < M; r++) nulls[r].push(g[r]);
          }
          const z = real.map((v, r) => {
            const mu = mean(nulls[r]), s = sd(nulls[r]) || 1e-9;
            return (v - mu) / s;
          });
          console.log(`    M=${M}  means ${real.map(v => v.toFixed(4).padStart(8)).join('')}`);
          console.log(`         z   ${z.map(v => v.toFixed(2).padStart(8)).join('')}` +
            `   ${Math.max(...z.map(Math.abs)) > 3 ? '<-- a residue class stands out' : ''}`);
        }
        // A residue class is a coarse read. The interpretable form is the mean
        // correlation as a function of Δk ITSELF: a source-side lattice of B px
        // at pitch P puts peaks at every Δk that realigns the block phase, so
        // the curve should be periodic. Anything else — a decaying curve, or a
        // flat one — is not a lattice.
        {
          const DMAX = 20;
          const sum = new Float64Array(DMAX + 1), cnt = new Int32Array(DMAX + 1);
          for (let a = 0; a < n; a++) for (let c = a + 1; c < n; c++) {
            const d = Math.abs(ks2[a] - ks2[c]);
            if (d <= DMAX) { sum[d] += CM[a][c]; cnt[d]++; }
          }
          const nullsD = Array.from({ length: DMAX + 1 }, () => []);
          for (let t2 = 0; t2 < 200; t2++) {
            const p = [...ks2];
            for (let a = p.length - 1; a > 0; a--) { const j = Math.floor(rnd3() * (a + 1)); [p[a], p[j]] = [p[j], p[a]]; }
            const s2 = new Float64Array(DMAX + 1), c2 = new Int32Array(DMAX + 1);
            for (let a = 0; a < n; a++) for (let c = a + 1; c < n; c++) {
              const d = Math.abs(p[a] - p[c]);
              if (d <= DMAX) { s2[d] += CM[a][c]; c2[d]++; }
            }
            for (let d = 1; d <= DMAX; d++) nullsD[d].push(c2[d] ? s2[d] / c2[d] : 0);
          }
          console.log(`    mean correlation vs Δk (z against the same permuted-label null):`);
          let line1 = '      Δk ', line2 = '      r  ', line3 = '      z  ';
          for (let d = 1; d <= DMAX; d++) {
            const r = cnt[d] ? sum[d] / cnt[d] : 0;
            const zz = (r - mean(nullsD[d])) / (sd(nullsD[d]) || 1e-9);
            line1 += String(d).padStart(7); line2 += r.toFixed(3).padStart(7); line3 += zz.toFixed(1).padStart(7);
          }
          console.log(line1); console.log(line2); console.log(line3);
        }
      }
      if (PHASE) {
        const NB2 = 5;
        const basis = ph => [1, Math.cos(2 * Math.PI * ph), Math.sin(2 * Math.PI * ph),
          Math.cos(4 * Math.PI * ph), Math.sin(4 * Math.PI * ph)];
        const explained = phs => {
          const D = phs.map(basis);
          // normal equations once (same design for every cell), then accumulate
          const A = Array.from({ length: NB2 }, () => new Float64Array(NB2));
          for (let m = 0; m < n; m++) for (let a = 0; a < NB2; a++)
            for (let c = 0; c < NB2; c++) A[a][c] += D[m][a] * D[m][c];
          for (let a = 0; a < NB2; a++) A[a][a] += 1e-9;
          const chol = A.map(r => Float64Array.from(r));
          for (let a = 0; a < NB2; a++) {            // Cholesky
            for (let c = 0; c < a; c++) { let s = chol[a][c]; for (let q = 0; q < c; q++) s -= chol[a][q] * chol[c][q]; chol[a][c] = s / chol[c][c]; }
            let s = chol[a][a]; for (let q = 0; q < a; q++) s -= chol[a][q] ** 2; chol[a][a] = Math.sqrt(Math.max(s, 1e-12));
          }
          const solve = rv => {
            const y = new Float64Array(NB2), x = new Float64Array(NB2);
            for (let a = 0; a < NB2; a++) { let s = rv[a]; for (let q = 0; q < a; q++) s -= chol[a][q] * y[q]; y[a] = s / chol[a][a]; }
            for (let a = NB2 - 1; a >= 0; a--) { let s = y[a]; for (let q = a + 1; q < NB2; q++) s -= chol[q][a] * x[q]; x[a] = s / chol[a][a]; }
            return x;
          };
          let eExp = 0, eVar = 0;
          for (let c = 0; c < TW * TH; c++) {
            const col = new Float64Array(n), rv = new Float64Array(NB2);
            for (let m = 0; m < n; m++) {
              const e = m * TH * TW + c;
              col[m] = (o[e] - rhs[e]) - sg[c] / n;
              eVar += col[m] * col[m];
            }
            for (let a = 0; a < NB2; a++) for (let m = 0; m < n; m++) rv[a] += D[m][a] * col[m];
            const co2 = solve(rv);
            for (let m = 0; m < n; m++) {
              let f = 0; for (let a = 0; a < NB2; a++) f += co2[a] * D[m][a];
              eExp += f * f;
            }
          }
          return eExp / eVar;
        };
        const phs = Array.from(dY);
        const real = explained(phs);
        let seed2 = 424242 >>> 0;
        const rnd2 = () => { seed2 = (seed2 * 1103515245 + 12345) >>> 0; return seed2 / 4294967296; };
        const nulls = [];
        for (let t2 = 0; t2 < 40; t2++) {
          const p = [...phs];
          for (let a = p.length - 1; a > 0; a--) { const j = Math.floor(rnd2() * (a + 1)); [p[a], p[j]] = [p[j], p[a]]; }
          nulls.push(explained(p));
        }
        nulls.sort((a, c) => a - c);
        console.log(`  IS THE VARYING PART A SMOOTH FUNCTION OF THE PHASE? (2 harmonics of φ, cell by cell)`);
        console.log(`    explained ${(100 * real).toFixed(1)}% of the varying energy;  ` +
          `PERMUTED-φ null: median ${(100 * nulls[20]).toFixed(1)}%, max of 40 ${(100 * nulls[39]).toFixed(1)}%`);
        console.log(`    ${real > nulls[39]
          ? 'ABOVE the null — part of the residual IS keyed to the phase, in a moment no block here has freed.'
          : 'AT the null — the residual is NOT a smooth function of the phase, so the phase-keyed class is closed ' +
            'INCLUDING its centroid-neutral members, and what varies per line is keyed to something else.'}`);
      }
    }
  }

  // ---- what the phases say --------------------------------------------------
  if (PHASE) {
    const n = used.length;
    const sdD = Math.sqrt(dY.reduce((s, v) => s + v * v, 0) / n);
    // A DRIFT proportional to k is a pitch error; SCATTER about that line is not.
    const ks = used.map(i => i.k), mk = mean(ks), md = mean([...dY]);
    let num = 0, den = 0;
    for (let m = 0; m < n; m++) { num += (ks[m] - mk) * (dY[m] - md); den += (ks[m] - mk) ** 2; }
    const slope = num / den;
    const res = dY.map((v, m) => v - (md + slope * (ks[m] - mk)));
    const sdR = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / n);
    console.log(`\n  PER-MARKER PHASE (${n} markers, source px, mean removed):`);
    console.log(`    sd ${sdD.toFixed(3)}, range ${Math.min(...dY).toFixed(3)} .. ${Math.max(...dY).toFixed(3)}`);
    // ---- THE ACCUMULATOR'S AMPLITUDE, FITTED RATHER THAN ASSUMED -------------
    // This has never been measured. The scan fits frac(k·phi), whose range is 1
    // BY CONVENTION, so the amplitude was inherited as "one model source px" —
    // and the model's source px is a fiction (fy is unidentifiable once the
    // source is free). Regress the phases on the sawtooth instead and read the
    // amplitude off the slope, in OUTPUT px, which is resolution-free and is the
    // unit the x grid constant u is already held in.
    //
    // The point of doing it: if a single carry-drop accumulator on ONE grid runs
    // both axes, then u_y = u_x = 0.274220 ± 0.000027 output px, and the row
    // pitch must sit at a carry-drop rung, pitch/u_y = m + 0.207037. That is the
    // strongest producer statement available here, and it is falsifiable.
    {
      const APH = +opt('amp-phi', '0.206929');
      // The sawtooth has a free ORIGIN — the scan fits frac(k·phi + c), and an
      // OLS that assumes c = 0 fits noise (it returns a negative amplitude and
      // 12x the scan's residual). Scan c, take the best fit; that is the same
      // model the pitch scan uses, only with the amplitude freed as well.
      let A = 0, ic = 0, rs = Infinity, seA = 0;
      for (let ci = 0; ci < 1000; ci++) {
        const c = ci / 1000;
        const sw = used.map(i => { const u = APH * i.k + c; return u - Math.floor(u) - 0.5; });
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let j = 0; j < n; j++) { sx += sw[j]; sy += dY[j]; sxx += sw[j] * sw[j]; sxy += sw[j] * dY[j]; }
        const den = n * sxx - sx * sx;
        if (!den) continue;
        const a = (n * sxy - sx * sy) / den, b0 = (sy - a * sx) / n;
        let r = 0; for (let j = 0; j < n; j++) r += (dY[j] - b0 - a * sw[j]) ** 2;
        if (r < rs) { rs = r; A = a; ic = b0; seA = Math.sqrt(r / (n - 2) / (sxx - sx * sx / n)); }
      }
      const Aout = A / b.fy, seOut = seA / b.fy;
      console.log(`    AMPLITUDE, FITTED FREE (not the frac() convention's 1): ${A.toFixed(4)} ± ${seA.toFixed(4)} model-src px` +
        ` = ${Aout.toFixed(5)} ± ${seOut.toFixed(5)} OUTPUT px  (residual sd ${Math.sqrt(rs / n).toFixed(4)} src px)`);
      const UX = 0.274220;
      console.log(`      against the x layout grid u = ${UX} output px: ratio ${(Aout / UX).toFixed(4)}, ` +
        `${Math.abs(Aout - UX) / seOut > 3 ? `${(Math.abs(Aout - UX) / seOut).toFixed(1)}σ APART — NOT one grid for both axes`
          : 'consistent — ONE GRID FOR BOTH AXES'}`);
      // The carry-drop law has TWO branches — the dropped carry can advance by
      // frac(pitch/u_y) or by 1 − that — so the admissible grids are
      // u_y = pitch/(m + phi) AND pitch/(m + 1 − phi). Scoring only one branch
      // hides half the rungs, and it is the other branch that this page lands on.
      const rung = 14.33868 / Aout;
      console.log(`      carry-drop rung: pitch/u_y = 14.33868/${Aout.toFixed(5)} = ${rung.toFixed(3)}` +
        `  (the law needs frac = ${APH.toFixed(6)} or ${(1 - APH).toFixed(6)}; this is ${(rung - Math.floor(rung)).toFixed(3)})`);
      const cands = [];
      for (const [tag, fr] of [['φ', APH], ['1−φ', 1 - APH]])
        for (const m of [Math.floor(rung) - 1, Math.floor(rung), Math.floor(rung) + 1]) {
          const uy = 14.33868 / (m + fr);
          cands.push({ tag, m, uy, s: Math.abs(uy - Aout) / seOut });
        }
      cands.sort((a, c) => a.s - c.s);
      console.log(`      nearest rungs, BOTH branches: ` + cands.slice(0, 4).map(c =>
        `${c.tag}+${c.m} -> ${c.uy.toFixed(6)} (${c.s.toFixed(2)}σ)`).join('   '));
      const w = cands[0], rungGap = Math.abs(cands[1].uy - w.uy) / seOut;
      console.log(`      BEST: u_y = ${w.uy.toFixed(6)} output px at m = ${w.m}, ${w.tag} branch, ${w.s.toFixed(2)}σ.` +
        `  Neighbouring rungs are ${rungGap.toFixed(1)}σ away, and there are 2 branches, so a random`);
      console.log(`      amplitude lands this close to SOME rung about ${(100 * 2 * Math.max(w.s, 0.02) / rungGap).toFixed(0)}% of the time —` +
        ` suggestive, not decisive. Quote it with that caveat.`);
    }
    console.log(`    drift vs row index: ${slope.toFixed(5)} src px per row  ` +
      `(= a source pitch of ${(P42 + slope).toFixed(4)}, i.e. an output pitch of ` +
      `${((P42 + slope) / b.fy).toFixed(5)});  scatter about that line sd ${sdR.toFixed(3)}`);
    // Uniform over one source px is what a NON-INTEGER pitch gives (sd 0.289);
    // a ¼-px pen lattice gives a 4-point comb. Both are testable here.
    const q4 = Math.sqrt(dY.reduce((s, v) => { const r = v - Math.round(v * 4) / 4; return s + r * r; }, 0) / n);
    console.log(`    distance to the nearest ¼-src-px lattice: rms ${q4.toFixed(3)} ` +
      `(a ¼-px pen lattice would give ~0; uniform phases give 0.072)`);
    // ---- IS THERE A LATTICE OF *ANY* SPACING? ---------------------------------
    // The ¼-px line above tests ONE spacing, chosen because it is the control
    // family's own pen lattice. mupdf's glyph cache quantises y to a whole DEVICE
    // pixel for upright text at any size >= 8 (fz_subpixel_adjust: b == c == 0 puts
    // the vertical axis on qmin, and qmin = 0 above size 8), so the spacing it
    // predicts in SOURCE px depends on the render resolution, which is not known.
    // It is bounded anyway, and the bound needs no resolution at all:
    //
    //   cache branch requires  size <= MAX_GLYPH_SIZE = 256 device px
    //   y quantum             = 1 device px
    //   size                  = em measured in device px
    //   => quantum >= em/256, in whatever units em is measured.
    //
    // Raising the resolution to make the device pixel fine also drives `size`
    // through the 256 ceiling, at which point fz_render_glyph returns NULL for an
    // FT font and the glyph is filled as a PATH with no quantisation whatsoever.
    // So the cache branch cannot put the phases on a lattice finer than em/256
    // source px however the page was rendered, and a scan over every spacing at or
    // above that bound tests the whole branch in one pass.
    {
      const qMin = (b.em / 64) / 256;              // src px — resolution-free bound
      const at = a => {                            // rms distance to the best-offset lattice of spacing a
        let sc = 0, ss = 0;
        for (let m = 0; m < n; m++) { const t = 2 * Math.PI * dY[m] / a; sc += Math.cos(t); ss += Math.sin(t); }
        const c = Math.atan2(ss, sc) / (2 * Math.PI);
        let s = 0;
        for (let m = 0; m < n; m++) { const u = dY[m] / a - c; const r = (u - Math.round(u)) * a; s += r * r; }
        return Math.sqrt(s / n);
      };
      // TRAP, caught by this scan's own negative control: the ratio against a
      // UNIFORM null of a/sqrt(12) is only valid while the lattice cell is smaller
      // than the spread of the phases. Above that, 57 samples confined to one
      // source px cannot fill a cell, every large spacing "fits", and a page with
      // no lattice whatsoever reports 0.66x at a = 1.5. So the scan is capped at
      // half the phase range and the coarse half of the branch is excluded by a
      // different statistic — the phase SD itself, which a lattice of spacing at or
      // above the full range would drive to the estimator floor (all 57 markers
      // would land on the SAME lattice point, the fold being an integer 42).
      const aMax = 0.5;
      let bestA = { a: 0, rms: Infinity, ratio: Infinity };
      for (let a = qMin; a <= aMax; a += 0.0005) {
        const rms = at(a), ratio = rms / (a / Math.sqrt(12));
        if (ratio < bestA.ratio) bestA = { a, rms, ratio };
      }
      console.log(`    LATTICE SCAN over the spacings the mupdf glyph cache can emit ` +
        `(>= em/256 = ${qMin.toFixed(3)} src px — the size<=256 ceiling, and resolution-free, ` +
        `since a finer device px raises \`size\` toward the same ceiling):`);
      console.log(`      ${qMin.toFixed(3)}..${aMax} src px: best-fitting spacing ${bestA.a.toFixed(4)} ` +
        `-> rms distance ${bestA.rms.toFixed(4)} src px = ${bestA.ratio.toFixed(2)}x the ` +
        `${(bestA.a / Math.sqrt(12)).toFixed(4)} a uniform phase gives there`);
      console.log(`      > ${aMax} src px: excluded by the phase sd of ${sdD.toFixed(3)} — one lattice point ` +
        `would take every marker, giving sd ~0.011`);
      // The RATIO carries the verdict, not the rms: the rms alone falls with the
      // spacing, so the smallest admissible cell always looks tightest. Both
      // controls are run through this identical scan — a continuous page reads
      // 0.91x (its own floor, and NOT 1.00x, because the best of ~700 spacings is
      // a minimum over a noisy statistic) and an injected lattice reads 0.30x with
      // its spacing recovered to 4 decimals.
      console.log(`      CONTROLS (--synth --synth-phi 0.206929, same solve, same scan): continuous reads ` +
        `0.0421 / 0.91x; a pen snapped to 0.1875 src px (--synth-peny-lattice) reads 0.0162 / 0.30x ` +
        `at a recovered spacing of 0.1874`);
      console.log(`      ${bestA.ratio > 0.6
        ? 'NO LATTICE AT ANY ADMISSIBLE SPACING. The phases are continuous, which in mupdf is the '
          + 'PATH-FILL branch — fz_render_glyph returns NULL for an FT font once size > 256, and '
          + 'fz_draw_fill_text then fills fz_outline_glyph(tm) at the UNQUANTISED text matrix.'
        : 'A LATTICE IS PRESENT — read its spacing against em/256; the glyph-cache branch is in play.'}`);
    }
    // IS THE SCATTER DETERMINISTIC? A non-integer source row pitch P42 + phi
    // puts marker k at phase frac(k·phi), so ONE number would explain all 57 —
    // and the integer-pitch law says phi = 0, i.e. no scatter at all. Jitter, by
    // contrast, is explained by no phi. Scan it: sharp minimum -> the pitch is
    // measured and the law is wrong; flat -> the lines really do jitter.
    let best = { phi: 0, rms: Infinity };
    {
      const circ = v => v - Math.round(v);
      const at = phi => {
        let sc = 0, ss = 0;
        for (let m = 0; m < n; m++) {
          const d = 2 * Math.PI * (dY[m] - ks[m] * phi);
          sc += Math.cos(d); ss += Math.sin(d);
        }
        const c = Math.atan2(ss, sc) / (2 * Math.PI);
        let s = 0;
        for (let m = 0; m < n; m++) { const r = circ(dY[m] - ks[m] * phi - c); s += r * r; }
        return Math.sqrt(s / n);
      };
      const all = [];
      for (let phi = 0; phi < 1; phi += 1e-5) {
        const rms = at(phi);
        all.push(rms);
        if (rms < best.rms) best = { phi, rms };
      }
      for (let step = 5e-6; step > 1e-9; step /= 2)
        for (const p of [best.phi - step, best.phi + step]) {
          const rms = at(p);
          if (rms < best.rms) best = { phi: p, rms };
        }
      all.sort((p, q) => p - q);
      const near = all.filter(v => v < 2 * best.rms).length;
      console.log(`    DETERMINISTIC PITCH SCAN: best fractional pitch ${best.phi.toFixed(6)} ` +
        `-> residual rms ${best.rms.toFixed(4)} src px`);
      console.log(`      median over the scan ${all[all.length >> 1].toFixed(3)}, ` +
        `${near} of ${all.length} grid points within 2x of the best`);
      // The rate's own error bar, which decides whether two documents' phi
      // differ. A rate error δ tilts marker k's phase by k·δ, so this is the
      // ordinary slope uncertainty — and it is the only thing that can say
      // whether phi is a STORED CONSTANT (every layout must give the same one)
      // or COMPUTED PER DOCUMENT. Quote phi with it or not at all.
      {
        let sk = 0; for (let m = 0; m < n; m++) sk += (ks[m] - mk) ** 2;
        const sePhi = best.rms / Math.sqrt(sk);
        console.log(`      phi = ${best.phi.toFixed(6)} ± ${sePhi.toExponential(2)} (1σ, from the ` +
          `${best.rms.toFixed(4)} src px scatter over ${n} markers spanning k = ` +
          `${Math.min(...ks)}..${Math.max(...ks)})`);
      }
      const wrapped = Math.min(best.phi, 1 - best.phi);
      console.log(`      ${best.rms >= 0.05
        ? 'FLAT — no single fractional rate explains the phases, so they are genuine per-line ' +
          'jitter rather than anything periodic.'
        : wrapped < 1e-3
        ? `phi is 0 to within ${wrapped.toFixed(6)} — the markers sit at ONE phase, which is what ` +
          `an exactly integer source pitch of ${P42} looks like. Nothing to explain.`
        : `SHARP at phi ${best.phi.toFixed(6)} — the sub-pixel phases are DETERMINISTIC in k. ` +
          `CAREFUL: this is a WRAPPED sawtooth, which is NOT the same thing as a source pitch of ` +
          `${(P42 + best.phi).toFixed(5)} — that would drift ${((best.phi) * 60).toFixed(1)} px over ` +
          `the page and could never stay inside this search. Compare --synth-pitch (a real ` +
          `non-integer pitch) against --synth-phi (a sub-pixel wobble about an integer one) ` +
          `before reading a pitch off this number.`}`);
    }
    if (SYNTH && used.some(i => i.injY)) {
      const inj = used.map(i => i.injY), mi = mean(inj);
      const err = dY.map((v, m) => v - (inj[m] - mi));
      const sdE = Math.sqrt(err.reduce((s, v) => s + v * v, 0) / n);
      let c = 0, vi = 0, vd = 0;
      for (let m = 0; m < n; m++) { c += (inj[m] - mi) * (dY[m] - md); vi += (inj[m] - mi) ** 2; vd += (dY[m] - md) ** 2; }
      console.log(`    RECOVERY vs the injected truth: residual sd ${sdE.toFixed(3)} src px, ` +
        `r ${(c / Math.sqrt(vi * vd)).toFixed(4)}  <- this is the estimator's PRECISION`);
    }

    // ---- the SCALE block's readout, beside the offsets it must be read with --
    if (SCALE) {
      const ms = mean([...dSc]);
      const sdS = Math.sqrt(dSc.reduce((s, v) => s + (v - ms) ** 2, 0) / n);
      console.log(`\n  PER-MARKER VERTICAL SCALE (${n} markers, relative, mean removed):`);
      console.log(`    sd ${(100 * sdS).toFixed(3)}%, range ${(100 * (Math.min(...dSc) - ms)).toFixed(3)} .. ` +
        `${(100 * (Math.max(...dSc) - ms)).toFixed(3)}%`);
      // IS IT DETERMINISTIC IN k, like the offsets are? Same question, same
      // shape of answer: scan the sawtooth rate and correlate. The median over
      // the scan is the negative control — it is what a rate that explains
      // nothing looks like, and without it a best-|r| means nothing at all.
      const sawR = phi => {
        let sx = 0, sy2 = 0, sxy = 0, sxx = 0, syy = 0;
        for (let m = 0; m < n; m++) {
          const u = phi * ks[m];
          sx += u - Math.floor(u) - 0.5; sy2 += dSc[m];
        }
        const mw = sx / n, mv = sy2 / n;
        for (let m = 0; m < n; m++) {
          const u = phi * ks[m], w = u - Math.floor(u) - 0.5;
          sxy += (w - mw) * (dSc[m] - mv); sxx += (w - mw) ** 2; syy += (dSc[m] - mv) ** 2;
        }
        return syy > 0 && sxx > 0 ? Math.abs(sxy / Math.sqrt(sxx * syy)) : 0;
      };
      // The scan must EXCLUDE a neighbourhood of 0 and 1, and this is not a
      // nuisance guard — it is a real degeneracy that reads as a strong result.
      // Over k = 6..65 a rate below ~1/60 never wraps, so frac(k·phi) is just a
      // straight line in k and the scan reports whatever linear drift the
      // estimator has, at |r| 0.8 on data with NO sawtooth in it at all
      // (measured, on --synth-phi with no scale injected). Demand two wraps.
      const PLO = 2 / (Math.max(...ks) - Math.min(...ks)), PHI_ = 1 - PLO;
      let bp = 0, br = 0; const rs = [];
      for (let phi = PLO; phi < PHI_; phi += 1e-4) { const r = sawR(phi); rs.push(r); if (r > br) { br = r; bp = phi; } }
      rs.sort((p, q) => p - q);
      console.log(`    SAWTOOTH SCAN over the scales: best rate ${bp.toFixed(6)} -> |r| ${br.toFixed(3)}` +
        `   (median over the scan ${rs[rs.length >> 1].toFixed(3)} — the negative control)`);
      console.log(`    |r| against the OFFSETS' own rate 0.206929: ${sawR(0.206929).toFixed(3)}`);
      if (SYNTH && used.some(i => i.injS)) {
        const inj = used.map(i => i.injS), mi = mean(inj);
        let c2 = 0, vi2 = 0, vd2 = 0, e2 = 0;
        for (let m = 0; m < n; m++) {
          c2 += (inj[m] - mi) * (dSc[m] - ms); vi2 += (inj[m] - mi) ** 2; vd2 += (dSc[m] - ms) ** 2;
          e2 += ((dSc[m] - ms) - (inj[m] - mi)) ** 2;
        }
        console.log(`    INJECTED sd ${(100 * Math.sqrt(vi2 / n)).toFixed(3)}% — RECOVERY: ` +
          `slope ${(c2 / vi2).toFixed(3)}, r ${(c2 / Math.sqrt(vi2 * vd2)).toFixed(4)}, ` +
          `residual sd ${(100 * Math.sqrt(e2 / n)).toFixed(3)}%  <- the estimator's PRECISION`);
      }
    }

    // ---- THE HALF-WINDOW TEST -----------------------------------------------
    // Sampled once per line, a per-line pen offset and a per-ROW mapping error
    // are the same observation: frac(k·phi) either way. They differ INSIDE a
    // marker window. Fit each marker's offset on the window's top rows and its
    // bottom rows separately:
    //   per-line constant (a pen that moved, an accumulator that drops its
    //     carry)  ->  the halves want the SAME offset, Δ ≈ 0 with random sign;
    //   per-row ramp (the resampler's row mapping drifting with y)
    //           ->  the halves want offsets differing by the ramp's advance
    //               across the window, the SAME SIGN on every marker.
    // The window is 15 output rows for ~5 px of glyph, so this buys sub-line
    // resolution from the markers already in hand — no new pages, which is the
    // constraint this family is under.
    if (flag('phase-halves')) {
      const HT = +opt('halves', String(TH >> 1));
      const yT = [0, HT], yB = [TH - HT, TH];
      // Where each band's evidence actually sits. The phase is carried by ink
      // EDGES, so weight the row by how much ink gradient it holds — a row of
      // flat paper constrains nothing and must not move the centroid.
      const bandCentre = (m, lo, hi) => {
        let sw = 0, sy = 0;
        for (let Y = lo; Y < hi; Y++) for (let X = 0; X < TW; X++) {
          const up = Y > 0 ? rhs[m * TH * TW + (Y - 1) * TW + X] : 255;
          const dn = Y < TH - 1 ? rhs[m * TH * TW + (Y + 1) * TW + X] : 255;
          const w = Math.abs(dn - up) / 2;
          sw += w; sy += w * Y;
        }
        return sw ? sy / sw : (lo + hi) / 2;
      };
      const dT = [], dB = [], sep = [];
      for (let m = 0; m < n; m++) {
        dT.push(bestOffset(m, dY[m], yT[0], yT[1]));
        dB.push(bestOffset(m, dY[m], yB[0], yB[1]));
        sep.push(bandCentre(m, yB[0], yB[1]) - bandCentre(m, yT[0], yT[1]));
      }
      const D = dB.map((v, m) => v - dT[m]);
      const mSep = mean(sep);
      // A ramp that WRAPS puts a whole-source-pixel discontinuity inside the ~1
      // window in 5 that straddles a wrap, and those markers' halves disagree by
      // most of a pixel. They are a prediction of the hypothesis, not noise —
      // but they wreck the mean, so the location statistic must be the MEDIAN
      // and the wrap count is reported beside it as its own signature.
      const WRAP = 0.15;
      const wraps = D.filter(v => Math.abs(v) > WRAP).length;
      const core = D.filter(v => Math.abs(v) <= WRAP);
      const mdD = median(D), mD = mean(D), sdDD = sd(D);
      const seCore = sd(core) / Math.sqrt(core.length);
      const pos = D.filter(v => v > 0).length;
      // dY displaces the SOURCE under the sampling; a mapping error displaces
      // the SAMPLING. So an implied mapping rate is −Δ per separation.
      const rate = best.phi;                          // the measured per-line sawtooth
      const predD = -rate * b.fy / P42 * mSep;        // what a per-ROW ramp of that rate gives
      console.log(`\n  HALF-WINDOW PHASE (top rows ${yT[0]}..${yT[1] - 1} vs bottom ${yB[0]}..${yB[1] - 1}):`);
      console.log(`    Δ = d(bottom) − d(top):  median ${mdD.toFixed(4)}, mean ${mD.toFixed(4)}, ` +
        `sd ${sdDD.toFixed(4)} src px;  ${Math.max(pos, n - pos)}/${n} share the majority sign`);
      console.log(`    ${wraps} of ${n} markers with |Δ| > ${WRAP} (a WRAPPING ramp must produce ` +
        `~${(n * mSep * 2 * rate * b.fy / P42).toFixed(0)}; a per-line constant produces 0); ` +
        `core sd ${sd(core).toFixed(4)}, se ${seCore.toFixed(4)}`);
      console.log(`    gradient-weighted band separation ${mSep.toFixed(2)} output rows ` +
        `= ${(mSep * b.fy).toFixed(2)} source rows`);
      console.log(`    PREDICTED median Δ if the wobble is a per-ROW ramp at the measured rate ` +
        `${rate.toFixed(6)}/line:  ${predD.toFixed(4)} src px`);
      console.log(`    PREDICTED median Δ if it is a per-LINE constant:  0`);
      console.log(`    observed is ${(Math.abs(mdD - predD) / seCore).toFixed(1)}σ from the ramp ` +
        `and ${(Math.abs(mdD) / seCore).toFixed(1)}σ from the constant ` +
        `(σ = the core se; --synth with no wobble is the instrument's own floor).`);
      if (flag('phase-halves-dump')) {
        console.log(`    k    dY      d(top)  d(bot)   Δ`);
        for (let m = 0; m < n; m++)
          console.log(`    ${String(used[m].k).padStart(3)}  ${dY[m].toFixed(3).padStart(6)}  ` +
            `${dT[m].toFixed(3).padStart(6)}  ${dB[m].toFixed(3).padStart(6)}  ${D[m].toFixed(3).padStart(6)}`);
      }
      // The residual's own shape by row, which is the other half of the claim: a
      // rigid offset optimally splitting a ramp leaves the extremes signed one
      // way and the middle the other.
      {
        // The FREE source, not the clamped one: RMS 1.647 is the free objective,
        // and clamping adds a residual of its own that is not what is under test.
        const o = new Float64Array(NEQ);
        for (let t = 0; t < nTerm; t++) o[eqOf[t]] += S[sIdx[t]] * wArr[t];
        const prof = new Float64Array(TH), abs = new Float64Array(TH);
        for (let m = 0; m < n; m++) for (let Y = 0; Y < TH; Y++)
          for (let X = 0; X < TW; X++) {
            const e = m * TH * TW + Y * TW + X, r = o[e] - rhs[e];
            prof[Y] += r; abs[Y] += Math.abs(r);
          }
        console.log(`    signed residual by window row (model − page, mean per byte):`);
        console.log(`      ${Array.from(prof, (v, Y) => `${Y}:${(v / (n * TW)).toFixed(2)}`).join(' ')}`);
        console.log(`      |r|  ${Array.from(abs, v => (v / (n * TW)).toFixed(2)).join(' ')}`);
      }
    }
  }

  // ---- what the X phases say ------------------------------------------------
  // All 57 markers are the leading '>' of their line, in one column, so the
  // producer's own layout says they share an x pen exactly. A non-zero sd here
  // is therefore not a free parameter finding slack — it is that claim failing.
  if (PHASEX) {
    const n = used.length;
    const sdX = Math.sqrt(dX.reduce((s, v) => s + v * v, 0) / n);
    console.log(`\n  PER-MARKER X PHASE (${n} markers, source px, mean removed):`);
    console.log(`    sd ${sdX.toFixed(3)}, range ${Math.min(...dX).toFixed(3)} .. ${Math.max(...dX).toFixed(3)}`);
    if (SYNTH && used.some(i => i.injX)) {
      const inj = used.map(i => i.injX), mi = mean(inj), mdx = mean([...dX]);
      const err = dX.map((v, m) => v - (inj[m] - mi));
      const sdE = Math.sqrt(err.reduce((s, v) => s + v * v, 0) / n);
      let c = 0, vi = 0, vd = 0;
      for (let m = 0; m < n; m++) { c += (inj[m] - mi) * (dX[m] - mdx); vi += (inj[m] - mi) ** 2; vd += (dX[m] - mdx) ** 2; }
      console.log(`    RECOVERY vs the injected truth: residual sd ${sdE.toFixed(3)} src px, ` +
        `r ${(c / Math.sqrt(vi * vd)).toFixed(4)}  <- this is the estimator's PRECISION`);
    }
    console.log(`    ${sdX < 0.05
      ? 'AT THE FLOOR — the markers do share one x pen, so whatever the residual is made of, '
        + 'it is not a horizontal per-line inconsistency.'
      : 'NOT AT THE FLOOR — read this against --synth --synth-jitter-x before believing it; '
        + 'a free block will always absorb something.'}`);
  }
}

// ---- DO THE MARKERS SHARE ONE SOURCE RASTER? (model-free) --------------------
// Every multi-instance argument in this family rests on one premise: the row
// pitch is a whole number of source pixels, so every marker sits at the SAME
// fractional pen phase and the source raster is identical for all of them —
// only the output sampling phase differs. Nothing has ever tested that.
//
// It is testable with no model at all. If the premise holds, two markers whose
// OUTPUT phase φ = frac(k · pitch) coincides must carry near-identical windows,
// because they are the same source raster sampled at the same offset. So bucket
// the markers by φ and compare same-φ pairs against far-φ pairs, straight off
// the page. Same-φ pairs near zero -> the premise holds. Same-φ pairs as far
// apart as far-φ pairs -> the markers genuinely differ, every shared-raster
// solve in this file is measuring its own assumption, and the pitch is not a
// whole number of source pixels.
if (flag('phase')) {
  // The phase difference between two markers depends ONLY on their row
  // separation, so collapse every pair onto Δk. D(Δk) is measured straight off
  // the page with no pitch and no model in it at all.
  const dist = (a, c) => {
    let s = 0;
    for (let n = 0; n < TW * TH; n++) s += Math.abs(a.target[n] - c.target[n]);
    return s / (TW * TH);
  };
  // TRAP, and it is what made the first version of this test unreadable: the
  // windows above are anchored on each marker's DETECTED INK TOP, an integer
  // row that jumps by ±1 as the phase crosses a threshold. That quantisation
  // is a phase-dependent whole-pixel shift mixed into every distance, and it
  // swamps the sub-pixel effect being measured. Re-cut every window on the
  // CONTINUOUS centroid line instead, and the phase becomes a number rather
  // than something inferred from row separation.

  // Now find the pitch. psi(dk,p) is the distance of dk*p from a whole number
  // of output pixels — the phase offset between two markers dk rows apart. If
  // one source raster serves them all, D must rise with psi and, crucially,
  // must go to ZERO as psi does. Sensitivity is dpsi/dp = dk, so the large
  // separations are what deliver 1e-4 on the pitch.
  const psi = (dk, p) => { const f = dk * p - Math.round(dk * p); return Math.abs(f); };
  const fitAt = p => {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const { dk, D, n } of DK) {
      const x = psi(dk, p), w = n;
      sw += w; sx += w * x; sy += w * D; sxx += w * x * x; sxy += w * x * D;
    }
    const den = sw * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) return null;
    const beta = (sw * sxy - sx * sy) / den, alpha = (sy - beta * sx) / sw;
    let ssr = 0, sst = 0; const my = sy / sw;
    for (const { dk, D, n } of DK) {
      ssr += n * (D - (alpha + beta * psi(dk, p))) ** 2;
      sst += n * (D - my) ** 2;
    }
    return { alpha, beta, r2: 1 - ssr / sst };
  };
  // An INDEPENDENT pitch, measured directly: the ink centroid of each marker,
  // fitted against its row index. No model, no phase assumption. The centroid
  // carries a phase-dependent bias, but the 57 markers sample the phases and
  // it averages out; the residual scatter below says how well.
  const cen = used.map(i => {
    let sw = 0, sy = 0;
    for (let Y = 0; Y < TH; Y++)
      for (let X = 0; X < TW; X++) {
        const w = 255 - i.target[Y * TW + X];
        if (w > 0) { sw += w; sy += w * Y; }
      }
    return { k: i.k, y: i.TY0 + sy / sw };
  });
  let aC, bC, sdC;
  {
    const mk = mean(cen.map(c => c.k)), my = mean(cen.map(c => c.y));
    let num = 0, den = 0;
    for (const c of cen) { num += (c.k - mk) * (c.y - my); den += (c.k - mk) ** 2; }
    bC = num / den; aC = my - bC * mk;
    const res = cen.map(c => c.y - (aC + bC * c.k));
    const sdR = sd(res), se = sdR / Math.sqrt(den);
    sdC = sdR;
    console.log(`\n  INDEPENDENT PITCH from ink centroids: ${bC.toFixed(5)} output px ` +
      `± ${se.toFixed(5)} (1σ), residual sd ${sdR.toFixed(3)} px over ${cen.length} markers`);
    console.log(`    for comparison: row detector ${det.yGrid.pitch.toFixed(4)}, ` +
      `pen-line fit ${(b.line.P / b.fy).toFixed(4)}, 43/3 = ${(43 / 3).toFixed(5)}`);
  }
  const PW = TW, PH = TH;
  const cut = (topRow) => {
    const w = new Uint8Array(PW * PH);
    for (let y = 0; y < PH; y++)
      for (let x = 0; x < PW; x++) {
        const py = topRow + y, px = MX - PADX + x;
        w[y * PW + x] = (py >= 0 && py < page.h) ? page.gray[py * page.w + px] : 255;
      }
    return w;
  };
  const cd = cen.map(c => {
    const yFit = aC + bC * c.k, A = Math.round(yFit);
    return { k: c.k, phi: yFit - A, win: cut(A - (PH >> 1)) };
  });
  const dist2 = (a, c) => {
    let s = 0;
    for (let n = 0; n < PW * PH; n++) s += Math.abs(a.win[n] - c.win[n]);
    return s / (PW * PH);
  };
  const pts = [];
  for (let a = 0; a < cd.length; a++)
    for (let c = a + 1; c < cd.length; c++)
      pts.push({ dp: Math.abs(cd[a].phi - cd[c].phi), D: dist2(cd[a], cd[c]) });
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const q of pts) { sw++; sx += q.dp; sy += q.D; sxx += q.dp * q.dp; sxy += q.dp * q.D; }
  const beta2 = (sw * sxy - sx * sy) / (sw * sxx - sx * sx);
  const alpha2 = (sy - beta2 * sx) / sw;
  pts.sort((a, c) => a.dp - c.dp);
  const head = pts.slice(0, 40), tail = pts.slice(-40);
  const avg = z => z.reduce((s, q) => s + q.D, 0) / z.length;
  console.log(`\nDO THE MARKERS SHARE ONE SOURCE RASTER? (page pixels only, no model)`);
  console.log(`  windows re-cut on the centroid line, phase taken directly; ${pts.length} pairs.`);
  console.log(`  D = ${alpha2.toFixed(3)} + ${beta2.toFixed(2)}·|Δφ|   over |Δφ| in [0, 0.5]`);
  console.log(`  40 smallest |Δφ| (mean ${head[Math.floor(head.length / 2)].dp.toFixed(4)}): ` +
    `mean D ${avg(head).toFixed(3)}, min ${Math.min(...head.map(q => q.D)).toFixed(3)} bytes/px`);
  console.log(`  40 largest  |Δφ| (mean ${tail[Math.floor(tail.length / 2)].dp.toFixed(4)}): ` +
    `mean D ${avg(tail).toFixed(3)} bytes/px`);
  // The intercept is only as good as the PHASE. φ comes from the centroid,
  // whose scatter about its own line is sdC — so |Δφ| carries an error of
  // sdC·√2 even when two markers are truly at the same phase, and a positive
  // intercept follows from that alone: E|Δφ_noise| = sdC·√2·√(2/π), times the
  // measured slope. Compare the two before calling the intercept a floor.
  const predicted = beta2 * sdC * Math.SQRT2 * Math.sqrt(2 / Math.PI);
  console.log(`  INTERCEPT at zero phase: ${alpha2.toFixed(3)} bytes/px`);
  console.log(`  predicted from phase noise alone: ${predicted.toFixed(3)} bytes/px ` +
    `(centroid scatter ${sdC.toFixed(3)} px × slope ${beta2.toFixed(2)})  <- compare these two`);
  console.log(`  VERDICT: ${alpha2 < 1.5 * predicted
    ? 'CONSISTENT WITH THE PREMISE HOLDING, and not provable beyond that with this instrument. ' +
      'The whole intercept is accounted for by the error in the phase itself. Do NOT read that ' +
      'as "no per-line variation": this test infers phase from the ink CENTROID, whose scatter ' +
      'is partly its own bias, and --solve-joint — which never touches the centroid and reads ' +
      'the pixels directly — does see marker-to-marker inconsistency worth ~0.29 src px. A ' +
      'better phase estimator, not more markers, is what would settle it. Treat the ' +
      'integer-pitch law as SUPPORTED but not proven, and note that 1/sqrt(12) = 0.289 is what ' +
      'a NON-INTEGER source pitch would produce.'
    : alpha2 < 0.5
    ? 'the premise HOLDS. D extrapolates to ~0 at zero phase, so two markers at the same phase ' +
      'ARE the same pixels — one source raster serves every line and the row pitch is a whole ' +
      'number of source px. The integer-pitch law stands and --solve-src can be read as structural.'
    : 'the premise FAILS. Markers at identical phase still differ by this much, so each line ' +
      'carries its OWN source raster — the pitch is not a whole number of source px, the ' +
      'integer-pitch law is unsafe, and every shared-raster result is measuring the assumption.'}`);
}

// ---- A NONLINEAR POST-STEP: the one thing no linear test can see -------------
// Both structural solves come back negative — no kernel explains the page with
// cour.ttf's raster, and no raster explains it through these kernels. Both are
// LINEAR statements, so both are blind to a byte curve applied AFTER the
// downscale: levels, gamma, a contrast tweak, a scanner-ish tone curve. That is
// what "post-processed" usually means, and the page's histogram already hints
// at it — its top ink bytes run 254,253,252,251,250,249, a RAMP off white,
// where a native render shows plateaus at 119,148,228,252.
//
// The test needs no model of the curve at all. If ANY monotone LUT was applied,
// then the page byte must be a FUNCTION of the model's continuous value v: every
// window pixel with the same v must carry the same target byte. So bin by v and
// measure the SCATTER of the target within each bin. Tight -> a LUT explains
// the whole residual and this reads it off. Scattered -> no post-curve can, and
// the scatter is a hard floor on what any such curve could ever achieve.
if (flag('lut')) {
  EMY = b.emy;
  geometry(b.fy);
  clone.cache.clear();
  for (const j of used) { j.WX = axisW(j.TX0, TW, FX, j.SX0, SW, kx); j.WY = axisW(j.TY0, TH, b.fy, j.SY0, SH, ky); }
  const nudge = +opt('nudge', '16');
  const pairs = [];
  for (const i of used) {
    const px64 = Math.round((b.line.X0 - i.SX0) * 64);
    const py64 = Math.round((b.line.Y0 + b.line.P * i.k - i.SY0) * 64);
    let bd = Infinity, bdx = 0, bdy = 0;
    for (let dx = -nudge; dx <= nudge; dx += b.penStep)
      for (let dy = -nudge; dy <= nudge; dy += b.penStep) {
        if (px64 + dx < 0 || py64 + dy < 0) continue;
        if (!render(b.em, px64 + dx, py64 + dy)) continue;
        const r = score(i, i.WX, i.WY);
        if (r.diff < bd) { bd = r.diff; bdx = dx; bdy = dy; }
      }
    render(b.em, px64 + bdx, py64 + bdy);
    for (let y = 0; y < SH; y++) {
      const row = y * SW;
      for (let x = 0; x < TW; x++) {
        const { idx, wt } = i.WX[x];
        let a = 0;
        for (let j = 0; j < idx.length; j++) a += src[row + idx[j]] * wt[j];
        tmp[y * TW + x] = a;
      }
    }
    for (let Y = 0; Y < TH; Y++) {
      const { idx, wt } = i.WY[Y];
      for (let X = 0; X < TW; X++) {
        let v = 0;
        for (let j = 0; j < idx.length; j++) v += tmp[idx[j] * TW + X] * wt[j];
        pairs.push([v, i.target[Y * TW + X]]);
      }
    }
  }
  const NB2 = 256, bins = Array.from({ length: NB2 }, () => []);
  for (const [v, t] of pairs) bins[Math.max(0, Math.min(255, Math.round(v)))].push(t);
  let tot = 0, worst = null, nBins = 0, wsum = 0;
  const lut = new Int32Array(NB2);
  for (let q = 0; q < NB2; q++) {
    const bcount = bins[q];
    if (!bcount.length) { lut[q] = q; continue; }
    bcount.sort((p, r) => p - r);
    const med = bcount[bcount.length >> 1];
    lut[q] = med;
    let s = 0;
    for (const t of bcount) s += Math.abs(t - med);
    tot += s; nBins++;
    const sd2 = s / bcount.length;
    wsum += s;
    if (!worst || sd2 > worst.sd) worst = { q, sd: sd2, n: bcount.length };
  }
  const nExact = (() => { let e = 0;
    for (let m = 0, p = 0; m < used.length; m++) { let bad = false;
      for (let q = 0; q < TW * TH; q++, p++) {
        const [v, t] = pairs[p];
        if (lut[Math.max(0, Math.min(255, Math.round(v)))] !== t) bad = true;
      }
      if (!bad) e++; }
    return e; })();
  console.log(`\nBEST POSSIBLE MONOTONE POST-CURVE (a 256-entry LUT fitted on ${pairs.length} pixels,` +
    ` ${nBins} bins occupied):`);
  console.log(`  Σ|Δ| ${tot} = ${(tot / used.length).toFixed(1)} per glyph, ` +
    `${(tot / inkBytes).toFixed(2)} per ink byte;  ${nExact} of ${used.length} byte-exact`);
  console.log(`  worst bin: model value ${worst.q}, ${worst.n} pixels, mean spread ${worst.sd.toFixed(2)} bytes`);
  console.log(`  VERDICT: ${tot / used.length < 20
    ? 'A POST-CURVE EXPLAINS IT. The page byte IS a function of the model value — read the LUT off.'
    : 'no post-curve can explain it either. The page byte is NOT a function of the model ' +
      'value: identical model values carry different page bytes, so the residual is ' +
      'spatial, not tonal. This is a FLOOR on every levels/gamma/contrast hypothesis.'}`);
  let shown = 0, ln = '  LUT (model -> page), where it departs from identity: ';
  for (let q = 0; q < NB2 && shown < 14; q++)
    if (bins[q].length && lut[q] !== q) { ln += `${q}->${lut[q]} `; shown++; }
  console.log(shown ? ln : '  LUT is the identity wherever it is occupied — no tonal shift at all.');
}

// ---- the residual, averaged over every y phase -------------------------------
// One marker's residual is one sample of a noisy thing. Averaging the SIGNED
// residual over all 57 markers cancels whatever is phase-dependent and leaves
// only what is systematic — which is the part a missing physical term makes.
// The mean ABS map beside it says whether a near-zero mean is real agreement
// or two phases cancelling.
if (flag('dump')) {
  EMY = b.emy;
  geometry(b.fy);
  clone.cache.clear();
  for (const j of used) { j.WX = axisW(j.TX0, TW, FX, j.SX0, SW, kx); j.WY = axisW(j.TY0, TH, b.fy, j.SY0, SH, ky); }
  const nudge = +opt('nudge', '16');
  const sum = new Float64Array(TW * TH), sumAbs = new Float64Array(TW * TH);
  const modelOf = i => {
    const out = new Int32Array(TW * TH);
    for (let y = 0; y < TH; y++) {
      const { idx, wt } = i.WY[y];
      for (let x = 0; x < TW; x++) {
        let a = 0;
        for (let j = 0; j < idx.length; j++) a += tmp[idx[j] * TW + x] * wt[j];
        let v = roundBy(a); out[y * TW + x] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    return out;
  };
  for (const i of used) {
    const px64 = Math.round((b.line.X0 - i.SX0) * 64);
    const py64 = Math.round((b.line.Y0 + b.line.P * i.k - i.SY0) * 64);
    let bd = Infinity, bm = null;
    for (let dx = -nudge; dx <= nudge; dx += b.penStep)
      for (let dy = -nudge; dy <= nudge; dy += b.penStep) {
        if (px64 + dx < 0 || py64 + dy < 0) continue;
        if (!render(b.em, px64 + dx, py64 + dy)) continue;
        const r = score(i, i.WX, i.WY);
        if (r.diff < bd) { bd = r.diff; bm = modelOf(i); }
      }
    if (!bm) continue;
    for (let n = 0; n < TW * TH; n++) { const d = bm[n] - i.target[n]; sum[n] += d; sumAbs[n] += Math.abs(d); }
  }
  const N = used.length;
  for (const [title, arr] of [['MEAN SIGNED residual (model − page)', sum], ['MEAN |residual|', sumAbs]]) {
    console.log(`\n${title}, averaged over ${N} y phases:`);
    for (let y = 0; y < TH; y++) {
      let line = '   ';
      for (let x = 0; x < TW; x++) {
        const v = arr[y * TW + x] / N;
        line += (Math.abs(v) < 0.5 ? '     .' : v.toFixed(1).padStart(6));
      }
      console.log(line);
    }
  }
  console.log('\n  A soft ring one pixel beyond the glyph is a wrong FILTER.');
  console.log('  Dipoles localised at arm edges are a wrong OUTLINE — a filter cannot make them.');
  console.log('  A mean that is ~0 where mean|.| is large is PHASE noise, not a systematic term.');
}
