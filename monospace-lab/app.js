// app.js — the human's half of the lab.
//
// Everything that decides anything lives in src/ (lattice, lines, match) and in
// engine/ocr-engine.js (objects, bands). This file is the loop the human works
// in: look at the page, look at what read, cut a template for something that
// didn't, watch every identical cell on the page turn green, repeat.
//
// The loop is deliberately tight: save a template and the page is re-read and
// the view jumps to the next □ (auto-advance). Ten labelled cells usually
// unlock a few hundred, because a monospace page repeats its four
// rasterizations of every character over and over.

import { detectRows, detectColumns, calibrate, cellsOf } from './src/lines.mjs';
import { buildIndex, readPage, readCell, nccRank, cutBytes } from './src/match.mjs';
import { makeTemplate, reviveTemplate, coverage, fileStem } from './src/templates.mjs';
import { phaseOf, cellX } from './src/lattice.mjs';

const $ = id => document.getElementById(id);
const engine = window.OCREngine;

const S = {
  docs: [], doc: null, pno: 1, nPages: 1, pool: 'default',
  page: null, det: null, grid: null, templates: [], index: null, result: null,
  view: { tx: 0, ty: 0, scale: 1 }, hover: null, modal: null,
};

// ---------------------------------------------------------------- page load
async function fetchPage(doc, pno) {
  const r = await fetch(`/api/page?doc=${encodeURIComponent(doc)}&page=${pno}`);
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
  const buf = new Uint8Array(await r.arrayBuffer());
  const dv = new DataView(buf.buffer, 0, 20);
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'MGP1') throw new Error('bad page envelope');
  const w = dv.getUint32(4, true), h = dv.getUint32(8, true);
  return { w, h, nPages: dv.getUint32(12, true), spread: dv.getUint32(16, true),
    gray: buf.slice(20, 20 + w * h) };
}

const gridKey = () => `mono:grid:${S.doc}#${S.pno}`;

async function loadDoc(path, pno = 1) {
  S.doc = path; S.pno = pno; S.lastUnread = null;   // □ walk restarts on a new page
  const d = S.docs.find(d => d.path === path);
  if ($('doc').value !== path) $('doc').value = path;
  S.pool = $('pool').value = d ? d.pool : 'default';
  status('decoding page…');
  const p = await fetchPage(path, pno);
  S.page = p; S.nPages = p.nPages;
  $('pageno').textContent = `${pno} / ${p.nPages}`;
  localStorage.setItem('mono:last', JSON.stringify({ doc: path, pno }));
  buildPageCanvas();
  await analyze();
  await loadTemplates();
  read();
  resetFit();
  if (p.spread >= 4)
    status(`page carries colour (channel spread ${p.spread}) — colour pixels cannot byte-match gray templates`);
}

// -------------------------------------------------------------- measurement
// `force` throws away the human's stored overrides for this page and takes the
// pixels' word for everything — the "measure grid" button.
async function analyze(force = false) {
  const t0 = performance.now();
  status('detecting objects and rows…');
  await new Promise(r => setTimeout(r));
  S.det = detectRows(S.page, engine);
  const col = detectColumns(S.page, S.det.mask, S.det.rows);
  let grid = calibrate(S.page, S.det.mask, S.det.rows, col);
  grid.rowH = S.det.rowH; grid.yPitch = S.det.yGrid.pitch;
  let stored = null;
  try { stored = force ? null : JSON.parse(localStorage.getItem(gridKey()) ?? 'null'); }
  catch { stored = null; }
  if (stored) {
    grid = { ...grid, ...stored };
    if (stored.rowTop0 != null) applyRowGeometry(stored.rowTop0, grid.yPitch, grid.rowH);
  }
  S.grid = grid;
  fillGridInputs();
  // The fit score is the page's answer to "am I monospaced at all". A
  // proportional face scores ~0.3 and no grid drawn over it will ever read;
  // saying so here costs a line and saves an afternoon.
  const warn = col.score < 0.85 ? ' — NOT a monospace lattice: the grid below is a guess' : '';
  $('fitinfo').textContent =
    `column fit R=${col.score.toFixed(3)} over ${col.starts} runs · row fit R=${S.det.yGrid.score.toFixed(3)} ` +
    `over ${S.det.bands.length} bands · ${S.det.rows.length} rows` +
    `${(S.det.strays ?? []).length ? ` · ${S.det.strays.length} bands off the row lattice` : ''}` +
    ` · ${(performance.now() - t0) | 0} ms${warn}`;
  $('fitinfo').style.color = warn ? 'var(--bad)' : '';
}

function fillGridInputs() {
  const g = S.grid;
  $('g-pitch').value = g.pitch.toFixed(4);
  $('g-origin').value = g.origin.toFixed(4);
  $('g-lead').value = g.lead;
  $('g-tw').value = g.tw;
  $('g-ypitch').value = (g.yPitch ?? 0).toFixed(4);
  $('g-ytop').value = S.det.rows.length ? S.det.rows[0].top : 0;
  $('g-yh').value = g.rowH;
}

// Move every row onto the lattice the human just typed. Rows keep their index
// k, so a row that was row 12 stays row 12 in the transcript.
function applyRowGeometry(top0, yPitch, rowH) {
  if (!S.det.rows.length) return;
  const k0 = S.det.rows[0].k;
  for (const r of S.det.rows) { r.top = Math.round(top0 + (r.k - k0) * yPitch); r.h = rowH; }
}

// Grid edits are the human's override of a measurement. They are remembered
// per (document, page) and re-applied on the next visit; "measure grid" throws
// them away and re-fits from the pixels.
function applyGridInputs() {
  const g = S.grid;
  g.pitch = +$('g-pitch').value; g.origin = +$('g-origin').value;
  g.lead = Math.round(+$('g-lead').value); g.tw = Math.round(+$('g-tw').value);
  g.yPitch = +$('g-ypitch').value; g.rowH = Math.round(+$('g-yh').value);
  const top0 = Math.round(+$('g-ytop').value);
  applyRowGeometry(top0, g.yPitch, g.rowH);
  localStorage.setItem(gridKey(), JSON.stringify({
    pitch: g.pitch, origin: g.origin, lead: g.lead, tw: g.tw,
    yPitch: g.yPitch, rowH: g.rowH, rowTop0: top0,
  }));
  read();
}

// ---------------------------------------------------------------- templates
async function loadTemplates() {
  const r = await fetch(`/api/templates?pool=${encodeURIComponent(S.pool)}`);
  const j = await r.json();
  S.templates = j.templates.map(t => reviveTemplate(t, t.id));
  S.index = buildIndex(S.templates);
}

async function saveTemplate(rec) {
  const r = await fetch(`/api/templates?pool=${encodeURIComponent(S.pool)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rec) });
  return (await r.json()).id;
}

async function deleteTemplate(id) {
  await fetch(`/api/templates?pool=${encodeURIComponent(S.pool)}&id=${encodeURIComponent(id)}`,
    { method: 'DELETE' });
}

// --------------------------------------------------------------------- read
function read() {
  if (!S.page || !S.grid) return;
  S.index = buildIndex(S.templates);
  const t0 = performance.now();
  S.result = readPage(S.page, S.det.mask, S.det.rows, S.grid, S.index, cellsOf);
  const cells = S.result.read + S.result.unread;
  status(`${S.result.read} read · ${S.result.unread} □ · ${S.result.gutterDark} dark px in gutters · ` +
    `${S.templates.length} templates · ${(performance.now() - t0) | 0} ms` +
    (cells ? ` · ${(100 * S.result.read / cells).toFixed(1)}% of inked cells` : ''));
  renderPanels();
  render();
}

// ------------------------------------------------------------------ canvas
let pageCanvas = null, maskCanvas = null;

function buildPageCanvas() {
  const { w, h, gray } = S.page;
  pageCanvas = document.createElement('canvas');
  pageCanvas.width = w; pageCanvas.height = h;
  const img = new ImageData(w, h);
  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    img.data[o] = img.data[o + 1] = img.data[o + 2] = gray[i];
    img.data[o + 3] = 255;
  }
  pageCanvas.getContext('2d').putImageData(img, 0, 0);
  maskCanvas = null;
}

function buildMaskCanvas() {
  const { w, h } = S.page, mask = S.det.mask;
  maskCanvas = document.createElement('canvas');
  maskCanvas.width = w; maskCanvas.height = h;
  const img = new ImageData(w, h);
  for (let i = 0, o = 0; i < w * h; i++, o += 4)
    if (mask[i]) { img.data[o] = 180; img.data[o + 1] = 90; img.data[o + 2] = 220; img.data[o + 3] = 110; }
  maskCanvas.getContext('2d').putImageData(img, 0, 0);
}

function resize() {
  const c = $('canvas'), wrap = $('canvas-wrap');
  c.width = wrap.clientWidth; c.height = wrap.clientHeight;
  render();
}

function resetFit() {
  const c = $('canvas');
  if (!S.page) return;
  const m = 16;
  S.view.scale = Math.min((c.width - 2 * m) / S.page.w, (c.height - 2 * m) / S.page.h);
  S.view.tx = (c.width - S.page.w * S.view.scale) / 2;
  S.view.ty = (c.height - S.page.h * S.view.scale) / 2;
  render();
}

function centerOn(x, y, scale) {
  const c = $('canvas');
  if (scale) S.view.scale = scale;
  S.view.tx = c.width / 2 - x * S.view.scale;
  S.view.ty = c.height / 2 - y * S.view.scale;
  render();
}

const STATE_COLOR = { read: 'rgba(56,209,122,', unread: 'rgba(239,83,80,', object: 'rgba(150,150,160,' };

function render() {
  const c = $('canvas'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  if (!S.page) return;
  const { tx, ty, scale } = S.view;
  ctx.save();
  ctx.translate(tx, ty); ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pageCanvas, 0, 0);
  if ($('t-mask').checked) { if (!maskCanvas) buildMaskCanvas(); ctx.drawImage(maskCanvas, 0, 0); }

  // visible page rect — 6,000 cells a frame is fine, 60,000 is not
  const vx0 = -tx / scale, vy0 = -ty / scale, vx1 = vx0 + c.width / scale, vy1 = vy0 + c.height / scale;
  const hair = 1 / scale;

  if (S.det && $('t-rows').checked) {
    ctx.strokeStyle = 'rgba(102,194,255,.55)'; ctx.lineWidth = hair;
    for (const r of S.det.rows) {
      if (r.top + r.h < vy0 || r.top > vy1) continue;
      ctx.strokeRect(0.5 * hair, r.top, S.page.w - hair, r.h);
    }
  }
  if (S.result && ($('t-grid').checked || $('t-reads').checked)) {
    const showLabels = scale >= 6;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const rr of S.result.rows) {
      const r = rr.row;
      if (r.top + r.h < vy0 || r.top > vy1) continue;
      for (const cell of rr.cells) {
        const { x0, w, y0, h } = cell.cell;
        if (x0 + w < vx0 || x0 > vx1) continue;
        if ($('t-grid').checked) {
          ctx.strokeStyle = 'rgba(255,80,80,.35)'; ctx.lineWidth = hair;
          ctx.beginPath(); ctx.moveTo(x0 - 1, y0); ctx.lineTo(x0 - 1, y0 + h); ctx.stroke();
        }
        if (!$('t-reads').checked || cell.state === 'blank') continue;
        const col = STATE_COLOR[cell.state];
        if (!col) continue;
        ctx.fillStyle = col + (scale >= 14 ? '.12)' : '.22)');
        ctx.fillRect(x0, y0, w, h);
        // Labels are drawn to make state legible at a glance — and stop being
        // drawn past 14×, where the human is no longer glancing but looking at
        // the actual pixels they are about to cut. A '□' painted over the
        // glyph you are trying to identify is worse than no overlay at all.
        if (showLabels && scale < 14) {
          ctx.fillStyle = col + (cell.state === 'read' ? '.95)' : '.9)');
          ctx.font = `${h * 0.8}px ui-monospace, monospace`;
          ctx.fillText(cell.state === 'read' ? cell.char : '□', x0 + w / 2, y0 + h / 2);
        }
      }
    }
  }
  if (S.hover) {
    ctx.strokeStyle = 'rgba(255,220,80,.95)'; ctx.lineWidth = 2 * hair;
    ctx.strokeRect(S.hover.x0, S.hover.y0, S.hover.w, S.hover.h);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- hit test
function pick(clientX, clientY) {
  const rect = $('canvas').getBoundingClientRect();
  const ix = (clientX - rect.left - S.view.tx) / S.view.scale;
  const iy = (clientY - rect.top - S.view.ty) / S.view.scale;
  if (!S.det || !S.grid) return null;
  const row = S.det.rows.find(r => iy >= r.top && iy < r.top + r.h);
  if (!row) return null;
  const g = S.grid;
  const i = Math.round((ix - g.lead - g.origin) / g.pitch);
  const x0 = cellX(g, i) + g.lead;
  if (x0 < 0 || x0 + g.tw > S.page.w) return null;
  return { row, i, x0, w: g.tw, y0: row.top, h: row.h, phase: phaseOf(g, i) };
}

// ------------------------------------------------------------------- modal
function openModal(cell) {
  const m = S.modal = { cell, ox: 0, oy: 0, w: cell.w, h: cell.h };
  const cur = readCell(S.page, S.det.mask, cell, S.index);
  m.current = cur;
  $('modal-head').textContent =
    `row ${cell.row.k}  col ${cell.i}  phase ${cell.phase}  ·  page x ${cell.x0} y ${cell.y0}` +
    `  ·  ${cur.state}${cur.state === 'read' ? ` '${cur.char}' at offset ${cur.dx},${cur.dy}` : ''}`;
  $('modal-exact').innerHTML = cur.state === 'read'
    ? `<span class="exact-yes">byte-exact match: '${esc(cur.char)}' — template ${esc(cur.t.id)}` +
      (cur.dx || cur.dy ? ` (offset ${cur.dx},${cur.dy} — that template is cut a pixel off)` : '') + `</span>`
    : cur.state === 'blank' ? '<span class="hint">no ink in this cell</span>'
    : '<span class="exact-no">no template reproduces these bytes</span>';
  const sugg = S.templates.length ? nccRank(S.page, cell, S.index, 5) : [];
  $('modal-ncc').innerHTML = sugg.length
    ? 'suggestions (correlation only — not evidence): ' + sugg.map(s =>
        `<span class="chip" data-ch="${esc(s.char)}">${esc(s.char)} ${s.score.toFixed(2)}</span>`).join('')
    : '<span class="hint">no templates yet — you are cutting the first one</span>';
  for (const ch of $('modal-ncc').querySelectorAll('.chip'))
    ch.onclick = () => { $('label-input').value = ch.dataset.ch; $('label-input').focus(); };
  // The input is prefilled ONLY when a template already read this cell — i.e.
  // when the human is confirming or correcting a decision they already made.
  // It is deliberately NOT prefilled from the correlation ranking: that
  // ranking's top answer for a '3' is happily 'P' at 0.47, and a prefilled
  // wrong letter one Enter away from being saved is how a template dictionary
  // quietly poisons itself.
  $('label-input').value = cur.state === 'read' ? cur.char : '';
  $('modal').classList.remove('hidden');
  $('label-input').focus(); $('label-input').select();
  drawPreview();
}

function drawPreview() {
  const m = S.modal, SC = 18, pad = 1;
  const cv = $('preview');
  cv.width = (m.w + 2 * pad) * SC; cv.height = (m.h + 2 * pad) * SC;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sx = m.cell.x0 + m.ox - pad, sy = m.cell.y0 + m.oy - pad;
  ctx.drawImage(pageCanvas, sx, sy, m.w + 2 * pad, m.h + 2 * pad, 0, 0, cv.width, cv.height);
  // dim the gutter columns: they are shown so a mis-cut is visible, and dimmed
  // so it is never mistaken for part of the template
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(0, 0, pad * SC, cv.height);
  ctx.fillRect((m.w + pad) * SC, 0, pad * SC, cv.height);
  ctx.fillRect(0, 0, cv.width, pad * SC);
  ctx.fillRect(0, (m.h + pad) * SC, cv.width, pad * SC);
  ctx.strokeStyle = 'rgba(102,194,255,.9)'; ctx.lineWidth = 1;
  ctx.strokeRect(pad * SC - .5, pad * SC - .5, m.w * SC + 1, m.h * SC + 1);
  $('modal-rect').textContent =
    `crop x ${m.cell.x0 + m.ox} y ${m.cell.y0 + m.oy}  ${m.w}×${m.h}  (offset ${m.ox},${m.oy})`;
}

function closeModal() { $('modal').classList.add('hidden'); S.modal = null; $('canvas').focus(); }

async function commitTemplate() {
  const m = S.modal, ch = $('label-input').value;
  if (!m || !ch) return;
  const x = m.cell.x0 + m.ox, y = m.cell.y0 + m.oy;
  if (x < 0 || y < 0 || x + m.w > S.page.w || y + m.h > S.page.h) { status('crop is off the page'); return; }
  const rec = makeTemplate({
    char: ch, phase: m.cell.phase, ox: m.ox, oy: m.oy, w: m.w, h: m.h,
    bytes: cutBytes(S.page, x, y, m.w, m.h),
    src: { doc: S.doc, page: S.pno, row: m.cell.row.k, col: m.cell.i, x, y, pitch: S.grid.pitch },
  });
  rec.stem = fileStem(ch, m.cell.phase);
  const before = S.result ? S.result.read : 0;
  const id = await saveTemplate(rec);
  await loadTemplates();
  closeModal();
  read();
  const gained = S.result.read - before;
  status(`saved ${id} — ${gained >= 0 ? '+' : ''}${gained} cells now read (${S.result.unread} □ left)`);
  if ($('t-auto').checked) nextUnread();
}

async function deleteMatched() {
  const cur = S.modal?.current;
  if (!cur || cur.state !== 'read') { status('no template matched this cell'); return; }
  await deleteTemplate(cur.t.id);
  await loadTemplates();
  closeModal();
  read();
  status(`deleted ${cur.t.id}`);
}

// -------------------------------------------------------------- navigation
function nextUnread(from = null) {
  if (!S.result) return;
  const start = from ?? S.lastUnread ?? { k: -Infinity, i: -Infinity };
  let first = null, next = null;
  for (const rr of S.result.rows)
    for (const c of rr.cells) {
      if (c.state !== 'unread') continue;
      const pos = { k: rr.row.k, i: c.cell.i };
      if (!first) first = { rr, c, pos };
      if (!next && (pos.k > start.k || (pos.k === start.k && pos.i > start.i))) next = { rr, c, pos };
    }
  const hit = next ?? first;
  if (!hit) { status('no unread cells on this page'); return; }
  S.lastUnread = hit.pos;
  const cell = { ...hit.c.cell, row: hit.rr.row };
  S.hover = cell;
  centerOn(cell.x0 + cell.w / 2, cell.y0 + cell.h / 2, Math.max(S.view.scale, 8));
  openModal(cell);
}

// ------------------------------------------------------------------ panels
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderPanels() {
  // transcript
  const rowsHtml = S.result.rows.map(rr => {
    const num = String(rr.row.k).padStart(3, ' ');
    const body = esc(rr.text).replace(/□+/g, m => `<span class="u">${m}</span>`);
    return `<span class="hint">${num}</span> ${body}`;
  }).join('\n');
  $('transcript').innerHTML = rowsHtml;

  // coverage — what to cut next
  const cov = coverage(S.templates);
  const used = new Set();
  for (const rr of S.result.rows) for (const c of rr.cells) if (c.state !== 'blank') used.add(c.cell.phase);
  let html = `<p class="note">phases in use on this page: ${[...used].sort().join(', ') || '—'}. ` +
    `A template only matches cells of its own ¼-px phase bucket, so every character needs all four.</p>`;
  html += '<table><tr><th>char</th><th>p0</th><th>p1</th><th>p2</th><th>p3</th></tr>';
  for (const [ch, counts] of cov)
    html += `<tr><td>${esc(ch === ' ' ? '␠' : ch)}</td>` +
      counts.map(n => `<td class="${n ? 'have' : 'miss'}">${n || '·'}</td>`).join('') + '</tr>';
  html += '</table>';
  if (!cov.length) html += '<p class="note">no templates in this pool yet.</p>';
  $('coverage').innerHTML = html;

  // certificate
  const rows = S.result.rows;
  const clean = rows.filter(r => r.clean).length;
  const objs = S.det.objects.reduce((m, o) => (m[o.type] = (m[o.type] ?? 0) + 1, m), {});
  $('certificate').innerHTML = `
    <p class="big">${S.result.unread === 0
      ? `every inked cell byte-exact — ${S.result.gutterDark} dark px still unverified in the gutters`
      : `${S.result.unread} □ · ${S.result.gutterDark} dark px unverified in the gutters`}</p>
    <table>
      <tr><td>rows on the lattice</td><td>${rows.length}</td></tr>
      <tr><td>rows fully read</td><td>${clean}</td></tr>
      <tr><td>cells read byte-exact</td><td>${S.result.read}</td></tr>
      <tr><td>cells unread (□)</td><td>${S.result.unread}</td></tr>
      <tr><td>gutter ink (never verified)</td><td>${S.result.gutter} px</td></tr>
      <tr><td>&nbsp;&nbsp;of which stroke, not fringe (&lt;160)</td><td>${S.result.gutterDark} px</td></tr>
      <tr><td>column pitch</td><td>${S.grid.pitch.toFixed(4)} px</td></tr>
      <tr><td>column origin</td><td>${S.grid.origin.toFixed(4)} px</td></tr>
      <tr><td>row pitch</td><td>${(S.grid.yPitch ?? 0).toFixed(4)} px</td></tr>
      <tr><td>objects masked</td><td>${Object.entries(objs).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}</td></tr>
      <tr><td>bands off the row lattice</td><td>${(S.det.strays ?? []).length}</td></tr>
    </table>
    <p class="note">The gutter is the pixel dropped from each side of every
    cell so a neighbour's ink cannot bleed into a template. Ink left there is
    outside the certificate. Fringe in the gutter is the price of the crop;
    <b>stroke</b> in the gutter (the second number) means the template width is
    too narrow for this face — widen <code>tmpl w</code> by one and watch both
    numbers move.</p>`;
}

function status(t) { $('status').textContent = t; }

// ------------------------------------------------------------------- events
function initEvents() {
  new ResizeObserver(resize).observe($('canvas-wrap'));

  $('doc').onchange = e => loadDoc(e.target.value, 1).catch(err => status('' + err.message));
  $('prev').onclick = () => S.pno > 1 && loadDoc(S.doc, S.pno - 1).catch(e => status('' + e.message));
  $('next').onclick = () => S.pno < S.nPages && loadDoc(S.doc, S.pno + 1).catch(e => status('' + e.message));
  $('pool').onchange = async () => { S.pool = $('pool').value; await loadTemplates(); read(); };
  $('measure').onclick = async () => { localStorage.removeItem(gridKey()); await analyze(true); read(); render(); };
  $('read').onclick = read;
  $('next-unread').onclick = () => nextUnread();
  $('export').onclick = exportText;
  for (const id of ['t-grid', 't-rows', 't-reads', 't-mask']) $(id).onchange = render;
  for (const id of ['g-pitch', 'g-origin', 'g-lead', 'g-tw', 'g-ypitch', 'g-ytop', 'g-yh'])
    $(id).onchange = applyGridInputs;

  const c = $('canvas');
  c.addEventListener('wheel', e => {
    e.preventDefault();
    const r = c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const ns = Math.max(0.05, Math.min(60, S.view.scale * f));
    S.view.tx = mx - (mx - S.view.tx) * (ns / S.view.scale);
    S.view.ty = my - (my - S.view.ty) * (ns / S.view.scale);
    S.view.scale = ns;
    render();
  }, { passive: false });

  let drag = null;
  c.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, tx: S.view.tx, ty: S.view.ty, moved: false };
    $('canvas-wrap').classList.add('dragging');
  });
  window.addEventListener('mousemove', e => {
    if (drag) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
      S.view.tx = drag.tx + (e.clientX - drag.x); S.view.ty = drag.ty + (e.clientY - drag.y);
      render();
      return;
    }
    const cell = pick(e.clientX, e.clientY);
    S.hover = cell;
    if (cell && S.result) {
      const rr = S.result.rows.find(r => r.row === cell.row);
      const cc = rr?.cells.find(x => x.cell.i === cell.i);
      status(`row ${cell.row.k} col ${cell.i} phase ${cell.phase} · ${cc ? cc.state : '—'}` +
        (cc?.state === 'read' ? ` '${cc.char}'` : ''));
    }
    render();
  });
  window.addEventListener('mouseup', e => {
    const wasDrag = drag;
    drag = null;
    $('canvas-wrap').classList.remove('dragging');
    if (wasDrag && !wasDrag.moved) {
      const cell = pick(e.clientX, e.clientY);
      if (cell) openModal(cell);
    }
  });
  c.addEventListener('dblclick', resetFit);

  window.addEventListener('keydown', e => {
    if (S.modal) {
      if (e.key === 'Enter') { e.preventDefault(); commitTemplate(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
      else if (e.key === 'Delete') { e.preventDefault(); deleteMatched(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); S.modal.ox--; drawPreview(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); S.modal.ox++; drawPreview(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); S.modal.oy--; drawPreview(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); S.modal.oy++; drawPreview(); }
      else if (e.key === '[') { e.preventDefault(); S.modal.w = Math.max(1, S.modal.w - 1); drawPreview(); }
      else if (e.key === ']') { e.preventDefault(); S.modal.w++; drawPreview(); }
      return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'n') { e.preventDefault(); nextUnread(); }
    else if (e.key === 'r') { e.preventDefault(); read(); }
    else if (e.key === '0') { e.preventDefault(); resetFit(); }
  });

  for (const t of document.querySelectorAll('.tab')) t.onclick = () => {
    for (const x of document.querySelectorAll('.tab')) x.classList.toggle('active', x === t);
    for (const p of document.querySelectorAll('.pane'))
      p.classList.toggle('active', p.id === `pane-${t.dataset.tab}`);
  };
  $('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };
}

async function exportText() {
  if (!S.result) return;
  const base = S.doc.split('/').pop().replace(/\.pdf$/i, '');
  const name = `${base}-p${String(S.pno).padStart(4, '0')}.txt`;
  const head =
    `# ${S.doc} page ${S.pno} — monospace lab\n` +
    `# pitch ${S.grid.pitch.toFixed(4)} origin ${S.grid.origin.toFixed(4)} lead ${S.grid.lead} ` +
    `tw ${S.grid.tw} rowPitch ${(S.grid.yPitch ?? 0).toFixed(4)} rowH ${S.grid.rowH}\n` +
    `# ${S.result.read} cells byte-exact, ${S.result.unread} unread (□), ` +
    `${S.result.gutter} px gutter ink outside the certificate\n`;
  const r = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, text: head + S.result.text + '\n' }) });
  const j = await r.json();
  status(j.written ? `wrote ${j.written}` : `export failed: ${j.error}`);
}

// The whole app state and the handful of verbs that change it, on the window.
// This is how uitest.mjs drives a human loop without a mouse, and how you poke
// at a stuck page from the console: `LAB.S.grid`, `LAB.read()`.
window.LAB = { S, read, analyze, nextUnread, openModal, commitTemplate, closeModal,
  loadDoc, loadTemplates, pick, render };

// --------------------------------------------------------------------- boot
(async function boot() {
  initEvents();
  resize();
  const r = await fetch('/api/docs');
  const j = await r.json();
  S.docs = j.docs;
  $('doc').innerHTML = j.docs.map(d => `<option value="${esc(d.path)}">${esc(d.path)}</option>`).join('');
  if (!j.docs.length) { status('no PDFs found — start the server with --corpus <dir>'); return; }
  let start = j.docs[0].path, pno = 1;
  try {
    const last = JSON.parse(localStorage.getItem('mono:last') ?? 'null');
    if (last && j.docs.some(d => d.path === last.doc)) { start = last.doc; pno = last.pno; }
  } catch { /* no memory of a last document is not a problem */ }
  $('doc').value = start;
  await loadDoc(start, pno).catch(e => status('' + e.message));
})();
