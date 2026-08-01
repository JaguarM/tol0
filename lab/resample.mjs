// resample.mjs — before any face is tried: did these pixels go through a
// resampler, and WHICH WAY?
//
// Up and down are different in KIND, not degree — that asymmetry is what makes
// the question measurable at all:
//
//   · an UPSCALE cannot invent detail. A glyph blown up ×s is band-limited (no
//     energy above 1/s of the new Nyquist), its edge ramps are ~s px wide
//     where a native render puts a single AA pixel, nearest-neighbour leaves
//     runs of byte-identical pixels, and interpolating kernels leave periodic
//     correlations between pixels — the Popescu–Farid / Gallagher signature,
//     from which the factor itself can be read.
//   · a properly filtered DOWNSCALE compresses real detail down to the new
//     grid: full-bandwidth spectrum, ~1 px edges — by every signal above it is
//     INDISTINGUISHABLE from a native render. What betrays it is arithmetic,
//     not spectra: averaging emits byte values the producer's blend law cannot
//     (fz cannot write 127 over paper — the one-number test in families.mjs
//     `page-downscale-816x1073`), and every cell becomes its own rasterization.
//
// The honest contract, then: this tool PROVES upscaling when it is there and
// estimates the factor; refutes it when it is not; and for the
// downscale-vs-native split it measures the averaging fingerprint and defers
// to the raster-uniqueness tests that close it. Every signal is measured and
// judged PER AXIS — a fax pipeline or a stamp-strip compositor resamples
// height without touching width, and a pooled verdict would average the tell
// away. The typographic cue (hinted chunky letterforms at a size where the
// real face shows detail) is real but not automated here.
//
// Every negative verdict ships with its own positive controls: the SAME page
// is synthetically resampled (bilinear ×2 both axes, nearest ×2, and a mild
// y-only stretch — the 816×1073 family's original suspicion) and re-measured.
// If a twin fails to fire its detector, the tool says so and the negative
// verdict is not to be trusted. Known blind spots, per the literature and
// worth repeating: heavy JPEG, sharpening and AI upscalers muddy every
// spectral/edge signal (an AI upscale defeats them outright), and smooth
// factors ≲1.2 sit below the ramp/spectrum floor — only the periodicity probe
// can catch those.
//
// Why a tenth lab file: no existing tool owns the pre-hunt question "is this a
// 1× render at all?". sweep/identify assume yes and burn hours when it is
// false — the 816×1073 family cost repeated full-roster hunts before its
// fingerprint was found. This is the ~40 s gate that routes between hunting a
// face and reproducing a pipeline.
//
//   node lab/resample.mjs <pdf> [--page N] [--stretch f] [--no-twins]
//
// One page is enough for a verdict. ~40 s with twins.
import * as mupdf from 'mupdf';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const PDF = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
if (!PDF) { console.error('usage: node lab/resample.mjs <pdf> [--page N] [--stretch f] [--no-twins]'); process.exit(2); }
const PNO = +opt('page', 1);
const STRETCH = +opt('stretch', 1073 / 1056);   // the family's 17-row growth, as a factor
const TWINS = !argv.includes('--no-twins');

// Thresholds. Calibrated 2026-07-31 on corpus-cour832/EFTA00434905 p2 — a
// PROVEN native ¼-px render (reads at tol 0) — against its own synthetic
// twins; the calibration numbers are printed by every run (the control block
// below), so re-measuring them is free and the constants here are copies
// (METHOD rule 1).
const THR = {
  ramp: 2.0,       // mean edge-ramp px; native measures 1.5/1.7, bilinear ×2 blows past 7
  f95: 0.30,       // c/px; native fills to 0.44–0.46, ×2 ceilings at 0.19–0.20
  nn: 0.30,        // equal-mid-gray neighbour fraction; native 3.5–8.9%, NN ×2 ≥52%
  dupFrac: 0.05,   // duplicated adjacent rows/cols as a FRACTION of band rows/cols.
                   // A count was a trap the control caught: Courier stems duplicate
                   // 43 whole columns on a page that was never resampled (0.1% of
                   // 45k band columns); NN ×2 duplicates 39%.
  xnull: 8,        // periodicity peak strength ×median to count at all
};

// ---- decode: the producer's own raster --------------------------------------
// Duplicated from ingest.mjs on purpose (see its header: twelve duplicated
// lines are cheaper than a root ↔ lab import). Largest image XObject, decoded
// not rendered.
function decodeGray(path, pno) {
  const doc = mupdf.PDFDocument.openDocument(readFileSync(path), 'application/pdf');
  const nPages = doc.countPages();
  if (pno < 1 || pno > nPages) throw new Error(`page ${pno} of ${nPages}`);
  const page = doc.loadPage(pno - 1);
  let best = null, bp = -1;
  page.getObject()?.get('Resources')?.get('XObject')?.forEach?.(val => {
    try {
      const im = val.isIndirect?.() ? val.resolve() : val;
      if (im.get('Subtype')?.asName?.() !== 'Image') return;
      const px = (im.get('Width')?.asNumber?.() ?? 0) * (im.get('Height')?.asNumber?.() ?? 0);
      if (px > bp) { bp = px; best = val; }
    } catch { /* malformed entry: not the page image */ }
  });
  if (!best) return null;                        // vector page — out of scope
  const pix = doc.loadImage(best).toPixmap();
  const w = pix.getWidth(), h = pix.getHeight(), n = pix.getNumberOfComponents();
  const s = pix.getPixels();
  const gray = new Uint8Array(w * h);
  if (n === 1) gray.set(s.subarray(0, w * h));
  else for (let i = 0; i < w * h; i++)
    gray[i] = Math.round((s[i * n] + s[i * n + 1] + s[i * n + 2]) / 3);
  return { w, h, gray, nPages };
}

// ---- text bands --------------------------------------------------------------
function findBands(buf) {
  const { w, h, gray } = buf, bands = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    let on = false;
    if (y < h) { const o = y * w; for (let x = 0; x < w; x++) if (gray[o + x] < 255) { on = true; break; } }
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      const b = { top: start, bot: y, x0: w, x1: -1 };
      for (let yy = start; yy < y; yy++) {
        const o = yy * w;
        for (let x = 0; x < w; x++) if (gray[o + x] < 255) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; }
      }
      if (y - start >= 2 && y - start <= 64 && b.x1 - b.x0 >= 40) bands.push(b);
      start = -1;
    }
  }
  return bands;
}

// ---- text-lattice pitches, measured from GEOMETRY ---------------------------
// The periodicity detector must not flag the text's own periods (char pitch,
// line pitch, their harmonics). Measuring those pitches from the same spectrum
// being flagged is circular — the control caught it: the d2 profile's
// strongest x peak is pitch/2, not pitch, so a spectrum-derived "dominant"
// starred the wrong peak and let a line-pitch/4 harmonic through as a flag.
// So the pitches come from geometry instead: circular coherence over ink-run
// start columns (x) and band tops (y), with the largest-pitch-within-tolerance
// rule, since a true lattice scores identically at p/2, p/3.
function circFit(xs, pMin, pMax) {
  if (xs.length < 8) return 0;
  const cands = [];
  let bestR = 0;
  for (let p = pMin; p <= pMax; p += 0.01) {
    let S = 0, C = 0;
    for (const x of xs) { const a = 2 * Math.PI * x / p; S += Math.sin(a); C += Math.cos(a); }
    const R = Math.hypot(S, C) / xs.length;
    cands.push([p, R]);
    if (R > bestR) bestR = R;
  }
  let pick = 0;
  for (const [p, R] of cands) if (R >= bestR - 0.03 && p > pick) pick = p;
  return pick;
}
function measurePitches(buf, bands) {
  const starts = [];
  for (const b of bands) {
    const col = new Uint8Array(buf.w);
    for (let y = b.top; y < b.bot; y++)
      for (let x = b.x0; x <= b.x1; x++) if (buf.gray[y * buf.w + x] < 255) col[x] = 1;
    for (let x = b.x0, prev = 0; x <= b.x1; x++) { if (col[x] && !prev) starts.push(x); prev = col[x]; }
  }
  return { xp: circFit(starts, 3, 30), yp: circFit(bands.map(b => b.top), 8, 40) };
}

// ---- signal 1: edge ramp width ----------------------------------------------
// Count of intermediate-gray pixels between paper (255) and stroke core
// (≤96), per crossing, both directions. An upscale by s multiplies this by ~s.
function edgeRamps(buf, bands) {
  const CORE = 96;
  const collect = (out, get, len) => {
    let last = 'white', mids = 0;
    for (let i = 0; i < len; i++) {
      const v = get(i);
      if (v === 255) { if (last === 'core') out.push(Math.min(mids, 15)); last = 'white'; mids = 0; }
      else if (v <= CORE) { if (last === 'white') out.push(Math.min(mids, 15)); last = 'core'; mids = 0; }
      else mids++;
    }
  };
  const rx = [], ry = [];
  for (const b of bands) {
    const xa = Math.max(0, b.x0 - 2), xb = Math.min(buf.w - 1, b.x1 + 2);
    for (let y = b.top; y < b.bot; y++)
      collect(rx, i => buf.gray[y * buf.w + xa + i], xb - xa + 1);
    const ya = Math.max(0, b.top - 2), yb = Math.min(buf.h - 1, b.bot + 2);
    for (let x = b.x0; x <= b.x1; x++)
      collect(ry, i => buf.gray[(ya + i) * buf.w + x], yb - ya + 1);
  }
  const stats = a => {
    if (!a.length) return { mean: 0, p90: 0, n: 0 };
    const s = [...a].sort((p, q) => p - q);
    return { mean: a.reduce((x, y) => x + y, 0) / a.length, p90: s[Math.floor(0.9 * (s.length - 1))], n: a.length };
  };
  return { x: stats(rx), y: stats(ry) };
}

// ---- signal 2: exact duplication (nearest-neighbour) ------------------------
function duplication(buf, bands) {
  const { w, gray } = buf;
  let mid = 0, eqx = 0, eqy = 0, dupRows = 0, dupCols = 0;
  for (const b of bands) {
    for (let y = b.top; y < b.bot; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        const v = gray[y * w + x];
        if (v < 1 || v > 254) continue;          // paper and saturated core prove nothing
        mid++;
        if (x < b.x1 && gray[y * w + x + 1] === v) eqx++;
        if (y < b.bot - 1 && gray[(y + 1) * w + x] === v) eqy++;
      }
    for (let y = b.top; y < b.bot - 1; y++) {    // whole duplicated scanlines
      let same = true, ink = false;
      for (let x = b.x0; x <= b.x1; x++) {
        const a = gray[y * w + x];
        if (a !== gray[(y + 1) * w + x]) { same = false; break; }
        if (a < 255) ink = true;
      }
      if (same && ink) dupRows++;
    }
    for (let x = b.x0; x < b.x1; x++) {
      let same = true, ink = false;
      for (let y = b.top; y < b.bot; y++) {
        const a = gray[y * w + x];
        if (a !== gray[y * w + x + 1]) { same = false; break; }
        if (a < 255) ink = true;
      }
      if (same && ink) dupCols++;
    }
  }
  return { mid, eqx: mid ? eqx / mid : 0, eqy: mid ? eqy / mid : 0, dupRows, dupCols };
}

// ---- signal 3: spectral occupancy (Welch) -----------------------------------
// f95 = frequency below which 95% of AC power sits. A native render fills the
// band; an upscale by s ceilings near 0.5/s.
const N = 128, HALF = 64;
let COS = null, SIN = null, HANN = null;
function initTables() {
  if (COS) return;
  COS = []; SIN = [];
  for (let k = 1; k <= HALF; k++) {
    const c = new Float64Array(N), s = new Float64Array(N);
    for (let n = 0; n < N; n++) { c[n] = Math.cos(2 * Math.PI * k * n / N); s[n] = Math.sin(2 * Math.PI * k * n / N); }
    COS.push(c); SIN.push(s);
  }
  HANN = new Float64Array(N);
  for (let n = 0; n < N; n++) HANN[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (N - 1)));
}
function spectrum(buf, bands, axis) {
  initTables();
  const acc = new Float64Array(HALF), seg = new Float64Array(N);
  let nseg = 0;
  const feed = (get, len) => {
    for (let s0 = 0; s0 + N <= len; s0 += N) {
      let ink = 0;
      for (let n = 0; n < N; n++) { seg[n] = get(s0 + n); if (seg[n] < 255) ink++; }
      if (ink < 10) continue;
      let m = 0; for (let n = 0; n < N; n++) m += seg[n];
      m /= N;
      for (let n = 0; n < N; n++) seg[n] = (seg[n] - m) * HANN[n];
      for (let k = 0; k < HALF; k++) {
        let re = 0, im = 0;
        const ct = COS[k], st = SIN[k];
        for (let n = 0; n < N; n++) { re += seg[n] * ct[n]; im += seg[n] * st[n]; }
        acc[k] += re * re + im * im;
      }
      nseg++;
    }
  };
  if (axis === 'x') {
    for (const b of bands)
      for (let y = b.top; y < b.bot; y++) feed(i => buf.gray[y * buf.w + b.x0 + i], b.x1 - b.x0 + 1);
  } else {
    const x0 = Math.min(...bands.map(b => b.x0)), x1 = Math.max(...bands.map(b => b.x1));
    for (let x = x0; x <= x1; x += 2) feed(i => buf.gray[i * buf.w + x], buf.h);
  }
  const total = acc.reduce((a, b) => a + b, 0);
  if (!total) return { f95: 0, hi: 0, nseg };
  let cum = 0, f95 = 0.5;
  for (let k = 0; k < HALF; k++) { cum += acc[k]; if (cum >= 0.95 * total) { f95 = (k + 1) / N; break; } }
  let hi = 0;
  for (let k = 0; k < HALF; k++) if ((k + 1) / N >= 0.30) hi += acc[k];
  return { f95, hi: hi / total, nseg };
}

// ---- signal 4: interpolation periodicity (Gallagher 2005) -------------------
// |second difference| averaged along the other axis; a resampler's phase
// pattern makes it periodic in the resample grid. Text is periodic too (char
// pitch, line pitch), so the dominant structural period and its harmonics are
// marked and never flagged — everything else strong is a resampler talking.
function d2profile(buf, bands, axis) {
  if (axis === 'x') {
    const x0 = Math.min(...bands.map(b => b.x0)) + 1, x1 = Math.max(...bands.map(b => b.x1)) - 1;
    const v = new Float64Array(x1 - x0 + 1);
    let rows = 0;
    for (const b of bands)
      for (let y = b.top; y < b.bot; y++, rows++) {
        const o = y * buf.w;
        for (let x = x0; x <= x1; x++)
          v[x - x0] += Math.abs(buf.gray[o + x - 1] - 2 * buf.gray[o + x] + buf.gray[o + x + 1]);
      }
    for (let i = 0; i < v.length; i++) v[i] /= Math.max(1, rows);
    return v;
  }
  const x0 = Math.min(...bands.map(b => b.x0)), x1 = Math.max(...bands.map(b => b.x1));
  const v = new Float64Array(buf.h - 2);
  const nc = Math.floor((x1 - x0) / 2) + 1;
  for (let y = 1; y < buf.h - 1; y++) {
    let s = 0;
    for (let x = x0; x <= x1; x += 2)
      s += Math.abs(buf.gray[(y - 1) * buf.w + x] - 2 * buf.gray[y * buf.w + x] + buf.gray[(y + 1) * buf.w + x]);
    v[y - 1] = s / nc;
  }
  return v;
}
function periodogram(v, pMax) {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const grid = [];
  for (let p = 1.6; p <= Math.min(20, pMax); p += 0.01) grid.push(p);
  for (let p = 20.05; p <= pMax; p += 0.05) grid.push(p);
  const amp = p => {
    let re = 0, im = 0;
    const k = 2 * Math.PI / p;
    for (let i = 0; i < v.length; i++) { const d = v[i] - m; re += d * Math.cos(k * i); im += d * Math.sin(k * i); }
    return 2 * Math.hypot(re, im) / v.length;
  };
  const A = grid.map(amp);
  const nul = [...A].sort((a, b) => a - b)[Math.floor(A.length / 2)] || 1e-9;
  const peaks = [];
  for (let i = 1; i < grid.length - 1; i++)
    if (A[i] >= A[i - 1] && A[i] >= A[i + 1]) peaks.push({ p: grid[i], a: A[i] });
  peaks.sort((a, b) => b.a - a.a);
  const keep = [];
  for (const pk of peaks) {
    if (keep.every(q => Math.abs(q.p - pk.p) > 0.025 * q.p)) keep.push(pk);
    if (keep.length >= 6) break;
  }
  return { nul, peaks: keep, amp };
}
// structural = within 3% of pitch·k/m, k ≤ 5, m ≤ 4. The k/m grid is kept
// deliberately COARSE: with m up to 7 the family reaches 14.33·4/7 = 8.19,
// within tolerance of the 8.00 px probe the 8:25 downscale family predicts —
// a dense rational grid can excuse any number, which is no exclusion at all.
function markStructuralFamily(g, pitch) {
  for (const pk of g.peaks) {
    pk.structural = false;
    if (!pitch) continue;
    for (let k = 1; k <= 5 && !pk.structural; k++)
      for (let m = 1; m <= 4; m++) {
        const h = pitch * k / m;
        if (Math.abs(pk.p - h) <= 0.03 * h) { pk.structural = true; break; }
      }
  }
}

// ---- signal 5: the averaging fingerprint ------------------------------------
// fz over paper cannot emit byte 127 (families.mjs). Any real rate of 127s in
// glyph ink means the bytes were AVERAGED after rendering — the downscale
// tell. Scoped to the fz-law family; a producer under a different blend law
// could emit 127 natively and this number would prove nothing there.
function unreachable127(buf, bands) {
  let ink = 0, bad = 0;
  for (const b of bands)
    for (let y = b.top; y < b.bot; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        const v = buf.gray[y * buf.w + x];
        if (v === 255) continue;
        ink++;
        if (v === 127) bad++;
      }
  return { ink, bad, rate: ink ? bad / ink : 0 };
}

// ---- the battery -------------------------------------------------------------
const pct = v => (100 * v).toFixed(1) + '%';
function battery(buf, label, probes, brief = false) {
  const bands = findBands(buf);
  if (!bands.length) { console.log(`  ${label}: no text bands`); return null; }
  const pitches = measurePitches(buf, bands);
  const ramp = edgeRamps(buf, bands);
  const dup = duplication(buf, bands);
  const sx = spectrum(buf, bands, 'x'), sy = spectrum(buf, bands, 'y');
  const gx = periodogram(d2profile(buf, bands, 'x'), 40);
  const gy = periodogram(d2profile(buf, bands, 'y'), 130);
  markStructuralFamily(gx, pitches.xp);          // char-pitch family
  markStructuralFamily(gy, pitches.yp);          // line-pitch family
  const u = unreachable127(buf, bands);
  let totRows = 0, totCols = 0;
  for (const b of bands) { totRows += b.bot - b.top; totCols += b.x1 - b.x0 + 1; }
  const dupColFrac = totCols ? dup.dupCols / totCols : 0;
  const dupRowFrac = totRows ? dup.dupRows / totRows : 0;

  // per-axis flags — a height-only pipeline must not hide behind a clean width
  const flags = { x: [], y: [] };
  if (dup.eqx >= THR.nn || dupColFrac >= THR.dupFrac)
    flags.x.push(`nearest-neighbour (equal-mid pairs ${pct(dup.eqx)}, duplicated cols ${pct(dupColFrac)})`);
  if (dup.eqy >= THR.nn || dupRowFrac >= THR.dupFrac)
    flags.y.push(`nearest-neighbour (equal-mid pairs ${pct(dup.eqy)}, duplicated rows ${pct(dupRowFrac)})`);
  if (ramp.x.mean >= THR.ramp && sx.f95 <= THR.f95)
    flags.x.push(`smooth upscale ≈ ×${(0.45 / sx.f95).toFixed(1)} from the spectral ceiling (ramp ${ramp.x.mean.toFixed(2)} px, f95 ${sx.f95.toFixed(3)})`);
  if (ramp.y.mean >= THR.ramp && sy.f95 <= THR.f95)
    flags.y.push(`smooth upscale ≈ ×${(0.45 / sy.f95).toFixed(1)} from the spectral ceiling (ramp ${ramp.y.mean.toFixed(2)} px, f95 ${sy.f95.toFixed(3)})`);
  const perFlags = { x: [], y: [] };
  for (const [axis, g] of [['x', gx], ['y', gy]])
    for (const pk of g.peaks)
      if (!pk.structural && pk.a / g.nul >= THR.xnull)
        perFlags[axis].push(`periodic resampler correlation at ${pk.p.toFixed(2)} px (×${(pk.a / g.nul).toFixed(1)})`);

  const fmtPeaks = g => g.peaks.map(pk =>
    `${pk.p.toFixed(2)}×${(pk.a / g.nul).toFixed(1)}${pk.structural ? '*' : ''}`).join(' ');
  const fmtProbes = (g, ps) => ps.map(p => `${p.toFixed(2)}→×${(g.amp(p) / g.nul).toFixed(1)}`).join(' ');

  console.log(`  ${label} — ${buf.w}×${buf.h}, ${bands.length} bands · measured pitch x ${pitches.xp.toFixed(2)} y ${pitches.yp.toFixed(2)} px`);
  console.log(`    x: ramp ${ramp.x.mean.toFixed(2)} px (p90 ${ramp.x.p90}, n ${ramp.x.n}) · eq-mid ${pct(dup.eqx)} dup-cols ${dup.dupCols} · ` +
    `f95 ${sx.f95.toFixed(3)} hi ${pct(sx.hi)} · d2 ${fmtPeaks(gx)} · probes ${fmtProbes(gx, probes.x)}`);
  console.log(`    y: ramp ${ramp.y.mean.toFixed(2)} px (p90 ${ramp.y.p90}, n ${ramp.y.n}) · eq-mid ${pct(dup.eqy)} dup-rows ${dup.dupRows} · ` +
    `f95 ${sy.f95.toFixed(3)} hi ${pct(sy.hi)} · d2 ${fmtPeaks(gy)} · probes ${fmtProbes(gy, probes.y)}`);
  if (!brief)
    console.log(`    fz-unreachable bytes (127): ${u.bad} of ${u.ink} ink px = ${pct(u.rate)}` +
      `  [averaging fingerprint — meaningful only for fz-law producers]`);
  return { bands, ramp, dup, sx, sy, gx, gy, u, flags, perFlags };
}

// ---- synthetic twins ---------------------------------------------------------
function bilinear(buf, fx, fy) {
  const w2 = Math.round(buf.w * fx), h2 = Math.round(buf.h * fy);
  const g = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    const sy = Math.min(buf.h - 1, Math.max(0, (y + 0.5) / fy - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(buf.h - 1, y0 + 1), wy = sy - y0;
    for (let x = 0; x < w2; x++) {
      const sx = Math.min(buf.w - 1, Math.max(0, (x + 0.5) / fx - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(buf.w - 1, x0 + 1), wx = sx - x0;
      g[y * w2 + x] = Math.round(
        buf.gray[y0 * buf.w + x0] * (1 - wx) * (1 - wy) + buf.gray[y0 * buf.w + x1] * wx * (1 - wy) +
        buf.gray[y1 * buf.w + x0] * (1 - wx) * wy + buf.gray[y1 * buf.w + x1] * wx * wy);
    }
  }
  return { w: w2, h: h2, gray: g };
}
function nearest(buf, fx, fy) {
  const w2 = Math.round(buf.w * fx), h2 = Math.round(buf.h * fy);
  const g = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    const sy = Math.min(buf.h - 1, Math.floor(y / fy));
    for (let x = 0; x < w2; x++)
      g[y * w2 + x] = buf.gray[sy * buf.w + Math.min(buf.w - 1, Math.floor(x / fx))];
  }
  return { w: w2, h: h2, gray: g };
}

// ---- run ---------------------------------------------------------------------
const page = decodeGray(PDF, PNO);
if (!page) { console.error('no embedded image on this page — vector text, out of scope'); process.exit(3); }
const PSTRETCH = STRETCH / (STRETCH - 1);        // interpolation phase period of the y-stretch
const probes = { x: [8], y: [8, PSTRETCH] };     // 8 = the 8:25 family's aligned period
console.log(`${PDF} page ${PNO} of ${page.nPages}\n`);
const res = battery(page, 'measured page', probes);
if (!res) process.exit(3);

// A stretch's periodicity peak wanders a little (integer height rounding
// changes the ACTUAL factor a twin implements; profile edge effects shift a
// peak a fraction of a bin), so probes are judged on the windowed max ±1.5 px.
const probeMax = (g, p) => {
  let best = 0;
  for (let q = Math.max(2, p - 1.5); q <= p + 1.5; q += 0.05) best = Math.max(best, g.amp(q) / g.nul);
  return best;
};

let selfOK = true;
if (TWINS) {
  console.log(`\n  synthetic positive controls, built from this very page — each must fire or the negative verdict is untrusted:`);
  const t2 = battery(bilinear(page, 2, 2), 'bilinear ×2 (both axes)', probes, true);
  const t2fire = t2 && (t2.flags.x.length + t2.flags.y.length > 0 ||
    t2.gx.amp(2) / t2.gx.nul >= THR.xnull || t2.gy.amp(2) / t2.gy.nul >= THR.xnull);
  const tn = battery(nearest(page, 2, 2), 'nearest ×2 (both axes)', probes, true);
  const tnfire = tn && (tn.flags.x.length + tn.flags.y.length > 0);
  // the twin's height rounds to an integer, so its ACTUAL factor (and true
  // period) differ slightly from the requested one — probe what it actually is
  const tsBuf = bilinear(page, 1, STRETCH);
  const fAct = tsBuf.h / page.h, pAct = fAct / (fAct - 1);
  const ts = battery(tsBuf, `bilinear y-only stretch ×${fAct.toFixed(5)} (as rounded)`,
    { x: probes.x, y: [8, pAct] }, true);
  const tsAmp = ts ? probeMax(ts.gy, pAct) : 0;
  const tsfire = tsAmp >= 6;
  console.log(`    self-check: bilinear×2 ${t2fire ? '✓ fires' : '✗ SILENT'} · nearest×2 ${tnfire ? '✓ fires' : '✗ SILENT'} · ` +
    `y-stretch ${tsfire ? `✓ fires (probe ${pAct.toFixed(2)}±1.5 ×${tsAmp.toFixed(1)})` : `✗ SILENT (probe ${pAct.toFixed(2)}±1.5 ×${tsAmp.toFixed(1)})`}`);
  selfOK = !!(t2fire && tnfire && tsfire);
  if (!selfOK) console.log(`    *** SELF-CHECK FAILED — the detectors did not fire on known positives from this page; do not trust a negative verdict below. ***`);
}

console.log('\n  verdict, per axis:');
for (const axis of ['x', 'y']) {
  const up = res.flags[axis], per = res.perFlags[axis];
  if (up.length) console.log(`    ${axis}: UPSCALED — ${up.join('; ')}`);
  else if (per.length) console.log(`    ${axis}: no upscale signature, but ${per.join('; ')} — a rational-factor resample left its grid here`);
  else console.log(`    ${axis}: no upscale signature (edges ~${res.ramp[axis].mean.toFixed(1)} px, spectrum to ${(axis === 'x' ? res.sx : res.sy).f95.toFixed(2)} c/px)`);
}
const anyUp = res.flags.x.length + res.flags.y.length > 0;
if (!anyUp) {
  if (res.u.rate >= 0.001)
    console.log(`    ⇒ full bandwidth + averaging fingerprint (${pct(res.u.rate)} unreachable bytes): ` +
      `these pixels were AVERAGED but not upscaled — a DOWNSCALE from a higher-resolution render ` +
      `(or a 1× blur; raster-uniqueness in families.mjs splits those).`);
  else
    console.log(`    ⇒ no resample signature at all: a native render, or a filtered downscale under a ` +
      `non-fz blend law this tool cannot see. The raster-uniqueness fingerprints (families.mjs) decide.`);
}
const pr = probeMax(res.gy, PSTRETCH);
console.log(`    the ×${STRETCH.toFixed(5)} y-stretch hypothesis specifically: probe ${PSTRETCH.toFixed(2)}±1.5 px → ×${pr.toFixed(1)}` +
  (TWINS ? (pr < 4 && selfOK ? ` while the stretch twin fires — REFUTED` : pr >= 6 ? ` — SUPPORTED` : ` — inconclusive`) : ''));
