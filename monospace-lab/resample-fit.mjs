// resample-fit.mjs — fit the producer's downscale against EVERY known glyph on
// a page, not one.
//
//   node monospace-lab/resample-fit.mjs --null          # certify the harness
//   node monospace-lab/resample-fit.mjs                 # default fit
//   node monospace-lab/resample-fit.mjs --em 2500,2600,8 --fy 2.88,3.00,0.04
//   node monospace-lab/resample-fit.mjs --pen 16,8,4,2 --dump
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
function axisW(o0, n, f, s0, sN, K) {
  const T = [];
  for (let i = 0; i < n; i++) {
    const c = (o0 + i + 0.5) * f;
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
  const offs = on => {
    const o = [];
    if (on && Q64 > 1) { for (let m = -NQ; m <= NQ; m++) o.push(m * Q64); return o; }
    for (let d = -nudge; d <= nudge; d += fine) o.push(d);
    return o;
  };
  const OFFX = offs(QAX_X), OFFY = offs(QAX_Y);
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
function forward(i, WX, WY) {
  const out = new Uint8Array(TW * TH);
  for (let y = 0; y < SH; y++) {
    const row = y * SW;
    for (let x = 0; x < TW; x++) {
      const { idx, wt } = WX[x];
      let a = 0;
      for (let j = 0; j < idx.length; j++) a += src[row + idx[j]] * wt[j];
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
  const P42 = +opt('pitch', '42');
  EMY = Math.round(sem * b.aspect * 32) / 32;
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
    const WXs = axisW(i.TX0, TW, FX, i.SX0, SW, skx);
    const WYs = axisW(i.TY0, TH, b.fy, i.SY0, SH, sky);
    const dj = jit ? Math.round((rnd() * 2 - 1) * Math.sqrt(3) * jit * 64) : 0;  // uniform, sd = jit
    const px64 = Math.round((b.line.X0 - i.SX0) * 64);
    const py64 = Math.round((b.line.Y0 + P42 * i.k - i.SY0) * 64) + dj;
    if (!render(sem, px64, py64)) { console.error('synth: no raster'); process.exit(2); }
    i.target = forward(i, WXs, WYs);
  }
  inkBytes = countInk();
  SYNTH = { skx: opt('synth-kx', KX), sky: opt('synth-ky', KY), sem, jit };
  console.log(`\n*** SYNTHETIC TARGETS — THIS IS A CONTROL, NOT A MEASUREMENT OF THE PAGE ***`);
  console.log(`  generated: em64 ${sem}, fy ${b.fy}, x ${SYNTH.skx} / y ${SYNTH.sky}, ` +
    `pen on an exact line, pitch ${P42} src px, jitter sd ${jit} src px`);
  console.log(`  the solves below are told x ${KX} / y ${KY} and must recover the rest.`);
  // Re-fit on the synthetic page: everything downstream reads b.line, so the
  // control must go through the same three stages the real data does.
  const r = runConfig(b.em, b.fy, kx, ky, b.penStep, b.aspect, false);
  b = r;
  console.log(`  re-fit on the control: ${r.perGlyph.toFixed(1)} per glyph, ${r.nExact}/${r.n} byte-exact, ` +
    `pen line ${r.line.X0.toFixed(3)}, ${r.line.Y0.toFixed(3)}, ${r.line.P.toFixed(4)}`);
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
      for (let sy = Math.ceil(cy - R - 0.5); sy <= Math.floor(cy + R - 0.5); sy++) {
        const sRel = sy - P42 * i.k;
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
  const rhs = new Float64Array(NEQ);
  {
    let e = 0, t = 0;
    for (const i of used) for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++, e++) {
      const cy = (i.TY0 + Y + 0.5) * b.fy, cx = (i.TX0 + X + 0.5) * FX;
      rhs[e] = i.target[Y * TW + X];
      for (let sy = Math.ceil(cy - R - 0.5); sy <= Math.floor(cy + R - 0.5); sy++) {
        const uy = (sy + 0.5 - cy - B0) / BW, y0 = Math.floor(uy);
        const sRel = sy - P42 * i.k - sLo;
        for (let sx = Math.ceil(cx - R - 0.5); sx <= Math.floor(cx + R - 0.5); sx++, t++) {
          const ux = (sx + 0.5 - cx - B0) / BW, x0 = Math.floor(ux);
          sIdx[t] = sRel * NC + (sx - cLo);
          byi[t] = y0; fyf[t] = uy - y0;
          bxi[t] = x0; fxf[t] = ux - x0;
        }
      }
    }
  }
  const eqOf = new Int32Array(nTerm);
  for (let e = 0; e < NEQ; e++) for (let t = eqStart[e]; t < eqStart[e + 1]; t++) eqOf[t] = e;

  // ---- the unknowns ---------------------------------------------------------
  // S starts at what cour.ttf actually renders, so the solve reports a delta;
  // the kernels start at the tent pair the fit settled on.
  const S = new Float64Array(NU).fill(255);
  {
    const px0 = Math.round((b.line.X0 - used[0].SX0) * 64);
    const py0 = Math.round((b.line.Y0 + b.line.P * used[0].k - used[0].SY0) * 64);
    render(b.em, px0, py0);
    for (let s = 0; s < SH; s++)
      for (let c = 0; c < SW; c++) {
        const sr = s + used[0].SY0 - P42 * used[0].k - sLo, cr = c + used[0].SX0 - cLo;
        if (sr >= 0 && sr < NR && cr >= 0 && cr < NC) S[sr * NC + cr] = src[s * SW + c];
      }
  }
  const S0 = Float64Array.from(S);
  const tapsOf = K => { const h = new Float64Array(NB);
    for (let q = 0; q < NB; q++) { const t = B0 + q * BW;
      h[q] = K.type === 'tri' ? Math.max(0, 1 - Math.abs(t) / K.w) / K.w
        : (Math.abs(t) < K.w / 2 ? 1 / K.w : 0); }
    return h; };
  let hy = tapsOf(ky), hx = tapsOf(kx);
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

  // ---- ALS ------------------------------------------------------------------
  refreshW();
  console.log(`\nFREE SOURCE + FREE ${K2D ? 'NON-SEPARABLE 2D' : 'SEPARABLE'} KERNEL ` +
    `(${NU} source px + ${K2D ? NB * NB : 2 * NB} kernel taps, ${NEQ} equations, ` +
    `nodes every ${BW} src px, pitch ${P42}, fy ${b.fy}):`);
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
    refreshW();
    console.log(`  ALS ${String(it + 1).padStart(2)}: RMS ${rmsNow(false).toFixed(3)} free, ` +
      `${rmsNow(true).toFixed(3)} with the source clamped to [0,255]`);
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
  if (!K2D) {
    const m = h => { let s = 0, m1 = 0, m2 = 0;
      for (let q = 0; q < NB; q++) { const t = B0 + q * BW; s += h[q]; m1 += h[q] * t; m2 += h[q] * t * t; }
      return `Σ ${s.toFixed(3)} centroid ${(m1 / s).toFixed(3)} sd ${Math.sqrt(m2 / s - (m1 / s) ** 2).toFixed(3)}`; };
    console.log(`  y kernel: ${m(hy)}   (tent ${KY} would be sd ${(ky.w / Math.sqrt(6)).toFixed(3)})`);
    console.log(`  x kernel: ${m(hx)}   (tent ${KX} would be sd ${(kx.w / Math.sqrt(6)).toFixed(3)})`);
  }
  let sum = 0, mx = 0;
  for (let j = 0; j < NU; j++) { const d = Math.max(0, Math.min(255, S[j])) - S0[j];
    sum += Math.abs(d); if (Math.abs(d) > Math.abs(mx)) mx = d; }
  console.log(`  free raster vs cour.ttf: mean |Δ| ${(sum / NU).toFixed(2)}, worst ${mx.toFixed(1)} bytes`);
  console.log(`  READ THIS AGAINST --synth, NOT AGAINST ZERO: the same solve on a control with a` +
    `\n  perfect shared raster floors near 0.13 bytes RMS, and near 3.6 once a 0.27 src px pen` +
    `\n  scatter is injected. Only a real run ABOVE the jittered control is structural.`);
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
