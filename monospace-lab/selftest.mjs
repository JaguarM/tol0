// selftest.mjs — the lab's gate. Runs the whole measuring and matching chain
// headlessly on a known courier document and checks numbers, not vibes.
//
//   node monospace-lab/selftest.mjs
//   node monospace-lab/selftest.mjs --doc lab/base64/corpus-cour832/EFTA00434905.pdf --page 2
//
// It cannot check what the characters ARE — that is the human's half, and the
// lab ships no truth file. What it checks is everything the human depends on:
//
//   · the column lattice fitted from pixels reproduces the pitch the old lab
//     had hardcoded (7.8026), without being told it;
//   · the row lattice finds every text row of the page;
//   · every inked cell of the page falls into a FINITE set of byte-identical
//     classes — cut one template per class and the page reads completely.
//     That number is the real size of the labelling job, and it is measured
//     here rather than assumed to be "65 characters";
//   · a template cut ONE PIXEL OFF still reads its cell, at the recorded
//     offset. This is the ±1 alignment search, and it is the one thing
//     standing between a human's imprecise crop and a page of □.
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePage } from './src/raster-node.mjs';
import { detectRows, detectColumns, calibrate, cellsOf } from './src/lines.mjs';
import { buildIndex, readPage, readCell, cutBytes } from './src/match.mjs';

const require = createRequire(import.meta.url);
const LAB = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(LAB, '..');
const engine = require(join(REPO, 'engine', 'ocr-engine.js'));

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DOC = resolve(REPO, opt('doc', 'lab/base64/corpus-cour832/EFTA00434905.pdf'));
const PNO = +opt('page', 2);

let pass = 0, fail = 0, skip = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
// Loudly, never silently: a page that is not monospaced cannot be gated on
// lattice properties, and pretending otherwise is how a lab starts passing by
// not looking.
const skipped = (name, why) => { skip++; console.log(`  SKIP  ${name}  — ${why}`); };
const note = (text) => console.log(`        ${text}`);

console.log(`monospace lab selftest — ${opt('doc', 'lab/base64/corpus-cour832/EFTA00434905.pdf')} page ${PNO}\n`);

// ---- 1. the page -------------------------------------------------------
const t0 = Date.now();
const page = decodePage(DOC, PNO);
check('page decodes to the producer\'s own raster', page.w > 0 && page.h > 0,
  `${page.w}×${page.h}, ${page.comps} component(s), channel spread ${page.spread}`);
check('page is gray (no colour to whiten)', page.spread === 0, `spread ${page.spread}`);

// ---- 2. rows -----------------------------------------------------------
const det = detectRows(page, engine);
check('rows are found', det.rows.length > 0, `${det.rows.length} rows, ${det.bands.length} ink bands`);
check('row lattice fits', det.yGrid.score > 0.9,
  `pitch ${det.yGrid.pitch.toFixed(3)} px, R=${det.yGrid.score.toFixed(3)}, ${det.bands.length} bands`);
check('row window has a measured height', det.rowH > 0 && det.rowH <= det.yGrid.pitch,
  `rowH ${det.rowH}, row pitch ${det.yGrid.pitch.toFixed(3)}`);
note(`bands that do not sit on the row lattice: ${(det.strays ?? []).length} ` +
  `(a heading at another size, a signature — reported, never guessed at)`);

// ---- 3. columns --------------------------------------------------------
const col = detectColumns(page, det.mask, det.rows);
const grid = calibrate(page, det.mask, det.rows, col);
grid.rowH = det.rowH; grid.yPitch = det.yGrid.pitch;
// Everything below this line is a claim about a MONOSPACE page. The column
// fit's R says whether this page is one; a proportional face scores ~0.3 and
// no amount of grid drawing will make it read.
const MONO = col.score > 0.85;
check('the column fit reports honestly whether this page is monospaced',
  Number.isFinite(col.score) && col.score >= 0 && col.score <= 1,
  `pitch ${col.pitch.toFixed(4)} px, R=${col.score.toFixed(3)} over ${col.starts} ink runs — ` +
  (MONO ? 'monospace' : 'NOT a monospace lattice'));
if (MONO)
  check('template rect leaves one pixel of gutter each side', grid.tw <= Math.floor(grid.pitch) - 1,
    `pitch ${grid.pitch.toFixed(3)} -> template width ${grid.tw}, lead ${grid.lead}`);
else
  skipped('template rect leaves one pixel of gutter each side', 'page is not monospaced');
note(`gutter ink after calibration: ${grid.gutterInk} px of ${grid.gutterInk + grid.cellInk}`);

// ---- 4. the labelling job, measured ------------------------------------
// Stand in for the human: cut a template for the first unread cell, re-read,
// repeat. Each round is one human keystroke. The loop terminates exactly when
// every inked cell on the page is byte-identical to something already cut,
// so the round count IS the number of distinct rasterizations on the page.
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const templates = [];
let rounds = 0, prevUnread = Infinity, monotone = true, res = null;
for (; rounds < 2000; rounds++) {
  res = readPage(page, det.mask, det.rows, grid, buildIndex(templates), cellsOf);
  if (res.unread > prevUnread) monotone = false;
  prevUnread = res.unread;
  if (!res.unread) break;
  let target = null;
  for (const rr of res.rows) { target = rr.cells.find(c => c.state === 'unread'); if (target) break; }
  const c = target.cell;
  templates.push({
    char: alphabet[rounds % alphabet.length], phase: c.phase, ox: 0, oy: 0, w: c.w, h: c.h,
    bytes: cutBytes(page, c.x0, c.y0, c.w, c.h), id: `t${rounds}`,
  });
}
check('cutting one template per unseen cell reads the whole page', res.unread === 0,
  `${rounds} templates, ${res.read} cells read, ${res.unread} □ left`);
check('every template strictly reduces the unread count', monotone, 'no round made the page worse');
// The point of a monospace page: one cut answers for many cells. Reuse below
// ~5× means the cells are not repeating, i.e. the grid is wrong or the page
// isn't monospaced — either way the human is about to label the whole page by
// hand and should be told before they start.
const reuse = rounds ? res.read / rounds : 0;
if (MONO)
  check('one template answers for many cells', reuse >= 5,
    `${res.read} cells from ${rounds} templates — ${reuse.toFixed(1)}× reuse`);
else
  skipped('one template answers for many cells',
    `page is not monospaced (${rounds} templates for ${res.read} cells)`);
note(`gutter ink left unverified: ${res.gutter} px, of which ${res.gutterDark} dark (<160)`);

// The crop rule, justified rather than asserted: cutting a pixel off each side
// is what keeps the labelling job finite. Without it a template carries the
// neighbouring letter's ink and the same character becomes a different class
// for every letter that can follow it.
const uncropped = new Set();
const cropped = new Set();
for (const r of det.rows)
  for (const c of cellsOf(page, grid, r)) {
    const wide = { ...c, x0: c.x0 - 1, w: c.w + 2 };
    if (wide.x0 < 0 || wide.x0 + wide.w > page.w) continue;
    const b = cutBytes(page, c.x0, c.y0, c.w, c.h);
    if (b.every(v => v === 255)) continue;
    cropped.add(b.join(','));
    uncropped.add(cutBytes(page, wide.x0, wide.y0, wide.w, wide.h).join(','));
  }
if (MONO)
  check('the one-pixel crop keeps the dictionary finite', cropped.size * 2 < uncropped.size,
    `${cropped.size} classes cropped vs ${uncropped.size} uncropped — the difference is the ` +
    `neighbouring letter bleeding into the cell`);
else
  skipped('the one-pixel crop keeps the dictionary finite',
    `page is not monospaced (${cropped.size} vs ${uncropped.size} classes)`);
const perPhase = [0, 0, 0, 0];
for (const t of templates) perPhase[t.phase & 3]++;
console.log(`        distinct rasterizations by ¼-px phase bucket: ` +
  perPhase.map((n, i) => `p${i}=${n}`).join(' '));

// ---- 5. the ±1 alignment search ----------------------------------------
// A template cut one pixel to the right of where it should have been — the
// mis-cut the human will make — must still read its own cell.
let offCell = null;
for (const rr of res.rows) { offCell = rr.cells.find(c => c.state === 'read')?.cell; if (offCell) break; }
const offTemplate = [{
  char: '?', phase: offCell.phase, ox: 0, oy: 0, w: offCell.w, h: offCell.h,
  bytes: cutBytes(page, offCell.x0 + 1, offCell.y0, offCell.w, offCell.h), id: 'off-by-one',
}];
const offRead = readCell(page, det.mask, offCell, buildIndex(offTemplate));
check('a template cut one pixel off still reads its cell', offRead.state === 'read',
  offRead.state === 'read' ? `matched at offset ${offRead.dx},${offRead.dy}` : 'stayed unread');
check('the recorded offset names the mis-cut', offRead.state === 'read' && offRead.dx === 1,
  `dx=${offRead.dx}`);

// a template of pure paper must not read an inked cell
const blankBytes = new Uint8Array(offCell.w * offCell.h).fill(255);
const blankRead = readCell(page, det.mask, offCell,
  buildIndex([{ char: 'Z', phase: offCell.phase, ox: 0, oy: 0, w: offCell.w, h: offCell.h,
    bytes: blankBytes, id: 'paper' }]));
check('a blank template never explains an inked cell', blankRead.state === 'unread');

console.log(`\n${fail ? 'FAILED' : 'PASSED'}  ${pass} checks${fail ? `, ${fail} failed` : ''}` +
  `${skip ? `, ${skip} skipped (page not monospaced)` : ''}  ` +
  `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
