// resample-fit.mjs — fit the producer's downscale against EVERY known glyph on
// a page, not one.
//
//   node monospace-lab/resample-fit.mjs                      # coarse sweep
//   node monospace-lab/resample-fit.mjs --em 2400,3300,16 --rows 12
//
// WHY THIS EXISTS. The `page-downscale-816x1073` family (lab/families.mjs) is a
// page resampled after rendering, so no (face, em64, pen, law) reproduces it
// and no roster sweep can close it. The only route is a forward model:
// rasterize at the source resolution, apply the producer's resample, compare.
// A first build fitted that against ONE isolated '>' and stalled in a shallow
// valley — em64 and blur width trade against each other, and 110 bytes cannot
// separate them.
//
// This fixes the shape of the problem rather than the search range. Every line
// of these documents starts with '>', so a page carries ~60 instances of a
// KNOWN character in a KNOWN column — and because they share a column they
// share an x sub-pixel phase, while their y phases differ (the row pitch is
// incommensurate with the resample period). One config must therefore explain
// sixty different y phases at once with a single pen origin. That is what a
// shallow valley cannot survive.
//
// Two stages, deliberately separate:
//   FIT       per instance the pen may float, so a wrong (em64, kernel) cannot
//             hide behind a lucky alignment — it has to explain every instance.
//   PHYSICS   the fitted pens must then lie on ONE line: pen_y = Y0 + k·pitch,
//             with x constant. A config that fits only by scattering its pens
//             has not found the producer, and this is what says so.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { decodePage } from './src/raster-node.mjs';
import { detectRows, detectColumns, calibrate } from './src/lines.mjs';
import { FTClone } from '../ftclone/ftclone.mjs';

const require = createRequire(import.meta.url);
const LAB = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(LAB, '..');
const engine = require(join(REPO, 'engine', 'ocr-engine.js'));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DOC = opt('doc', 'lab/base64/courir-strech/EFTA02154109.pdf');
const PNO = +opt('page', 2);
const NROWS = +opt('rows', 10);
const [EM_FROM, EM_TO, EM_STEP] = opt('em', '2400,3300,16').split(',').map(Number);
const SXPP = 25 / 8, SYPP = +opt('yscale', String(3300 / 1073));

// ---- the page and its known glyphs -----------------------------------------
const page = decodePage(resolve(REPO, DOC), PNO);
const det = detectRows(page, engine);
const col = detectColumns(page, det.mask, det.rows);
const grid = calibrate(page, det.mask, det.rows, col);
console.log(`${DOC} p${PNO} ${page.w}×${page.h} — ${det.rows.length} rows, ` +
  `col pitch ${col.pitch.toFixed(4)}, row pitch ${det.yGrid.pitch.toFixed(4)}`);

// first ink blob of each row = the '>' quote marker
const inst = [];
for (const r of det.rows) {
  let x0 = -1;
  for (let x = 0; x < page.w && x0 < 0; x++)
    for (let y = r.top; y < r.top + det.rowH; y++)
      if (page.gray[y * page.w + x] < 255 && !det.mask[y * page.w + x]) { x0 = x; break; }
  if (x0 < 0) continue;
  // extend right until 2 blank columns — that isolates the marker from the text
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
// keep only the modal shape and the modal column — anything else is not the marker
const mode = (arr, f) => {
  const m = new Map();
  for (const a of arr) m.set(f(a), (m.get(f(a)) ?? 0) + 1);
  return [...m.entries()].sort((p, q) => q[1] - p[1])[0];
};
const [mw] = mode(inst, i => i.w), [mh] = mode(inst, i => i.h), [mx] = mode(inst, i => i.x0);
const good = inst.filter(i => i.w === mw && i.h === mh && i.x0 === mx);
console.log(`  line-start markers: ${inst.length} found, ${good.length} share the modal ` +
  `shape ${mw}×${mh} at x=${mx}  (these are the fit set)`);
if (good.length < 4) { console.error('too few known glyphs on this page'); process.exit(2); }
const used = good.slice(0, NROWS);
console.log(`  using ${used.length} of them (rows ${used.map(i => i.k).join(',')})`);

// target windows, padded by 1 px of paper
const PAD = 1;
for (const i of used) {
  i.TX0 = i.x0 - PAD; i.TY0 = i.y0 - PAD;
  i.TW = i.w + 2 * PAD; i.TH = i.h + 2 * PAD;
  i.target = new Uint8Array(i.TW * i.TH);
  for (let y = 0; y < i.TH; y++)
    for (let x = 0; x < i.TW; x++)
      i.target[y * i.TW + x] = page.gray[(i.TY0 + y) * page.w + i.TX0 + x];
}

// ---- source windows and resample weights ------------------------------------
const MARGIN = 10;
for (const i of used) {
  i.SX0 = Math.floor(i.TX0 * SXPP) - MARGIN;
  i.SY0 = Math.floor(i.TY0 * SYPP) - MARGIN;
  i.SW = Math.ceil((i.TX0 + i.TW) * SXPP) + 2 * MARGIN - i.SX0;
  i.SH = Math.ceil((i.TY0 + i.TH) * SYPP) + 2 * MARGIN - i.SY0;
}
const SW = Math.max(...used.map(i => i.SW)), SH = Math.max(...used.map(i => i.SH));
const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));
function axisW(o0, n, spp, base, sigma) {
  const T = [];
  for (let i = 0; i < n; i++) {
    const a = (o0 + i) * spp - base, b = (o0 + i + 1) * spp - base, c = (a + b) / 2;
    const list = []; let sum = 0;
    for (let s = Math.floor(c - 4 * spp); s <= Math.ceil(c + 4 * spp); s++) {
      const w = gauss((s + 0.5 - c) / spp, sigma);
      if (w > 1e-6) { list.push(s, w); sum += w; }
    }
    const out = new Float64Array(list.length);
    for (let j = 0; j < list.length; j += 2) { out[j] = list[j]; out[j + 1] = list[j + 1] / sum; }
    T.push(out);
  }
  return T;
}
function scoreInst(i, src, WX, WY) {
  let diff = 0;
  for (let y = 0; y < i.TH; y++) {
    const wy = WY[y];
    for (let x = 0; x < i.TW; x++) {
      const wx = WX[x];
      let acc = 0;
      for (let a = 0; a < wy.length; a += 2) {
        const yy = wy[a]; if (yy < 0 || yy >= SH) continue;
        const row = yy * SW, ky = wy[a + 1];
        for (let b = 0; b < wx.length; b += 2) {
          const xx = wx[b]; if (xx < 0 || xx >= SW) continue;
          acc += src[row + xx] * ky * wx[b + 1];
        }
      }
      let v = Math.floor(acc + 0.5); v = v < 0 ? 0 : v > 255 ? 255 : v;
      diff += Math.abs(v - i.target[y * i.TW + x]);
    }
  }
  return diff;
}

// ---- the sweep ---------------------------------------------------------------
const FONTDIRS = [`${process.env.WINDIR ?? 'C:/Windows'}/Fonts`, `${process.env.LOCALAPPDATA}/Microsoft/Windows/Fonts`];
let FONT = null;
for (const d of FONTDIRS) if (existsSync(join(d, opt('font', 'cour.ttf')))) { FONT = join(d, opt('font', 'cour.ttf')); break; }
if (!FONT) { console.error('font not found'); process.exit(2); }
const CP = (opt('char', '>')).codePointAt(0);
const clone = new FTClone(FONT, SW, SH);
const SIG = (opt('sigma', '0.30,0.36,0.42,0.48')).split(',').map(Number);
const PENSTEP = +opt('penstep', '16');          // 1/4 source px

// weight tables per (instance, sigma pair) — independent of the render
for (const i of used) {
  i.WX = new Map(); i.WY = new Map();
  for (const s of SIG) {
    i.WX.set(s, axisW(i.TX0, i.TW, SXPP, i.SX0, s));
    i.WY.set(s, axisW(i.TY0, i.TH, SYPP, i.SY0, s));
  }
}
const src = new Uint8Array(SW * SH);
let best = null;
const t0 = Date.now();
for (let em = EM_FROM; em <= EM_TO; em += EM_STEP) {
  clone.cache.clear();
  for (const sx of SIG) for (const sy of SIG) {
    let total = 0;
    const pens = [];
    for (const i of used) {
      // Expected pen, in this instance's source window. The ink's left edge is
      // the pen plus the glyph's left side bearing, and the baseline sits at or
      // below the '>' ink (it is a raised glyph), so the window is asymmetric.
      const ex = Math.round(i.x0 * SXPP - i.SX0);
      const ey = Math.round((i.y1 + 1) * SYPP - i.SY0);
      let bi = null;
      for (let px64 = (ex - 8) * 64; px64 <= (ex + 4) * 64; px64 += PENSTEP)
        for (let py64 = (ey - 2) * 64; py64 <= (ey + 12) * 64; py64 += PENSTEP) {
          if (px64 < 0 || py64 < 0) continue;
          const cov = clone.coverage(CP, em, em, px64, py64);
          if (!cov) continue;
          for (let n = 0; n < src.length; n++) {
            const g = cov[n];
            src[n] = g ? (255 * (256 - (g + (g >> 7)))) >> 8 : 255;
          }
          const d = scoreInst(i, src, i.WX.get(sx), i.WY.get(sy));
          if (!bi || d < bi.d) bi = { d, px64, py64 };
        }
      if (!bi) { total = Infinity; break; }
      total += bi.d; pens.push({ k: i.k, ...bi });
    }
    if (!best || total < best.total) best = { total, em, sx, sy, pens };
  }
  if ((em - EM_FROM) % (EM_STEP * 8) === 0)
    process.stderr.write(`\r  em64 ${em}  best Σ|Δ| ${best ? best.total : '—'} ` +
      `[em ${best?.em} σ ${best?.sx}/${best?.sy}]  ${((Date.now() - t0) / 1000) | 0}s     `);
}
const bytes = used.reduce((s, i) => s + i.TW * i.TH, 0);
console.log(`\n\nBEST em64 ${best.em}  σx ${best.sx}  σy ${best.sy}`);
console.log(`  Σ|Δ| ${best.total} over ${bytes} bytes and ${used.length} glyphs ` +
  `= ${(best.total / bytes).toFixed(2)} per byte` + (best.total === 0 ? '   *** BYTE-EXACT ***' : ''));
console.log(`  em64 ${best.em} = ${(best.em / 64).toFixed(3)} source px at 300 dpi ` +
  `= ${(best.em / 64 * 72 / 300).toFixed(2)} pt   (Courier 12 pt would be em64 3200)`);

// ---- PHYSICS: do the fitted pens lie on one line? ----------------------------
// Pens are searched in each instance's OWN window frame, so they must be put
// back into absolute source coordinates before they can be compared — in local
// frames they would be constant by construction and the check would pass on
// nothing.
const byK = new Map(used.map(i => [i.k, i]));
for (const p of best.pens) {
  const i = byK.get(p.k);
  p.absX = p.px64 / 64 + i.SX0;
  p.absY = p.py64 / 64 + i.SY0;
}
const ks = best.pens.map(p => p.k), xs = best.pens.map(p => p.absX), ys = best.pens.map(p => p.absY);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
const mk = mean(ks), my = mean(ys);
let num = 0, den = 0;
for (let i = 0; i < ks.length; i++) { num += (ks[i] - mk) * (ys[i] - my); den += (ks[i] - mk) ** 2; }
const slope = num / den, icept = my - slope * mk;
const resid = ks.map((k, i) => ys[i] - (icept + slope * k));
console.log(`\n  PHYSICS CHECK — the fitted pens must be ONE line, not ${used.length} free choices:`);
console.log(`    pen x: sd ${sd(xs).toFixed(3)} source px  (all markers share a column, so this must be ~0)`);
console.log(`    pen y: pitch ${slope.toFixed(4)} source px/row = ${(slope / SYPP).toFixed(4)} output px ` +
  `(measured row pitch ${det.yGrid.pitch.toFixed(4)})`);
console.log(`    pen y residual from that line: sd ${sd(resid).toFixed(3)} source px`);
const pitchOK = Math.abs(slope / SYPP - det.yGrid.pitch) < 0.15;
console.log(`    ${sd(xs) < 0.3 && sd(resid) < 0.3 && pitchOK
  ? 'CONSISTENT — one pen origin and one pitch explain every instance.'
  : 'NOT CONSISTENT — the fit is buying its score with free pens' +
    (pitchOK ? '' : ', and the fitted pitch does not match the page') +
    ', so this config is not the producer.'}`);

// ---- VERIFY: predict every other instance's pen from that line ---------------
// The fit above let each pen float. The producer does not: one origin and one
// pitch place every glyph. So predict the pens from the fitted line, allow only
// a ¼-px nudge, and see what the page says.
if (good.length > used.length) {
  const rest = good.slice(0, +opt('verify', '40'));
  for (const i of rest) {
    if (!i.target) {
      i.TX0 = i.x0 - PAD; i.TY0 = i.y0 - PAD; i.TW = i.w + 2 * PAD; i.TH = i.h + 2 * PAD;
      i.target = new Uint8Array(i.TW * i.TH);
      for (let y = 0; y < i.TH; y++) for (let x = 0; x < i.TW; x++)
        i.target[y * i.TW + x] = page.gray[(i.TY0 + y) * page.w + i.TX0 + x];
      i.SX0 = Math.floor(i.TX0 * SXPP) - MARGIN; i.SY0 = Math.floor(i.TY0 * SYPP) - MARGIN;
      i.WX = new Map([[best.sx, axisW(i.TX0, i.TW, SXPP, i.SX0, best.sx)]]);
      i.WY = new Map([[best.sy, axisW(i.TY0, i.TH, SYPP, i.SY0, best.sy)]]);
    }
  }
  const px = mean(xs);
  let tot = 0, n = 0, worstInst = null;
  const perByte = [];
  for (const i of rest) {
    const predY = icept + slope * i.k;
    let bi = null;
    for (let dx = -16; dx <= 16; dx += 8)
      for (let dy = -16; dy <= 16; dy += 8) {
        const px64 = Math.round((px - i.SX0) * 64) + dx, py64 = Math.round((predY - i.SY0) * 64) + dy;
        if (px64 < 0 || py64 < 0) continue;
        const cov = clone.coverage(CP, best.em, best.em, px64, py64);
        if (!cov) continue;
        for (let m = 0; m < src.length; m++) {
          const g = cov[m];
          src[m] = g ? (255 * (256 - (g + (g >> 7)))) >> 8 : 255;
        }
        const d = scoreInst(i, src, i.WX.get(best.sx), i.WY.get(best.sy));
        if (!bi || d < bi) bi = d;
      }
    if (bi === null) continue;
    const pb = bi / (i.TW * i.TH);
    perByte.push(pb); tot += bi; n += i.TW * i.TH;
    if (!worstInst || pb > worstInst.pb) worstInst = { k: i.k, pb };
  }
  perByte.sort((a, b) => a - b);
  console.log(`\n  VERIFY on ${perByte.length} markers with pens PREDICTED from that line (±¼ px only):`);
  console.log(`    Σ|Δ| ${tot} over ${n} bytes = ${(tot / n).toFixed(2)} per byte`);
  console.log(`    per-glyph best ${perByte[0].toFixed(2)}  median ${perByte[perByte.length >> 1].toFixed(2)}  ` +
    `worst ${perByte[perByte.length - 1].toFixed(2)} (row ${worstInst.k})`);
  console.log(`    ${tot === 0 ? '*** BYTE-EXACT ACROSS THE PAGE ***'
    : 'not byte-exact — but this number, not the single-glyph one, is what a recipe must drive to 0.'}`);
}
