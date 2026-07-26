// ---------------------------------------------------------------------------
// synth-gate.mjs — the reader's gate WITHOUT a document.
//
//   npm run gate:synth
//
// `npm run gate` proves the reader against 18 real government PDFs, and it is
// the authority on real producers. It also runs 0 of 18 on a fresh clone: the
// documents are not distributable and most pools need faces that are not
// either. So a stranger could certify the rasterizer (`certify:ftclone`), the
// engine primitives (`npm test`) and the lab's fast engine (`rust:certify`) —
// and could not run the READER at all. This file closes that hole the same way
// those three do: by DRAWING its input instead of harvesting it.
//
// It draws one page, reads it back through the real CLI, and asserts what the
// read must be. Everything it needs ships: `ftclone/`, the faces in `fonts/`
// (OFL / URW-AFPL — fonts/LICENSES.md) and the five glyph sets those faces
// produce, which are among the 13 committed ones. No corpus, no system font,
// no PDF.
//
// ---- what is drawn, and why it is not a rigged test ------------------------
//
// The page is composed the way a PRODUCER composes one, not the way the reader
// reads one. Text is laid out at FRACTIONAL pens by accumulating the face's own
// advances, and only then does each glyph get placed through the measured
// lattice law (docs/LAWS.md §1): pen x snapped to the nearest ¼ px, pen y
// ROUNDED TO AN INTEGER — there is no subpixel y, so a line laid out on a
// ½-px baseline is drawn, and must be read, one row down. Glyphs composite
// left→right through the blend law (§2) on the page canvas, so overlapping
// pairs are real composites and not min-blends.
//
// The reader is then handed the page and the pool, and nothing else: no
// baselines, no advance table, no word-spacing constant, no glyph inventory per
// line. Every number in the assertions below is one it had to recover —
// including every pen, which is checked against the drawn pen to a quarter
// pixel.
//
// ---- what this DOES NOT prove ----------------------------------------------
//
// The page is drawn by the same rasterizer clone the reader matches with, so
// this is the reader's machinery certified against arithmetic: banding, the
// baseline pin, the composite-aware scan, object detection, space calibration,
// the certificate and the □ accounting. It is NOT evidence about any real
// producer — that is exactly what `npm run gate` is for, and neither
// substitutes for the other. Two whole laws are deliberately out of scope
// because inventing a producer for them would prove nothing: the linear
// post-law and palette quantization (§4) are exercised only by corpus
// documents. This page is also cleaner than a real one: no JPEG jitter, no
// whitened colour, no redaction spill.
//
// The reference in fixtures/synth-ref/ is COMMITTED, which is what makes this a
// regression gate rather than a self-consistency check — the transcript, the
// summary and the sha256 of the drawn page itself. Re-record deliberately with
// --regen, never to make a failure go away.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import * as mupdf from 'mupdf';
import { FTClone } from '../ftclone/ftclone.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'gate-out', 'synth');
const REF = join(REPO, 'fixtures', 'synth-ref');
const REGEN = process.argv.includes('--regen');

let fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) fail++;
};

// ---- the glyph dictionary --------------------------------------------------
// assets/glyphs/ is gitignored: the bundle holds whatever .npz you have
// locally, so it is per-machine and derived. On a fresh clone that is the 13
// committed sets — everything this page needs — but the file does not exist
// yet, and the point of this gate is that a stranger can run the reader. So
// build it, visibly, with the documented command rather than failing on a
// derived artifact.
const BUNDLE = join(REPO, 'assets', 'glyphs', 'glyphs.bin');
if (!existsSync(BUNDLE)) {
  console.log('assets/glyphs/glyphs.bin is missing (derived) — building it: node tools/export-glyphs.mjs');
  const r = spawnSync(process.execPath, [join(REPO, 'tools', 'export-glyphs.mjs')],
    { cwd: REPO, encoding: 'utf8' });
  process.stdout.write((r.stdout ?? '').split('\n').slice(-3).join('\n'));
  if (r.status !== 0) { console.error(r.stderr); process.exit(2); }
}

// ---------------------------------------------------------------- faces ----
// Only faces this repo may legally ship, and only sets whose .npz is committed
// (PROVENANCE src 'free'), so the whole gate runs on a clone. Three of them are
// bare CFFs — the gid-map path — and one is a TTF, so both outline pipelines
// draw ink on this page.
const FACES = {
  rom:  { file: 'NimbusRoman-Regular-1.12.0.cff', em64: 1024, set: 'nimbusrom1024' },
  bold: { file: 'NimbusRoman-Bold.cff',           em64: 1024, set: 'nimbusrombd1024' },
  ital: { file: 'NimbusRoman-Italic.cff',         em64: 1024, set: 'nimbusromi1024' },
  mono: { file: 'NimbusMonoPS-Regular.cff',       em64: 791,  set: 'nimbus791' },
  dvs:  { file: 'DejaVuSerif.ttf',                em64: 786,  set: 'dejavuserif786' },
};
// the pool as blind-read's --glyphs grammar: '+' joins the three faces that
// really mix within a line, ',' keeps the two other sizes as their own
// band-picked groups (pooling everything lets a foreign face byte-match a
// fragment — tools/glyph-registry.mjs says the same about real pools)
const POOL = 'nimbusrom1024+nimbusrombd1024+nimbusromi1024,nimbus791,dejavuserif786';
// A pool that CANNOT explain the body: same producer physics, wrong faces and
// wrong sizes. See the decoy assertion at the bottom.
const DECOY = 'nimbus791,dejavuserif786';

// missing pieces, named precisely, before anything runs (gate.mjs does the
// same): every one of these is committed, so a miss means a broken checkout,
// not an absent document
{
  const { readBundle } = await import('./glyph-bundle.mjs');
  const have = readBundle(BUNDLE).dir;
  const gone = Object.values(FACES).filter(f => !have.has(f.set)).map(f => `set:${f.set}`);
  if (gone.length) {
    console.error(`${gone.join(', ')} missing from the bundle — rebuild: node tools/export-glyphs.mjs`);
    process.exit(2);
  }
}

for (const f of Object.values(FACES)) {
  const path = join(REPO, 'fonts', f.file);
  if (!existsSync(path)) { console.error(`missing face ${f.file}`); process.exit(2); }
  f.mfont = new mupdf.Font('F', readFileSync(path));
  f.sizePx = f.em64 / 64;
  // same frame geometry fontgen.mjs uses, so no glyph can touch a window edge
  f.penx = Math.ceil(f.sizePx) + 3;
  f.basey = Math.ceil(f.sizePx * 1.6) + 3;
  const W = f.penx + Math.ceil(f.sizePx * 2.4), H = f.basey + Math.ceil(f.sizePx * 0.9);
  f.W = W; f.H = H;
  f.clone = new FTClone(path, W, H);
  f.gid = cp => f.mfont.encodeCharacter(cp);
  // a bare CFF has no cmap: cp→gid comes from mupdf's own encodeCharacter on
  // the same bytes, exactly as fontgen.mjs builds it for the sets
  if (f.clone.cff) {
    const cps = [];
    for (let c = 32; c <= 126; c++) cps.push(c);
    cps.push(0xFB01, 0xFB02);
    f.clone.setGidMap(new Map(cps.map(cp => [cp, f.mfont.encodeCharacter(cp)])));
  }
  // advance in px, exactly as fontgen computes it: design units are integers,
  // one rounding at the end
  const upm = f.clone.upm;
  f.adv = cp => {
    const g = f.gid(cp);
    return g ? Math.round(f.mfont.advanceGlyph(g, 0) * upm) * f.sizePx / upm : 0;
  };
}

// ------------------------------------------------------------- the page ----
// Left edges are deliberately fractional and different per line, so the ¼-px
// snap lands on all four phases across the page (asserted below) rather than on
// whichever one a round number happens to give.
//
// WORD GAPS ARE ONE WIDTH FOR THE WHOLE PAGE, and that is a property of the
// READER, measured here rather than assumed: `spaceCalib` clusters the gaps of
// the whole page and returns ONE space advance, so a page whose faces have
// different space advances transcribes the wider ones as MULTIPLES (drawn with
// each face's own space, the 12.36-px Courier lines came back as
// "Received:  by  10.229…" — gap 7.41 px against a calibrated 3.98). Nothing
// forces a producer to gap words by the face's own space advance — narrow
// styled spaces are exactly the case the calibration exists for — so this page
// uses one gap width and the mono/serif lines exercise that path. The corpus
// gate has never certified spacing on a mixed-space-width page either: of the
// documents that carry truth files, all are single-family.
const PAGE_W = 560, PAGE_H = 344;
const LINES = [
  { y: 40,    x: 56,    runs: [['bold', 'SYNTHETIC PAGE']] },
  // rule between the heading and the body (an object, not text)
  { y: 74,    x: 56.3,  runs: [['rom', 'This page was drawn by tools/synth-gate.mjs; it never']] },
  { y: 94,    x: 56.3,  runs: [['rom', 'existed as a document.  Its transcript is known.']] },
  { y: 114,   x: 56.55, runs: [['rom', 'The reader is told '], ['ital', 'nothing'],
                               ['rom', ' about this layout.']] },
  // laid out on a HALF-pixel baseline: §1 rounds pen y to 134, and the reader
  // must pin it there. The two lines below it are pitched to leave exactly one
  // blank row (asserted), which is where band splitting first goes wrong.
  { y: 133.5, x: 56.75, runs: [['rom', 'Pen y has no subpixel: 133.5 draws at 134.']] },
  { y: 152,   x: 56.2,  runs: [['rom', 'These two lines nearly touch,']] },
  { y: 168,   x: 56.9,  runs: [['rom', 'and one blank row separates them.']] },
  { y: 192,   x: 56.4,  runs: [['mono', 'Received: by 10.229.235.4 with SMTP id ke4mr685;']] },
  { y: 214,   x: 56.4,  runs: [['mono', 'a second face, monospaced, at 12.359375 px.']] },
  { y: 240,   x: 56.65, runs: [['dvs', 'DejaVu Serif 786 is the TTF pipeline on this page.']] },
  // a filled box sits in the gap of this line: the reader must mask it, read
  // both halves, and transcribe the gap it spans as ONE space
  { y: 268,   x: 56.5,  runs: [['rom', 'PAYMENT'], ['gap', 74], ['rom', 'schedule follows.']] },
  // 'ﬁ' and 'ﬂ' are single glyphs on the page and two letters in the
  // transcript, which is the reader's job, not the truth file's
  { y: 300,   x: 56.35, runs: [['rom', 'Ligatures are one glyph: ﬁnal, ﬂow.']] },
];
// one gap width for the whole page — see the note above
const WORD_GAP = FACES.rom.adv(32);
// non-text objects, drawn as solid ink after the text. The rule is a separator
// under the heading; the box is a filled redaction placed in the ['gap'] of the
// PAYMENT line, inset from the neighbouring glyphs so its dark row runs are its
// own evidence (a glyph kerned against a box fuses into one run for those rows
// — real, and its own gate document; here it would only obscure what this page
// is for).
const RULE = { x0: 56, x1: 430, y0: 50, y1: 52, v: 0 };
const BOX = { x0: 0, x1: 0, y0: 254, y1: 272, v: 0 };            // x from the layout
// A page on which everything reads proves the reader can say yes, not that it
// can say no — so this one carries ink that is not text and not an object: a
// solid 8×11 mark in its own band. 8 px is under the 9-px floor where a stack
// of dark runs becomes a small box, and 88 ink pixels is far over the ≤12-px
// dust cap, so it is neither masked away nor explainable. It must come back as
// exactly one □ with coordinates, and it must not cost a single text line.
const MARK = { x0: 300, x1: 308, y0: 318, y1: 329, v: 0 };

// ------------------------------------------------------------- drawing -----
const page = new Uint8Array(PAGE_W * PAGE_H).fill(255);
const drawn = [];                       // per line: what the reader has to find
const phaseSeen = new Set();

/** Composite one glyph at the ¼-px pen `pen` on integer `baseline`, through the
 *  laws in docs/LAWS.md §1 (lattice) and §2 (blend). The page is the only
 *  record it leaves, exactly as it is for a real producer; false means the face
 *  has no outline for that codepoint. */
let inkTop = Infinity, inkBot = -1;      // ink rows of the line being drawn
function stamp(face, cp, pen, baseline) {
  const pi = Math.floor(pen), phx = pen - pi;
  const cov = face.clone.coverage(cp, face.em64, face.em64,
    face.penx * 64 + Math.round(phx * 64), face.basey * 64);
  if (!cov) return false;
  const { W, H, penx, basey } = face;
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const g = cov[r * W + c];
      if (!g) continue;
      const px = pi + (c - penx), py = baseline + (r - basey);
      if (px < 0 || px >= PAGE_W || py < 0 || py >= PAGE_H)
        throw new Error(`glyph U+${cp.toString(16)} falls off the page at ${px},${py}`);
      const i = py * PAGE_W + px;
      page[i] = (page[i] * (256 - (g + (g >> 7)))) >> 8;
      if (py < inkTop) inkTop = py;
      if (py > inkBot) inkBot = py;
    }
  return true;
}

for (const L of LINES) {
  const baseline = Math.round(L.y);                 // §1: no subpixel y
  inkTop = Infinity; inkBot = -1;
  let pen = L.x;
  const glyphs = [];
  let text = '';
  for (const [kind, arg] of L.runs) {
    if (kind === 'gap') {                            // the redaction's span
      BOX.x0 = Math.ceil(pen) + 6; BOX.x1 = Math.floor(pen + arg) - 6;
      pen += arg; text += ' '; continue;
    }
    const face = FACES[kind];
    for (const ch of arg) {
      const cp = ch.codePointAt(0);
      if (ch === ' ') { pen += WORD_GAP; text += ' '; continue; }
      const q = Math.round(pen * 4) / 4;             // §1: the ¼-px lattice
      if (!stamp(face, cp, q, baseline)) throw new Error(`face ${kind} has no glyph for '${ch}'`);
      phaseSeen.add(Math.round((q - Math.floor(q)) * 4));
      glyphs.push([ch, q, face.set]);
      text += ch === 'ﬁ' ? 'fi' : ch === 'ﬂ' ? 'fl' : ch;
      pen = q + face.adv(cp);
    }
  }
  drawn.push({ baseline, laidAt: L.y, text, glyphs, inkTop, inkBot,
    sets: [...new Set(glyphs.map(g => g[2]))] });
}
for (const o of [RULE, BOX, MARK])
  for (let y = o.y0; y < o.y1; y++)
    for (let x = o.x0; x < o.x1; x++) page[y * PAGE_W + x] = o.v;

// ---- how close the closest pair of lines actually is -----------------------
// Measured off the ink each line put on the page, not off the constants above:
// band splitting works on blank ROWS, so the number that matters is how many
// blank rows separate the tightest neighbours. 1 means the two lines are one
// row from being a single band.
let tightGap = Infinity, tightPair = null;
for (let i = 1; i < drawn.length; i++) {
  const g = drawn[i].inkTop - drawn[i - 1].inkBot - 1;
  if (g < tightGap) { tightGap = g; tightPair = i; }
}

// ------------------------------------------------------------- the read ----
mkdirSync(OUT, { recursive: true });
const rasterPath = join(OUT, 'page.gray.gz');
{
  const hdr = Buffer.alloc(16);
  hdr.writeUInt32LE(0x31595247, 0);                 // 'GRY1'
  hdr.writeUInt32LE(1, 4);                          // mode 1 = u8 gray
  hdr.writeUInt32LE(PAGE_W, 8);
  hdr.writeUInt32LE(PAGE_H, 12);
  writeFileSync(rasterPath, gzipSync(Buffer.concat([hdr, Buffer.from(page)])));
}
const pageSha = createHash('sha256').update(Buffer.from(page)).digest('hex');
const truthPath = join(OUT, 'page.txt.truth');
writeFileSync(truthPath, drawn.map(d => d.text).join('\n') + '\n');

const read = (glyphs, outTxt, jsonPath) => {
  const args = ['--raster', rasterPath, '--glyphs', glyphs, '--tol', '0',
    '--truth', truthPath, '--out', outTxt, '--json', jsonPath];
  const r = spawnSync(process.execPath, [join(REPO, 'tools', 'blind-read.mjs'), ...args],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`blind-read exited ${r.status}\n${r.stderr}`);
    process.exit(1);
  }
  const summary = r.stdout.split('\n')
    .filter(l => l.trim() && !l.startsWith('wrote '))
    .map(l => l.replace(/, \d+\.\d+s$/, '')).join('\n') + '\n';
  return { summary, json: JSON.parse(readFileSync(jsonPath, 'utf8')) };
};

const main = read(POOL, join(OUT, 'page.txt'), join(OUT, 'page.json'));
const P = main.json.pages[0];
const lines = P.lines;
console.log(`\ndrawn: ${drawn.length} lines, ${drawn.reduce((s, d) => s + d.glyphs.length, 0)} glyphs, ` +
  `2 objects, tightest pair ${tightGap} blank row${tightGap === 1 ? '' : 's'} apart, ` +
  `page ${PAGE_W}×${PAGE_H} sha ${pageSha.slice(0, 12)}`);
console.log(`read:  ${lines.filter(l => !l.unread).length} lines, ` +
  `${lines.reduce((s, l) => s + (l.glyphs?.length ?? 0), 0)} glyphs, ` +
  `${lines.reduce((s, l) => s + (l.fails ?? 0) + (l.unread ? 1 : 0), 0)} □, ` +
  `space advance ${P.spaceAdv?.toFixed(4)}\n`);

// ---- 1. every drawn line came back, and nothing else did -------------------
const textLines = lines.filter(l => !l.unread);
const unread = lines.filter(l => l.unread);
ok('every line read, no text band left unread',
  textLines.length === drawn.length && textLines.every(l => l.text !== undefined),
  `${textLines.length}/${drawn.length} lines read, ${unread.length} band(s) unread`);

// ---- 2. the certificate, in both directions --------------------------------
// Every text line clean, and the one piece of ink that is not text reported as
// a □ instead of guessed at. A gate on which nothing can fail proves nothing
// about a reader whose whole claim is that errors cannot pass silently.
const textFails = textLines.reduce((s, l) => s + (l.fails ?? 0), 0);
ok('0 □ on the text — every non-object ink pixel explained', textFails === 0,
  textFails ? `${textFails} unreadable clusters in the text` : `${textLines.length} clean lines`);
ok('the one non-text mark is reported as exactly one □',
  unread.length === 1 && unread[0].top >= MARK.y0 - 1 && unread[0].top <= MARK.y0 + 1,
  unread.length === 1 ? `□ band at y ${unread[0].top}, mark drawn at y ${MARK.y0}`
    : `${unread.length} unread bands`);

// ---- 3. the transcript, letter- and space-exact -----------------------------
const gotText = textLines.map(l => l.text);
const wantText = drawn.map(d => d.text);
const badRow = gotText.findIndex((t, i) => t !== wantText[i]);
ok('transcript equals the truth, spacing included', badRow === -1,
  badRow === -1 ? `${wantText.length} rows` :
    `row ${badRow}: got ${JSON.stringify(gotText[badRow])} want ${JSON.stringify(wantText[badRow])}`);
ok('the reader\'s own truth diff agrees',
  /(\d+) rows letter-exact \((\d+) also space-exact\), 0 rows differ/.test(main.summary) &&
  main.summary.includes(`${drawn.length} rows letter-exact (${drawn.length} also space-exact)`),
  main.summary.split('\n').find(l => l.startsWith('vs truth')) ?? 'no truth line');

// ---- 4. every pen, to a quarter pixel --------------------------------------
// The load-bearing one. A transcript can be right for the wrong reason (a
// candidate that byte-matches at a pen nobody drew); recovering all ~500 pens
// exactly means the scan reproduced the producer's own lattice.
let penBad = null, nPens = 0;
for (let i = 0; i < Math.min(textLines.length, drawn.length) && !penBad; i++) {
  const got = textLines[i].glyphs ?? [], want = drawn[i].glyphs;
  if (got.length !== want.length) { penBad = `line ${i}: ${got.length} glyphs vs ${want.length} drawn`; break; }
  for (let k = 0; k < want.length; k++) {
    nPens++;
    if (got[k][0] !== want[k][0] || got[k][1] !== want[k][1]) {
      penBad = `line ${i} glyph ${k}: read ${JSON.stringify(got[k])} drawn ${JSON.stringify(want[k].slice(0, 2))}`;
      break;
    }
  }
}
ok('every recovered pen equals the drawn pen', penBad === null,
  penBad ?? `${nPens} pens on the ¼-px lattice, all 4 phases (${[...phaseSeen].sort().join(',')})`);
ok('the page really uses all four x phases', phaseSeen.size === 4, `${phaseSeen.size} phases drawn`);

// ---- 5. the baselines, including the ½-px one ------------------------------
const baseBad = textLines.map((l, i) => [i, l.baseline, drawn[i]?.baseline])
  .filter(([, got, want]) => got !== want);
ok('every baseline pinned where §1 put it', baseBad.length === 0,
  baseBad.length ? baseBad.map(([i, g, w]) => `line ${i}: ${g} vs ${w}`).join(', ')
    : textLines.map(l => l.baseline).join(' '));
const half = drawn.findIndex(d => d.laidAt !== d.baseline);
ok('a ½-px baseline reads one row down (no subpixel y)',
  half >= 0 && textLines[half]?.baseline === drawn[half].baseline && textLines[half]?.phy === 0,
  half < 0 ? 'no half-px line drawn'
    : `laid at ${drawn[half].laidAt} → drawn and read at ${textLines[half]?.baseline}, phy ${textLines[half]?.phy}`);

// ---- 6. the tight pair -----------------------------------------------------
// Both lines of the closest pair read, at their own baselines, one blank row
// apart — the case where band splitting on blank rows first goes wrong.
ok('the tightest pair is one blank row from being one band', tightGap === 1,
  `lines ${tightPair - 1}/${tightPair}: ink ends ${drawn[tightPair - 1]?.inkBot}, next starts ${drawn[tightPair]?.inkTop}`);

// ---- 7. the objects --------------------------------------------------------
const objs = P.objects ?? [];
const covers = (o, r) => o.x0 <= r.x0 + 2 && o.x1 >= r.x1 - 2 && o.y0 <= r.y0 + 2 && o.y1 >= r.y1 - 2;
ok('the rule is detected as a rule',
  objs.some(o => o.type === 'rule' && covers(o, RULE)),
  objs.filter(o => o.type === 'rule').map(o => `${o.x0}-${o.x1}@${o.y0}`).join(' ') || 'none');
ok('the filled box is detected as a box',
  objs.some(o => o.type === 'box' && covers(o, BOX)),
  objs.filter(o => o.type === 'box').map(o => `${o.x0}-${o.x1}@${o.y0}-${o.y1}`).join(' ') || 'none');
const boxLine = textLines.find(l => l.text?.startsWith('PAYMENT'));
ok('text on both sides of the box still reads, gap transcribed as one space',
  boxLine?.text === 'PAYMENT schedule follows.' && boxLine.fails === 0,
  JSON.stringify(boxLine?.text ?? null));

// ---- 8. word spacing, self-calibrated --------------------------------------
// The reader is never told a space advance; it clusters measured pen gaps.
const trueSpace = FACES.rom.adv(32);
ok('space advance self-calibrated from the gaps alone',
  P.spaceAdv !== null && Math.abs(P.spaceAdv - trueSpace) < 0.25,
  `measured ${P.spaceAdv?.toFixed(4)} px vs drawn ${trueSpace.toFixed(4)} px`);

// ---- 9. per-band font detection --------------------------------------------
const fontBad = textLines.map((l, i) => [i, l.font, drawn[i]?.sets])
  .filter(([, got, want]) => !want?.includes(got));
ok('each band picked a face it was actually drawn with', fontBad.length === 0,
  fontBad.length ? fontBad.map(([i, g, w]) => `line ${i}: ${g} ∉ ${w?.join('+')}`).join(', ')
    : [...new Set(textLines.map(l => l.font))].join(' '));

// ---- 10. the decoy ---------------------------------------------------------
// The reader half's version of the rule lab/selftest.mjs and rust:certify lean
// on: exactness must not be able to invent a transcript. Read the same page
// with a pool that cannot explain the 16-px body — the 12-px faces are still
// there, so the two lines they DID draw must still read, and not one row of
// the other ten may come back letter-exact.
const dec = read(DECOY, join(OUT, 'decoy.txt'), join(OUT, 'decoy.json'));
const decLines = dec.json.pages[0].lines.filter(l => l.text);
const decTexts = new Set(decLines.map(l => l.text));
const monoDrawn = drawn.filter(d => d.sets.every(s => s === 'nimbus791' || s === 'dejavuserif786'));
const strayRow = drawn.filter(d => !monoDrawn.includes(d)).find(d => decTexts.has(d.text));
ok('a decoy pool transcribes nothing it cannot explain', strayRow === undefined,
  strayRow ? `read a line it has no face for: ${JSON.stringify(strayRow.text)}`
    : `${decLines.length} lines read of ${drawn.length} (the ${monoDrawn.length} its faces drew)`);
ok('the decoy still reads the lines its own faces drew',
  monoDrawn.every(d => decTexts.has(d.text)),
  `${monoDrawn.filter(d => decTexts.has(d.text)).length}/${monoDrawn.length}`);

// ---- 11. the committed reference -------------------------------------------
const transcript = readFileSync(join(OUT, 'page.txt'), 'utf8');
const refFiles = { 'page.txt': transcript, 'page.summary': main.summary,
  'page.sha256': `${pageSha}  ${PAGE_W}x${PAGE_H} drawn by tools/synth-gate.mjs\n` };
if (REGEN) {
  mkdirSync(REF, { recursive: true });
  for (const [f, body] of Object.entries(refFiles)) writeFileSync(join(REF, f), body);
  console.log(`\nre-recorded ${Object.keys(refFiles).length} reference files in fixtures/synth-ref/`);
} else {
  const diff = Object.entries(refFiles).filter(([f, body]) =>
    !existsSync(join(REF, f)) || readFileSync(join(REF, f), 'utf8') !== body);
  ok('byte-identical to the committed reference', diff.length === 0,
    diff.length ? `${diff.map(([f]) => f).join(', ')} differ — re-record with --regen only if the change is intended`
      : Object.keys(refFiles).join(', '));
}

rmSync(join(OUT, 'decoy.json'), { force: true });
console.log(fail
  ? `\nSYNTHETIC GATE FAILED: ${fail} check(s)`
  : `\nSYNTHETIC GATE CERTIFIED: ${drawn.length} lines, ${nPens} pens and every baseline recovered, ` +
    `0 □ on the text and 1 on the ink that is not text`);
process.exit(fail ? 1 : 0);
