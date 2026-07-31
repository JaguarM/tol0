// lines.mjs — where the text rows are, and where each character cell is.
//
// The old lab asked the human for `rowBands` and a page-wide `xStart/xEnd`.
// This one asks the page. Three stages, each of which can be inspected in the
// UI before anything is matched:
//
//   1. NON-TEXT OBJECTS. engine/ocr-engine.js `detectObjects` is the repo's
//      one implementation of "this ink is a rule / a redaction box / whitened
//      graphic dust, not a glyph". It is reused, not reimplemented: a
//      letterhead rule left in the ink profile fuses two text rows into one
//      band and drags the row lattice off by half a pitch, which is the exact
//      failure the old lab's hand-tuned `rowBands` existed to paper over.
//   2. ROW LATTICE. Ink bands (`findBands`, same file) are the OBSERVATIONS;
//      the row lattice is fitted to their top edges (lattice.mjs). Rows then
//      come from the lattice, not from the bands — so rows whose bands fused
//      (a descender touching the next row's ascenders, an unmasked speck
//      bridging two lines) still land on their own row, and a row's window is
//      the same height everywhere on the page whatever its tallest glyph is.
//   3. CELL LATTICE. Ink-run starts inside the text rows are the
//      observations; the column lattice is fitted to them. `lead` and `tw`
//      then place the template rect inside each cell — see calibrate().
//
// TEMPLATE RECT = CELL MINUS ONE PIXEL EACH SIDE. At a 7.8 px pitch a glyph's
// AA fringe reaches its neighbour's cell edge, so a template cut to the full
// cell carries a sliver of the letter next to it and matches nothing but its
// own neighbourhood. Every template is cut, and every cell is compared, one
// pixel in from both sides. That is a deliberate hole in the certificate — the
// gutter columns are never verified — and readPage() counts the ink left in
// them so the size of the hole is always on screen.

import { fitLattice, cellX, cellIndex, phaseOf } from './lattice.mjs';

/** Ink test that ignores everything the object detector claimed. */
const isInk = (page, mask, x, y) => page.gray[y * page.w + x] < 255 && !mask[y * page.w + x];

/**
 * Rows of the page: { k, top, h, bands } on a fitted lattice, plus the raw
 * bands and the object mask for the UI to draw.
 *
 * engine = the UMD OCREngine object (window.OCREngine in the browser,
 * require('engine/ocr-engine.js') in Node) — passed in so this module needs no
 * globals and no import path into the reader.
 */
export function detectRows(page, engine, opts = {}) {
  const { mask, objects } = engine.detectObjects(page);
  const bands = engine.findBands(page, mask).map(([top, bot]) => ({ top, bot }));
  const yfit = fitLattice(bands.map(b => b.top), { pMin: 6, pMax: 60, coarse: 0.05, fine: 0.002 });
  if (!yfit.pitch) return { mask, objects, bands, yGrid: yfit, rows: [], rowTop: 0, rowH: 0 };

  // Row window inside one lattice period. Offsets are taken against the
  // lattice so a band that starts late (a row of digits, no ascenders) cannot
  // shrink the window every OTHER row is measured in: the modal offset wins,
  // and the height is the tallest band sharing it (descenders included).
  const offs = new Map();
  for (const b of bands) {
    const o = b.top - (yfit.origin + Math.round((b.top - yfit.origin) / yfit.pitch) * yfit.pitch);
    const key = Math.round(o);
    offs.set(key, (offs.get(key) ?? 0) + 1);
  }
  const rowOff = [...offs.entries()].sort((a, b) => b[1] - a[1])[0][0];
  let rowH = 1;
  for (const b of bands) {
    const o = Math.round(b.top - (yfit.origin + Math.round((b.top - yfit.origin) / yfit.pitch) * yfit.pitch));
    if (o === rowOff) rowH = Math.max(rowH, b.bot - b.top);
  }
  rowH = Math.min(rowH, Math.round(yfit.pitch));

  // Which lattice rows actually carry ink (and which bands feed each row).
  const rows = [];
  const seen = new Map();
  for (const b of bands) {
    const kA = Math.round((b.top - yfit.origin - rowOff) / yfit.pitch);
    const kB = Math.round((b.bot - 1 - yfit.origin - rowOff) / yfit.pitch);
    for (let k = kA; k <= kB; k++) {                 // a fused band feeds every row it spans
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(b);
    }
  }
  for (const k of [...seen.keys()].sort((a, b) => a - b)) {
    const top = Math.round(yfit.origin + rowOff + k * yfit.pitch);
    if (top < 0 || top + rowH > page.h) continue;
    let ink = 0;
    for (let y = top; y < top + rowH; y++)
      for (let x = 0; x < page.w; x++) if (isInk(page, mask, x, y)) ink++;
    if (ink) rows.push({ k, top, h: rowH, ink, bands: seen.get(k) });
  }
  // Ink that no row window covers: a heading at another size, a signature, a
  // caption between paragraphs. Reported, never guessed at.
  const covered = new Uint8Array(page.h);
  for (const r of rows) for (let y = r.top; y < r.top + r.h; y++) covered[y] = 1;
  const strays = bands.filter(b => {
    for (let y = b.top; y < b.bot; y++) if (!covered[y]) return true;
    return false;
  });
  return { mask, objects, bands, yGrid: yfit, rows, rowTop: rowOff, rowH, strays };
}

/**
 * Column lattice, fitted to the ink-run starts inside the detected rows.
 * `lead` and `tw` are then CALIBRATED, not assumed (see calibrate).
 */
export function detectColumns(page, mask, rows, opts = {}) {
  const starts = [];
  for (const r of rows) {
    const col = new Uint8Array(page.w);
    for (let y = r.top; y < r.top + r.h; y++)
      for (let x = 0; x < page.w; x++) if (isInk(page, mask, x, y)) col[x] = 1;
    for (let x = 0, prev = 0; x < page.w; x++) { if (col[x] && !prev) starts.push(x); prev = col[x]; }
  }
  const fit = fitLattice(starts, { pMin: 3, pMax: 24, coarse: 0.02, fine: 0.0005, ...opts });
  return { ...fit, starts: starts.length };
}

/**
 * Place the template rect inside the cell.
 *
 * The column fit's origin is where glyph INK tends to start, which is a pixel
 * or so inside the cell and rounds either way per cell. Rather than assume the
 * offset, try every (lead, tw) in a small window and keep the one that leaves
 * the least ink OUTSIDE the template rects — that ink is exactly what a read
 * can never account for, so minimising it is minimising the unverified part of
 * the page. `twMax` caps the width so the one-pixel gutters survive.
 *
 * WHAT THE ONE-PIXEL CROP COSTS, measured on
 * lab/base64/corpus-cour832/EFTA00434905 p2 (pitch 7.8015, 8-px cells):
 *
 *   template width 6 (a pixel off each side)   240 distinct rasterizations,
 *                                              17,753 px gutter ink, 3,277 dark
 *   template width 7                           271 rasterizations,
 *                                               4,543 px gutter ink,    90 dark
 *   template width 8 (the whole cell)          867 rasterizations, no gutter
 *
 * The full cell is not an option: 867 classes is the neighbour's ink entering
 * the template, and every one of them would be a separate thing for a human to
 * label. Cropping is what makes the job finite. But at width 6 this face loses
 * 3,277 pixels of STROKE, not just fringe — so `tw` is a knob in the toolbar,
 * `gutterDark` is on the certificate panel, and the human decides per document
 * rather than inheriting a number from this comment. Re-measure: it is a
 * property of the face and the pitch, not a constant.
 */
export function calibrate(page, mask, rows, grid, opts = {}) {
  const twMax = opts.twMax ?? Math.max(1, Math.floor(grid.pitch) - 1);
  let best = null;
  for (let lead = -2; lead <= 2; lead++)
    for (let tw = Math.max(1, twMax - 2); tw <= twMax; tw++) {
      const g = { ...grid, lead, tw };
      let out = 0, dark = 0, inside = 0;
      for (const r of rows) {
        const cells = cellsOf(page, g, r);
        const inRect = new Uint8Array(page.w);
        for (const c of cells) for (let x = c.x0; x < c.x0 + c.w; x++) if (x >= 0 && x < page.w) inRect[x] = 1;
        for (let y = r.top; y < r.top + r.h; y++)
          for (let x = 0; x < page.w; x++) {
            if (!isInk(page, mask, x, y)) continue;
            if (inRect[x]) inside++;
            else { out++; if (page.gray[y * page.w + x] < 160) dark++; }
          }
      }
      // ties (common: two leads that both cover everything) go to the widest
      // rect, then to the lead closest to the fitted origin
      const score = [out, -tw, Math.abs(lead)];
      if (!best || score[0] < best.score[0] ||
          (score[0] === best.score[0] && score[1] < best.score[1]) ||
          (score[0] === best.score[0] && score[1] === best.score[1] && score[2] < best.score[2]))
        best = { lead, tw, out, dark, inside, score };
    }
  return { ...grid, lead: best.lead, tw: best.tw,
    gutterInk: best.out, gutterDark: best.dark, cellInk: best.inside };
}

/**
 * The cells of one row: { i, x0, w, phase }. i is the column number counted
 * from the lattice origin, so the same character column has the same index on
 * every row of the page — which is what makes a base64 wall line up.
 */
export function cellsOf(page, grid, row) {
  const iFrom = Math.max(0, cellIndex(grid, 0));
  const iTo = cellIndex(grid, page.w) + 1;
  const cells = [];
  for (let i = iFrom; i <= iTo; i++) {
    const x0 = cellX(grid, i) + (grid.lead ?? 0);
    if (x0 < 0 || x0 + (grid.tw ?? 1) > page.w) continue;
    cells.push({ i, x0, w: grid.tw ?? 1, y0: row.top, h: row.h, phase: phaseOf(grid, i) });
  }
  return cells;
}
