// payoff.mjs — before you cut a single template, ask the document what the
// job is worth.
//
//   node monospace-lab/payoff.mjs lab/base64/corpus-cour832/EFTA00434905.pdf
//   node monospace-lab/payoff.mjs <pdf> --page 2 --against 3,4,20
//
// Hand-labelling pays off when one cut answers for many cells. That is true
// when the producer snaps pen positions to a lattice — then a character has a
// handful of rasterizations and they repeat all over the corpus. It is FALSE
// when pens land at arbitrary sub-pixel offsets, or when the page has been
// resampled: then every (row, column) is its own rasterization, one cut
// answers for one cell, and a human can spend a day to read a page and a half.
//
// The difference is invisible by eye and expensive to discover by hand, so it
// is measured here instead:
//
//   cuts        distinct byte-identical classes among the page's inked cells
//               — exactly how many times a human must name something
//   reuse       cells ÷ cuts, within the page
//   transfer    how much of ANOTHER page those same cuts already read
//
// Two documents, same corpus family, measured 2026-07-31:
//
//   corpus-cour832/EFTA00434905 p2   240 cuts   5,005 cells   20.9× reuse
//   courir-strech/EFTA02154109  p2 3,759 cuts   3,762 cells    1.00× reuse
//                                              1.8% transfer to p3
//
// The second one is not worth labelling by hand and no amount of patience
// changes that. Run this first.
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePage } from './src/raster-node.mjs';
import { detectRows, detectColumns, calibrate, cellsOf } from './src/lines.mjs';
import { cutBytes } from './src/match.mjs';

const require = createRequire(import.meta.url);
const LAB = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(LAB, '..');
const engine = require(join(REPO, 'engine', 'ocr-engine.js'));

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DOC = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
if (!DOC) { console.error('usage: node monospace-lab/payoff.mjs <pdf> [--page N] [--against 3,4,20]'); process.exit(2); }
const PNO = +opt('page', 2);
const AGAINST = (opt('against', '') || '').split(',').filter(Boolean).map(Number);

function measure(pno) {
  const page = decodePage(resolve(REPO, DOC), pno);
  const det = detectRows(page, engine);
  const col = detectColumns(page, det.mask, det.rows);
  const grid = calibrate(page, det.mask, det.rows, col);
  grid.rowH = det.rowH;
  // one pass: every inked cell's bytes, keyed by identity
  const classes = new Map();                 // bytes -> {n, rows:Set, cols:Set}
  let cells = 0;
  for (const r of det.rows)
    for (const c of cellsOf(page, grid, r)) {
      if (c.x0 < 0 || c.x0 + c.w > page.w) continue;
      const b = cutBytes(page, c.x0, c.y0, c.w, c.h);
      if (b.every(v => v === 255)) continue;
      cells++;
      const k = b.join(',');
      let e = classes.get(k);
      if (!e) classes.set(k, e = { n: 0, rows: new Set(), cols: new Set() });
      e.n++; e.rows.add(r.k); e.cols.add(c.i);
    }
  return { page, det, col, grid, classes, cells };
}

const A = measure(PNO);
console.log(`${DOC} page ${PNO} — ${A.page.w}×${A.page.h}`);
console.log(`  ${A.det.rows.length} rows, row pitch ${A.det.yGrid.pitch.toFixed(4)} (R=${A.det.yGrid.score.toFixed(3)}), ` +
  `column pitch ${A.col.pitch.toFixed(4)} (R=${A.col.score.toFixed(3)})`);
console.log(`\n  inked cells        ${A.cells}`);
console.log(`  cuts needed        ${A.classes.size}`);
console.log(`  reuse              ${(A.cells / A.classes.size).toFixed(2)}× per cut`);

// Where does a rasterization repeat — down a column, along a row, or nowhere?
// This names the reason: a lattice-snapping producer repeats everywhere; an
// unsnapped or resampled one repeats nowhere.
let multi = 0, spanRows = 0, spanCols = 0;
for (const [, e] of A.classes) {
  if (e.n === 1) continue;
  multi++;
  if (e.rows.size > 1) spanRows++;
  if (e.cols.size > 1) spanCols++;
}
console.log(`  classes used twice or more: ${multi} of ${A.classes.size}` +
  ` (${spanRows} span rows, ${spanCols} span columns)`);

for (const pno of AGAINST) {
  let B;
  try { B = measure(pno); } catch (e) { console.log(`  page ${pno}: ${e.message}`); continue; }
  let hit = 0;
  for (const [k, e] of B.classes) if (A.classes.has(k)) hit += e.n;
  console.log(`  transfer to page ${pno}: ${hit} / ${B.cells} cells (${(100 * hit / B.cells).toFixed(1)}%)`);
}

const reuse = A.cells / A.classes.size;
console.log(`\n  ${reuse >= 5
  ? `WORTH LABELLING — ${A.classes.size} cuts read ${A.cells} cells on this page alone.`
  : `NOT WORTH LABELLING BY HAND — ${A.classes.size} cuts for ${A.cells} cells is ${reuse.toFixed(2)}× reuse.\n` +
    `  This producer does not snap pens to a lattice (or the raster was resampled),\n` +
    `  so every cell is its own rasterization. Identify the face instead — see lab/README.md.`}`);
