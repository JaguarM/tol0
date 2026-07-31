// match.mjs — the matcher, the template store's read side, and the page read.
//
// A cell READS when some template reproduces its pixels BYTE FOR BYTE. Not
// "best correlation", not "close enough": every byte of the template rect
// equals every byte of the page under it, or the cell stays an honest □ with
// coordinates. NCC survives here only as a SUGGESTION shown to the human in
// the labelling modal (nccRank) — it never decides anything, because a wrong
// glyph scores 0.9 as happily as the right one.
//
// THE ±1 SEARCH. Templates are cut by a human out of a page, and a cut is not
// reliably placed to the pixel — nor is the fitted cell origin, which rounds
// either way at a 7.802 px pitch. So a template is tried at its nominal
// position and at each of the eight neighbouring pixel offsets: three
// positions across, three down. A cut that is one pixel off still reads, and
// the offset that hit is recorded per cell, so a template that only ever hits
// at dx=+1 is visible as a mis-cut to fix rather than a mystery.
//
// This is a tolerance on POSITION, never on VALUE. The compared bytes are
// still compared exactly, which is what keeps the match uninventable: there is
// no dial here that can be turned to make a stubborn document read.
//
// WHY IT IS FAST. Nine offsets × every template × every cell would be minutes
// per page. Instead each template is hashed once, and each cell hashes the
// nine windows under it and looks them up — nine hashes and nine map probes
// per cell, independent of how many templates exist. Every hash hit is then
// verified byte by byte, so a collision costs a compare and can never produce
// a false read.

const OFFSETS = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

function fnv1a(page, x0, y0, w, h) {
  let hash = 0x811c9dc5;
  for (let y = y0; y < y0 + h; y++) {
    let o = y * page.w + x0;
    for (let x = 0; x < w; x++) {
      hash ^= page.gray[o + x];
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

function fnv1aBytes(bytes) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { hash ^= bytes[i]; hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}

/**
 * Index templates for lookup: geometry -> hash -> templates.
 * Geometry is (ox, oy, w, h) — the rect relative to a cell's origin. Human
 * nudges create new geometries; each is probed separately, which is the whole
 * cost of letting a human move a crop.
 */
export function buildIndex(templates) {
  const geos = new Map();
  for (const t of templates) {
    const key = `${t.ox},${t.oy},${t.w},${t.h}`;
    let g = geos.get(key);
    if (!g) geos.set(key, g = { ox: t.ox, oy: t.oy, w: t.w, h: t.h, byHash: new Map(), all: [] });
    const hv = t.hash ?? (t.hash = fnv1aBytes(t.bytes));
    if (!g.byHash.has(hv)) g.byHash.set(hv, []);
    g.byHash.get(hv).push(t);
    g.all.push(t);
  }
  return { geos: [...geos.values()], templates };
}

const bytesEqual = (page, x0, y0, w, h, bytes) => {
  for (let y = 0, k = 0; y < h; y++) {
    const o = (y0 + y) * page.w + x0;
    for (let x = 0; x < w; x++, k++) if (page.gray[o + x] !== bytes[k]) return false;
  }
  return true;
};

/** True when the rect lies inside the page. */
const inside = (page, x0, y0, w, h) => x0 >= 0 && y0 >= 0 && x0 + w <= page.w && y0 + h <= page.h;

/**
 * Read one cell. Returns
 *   { state:'blank' }                          nothing but white paper
 *   { state:'object' }                         the object mask owns these pixels
 *   { state:'read', char, t, dx, dy }          byte-exact under some offset
 *   { state:'unread', ink }                    ink no template explains — a □
 */
export function readCell(page, mask, cell, index) {
  const { x0, y0, w, h } = { x0: cell.x0, y0: cell.y0, w: cell.w, h: cell.h };
  let ink = 0, masked = 0;
  for (let y = y0; y < y0 + h; y++) {
    const o = y * page.w;
    for (let x = x0; x < x0 + w; x++) {
      if (mask && mask[o + x]) { masked++; continue; }
      if (page.gray[o + x] < 255) ink++;
    }
  }
  if (masked && !ink) return { state: 'object', ink: 0 };
  if (!ink) return { state: 'blank', ink: 0 };
  for (const [dx, dy] of OFFSETS) {
    for (const g of index.geos) {
      const gx = x0 + g.ox + dx, gy = y0 + g.oy + dy;
      if (!inside(page, gx, gy, g.w, g.h)) continue;
      const hit = g.byHash.get(fnv1a(page, gx, gy, g.w, g.h));
      if (!hit) continue;
      for (const t of hit)
        if (bytesEqual(page, gx, gy, g.w, g.h, t.bytes))
          return { state: 'read', char: t.char, t, dx, dy, ink };
    }
  }
  return { state: 'unread', ink };
}

/**
 * Read one row: cells plus the row's certificate.
 *
 * `gutter` is the ink in the columns between template rects — the part of the
 * row no read can ever account for (see lines.mjs). `gutterDark` counts the
 * part of it that is under 160, i.e. glyph STROKE rather than antialiasing
 * fringe, and that is the number worth watching: fringe in the gutter is the
 * price of not letting a neighbour bleed into a template, but stroke in the
 * gutter means the template rect is too narrow for this document's face and
 * the crop is throwing away evidence. Both are shown, never averaged away.
 */
export function readRow(page, mask, cells, index) {
  const out = cells.map(c => ({ cell: c, ...readCell(page, mask, c, index) }));
  const inRect = new Uint8Array(page.w);
  for (const c of cells) for (let x = c.x0; x < c.x0 + c.w; x++) if (x >= 0 && x < page.w) inRect[x] = 1;
  let gutter = 0, gutterDark = 0;
  const row = cells.length ? cells[0] : null;
  if (row)
    for (let y = row.y0; y < row.y0 + row.h; y++)
      for (let x = 0; x < page.w; x++) {
        const v = page.gray[y * page.w + x];
        if (inRect[x] || v === 255 || (mask && mask[y * page.w + x])) continue;
        gutter++;
        if (v < 160) gutterDark++;
      }
  const unread = out.filter(r => r.state === 'unread').length;
  const read = out.filter(r => r.state === 'read').length;
  return { cells: out, read, unread, gutter, gutterDark, clean: unread === 0 && gutterDark === 0 };
}

/** Row text: characters where read, □ where not, spaces where blank. */
export function rowText(rowRead) {
  const cells = rowRead.cells;
  let first = -1, last = -1;
  for (let i = 0; i < cells.length; i++)
    if (cells[i].state !== 'blank' && cells[i].state !== 'object') { if (first < 0) first = i; last = i; }
  if (first < 0) return '';
  let s = '';
  for (let i = first; i <= last; i++) {
    const r = cells[i];
    s += r.state === 'read' ? r.char : r.state === 'unread' ? '□' : ' ';
  }
  return s;
}

/** Whole page: rows read in order, plus page totals. */
export function readPage(page, mask, rows, grid, index, cellsOf) {
  const out = [];
  let read = 0, unread = 0, gutter = 0, gutterDark = 0;
  for (const r of rows) {
    const rr = readRow(page, mask, cellsOf(page, grid, r), index);
    rr.row = r;
    rr.text = rowText(rr);
    out.push(rr);
    read += rr.read; unread += rr.unread; gutter += rr.gutter; gutterDark += rr.gutterDark;
  }
  return { rows: out, read, unread, gutter, gutterDark, text: out.map(r => r.text).join('\n') };
}

// ---- suggestion only ----
// Normalized cross-correlation, for the human's benefit in the labelling
// modal. Deliberately kept out of readCell: NCC is how the OLD lab decided
// what a cell was, and its confident wrong answers are the reason this one
// does not.
export function nccRank(page, cell, index, topN = 5) {
  const { x0, y0, w, h } = cell;
  const out = [];
  for (const g of index.geos) {
    const gx = x0 + g.ox, gy = y0 + g.oy;
    if (!inside(page, gx, gy, g.w, g.h)) continue;
    const n = g.w * g.h;
    const a = new Float64Array(n);
    for (let y = 0, k = 0; y < g.h; y++) {
      const o = (gy + y) * page.w + gx;
      for (let x = 0; x < g.w; x++, k++) a[k] = page.gray[o + x];
    }
    let am = 0; for (let i = 0; i < n; i++) am += a[i]; am /= n;
    let al2 = 0; for (let i = 0; i < n; i++) al2 += (a[i] - am) ** 2;
    al2 = Math.sqrt(al2);
    for (const t of g.all) {
      if (t._m === undefined) {
        let m = 0; for (let i = 0; i < t.bytes.length; i++) m += t.bytes[i]; m /= t.bytes.length;
        let l2 = 0; for (let i = 0; i < t.bytes.length; i++) l2 += (t.bytes[i] - m) ** 2;
        t._m = m; t._l2 = Math.sqrt(l2);
      }
      let num = 0;
      for (let i = 0; i < n; i++) num += (a[i] - am) * (t.bytes[i] - t._m);
      const den = al2 * t._l2;
      out.push({ t, char: t.char, score: den < 1e-8 ? 0 : num / den });
    }
  }
  out.sort((p, q) => q.score - p.score);
  // one row per character — five variants of 'A' are not five suggestions
  const seen = new Set(), best = [];
  for (const o of out) { if (seen.has(o.char)) continue; seen.add(o.char); best.push(o); if (best.length >= topN) break; }
  return best;
}

/** Cut the bytes of a rect out of the page — how a template is born. */
export function cutBytes(page, x0, y0, w, h) {
  const b = new Uint8Array(w * h);
  for (let y = 0, k = 0; y < h; y++) {
    const o = (y0 + y) * page.w + x0;
    for (let x = 0; x < w; x++, k++) b[k] = page.gray[o + x];
  }
  return b;
}

export { fnv1aBytes };
