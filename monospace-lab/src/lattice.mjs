// lattice.mjs — measuring a monospace document's grid FROM ITS PIXELS.
//
// A monospaced page is a rigid lattice in both axes: character origins sit at
// x = ox + k·px, text rows at y = oy + k·py. The old lab wrote those numbers
// down (`xStart = 60`, `charPitch = (653-60)/76`, `rowBands` hardcoded) and
// every new document needed the file edited. Nothing here is written down:
// both lattices are fitted to the page's own ink, and the fit reproduces the
// old constants on the document they came from (7.8026 -> 7.802 measured).
//
// THE FIT. For a candidate pitch p, project every observation x onto the unit
// circle at angle 2πx/p. If p is the true pitch the angles pile up and the
// resultant length R ≈ 1; the resultant's argument gives the origin for free.
// One pass per candidate p, no origin search. (This is the circular-statistics
// "phase coherence" estimator; a least-squares grid fit would need a nested
// origin search per p to say the same thing.)
//
// HARMONICS. If p fits, so does p/2, p/3, … — every observation near a
// multiple of p is also near a multiple of p/2. R cannot tell them apart, so
// the estimator takes the LARGEST pitch whose R is within `harmTol` of the
// best. A true 2p never survives that (half the observations land mid-cell and
// R collapses), so the rule only ever removes the sub-harmonics.
//
// DOM-free and dependency-free: the browser UI and any Node script import the
// same functions.

// Resultant length + origin for one candidate pitch.
function coherence(xs, p) {
  let S = 0, C = 0;
  const k = 2 * Math.PI / p;
  for (let i = 0; i < xs.length; i++) { const a = k * xs[i]; S += Math.sin(a); C += Math.cos(a); }
  const R = Math.hypot(S, C) / xs.length;
  let o = Math.atan2(S, C) / (2 * Math.PI) * p;
  if (o < 0) o += p;
  return { R, o };
}

/**
 * Fit a 1-D lattice to observations (ink-run start columns, band top rows, …).
 * Returns { pitch, origin, score, n } — origin ∈ [0, pitch), score = R ∈ [0,1].
 * score is the honest quality number: a page that is not monospaced at all
 * scores low and the caller should say so rather than draw a grid over it.
 */
export function fitLattice(xs, opts = {}) {
  const { pMin = 3, pMax = 20, coarse = 0.02, fine = 0.0005, harmTol = 0.03 } = opts;
  if (xs.length < 8) return { pitch: 0, origin: 0, score: 0, n: xs.length };
  // coarse sweep, keeping local maxima only — the refine pass is 40× finer and
  // running it everywhere would cost 40× for no new answers
  const peaks = [];
  let prev2 = -1, prev1 = -1, prevP = 0;
  for (let p = pMin; p <= pMax + 1e-9; p += coarse) {
    const R = coherence(xs, p).R;
    if (prev1 > prev2 && prev1 >= R) peaks.push(prevP);
    prev2 = prev1; prev1 = R; prevP = p;
  }
  if (!peaks.length) peaks.push((pMin + pMax) / 2);
  // refine each peak on the fine grid
  const cands = [];
  for (const p0 of peaks) {
    let best = null;
    for (let p = p0 - coarse; p <= p0 + coarse; p += fine) {
      if (p < pMin || p > pMax) continue;
      const { R, o } = coherence(xs, p);
      if (!best || R > best.score) best = { pitch: p, origin: o, score: R };
    }
    if (best) cands.push(best);
  }
  const top = cands.reduce((a, b) => (b.score > a.score ? b : a));
  // harmonic rule: largest pitch that scores as well as the best one
  const winner = cands
    .filter(c => c.score >= top.score - harmTol)
    .reduce((a, b) => (b.pitch > a.pitch ? b : a));
  return { pitch: winner.pitch, origin: winner.origin, score: winner.score, n: xs.length };
}

/** Column of the k-th cell on lattice (origin, pitch). */
export const cellX = (grid, k) => Math.round(grid.origin + k * grid.pitch);

/** Cell index whose origin is nearest x. */
export const cellIndex = (grid, x) => Math.round((x - grid.origin) / grid.pitch);

/**
 * The ¼-px phase bucket of cell k — the "4 buckets of letters".
 *
 * Pens snap to the ¼-px lattice (docs/LAWS.md), so a glyph has exactly four
 * distinct rasterizations and which one a cell carries is fixed by the
 * fractional part of its origin. A template cut from a bucket-2 cell can only
 * ever match bucket-2 cells; the coverage panel counts per bucket for exactly
 * that reason.
 */
export function phaseOf(grid, k) {
  const f = (grid.origin + k * grid.pitch) % 1;
  return (Math.round((f < 0 ? f + 1 : f) * 4) & 3);
}
