// families.mjs — THE registry of proven producer families, as data. Everything
// this project has byte-certified about how a document raster gets made lives
// here in machine-readable form, so `identify.mjs` can try every known answer
// automatically and a new hunt starts warm instead of from a blank page.
//
// **Each entry cites the DOCUMENT that proves it, not a prose file.** The old
// repo's `record` fields pointed at seven FINDINGS-*.md; those went stale, and
// the document pixels never do. If you doubt an entry, re-read its document —
// that is the authority, and re-reading it is one command.
//
// Add a family the moment it is byte-proven. The constants here are COPIES for
// machine use ([METHOD rule 1](../docs/METHOD.md)); the pixels remain the
// authority.
//
// ## Two kinds of entry
//
// **renderable** — a glyph config ftclone reproduces byte-for-byte:
//   { font, em64, fy, gid, law }
//   - fx is ALWAYS the ¼-px lattice [0,16,32,48]/64 and draws is always 1
//     (double-draw was tried and refuted). See ../docs/LAWS.md §1.
//   - fy is in 1/64 px. [0] = integer baselines, which is the only thing
//     mupdf's fillText can produce (LAWS §1: y rounds to whole pixels).
//     [0,32] additionally tries a true ½-px baseline; it only matters when it
//     changes the RASTER, since the exact test is bbox-aligned.
//   - gid: 'cmap' (TTF — ttf.mjs resolves the codepoint itself)
//          'mupdf' (bare CFF — gid map from mupdf encodeCharacter on the same
//          bytes, because a CFF has no cmap)
//   - law: the cov → page-byte map, keyed into LAWS below.
//
// **pageLaw** — no per-glyph render: a page-level transform, or a producer the
// ¼-px engine cannot match. Carries the fingerprint that identifies it and
// what to do about it.
import { existsSync } from 'node:fs';

// ---------------------------------------------------------------- font paths
// METHOD rule 3 in code: Windows installs fonts PER USER as well as globally,
// and the Settings font list merges the two, so a roster built from
// C:/Windows/Fonts alone is HALF the machine. That gap hid DejaVu Serif for a
// week and then wrote off TimesNewRoman8 as a lost artifact. Both directories,
// always — and `face()` reports which one answered.
// The same rule applied one step further: a face that is INSTALLED is not the
// same set as a face this machine HAS. Office caches its cloud fonts under
// AppData/Local/Microsoft/FontCache/*/CloudFonts, and applications ship their
// own; none of those are in any of the three directories below, so a hunt that
// stops here reports "not this face" when it means "not installed here".
// TOL0_FONT_DIRS (`;`-separated) appends scratch roster directories for exactly
// that — widen the roster without pretending the fonts are installed.
export const FONT_DIRS = [
  'C:/Windows/Fonts',
  `${(process.env.LOCALAPPDATA ?? '').replace(/\\/g, '/')}/Microsoft/Windows/Fonts`,
  new URL('../fonts/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  ...(process.env.TOL0_FONT_DIRS ?? '').split(';').filter(Boolean).map(d => d.replace(/\\/g, '/')),
];

/** Resolve a bare font file name against every roster directory. Returns null
 *  when no directory has it — which is a statement about this machine, not
 *  about the document. */
export function face(name) {
  if (/^([A-Za-z]:|\/)/.test(name)) return existsSync(name) ? name : null;
  for (const d of FONT_DIRS) {
    const p = `${d.replace(/\/$/, '')}/${name}`;
    if (existsSync(p)) return p;
  }
  return null;
}

// --------------------------------------------------------------------- laws
// A blend law maps FreeType coverage (0..255) to the byte the producer wrote.
// Integer laws are non-surjective, so the bytes a producer CAN emit have holes
// — and the holes are a fingerprint independent of the face. That is how the
// calibri 'mid' law was pinned (its hole is at 127/128).
const LIN = v => (v >= 128 && v <= 254 ? v + 1 : v);
const lut = f => { const L = new Uint8Array(256); for (let c = 0; c < 256; c++) L[c] = f(c); return L; };

export const LAWS = {
  // mupdf's own composite of black over white — ../docs/LAWS.md §2.
  fz:     lut(c => (255 * (256 - (c + (c >> 7)))) >> 8),
  // plain source-over, no >>7 correction. Not mupdf; kept because a sweep that
  // cannot express it cannot refute it.
  src:    lut(c => 255 - c),
  // the eDiscovery producer's +1 post-law on light bytes (LAWS §4).
  fzLin:  lut(c => LIN((255 * (256 - (c + (c >> 7)))) >> 8)),
  srcLin: lut(c => LIN(255 - c)),
  // 'linear254' in engine terms: raw 254 (coverage 1) goes to 255 and the
  // pixel disappears. The nimbusrom family, NOT the report family.
  fzLin254: lut(c => { const b = (255 * (256 - (c + (c >> 7)))) >> 8; return b >= 128 && b <= 254 ? Math.min(255, b + 1) : b; }),
  // the Calibri letterhead law: every antialias byte pushed 1 away from the
  // 127/128 midpoint.
  mid:    lut(c => { const t = 255 - c; return Math.max(0, Math.min(255, t + (t >> 7) - ((255 - t) >> 7))); }),
};

/** The DISTINCT laws, in LAWS order, the first name winning — and this is a
 *  correction, measured 2026-07-26 while certifying `lab/rust`.
 *
 *  **`fzLin`, `fzLin254` and `mid` are ONE map**: they agree on all 256
 *  coverages, so three of the six entries above are aliases. `min(255, b+1)`
 *  guards a case fz can never produce (b = 255 is not in [128,254]), and the
 *  Calibri midpoint push lands on the same bytes as the +1 post-law. Only four
 *  laws here are distinguishable from pixels: `fz`, `src`, `fzLin`, `srcLin`.
 *
 *  A sweep that enumerated all six reported every linear-family hit THREE
 *  times and then answered "which law?" with whichever alias came first in
 *  this object — an ambiguity that looked like evidence. Sweeps iterate this
 *  list; `identify` still keys `LAWS` by name, so a family may keep citing the
 *  law it was proven with. Two names for one map is honest documentation; two
 *  names in one search is not. */
export const LAW_NAMES = Object.keys(LAWS).filter((k, i, all) =>
  !all.slice(0, i).some(p => LAWS[p].every((v, c) => v === LAWS[k][c])));

/** Smallest coverage a law renders as ink (byte < pgm.INK). The LUTs are
 *  monotone in coverage, so this is the threshold at which a candidate's bbox
 *  is measured — and it MUST be the law's own, not a constant. Using a fixed
 *  threshold made every glyph with a faint 250..254 fringe measure 1–2 px too
 *  wide and get rejected before its bytes were ever compared. */
export const covMin = Object.fromEntries(Object.entries(LAWS).map(([k, L]) => {
  let c = 0; while (c < 256 && L[c] >= 250) c++;
  return [k, c];
}));

// ---------------------------------------------------------------- the families
export const FAMILIES = [
  // ---- mupdf @ 96 dpi over installed Windows faces (the corpus family) ----
  // Plain fz blend, nothing else. Proven by whole-document reads at tol 0.
  { name: 'times16', renderable: true, font: 'times.ttf', em64: 1024, fy: [0, 32], gid: 'cmap', law: 'fz',
    set: 'times16', record: 'gate v3.pdf + big.pdf — 25,586 lines, 0 □' },
  { name: 'times13', renderable: true, font: 'times.ttf', em64: 832, fy: [0, 32], gid: 'cmap', law: 'fz',
    set: 'times13' },
  { name: 'cour13', renderable: true, font: 'cour.ttf', em64: 832, fy: [0, 32], gid: 'cmap', law: 'fz',
    set: 'cour13', record: 'gate courier_1.pdf + courier_2.pdf — 0 □' },
  { name: 'cour16', renderable: true, font: 'cour.ttf', em64: 1024, fy: [0, 32], gid: 'cmap', law: 'fz', set: 'cour16' },
  { name: 'cour12', renderable: true, font: 'cour.ttf', em64: 768, fy: [0, 32], gid: 'cmap', law: 'fz', set: 'cour12' },
  { name: 'arial16', renderable: true, font: 'arial.ttf', em64: 1024, fy: [0, 32], gid: 'cmap', law: 'fz', set: 'arial16' },
  { name: 'calibri16', renderable: true, font: 'calibri.ttf', em64: 1024, fy: [0, 32], gid: 'cmap', law: 'fz', set: 'calibri16' },
  { name: 'segoeui16', renderable: true, font: 'segoeui.ttf', em64: 1024, fy: [0, 32], gid: 'cmap', law: 'fz', set: 'segoeui16' },
  // Verdana and MS Reference Sans Serif are the SAME PIXELS. Measured
  // 2026-07-26 through ftclone at em64 1024: 94 printable ASCII × 4 pen phases
  // = **376 of 376 rasters identical, none differing, neither face missing a
  // glyph the other has**. So an `m`-bank verdict of `REFSAN` and one of
  // `verdana` are the same answer, not a disagreement — which is worth knowing
  // before someone re-opens a hunt because two rosters "named different
  // faces". A tie of this kind is METHOD rule 6 in its cheapest form: the
  // faces are indistinguishable from pixels, so pick either and say so.
  //
  // NOT a clean read yet — see the `verdana-jitter-partial` note below.
  { name: 'verdana16', renderable: true, font: 'verdana.ttf', em64: 1024, fy: [0, 32], gid: 'cmap', law: 'fz',
    set: 'verdana16', record: 'EFTA00688178 — 49/152 cc-harvested targets exact at tol 0, every other family 0' },
  { name: 'georgia16', renderable: true, font: 'georgia.ttf', em64: 1024, fy: [0, 32], gid: 'cmap', law: 'fz', set: 'georgia16' },

  // ---- the eDiscovery linear producer (report.pdf) ----
  // Same blend, then +1 on every light byte. 8 pt at 96 dpi, so em64 682 with
  // advances at the UNtruncated 10.6666… px — LAWS §6.
  { name: 'times16-linear', renderable: true, font: 'times.ttf', em64: 1024, fy: [0, 32], gid: 'cmap', law: 'fzLin',
    set: 'timeslin16', record: 'gate report.pdf' },
  { name: 'tnr8-linear10', renderable: true, font: 'TimesNewRoman8_Clean.ttf', em64: 682, sizePx: 10.667, fy: [0], gid: 'cmap', law: 'fzLin',
    set: 'tnr8lin10', record: 'gate report.pdf body — per-USER font, see FONT_DIRS' },

  // ---- sans-body email family: Arial 14 pt under the palette page law ----
  // The corpus's majority email BODY face. Its certified read command has
  // shipped as glyph-registry POOLS `arialEmail` since 07-22 while this file
  // had no entry at all, so `identify` answered "no known family matches" on a
  // SOLVED producer and the registry's own comment cited a family that did not
  // exist. Measured here 2026-07-27 on EFTA00678329 p1, 42 component-harvested
  // targets (`hunt harvest`, since Arial is proportional):
  //   - `--scan arial.ttf --ems 1150..1240` spikes at em64 1194 and NOWHERE
  //     else in the 91-wide window. 1194/64 = 18.656 px = 14 pt at 96 dpi.
  //   - the reader reads the page whole: 9 lines / 365 glyphs / 7 □ at tol 0
  //     under `blind-read --pool arialEmail`.
  //
  // **Expect a THIN identify score here, and do not read it as a weak match.**
  // This producer palettizes the page (`palette-quant` below) and identify has
  // no palette step, so a target can only match where the ideal byte already
  // is a palette gray. Pushing the SAME config's candidate bytes through the
  // page's own quant map lifts it from 2/42 (1 char) to 14/42 (9 chars), while
  // every decoy stays flat 0 under that same map — arial at em64 1024/1190/
  // 1198, times/tahoma/verdana at 1194, and arial 1194 under fzLin and src.
  // Face, size, lattice and law are right; the page is quantized.
  //
  // That is the family's rule, not this document's quirk: of 2,500 corpus PDFs
  // sampled by `mbank scan --tol1`, 54 sight arial@1194 and only ONE carries a
  // byte-exact `m` at all — the bank's own post-law grading (`nExact/nHit`).
  { name: 'arial1194', renderable: true, font: 'arial.ttf', em64: 1194, fy: [0], gid: 'cmap', law: 'fz',
    set: 'arial1194', record: 'EFTA00678329 p1 — 365 glyphs / 7 □ at tol 0 via pool arialEmail; identify 2/42 raw, 14/42 through the page palette, all decoys 0' },
  // Weight companions: same producer, same tuple, a different face file. They
  // ship in the certified pool, and NEITHER fires on EFTA00678329 — its body is
  // regular and its headers are corpus-law times16 (both halves ride the one
  // pool). So these two are carried from the pool, unproven on pixels of their
  // own; they are the entry a bold- or italic-heavy family document needs.
  { name: 'arialbd1194', renderable: true, font: 'arialbd.ttf', em64: 1194, fy: [0], gid: 'cmap', law: 'fz', set: 'arialbd1194' },
  { name: 'ariali1194', renderable: true, font: 'ariali.ttf', em64: 1194, fy: [0], gid: 'cmap', law: 'fz', set: 'ariali1194' },

  // ---- Tahoma email family: the largest tol-0 corpus population ----
  // Found by the m-bank prefilter (`mbank.mjs scan`) and proven the same day.
  // Plain fz, integer y, no post-law — the exotic part was only finding it.
  { name: 'tahoma853', renderable: true, font: 'tahoma.ttf', em64: 853, fy: [0], gid: 'cmap', law: 'fz',
    set: 'tahoma853', record: 'EFTA01164435 1,963 glyphs 0 □ · EFTA00644019 3,659 0 □; 6,870 docs at this em64' },
  { name: 'tahomabd853', renderable: true, font: 'tahomabd.ttf', em64: 853, fy: [0], gid: 'cmap', law: 'fz', set: 'tahomabd853' },
  { name: 'tahoma832', renderable: true, font: 'tahoma.ttf', em64: 832, fy: [0], gid: 'cmap', law: 'fz',
    set: 'tahoma832', record: 'EFTA00999916 1,759 glyphs 5 □; 894 docs' },
  { name: 'tahomabd832', renderable: true, font: 'tahomabd.ttf', em64: 832, fy: [0], gid: 'cmap', law: 'fz', set: 'tahomabd832' },
  { name: 'tahoma1024', renderable: true, font: 'tahoma.ttf', em64: 1024, fy: [0], gid: 'cmap', law: 'fz',
    set: 'tahoma1024', record: 'EFTA01156316 844 glyphs 0 □; 147 docs' },
  { name: 'tahomabd1024', renderable: true, font: 'tahomabd.ttf', em64: 1024, fy: [0], gid: 'cmap', law: 'fz', set: 'tahomabd1024' },
  // The same producer's threads quote a SECOND body face at the SAME size —
  // EFTA00142692 reads its Tahoma and Segoe halves in one pass. METHOD rule 6:
  // a tie can be the answer.
  { name: 'segoeui853', renderable: true, font: 'segoeui.ttf', em64: 853, fy: [0], gid: 'cmap', law: 'fz', set: 'segoeui853' },
  { name: 'segoeuib853', renderable: true, font: 'segoeuib.ttf', em64: 853, fy: [0], gid: 'cmap', law: 'fz', set: 'segoeuib853' },

  // ---- mupdf-lineage renderer over the builtin base-14 faces ----
  // The producing PROGRAM is unidentified; only the render law is proven, and
  // that is enough to read the documents. em64 791 = 12.359375 px isotropic.
  { name: 'nimbus791', renderable: true, font: 'NimbusMonoPS-Regular.cff', em64: 791, fy: [0], gid: 'mupdf', law: 'fz',
    set: 'nimbus791', record: 'gate n791 block — 11 docs, 5,028/5,028 truth rows incl. spacing' },

  // ---- eDiscovery serif family: builtin Nimbus + linear254 + per-page palette ----
  // The palette step is per PAGE and read off the page itself, so it is a
  // reader flag (`--palette`), not something a glyph render can carry.
  { name: 'nimbusromlin1024', renderable: true, font: 'NimbusRoman-Regular.cff', em64: 1024, fy: [0], gid: 'mupdf', law: 'fzLin254',
    set: 'nimbusromlin1024', record: 'gate nimbusrom.pdf — 12 pages, 13,034 glyphs, 38 □ (censused: fixtures/gate-ref/README.md)' },
  { name: 'nimbusrombdlin1024', renderable: true, font: 'NimbusRoman-Bold.cff', em64: 1024, fy: [0], gid: 'mupdf', law: 'fzLin254', set: 'nimbusrombdlin1024' },
  { name: 'nimbusromlin983', renderable: true, font: 'NimbusRoman-Regular.cff', em64: 983, fy: [0], gid: 'mupdf', law: 'fzLin254', set: 'nimbusromlin983' },
  { name: 'nimbusromilin1024', renderable: true, font: 'NimbusRoman-Italic.cff', em64: 1024, fy: [0], gid: 'mupdf', law: 'fzLin254', set: 'nimbusromilin1024' },
  { name: 'nimbusrombdlin1194', renderable: true, font: 'NimbusRoman-Bold.cff', em64: 1194, fy: [0], gid: 'mupdf', law: 'fzLin254', set: 'nimbusrombdlin1194' },
  { name: 'nimbussansbdlin1536', renderable: true, font: 'NimbusSans-Bold.cff', em64: 1536, fy: [0], gid: 'mupdf', law: 'fzLin254', set: 'nimbussansbdlin1536' },
  // The same pages also embed a REAL Times New Roman subset for ■ and curly
  // quotes, rendered at the same pens. METHOD rule 6 again.
  { name: 'tnrlin1024', renderable: true, font: 'times.ttf', em64: 1024, fy: [0], gid: 'cmap', law: 'fzLin254', set: 'tnrlin1024' },
  // The REAL TNR Bold companion (METHOD rule 6 a third time on these pages).
  // Proven 2026-07-30: P5 heading tail `("DRY CELL" STATUS)` — 6/7 clean
  // components byte-exact at em64 1024 under fzLin254 + the page-5 palette
  // quantMap (R Y ” S T A; scan 950..1100 hits ONLY 1024; NimbusRoman-Bold
  // decoy 0/6, and its own control E hits only NimbusRoman-Bold@1024). NOTE:
  // identify's exact test has no palette step, so this family scores thin here
  // — the reader with --palette is what confirms it.
  { name: 'tnrbdlin1024', renderable: true, font: 'timesbd.ttf', em64: 1024, fy: [0], gid: 'cmap', law: 'fzLin254',
    set: 'tnrbdlin1024', record: 'gate nimbusrom.pdf P5 y745 heading tail — palette-aware 6/7 exact @1024, decoys flat 0' },
  // Sub-family of the same palette container (ECF court filings): NO linear
  // step. One sub-family per SOURCE-document producer.
  { name: 'censcbk1198', renderable: true, font: 'CENSCBK.TTF', em64: 1198, fy: [0], gid: 'cmap', law: 'fz',
    set: 'censcbk1198', record: 'EFTA00093044 brief body, exact' },

  // ---- Word→JPEG letterheads on Calibri VERSION 1.02 ----
  // METHOD rule 7 one level down: the installed Calibri 6.2x is a DIFFERENT
  // DRAWING of w and x. This needs the 1.02 build, which is not on most
  // machines, so these entries usually skip — and a skip is not a refutation.
  { name: 'calibri102-16', renderable: true, font: 'calibri-102.ttf', em64: 1024, fy: [0], gid: 'cmap', law: 'mid',
    set: 'calibri102mid_1024', record: 'EFTA00038617 + EFTA01649149 — 0 □ at tol 2' },
  { name: 'calibrib102-16', renderable: true, font: 'calibrib-102.ttf', em64: 1024, fy: [0], gid: 'cmap', law: 'mid', set: 'calibrib102mid_1024' },

  // ---- EFTA01150379: DejaVu Serif @ 786 ----
  // The one entry that is deliberately NOT a pool: the face is right, the BUILD
  // is wrong, so it reads at tol 4 and tol would be part of the proof
  // (METHOD rule 5). Reproduce it explicitly. NARROWED 2026-07-27 — the miss is
  // not "lowercase t alone", it is every glyph with off-curve points:
  //
  //   * OFF-CURVE POINTS PARTITION THE SPLIT EXACTLY — measured on 5,172
  //     ISOLATED page components (clean 1-px ring, window cut as a page
  //     RECTANGLE), not on the 391 targets, which are contaminated (below):
  //         I + 1 F 7 H 4   2,204 instances   100% byte-exact
  //         E                 275                99%
  //         N  M              104             83% / 72%
  //         G C 3 2 0 p 8 B D P 5 S Q 9 b 6 a c O s e U o
  //                         2,589 instances     0%
  //     The 100% group is exactly the glyphs with ZERO off-curve points in
  //     glyf; the 0% group is exactly the glyphs that have them.
  //   * THE TARGET SET UNDERSTATES THIS BADLY. lab/targets/DJ840 cuts a window
  //     as the 8-connected COMPONENT with every other pixel forced to 255, so a
  //     neighbour's faint tail and the glyph's own sub-250 fringe disagree.
  //     Over 12 pages: component-cut windows 16.5% byte-exact, the same
  //     components cut as page RECTANGLES 35.1%, and isolated ones 51.7%.
  //     That is why the same character shows both exact and missing variants
  //     in the target set — a cut artifact, not a font one.
  //   * HINTING IS REFUTED. Instruction length does not partition anything: the
  //     exact glyphs carry 48..499 bytes of instructions (X has 499), the
  //     curved ones 43..295. A grid-fitted producer would have moved the stems
  //     of K L T X too, and those are byte-exact.
  //   * THE RASTERIZER IS REFUTED. ftclone's conic path is certified against
  //     mupdf on Carlito — a quadratic TTF — over the whole printable ASCII
  //     alphabet, curves included, at 0 diffs / 1128 renders. Separately,
  //     routing every quadratic through the CUBIC walker by exact degree
  //     elevation (c1 = p0+⅔(q−p0), c2 = p2+⅔(q−p2)) changes NOTHING, so it is
  //     not conic-vs-cubic sampling either.
  //   * SIZE IS NOT IT. em64 786 is a sharp unique spike: 9 targets exact,
  //     and every em64 in 776..796 other than 786 scores exactly 0.
  //   * So what differs is the off-curve CONTROL POINT VALUES, by ~1..2 font
  //     units at 2048 upm — curve edges land 1..2/255 off, interior and edge
  //     alike, which is a redrawn outline and not a placement error.
  //
  //   * THE LAW IS PLAIN fz, MEASURED not assumed. Aligning every window whose
  //     strong ink (<200) already agrees and tabulating coverage -> page byte:
  //     241 of 242 coverage values map to exactly fz(cov), single-valued. The
  //     one multi-valued entry is cov 0, which is a neighbour's tail landing in
  //     the box, not a law.
  //   * THE PEN LATTICE IS EXACTLY THE ¼-px ONE. Rebuilding the render bank at
  //     8, 16 and 64 x-phases reproduces the SAME 2,673 isolated components as
  //     4 phases — not one extra. Independently, the page draws its 5x11 glyph
  //     in exactly 4 distinct rasters over 5,799 instances (1496/1467/1421/1415)
  //     and its 9x8 in exactly 2. Unlike page-downscale-816x1073, this document
  //     really is on the lattice.
  //   * VERSION DRIFT IS REFUTED, and not by sampling: the SplineSet geometry
  //     of this exact 18-glyph partition (coordinates + operator only, point
  //     numbering stripped so a re-save cannot fake a diff) is IDENTICAL across
  //     every shipped DejaVuSerif.sfd — all 2.x release tags plus 1.0 and 1.10,
  //     Vera-derived base included. The source is `Order2: 1`, native
  //     quadratics, so there is no cubic→quad build conversion to hide in.
  //     Confirmed independently from the repository history: the FIRST commit
  //     (2005-04-13, Version 1.8) and 2007-03-21 (Version 2.15) were built from
  //     .sfd with FontForge and both render the DJ840 targets identically to
  //     shipped 2.34 — same glyf points for 'o', same 9/67. Two years of
  //     history and 26 minor versions change nothing here.
  //   * THE FLATTENING ERA IS REFUTED, all five of them. Straight and diagonal
  //     segments bypass subdivision and go straight to gray_render_line — which
  //     is why K L T X Y Z w x hold exact and simultaneously pin the producer
  //     to the FreeType LINE path — while conics go through gray_render_conic,
  //     which changed five times between 2007 and the 2.13 ftclone speaks. All
  //     five eras were ported behind `FTClone.conicEra` and run at em64 786
  //     (curved-target residual, lower is closer; exact count never moved off
  //     9/67 for any of them):
  //         2.10+        DDA, the certified default        473   <- closest
  //         2.6.5–2.9.1  ft28, uniform bisection           473   (identical)
  //         2.4.12–2.6.2 ft261, recursive subdivision      479
  //         ~2.4.8       verified ≡ 2.6.1 (code motion)    479
  //         ≤2.3.x       ft240; 2.3.12 verified ≡ 2.4.0    538 / 982 / 2110
  //                      (conic_level 64 / 128 / 32)
  //     Every legacy era moves AWAY from the page, so the residual is not
  //     flattening-shaped. At this size the modern rule barely subdivides at
  //     all — swapping DDA for the 2.6.1 rule changes 'o' by ZERO bytes — so
  //     the era simply has no leverage on a 12.28 px glyph.
  //
  // ---- MECHANISM FOUND 2026-07-29. The font was never a different FONT. ----
  // It is stock DejaVu Serif put through a QUAD -> CUBIC -> QUAD round trip on
  // the 2048 grid, which perturbs only curves and leaves every straight segment
  // untouched — which is why the partition below looked like a build
  // difference for so long:
  //
  //   materialize the implied half-integer boundaries, round HALF-UP
  //   elevate per segment  C1 = P + ⅔(Q−P),  C2 = R + ⅔(Q−R), round half-up
  //   convert back         q1 = (3·C1 − P) >> 1
  //                        q2 = (3·C2 − R) >> 1
  //                        Q' = (q1 + q2) >> 1
  //   then a STALE hmtx: the bbox was recomputed and hmtx was not, so the
  //   renderer shifts each glyph by (lsb − xMin_new).
  //
  // Verified here by reimplementing it from that description alone and
  // measuring on 5,172 ISOLATED page components — a set the Ubuntu session
  // never saw:
  //     stock DejaVu Serif 2.34         51.7%   kit refs: control 27/27 target  0/47
  //     round trip                      85.2%             control 27/27 target 23/47
  //     round trip + stale hmtx         98.5%             control 27/27 target 34/47
  //     round trip WITHOUT the rounding 51.7%             control 27/27 target  0/47
  // That last row is the control that matters: elevation followed by
  // back-conversion is algebraically the identity, so with rounding disabled it
  // must return to baseline exactly — and it does. The entire effect is the
  // grid rounding, not the reimplementation.
  //
  // GRADE: recreation confirmed as MECHANISM by independent reimplementation
  // with the rounding-off identity control; EXACT on audited clean windows;
  // 98.5% on the raw isolated census with the residual dispositioned below and
  // no curve-attributable crack found.
  //
  // Residual disposition — all 78, and the answer is that none of them is the
  // law's. The Ubuntu corpus run's structural claim is BIMODALITY: a window
  // reads at 0 or misses far, never by a few grey levels. Confirmed here on
  // three sets, and the near band is empty in every one:
  //     raw isolated census   78 miss:  1-10 → 0,  11-50 → 0,  51-211 → 0,  ≥212 → 78
  //     their refs-clean       0 miss (58 exact, 2 no-dims → reconciles their 60/60)
  //     their refs-held        3 miss, all ≥212 (l, l, g — l is a catalogued homoglyph)
  // 42 of the 78 are COMMON-MODE — byte-identical diff under stock and under
  // the law font — so the transform provably never touched them; they are
  // concentrated in M and N, which are polygon-only. The other 36 are all far
  // misses, consistent with contamination or homoglyph labels (0/O, 1/l//, I/l)
  // and not with a crack, which would land in the near band.
  //
  // ARTIFACT WARNING. `ubuntu-kit/sweep-hits/SELFTEST-gridtrip.ttf` is NOT the
  // law font: 56.0% raw census, 5/47 target. Identified as an earlier vintage —
  // it differs from stock on 1792 glyphs where the law differs on 1987, and its
  // stale-hmtx set is {d,e,q}, missing the S the law names. It is NOT the
  // reversed-contour decoy (sign(5) and sign(S) match stock). Two guards follow
  // from that and are worth keeping: a self-test or decoy artifact must never
  // share a namespace with a deliverable, and a claimed-solved state must ship
  // a checksum-named object rather than a pointer into a scratch directory.
  // The deliverable here is `lab/base64/dejavuserif786-law-75707371a24d48cf.ttf`
  // (sha256 75707371a24d48cf…), regenerable by `node lab/transform.mjs
  // fonts/DejaVuSerif.ttf out.ttf --stalehmtx` — the transport law, tracked.
  //
  // PIN RESOLVED 2026-07-29, and it is NOT an equivalence class — the corpus
  // discriminates the candidate maps by 46 points. The disagreeing operation is
  // the BACK-CONVERSION ROUNDING, localized by running the archived
  // ubuntu-kit/gridtrip.py on Windows and diffing its glyf against this one:
  //
  //   floor, two-arm — q = (3C−P) >> 1 each, then Q = (q1+q2) >> 1   98.5%
  //   their `c2` / qround down                                       58.6%
  //   their `c1` / qround down                                       58.5%
  //   their `avg` and `pickax` / down                                54.4%
  //   their `mid` / up  (r_up per arm, then average)                 51.8%
  //   stock DejaVu Serif 2.34                                        51.7%
  //
  // Confirmed by substitution rather than inference: switching ONLY the arm
  // rounding in this implementation from >>1 to r_up reproduces their geometry
  // character for character ('o' first off-curve 765 vs stock 764 vs 763 here,
  // materialized midpoint 840,187 identical in both) and drops the score to
  // 51.8%, matching their cell. So `expand` is not the pin; the arm rounding is.
  //
  // The circulated recipe text — "q1=(3C1−P0)>>1; q2=(3C2−P3)>>1; Q=(q1+q2)>>1"
  // — is therefore literally correct, and is NOT any member of gridtrip.py's
  // `BACK` dict: `back_mid` is the nearest in shape but rounds each arm half-up
  // and averages in float.
  //
  // CONCORDANCE, and the fork was illusory. `ubuntu-kit/backlaw.py` — whose own
  // docstring opens "THIS FOUND THE LAW" and states the three shifts verbatim as
  // cell `two-hdn` (== `two-floor`; every intermediate is an integer or an exact
  // half, so half-down IS floor IS >>1) — was run here and agrees with this
  // reimplementation on all three pre-registered predictions:
  //     (i)   contour geometry byte-identical on 65 of 65 base64 glyphs
  //     (ii)  full-font stale-hmtx set {6,C,O,Q,S,d,e,g,q}, exactly
  //     (iii) identical scores in every cell — refs-clean 25/25 + 33/35,
  //           refs-held 61/71, kit refs 27/27 + 34/47, raw census 98.5%
  // So `gridtrip.py` is a STALE VINTAGE of the same class as SELFTEST, and its
  // per-glyph "arm" was withdrawn in-session: backlaw.py records that the arm
  // was entirely the hmtx confound (fontTools recomputes a bbox on save and
  // leaves hmtx alone, so rounding a glyph's leftmost point inward silently
  // translates it by +1), that `two` equals min(c1,c2) on 45,612 of 45,612
  // axis-values, and that a 208-bit per-segment arm ORACLE loses to this 0-bit
  // law because the decision is per AXIS. The law is parameter-free. Its
  // {S,d,e,q} was the fitted-corpus scope of the same set measured full-font
  // here — one clause, not two.
  //
  // GUARD, learned the expensive way: this time the PROSE handoff was exact and
  // the CODE archive was lossy, because the prose was written at session end
  // while the gitignored kit silently carried older vintages. Archived code must
  // be regenerated or content-stamped at session end the same way deliverables
  // are; a kit that survives sessions but not edits is a second SELFTEST waiting
  // to happen.
  //
  // Where that leaves it. Face, em64, blend law and pen lattice are PROVEN —
  // thousands of straight-sided instances are byte-exact and nothing else on a
  // 1,253-face roster reproduces even one. Upstream geometry (to the first
  // commit), hinting, the rasterizer, degree elevation, the size and all five
  // flattening eras are eliminated. The whole remaining defect is that curved
  // glyphs land 1..2 coverage units off, always, and only them.
  //
  // Since ftclone's conic path is certified against mupdf 1.28 on Carlito's
  // curves at 0 diffs, a mupdf 1.28 producer would MATCH. So the producer is a
  // different FreeType build, and the axis that has never been tested is the
  // BUILD-TIME one: FT_INT64 vs the 32-bit fallback arithmetic, and the real
  // libfreetype of a 2009-2015 Linux imaging stack. That is a native test, not
  // a port — render DejaVu Serif at em64 786 through Ubuntu's own libfreetype
  // across a few versions and diff against the page. Two outcomes, both worth
  // having: a hit closes the pool and adds a fifth axis to the tuple, and a
  // miss finally sends the hunt to distro package archives for a patched font.
  //
  // Practical note for the reader, independent of all that: the 100% group is
  // 46% of isolated instances. A read that windowed on page RECTANGLES rather
  // than components would start from 35.1% instead of 16.5%.
  //
  // The published 9/391 is against a contaminated denominator: only 67 of the
  // 391 DJ840 targets are single glyphs. This document's text is dense enough
  // that 8-connected components fuse — the target labelled 'O' is 26 px wide
  // against a 9 px render — so the honest score is 9 of 67.
  { name: 'dejavuserif786', renderable: true, font: 'DejaVuSerif.ttf', em64: 786, fy: [0], gid: 'cmap', law: 'fz',
    set: null, record: 'EFTA01150379 — 9/67 single-glyph DJ840 targets byte-exact (9/391 raw, 324 of those merged components); 21.0% of 2,194,088 instances byte-exact; 94.5%/page at tol 4' },

  // ---- page-law families: recognize by fingerprint, do not try to render ----
  { name: 'palette-quant', renderable: false,
    fingerprint: 'reads "almost, but ±1" against a proven rasterizer',
    action: 'reader --palette: page byte = nearest available gray, ties darker. The palette is read off the page, so its grays are fixpoints (../docs/LAWS.md §4). It also SUPPRESSES identify: the exact test has no palette step, so a renderable family under this law scores a few percent of its targets rather than none — see `arial1194`, 2/42 raw vs 14/42 through the map, decoys 0 under both.',
    record: 'gate v3.pdf, email.pdf P1; EFTA00678329 (189 of 256 grays present, identity on every one of them — a rich palette is not a detector, see mbank.mjs)' },
  { name: 'jpeg-jitter', renderable: false,
    fingerprint: 'mode-3 colour raster, ±1 channel jitter on ink, blue mailto links',
    action: 'reader --tol 1, justified by the documented producer law and by every tol-0 document in the family staying byte-identical under it',
    record: 'EFTA00142692 — 361 □ at tol 0, 36 □ at tol 1' },
  // MECHANISM MEASURED 2026-07-27. The old entry had the symptom (a continuous
  // pen lattice) but not the cause, and lab/base64/README.md drew the opposite
  // conclusion from it — "lossless FlateDecode, so byte-exactness is reachable
  // in principle". It is not: FlateDecode says the LAST encoding step was
  // lossless, nothing about the resample before it. Three measurements:
  //
  //   1. A glyph's sub-pixel phase is a function of its ABSOLUTE PAGE X.
  //      Over 666 two-column stems, the ink split f = left/(left+right) ramps
  //      monotonically with x mod 8: .40 .48 .49 .52 .57 .63 .68 (sd ~.12,
  //      n~90/bucket, so the ramp is ~20 SE wide). A pen lattice sets phase
  //      from the text ADVANCE and can not know where the page grid is; a
  //      fixed-grid resample is the only thing that does. THIS IS THE CRUX.
  //   2. 8-connected components, 40 pages: the 8×11 bucket has 2,198
  //      observations and 1,829 DISTINCT rasters, largest cluster 4. The same
  //      count on a tol-0-readable control (EFTA00751637) gives 827
  //      observations of 5×7 in exactly 4 distinct rasters — the 4-phase
  //      lattice, visible in raw pixels.
  //   3. 816 = 2550 × 96/300 exactly, and 612×804.75 pt at 300 dpi is
  //      2550×3353. So the source is 300 dpi and the page is 96 dpi: a
  //      rational 8/25 downscale, whose output period is the 8 px of (1).
  //      Corroborating: 63% of horizontal ink runs measure 1.25–1.30 px
  //      = 4 source pixels at 300 dpi, the next cluster exactly 3.
  //   4. THE CONTROL ROW for (1), drawn 2026-07-29 (eighth session). (1) was
  //      argued from the lattice's construction and never measured, because no
  //      tol-0-readable document supplies the subject: DJ840's narrowest
  //      connected component is FOUR columns — DejaVu Serif's serifs mean an
  //      `l` is never a bare stem. So `ubuntu-kit/synthramp.mjs` DRAWS both
  //      arms, same prose and same sans face, at the subject's own stroke
  //      geometry (11 rows, 276 ink/row), differing only in pipeline:
  //
  //        pen lattice @ 96 dpi         amp 0.027   0.73x null   p 0.82  FLAT
  //        the same @ 300 dpi, then
  //          box-resampled 8/25         amp 0.130   3.03x null   p 0.0005 RAMP
  //        EFTA02715081                 amp 0.119   2.88x null   p 0.0010 RAMP
  //
  //      and the subject's 8-bin waveform matches the FORWARD control's at
  //      r = +0.855, MAX OVER THE 8 CYCLIC SHIFTS (every other shift ≤ +0.27;
  //      a shift is only where the page origin sits in the resample cycle, so
  //      maximising over it is the right test — but it is a look-elsewhere of
  //      8 and the figure is quoted as such. The gap to the runner-up, not the
  //      peak, is what makes it safe). (1) is now measured in both directions.
  //
  //      Two corrections fell out of it. RAW AMPLITUDE IS NOT COMPARABLE
  //      BETWEEN DOCUMENTS: the first control, run at the corpus stroke size,
  //      scored amplitude 0.105 against the subject's 0.119 and was FLAT
  //      anyway (p = 0.16) — its splits are 2.4× more spread, so its null sits
  //      at 0.081 instead of 0.041. Always quote amplitude ×its own null.
  //      And THE SOURCE IS NOT BITONAL: the arm that reproduces the
  //      fingerprint renders GRAYSCALE, which agrees with the mid-tone census
  //      (the 17 run 85% mid-tone/ink, as antialiased as the readable family).
  //      That supersedes the word "bitonal" in the action below, struck in the
  //      same session.
  //
  //      Excluded there too, and it was a live confound rather than a
  //      formality: JPEG's 8×8 DCT blocks are period 8 in absolute x as well,
  //      and would have explained the whole statistic with no resample at all.
  //      Census over lab/base64/: 40 PDFs, 5083 pages, 5083 image XObjects —
  //      exactly one per page — and ZERO /DCTDecode. 5080 are /FlateDecode
  //      8 bpc bare /DeviceGray; the only 3 /Indexed (over /DeviceRGB) are
  //      colour pages of one jitter-family document, in neither family here.
  //      No lossy step anywhere in the container, so the period-8 signal
  //      cannot be block artifacts.
  //        (Read "indexed" in a first draft of this entry: that came from
  //        grepping /ColorSpace and mistaking the OBJECT REFERENCE for a name.
  //        Resolved, it is bare /DeviceGray, which agrees with the banked
  //        assembly profile's "8 bpc gray" — corrected the same session.
  //        Colourspace DECLARATION STYLE is part of the container fingerprint
  //        that the version pin will be argued from, so it has to be right.)
  //
  //   5. The burned `_R1_` Bates band (image rows 1058–1071, below the body's
  //      last ink at 1006) carries the SAME resample damage as the body of its
  //      own page. Pure-black share of ink — a crisp 96 dpi render saturates
  //      stem interiors, a downscale mixes them away — is 0.131 % in the band
  //      against 0.077 % in the body, where the lattice controls run 3.3 %
  //      (DJ840) and 6.9 % (synthetic): a 25–50× gap, self-controlled within
  //      one image. So the band was already in the ~300 dpi source and went
  //      through one downscale with everything else; it is not a 96 dpi
  //      overlay applied afterwards.
  //      STATE THE CLAIM ON THE GAP, NOT ON AGREEMENT: the instrument is
  //      coarse. The forward 8/25 control sits at 0.378 %, itself ~5× above
  //      the subject's own body at 0.077 %, so control and subject do NOT
  //      agree quantitatively and nothing here should be read as if they did.
  //      What carries the verdict is the CATEGORICAL gap between the resampled
  //      regime (0.08–0.38 %) and the lattice regime (3.3–6.9 %) — an order of
  //      magnitude and a half, with band and body on the same side of it.
  //      NOTE the statistic that does NOT work here, because it looks like it
  //      should: raster DIVERSITY is confounded for a fixed-position stamp. A
  //      Bates line sits at the same absolute x on all 58 pages, and same
  //      content at same x gives one raster under a pen lattice AND under a
  //      fixed-grid resample. Measured: the fixed prefix buckets give exactly
  //      1 distinct raster over 58 pages, while a 22×11 bucket gives 26
  //      distinct rasters at a SINGLE x — merged digits whose content changes
  //      as the number increments. Neither number is about the pipeline.
  //      `phaseramp` on the band refuses (0 two-column stems): guard working.
  //
  // So the page is not a per-pixel function of ANY 1× coverage map, and no
  // (face, em64, pen, law) can reproduce it — which is why every roster miss
  // below was a miss. Enumerated and refuted 2026-07-27, all returning zero:
  // 1,253 faces (the installed roster + Office CloudFonts + app-bundled faces,
  // via TOL0_FONT_DIRS) × em64 700..1100 × 4 x-phases under ANY MONOTONE LAW,
  // not just the four in LAW_NAMES; and the dims-signature shortlist (Calibri
  // 938..942 leads at 22/26 characters) additionally over the full 64×64 pen
  // lattice, again under any monotone law. Calibri is also refuted by the rust
  // sweep at 4096 pens × 4 laws over em64 920..960.
  { name: 'page-downscale-816x1073', renderable: false,
    fingerprint: '816×1073 pages (MediaBox 612×804.75 pt); sub-pixel phase tracks x mod 8, and one glyph shape has ~1800 distinct rasters where a 4-phase producer has 4. ' +
      'ONE-NUMBER TEST (2026-07-31, EFTA02154109): the page carries BYTE 127 in glyph ink — 4,368 px, 0.51% of 856,269 ink px over 4 pages. ' +
      'Over white paper the fz law (e = cov + (cov>>7); dst = (255·(256−e))>>8) emits 255 of 256 bytes and 127 is the one it cannot: cov 127 gives 128, cov 128 gives 126. ' +
      'corpus-cour832 (same face family, native render) has 0 in 649,150 ink px. A rate of 1/196 against the 1/255 you would expect if EVERY ink pixel is an average of two rendered values is the area-average, measured in one byte and needing no roster.',
    action: 'NOT a face hunt, and a wider roster will not close it — the pixels are a ~300 dpi GRAYSCALE source resampled down to 96 dpi ("bitonal" here until 2026-07-29, refuted by the mid-tone census, by the grayscale control that reproduces the fingerprint, and again on 2026-08-02 at every source resolution). Tolerance 0 is reachable only by reproducing THAT: rasterize antialiased and apply the same resample — which is ANISOTROPIC and is NOT an area box (both corrected 2026-08-02, see the record): x factor 3.125 with a tent of about the scale, y factor 2.92–2.96 with a tent of about 0.9 of it, i.e. the page is stretched ~5% vertically relative to a uniform 8/25. Ink BOLDER than plain fz coverage — stem darkening, double-draw, a coverage gamma — is REFUTED and is not the missing term. THE RESAMPLE ITSELF IS NOW EXONERATED ON BOTH AXES (2026-08-02, sixth session): an ARBITRARY non-parametric kernel solved by least squares cannot beat the two-parameter tent on either axis, so what is missing is in the SOURCE RENDER, upstream of the downscale. Do NOT spend a session hunting the exact vertical rational by fitting: it is not the missing term, and the thing that finally PINNED it was not a fit but the control family\'s layout law (integer row pitch at render resolution), which admits only fy = n/14.3386 and picks n = 42, fy 2.9292 — the same law also refuting the anisotropic-text-matrix reading, so the excess is in the resample. THE SOURCE RENDER IS ALSO NOW CLOSED (2026-08-03): hinting in both forms, the composite law, a supersampling rasterizer, the Courier New variants and any nonlinear post-curve are each refuted. THE DOWNSCALE IS NOT REFUTED — and that reading, which this entry carried for two sessions, came from solves that had never been given a positive control (2026-08-03c). With one (--synth), the free-kernel solves turn out to have been floored by their own tap binning, and --solve-src\'s floor turns out to be exactly what a per-line sub-pixel phase scatter produces and nothing more. Freeing the SOURCE and the KERNEL together, separable and non-separable (--solve-joint --k2d, the experiment the previous session named), lands at the same floor as a control whose only defect is that scatter — and, with the source free to be any image at all, RECOVERS the tent pair. NEXT MEASUREMENT, and it now gates everything rather than being one hypothesis among several: the per-marker PHASE, to ~0.02 source px. Every multi-instance solve here is floored at 3.85 bytes RMS by a ~0.29 src px marker-to-marker inconsistency, which is 20x the rounding floor, and beneath it no resample or source-render hypothesis can be told from any other. Until someone measures that, these documents have no pool and no □-free read. Do NOT widen a roster or loosen a tolerance against them. ' +
      'FIRST BUILD ATTEMPT 2026-07-31, on an ISOLATED \'>\' (EFTA02154109 p2 row k=26, page x 95..104 y 384..394 — white paper on all four sides, so nothing can excuse a miss). The 8:25 mapping needs no search: 816 = 102×8 output px against 2550 = 102×25 source px anchors output pixel X to source [25X/8, 25(X+1)/8) with no free offset, which pins placement and leaves only (face, em64, pen, kernel, rounding). ' +
      'BEST: Σ|Δ| 183 over 110 bytes, 37 differing, worst byte 17 — Courier New em64 ~2608, GAUSSIAN kernel sigma ~0.4 of the output pixel\'s source span in both axes, round-half-up, anamorphic scale. Not byte-exact. ' +
      'THE BOX IS REFUTED, and this supersedes "area-averaged"/"box resample" wherever that is still written: a single 3.125 px box scores 346, widening it to 3.5 gives 295, a Gaussian gives 183. The page is blurrier at the glyph FRINGE and lighter at its CORE than any box average of a 1× render — ink moved outward, which is a blur, not an area average. ' +
      'BITONAL IS NOT THE MISSING PIECE either: source models {grayscale at 300 dpi, 1-bit at 300, 1-bit at 1200 box-averaged to 300} all land at Σ|Δ| 309-315 with the SAME residual, so the source rendering model barely moves the answer. ' +
      'THE SHALLOW VALLEY IS FIXED, and this supersedes "em64 and blur width trade against each other and neither pins". Fit against EVERY line-start \'>\' on the page instead of one isolated glyph (monospace-lab/resample-fit.mjs): ~40 instances of a known character in a known column, sharing an x sub-pixel phase and differing in y, so one config must explain forty y phases with a single pen origin. Measured on EFTA02154109 p2: em64 2604, gaussian sigma 0.40 both axes. ' +
      'em64 LANDS ON 2600 = 832 × 25/8 EXACTLY — the source is cour13 (the readable courier family\'s own size, 13 px at 96 dpi) rendered at 300 dpi, i.e. 9.77 pt, NOT 12 pt (which would be em64 3200). Other documents in the family may be 12 pt; the tool takes --doc and --em and the physics check below will say so. ' +
      'PHYSICS CHECK PASSES and it is the substantive result: the fitted pens lie on ONE line — pen x sd 0.000 source px (all markers share a column), pen y pitch 14.3359 output px against the 14.3260 measured independently from the page, residual sd 0.290 source px. One pen origin and one pitch place every marker, and the row pitch comes out right without being told. So the recipe is right in its GEOMETRY and wrong only in its GREYS. ' +
      'THE OBJECTIVE IS NOW PAGE-WIDE: with pens PREDICTED from that line (±¼ px only), 40 markers score 2.67 per byte over 4,000 bytes (best 1.63, median 2.25, worst 5.68). That is the number a correct recipe drives to 0. The old single-glyph score (183 over 110 bytes) is NOT the objective — it was small because it was easy, and it is what let a wrong config look close. ' +
      'THE DEFORMATION DECOMPOSES (2026-07-31, from comparing the suspect against the corpus-cour832 document that READS): a letter page at 300 dpi is 2550×3300, and a UNIFORM 8/25 downscale of it is exactly 816×1056 — which is corpus-cour832\'s page size to the pixel. This document is 816×1073, i.e. the same downscale with y stretched by 1073/1056 = 1.0161. So x scale = 8/25 exactly and y scale = 1073/3300, and since 1073 and 3300 are coprime the y phase NEVER repeats while x repeats every 8 output px. That asymmetry is the whole reason a template cut on one row matches other pages at the same row and nothing else: it is not two producers, it is one downscale with a 1.61% vertical stretch. ' +
      'Layout comparison behind it: the two documents are NOT the same layout deformed — modal left margin 96 px (1.000") vs 45 px (0.469"), 61 vs 65 rows per page, 12.52 vs 12.31 CPI — but they ARE the same KIND of document, 79 character columns of \'>\'-quoted base64 in both. So cour832 is the un-stretched GEOMETRY, not the un-stretched twin, and it cannot be used as a source image. ' +
      'Rebuilding the reproducer anamorphically (x 3.125, y 3.0755 source px per output px) improves the isolated-\'>\' fit from Σ|Δ| 346 to 303 over 110 bytes but leaves the same 36 bytes differing and the same halo, so the y scale was not the blocker either — the missing piece is still upstream of the resample. ' +
      'REFUTED this session: JPEG. A decoded-and-re-Flated JPEG keeps its signature, and there is none — per-coefficient lattice fit 0.51 on 3,000 inked 8×8 blocks (0.5 is the no-structure baseline) with no q standing out, identical to the corpus-cour832 control, and the mean |Δ| across a column boundary is flat in x mod 8 (49–53) where blocking would spike at the seam. The x-mod-8 fingerprint is the 25-source-px period, NOT a DCT block.',
    record: '16 documents in lab/base64/unidentified/ plus EFTA02154109 (83 pp), which is staged apart in lab/base64/courir-strech/ — that is the 17th this entry has always counted, not a new find. (1) and (4) measured on EFTA02715081 (58 pp, 475–477 two-column stems at every height floor 3..8). (2) says 40 pages, so it is one of the OTHER 15 — and the 666-stem figure once quoted for (1) is likewise not this document. Which one went unrecorded; the entry conflates at least two. ' +
      'EFTA02154109 re-measured 2026-07-31 and it belongs here: column pitch 7.6677 px, row pitch 14.3387 px (both non-integer); the ¼-px pen sawtooth that corpus-cour832 shows at corr 0.930 shows at 0.548, and its y residual is 0.106 px against that control\'s 0.034; 53,286 distinct rasterizations over 12 pages (≈55,000 cells — essentially every cell its own raster). ' +
      'Of 263 byte-identical cell pairs found across those pages, 263 sit in the SAME ROW (row delta 0, always) and 262 at column delta exactly 48 — 46 resample periods of 8 output px, which is the x-mod-8 law above seen from the other side. ' +
      'Consequence for the hand-labelling route (monospace-lab/payoff.mjs): 3,759 cuts read 3,762 cells on one page, 1.00× reuse, and that whole dictionary reads 1.3% of the next page. There is no template job here. ' +
      'lab/resample.mjs verdicts (2026-07-31, p2, all six self-checks firing): no upscale signature on EITHER axis — full-bandwidth spectrum f95 0.414 both axes (control 0.461/0.438), no NN duplication, no off-pitch interpolation periodicity — while edge ramps run 3.27 px x / 2.63 px y against the control\'s 1.49/1.72. So BOTH axes are blurred wider than a 1-px box (x no less than y — the suspicion that only height was resampled is refuted), the pixels were averaged but never upscaled, and the once-suspected 1056→1073 bilinear y-stretch is refuted directly: its phase-period probe reads ×2.5 where the same page synthetically stretched reads ×6.6. ' +
      'ANISOTROPY, LOCATED (2026-07-31): the pitch deficit against corpus-cour832 is real and unequal — ×1.0172 in x, ×1.0461 in y (centroid-line fits 7.6677/14.3387 vs 7.7997/15.0004; the courir-new family is 7.417/12.360 and not the sibling). But it is SOURCE TYPOGRAPHY, not an extra raster scale: the Δcol=48 byte-identity (262 exact pairs) requires repeated cells to land on identical (¼-src-px pen, 25-src-px block) phases, which an extra ~1.7% raster factor would make impossible — so the x raster is pinned to EXACT aligned 8/25, and the implied source layout is advance ≈ 1150/48 = 23.958 src px (em64 ≈ 2555, ≈9.58 pt at 300 dpi) with line pitch ≈ 44.81 src px, versus the control-equivalent 24.375/46.88 — a smaller face and tighter leading in the source document, unequal by axis because typography is. HALF SUPERSEDED 2026-08-02: the x half stands, the y half does not. The GLYPH ITSELF measures ~5% taller than Courier New\'s own aspect at the advance-pinned width, and no choice of leading can change a glyph\'s shape, so the vertical axis carries a real raster factor. Note also what the Δcol=48 identity actually constrains: 48 = 6 periods of 8 output px, so it pins the x factor\'s DENOMINATOR to 8 (17/8, 24/8 and 25/8 all satisfy it), not the numerator to 25. The y raster has no repeat evidence either way (61 rows never realign a non-lattice 44.81 pitch on-page) but needs no extra factor: 1073 is the MediaBox at 96 dpi exactly, as 1056 is for every sibling. ' +
      'Reproducer hint from the same numbers: added smoothing is HEAVIER IN X than y (ramps 2.19× vs 1.53× the control\'s, per axis) — the next pipeline attempt should fit per-axis kernel widths instead of one square kernel. ' +
      'MULTI-INSTANCE FORWARD FIT 2026-07-31 (the second build attempt, and the one that narrowed it). Every leading \'>\' on p2 — 58 of them, ALL at page x=96, so they share ONE source x-pen while the y-pen walks the line lattice: the layout has zero per-glyph freedom (pen_k = X0, Y0+k·Py, three numbers for 58 glyphs) and 58 distinct y-phases identify the kernel, which one glyph provably cannot (kernel width and pen shift trade off). Their bboxes split 8×8 (40) and 8×9 (18) — the y-phase moving, visible. ' +
      'Result: cour.ttf em64 2582, kernel x triangle(4.0) / y box(3.125), half-up — 337 Σ|Δ|/glyph on 15 fitted, and held out on all 58: Σ|Δ| 23,915 over 5,980 bytes, 35.7% of bytes differ, worst 188, 0/58 byte-exact. THE ANISOTROPY IS CONFIRMED INDEPENDENTLY BY THE FIT: y settles on box(3.125), which IS the plain 8/25 area box, while x demands wider support — so the vertical pipeline is the bare downscale and the horizontal one carries extra blur. ' +
      'THE DIAGNOSTIC THAT MATTERS: the residual is PHASE-INDEPENDENT — per-glyph Σ|Δ| min 243, median 332 across all 58 y-phases. A wrong pen/phase/layout model would make the residual swing with phase; a flat residual says the geometry is right and THE SOURCE RASTER SHAPE IS WRONG. Stop tuning pens and kernels. (em64 also drifts to whatever bound the search allows, 2574→2582→2592: the fit compensating shape with size, the same symptom.) ' +
      'REFUTED this session, both with like-for-like scoring on the same instances: (1) ClearType/LCD subpixel as the horizontal-blur source — modelled as made (coverage at 3× horizontal, 5-tap [1,2,3,2,1]/9 across subpixels, decimate, then fz, then 8/25) it scores 5007 against the plain model\'s 5014, i.e. nothing. (2) "a known courier page, post-processed" — a native \'>\' lifted from corpus-cour832 (65 leading glyphs, 1 distinct raster, confirming a native page repeats) fitted onto the strech instances by scale+offset+per-axis blur, with EACH instance given its own best offset (maximum freedom, an upper bound on the story): 503 Σ|Δ|/glyph versus 334 for the 300 dpi font render. The 96 dpi template cannot make the target\'s tight cores (target 128 where the resampled template smears 170/176), so the source carried detail no 96 dpi raster holds. Face ranking, same fit: cour.ttf beats courbd/consola/lucon/OCRAEXT/SimsunExtG. ' +
      'RENDERER VALIDATED 2026-07-31, and this is the reusable part: every fit above had assumed ftclone reproduces what the producer\'s renderer produces, which was never tested. It does — FTClone + cour.ttf at em64 832 (the `cour13` config) reproduces corpus-cour832 p2\'s leading \'>\' BYTE-EXACTLY, 65 of 65 instances, at pen sub-pixel phase x 0.00 / y 0.00 (273 byte-exact pen positions; that page carries 1 distinct leading raster, as a native single-y-phase page must). The render step is therefore NOT the residual, and any future reproducer should re-run this null before trusting a fit. ' +
      'SOURCE RESOLUTION IS NOT IDENTIFIABLE from the \'>\' set (measured, do not re-derive): rendering synthetically at em64 E with the x scale PINNED by the measured advance (sx = 7.6677/(E/64·1229/2048)) and fitting sy, pen origin and per-axis box widths gives Σ|Δ|/glyph 397 (E=2550) · 417 (3000) · 421 (2750) · 434 (2496) · 492 (2600) · 546 (3328) — flat and noisy across 282–391 dpi equivalent with no minimum, and the winner\'s kernel refit (x 1.20× y 1.25× the area width, 254/glyph on 9 fitted) degrades to 439/glyph held out on all 58, i.e. the freedom overfits. The detail argument separates 96 dpi (503) from ~300 dpi (334) and then saturates; it cannot pick the exact source dpi. ' +
      'THE PLATEAU IS THE FINDING: three unrelated model families — block-aligned 8/25 with per-axis kernels, ClearType 3× horizontal, and a general anisotropic scale over a synthetic source — all bottom out at 330–440 Σ|Δ|/glyph and not one reaches a single byte-exact instance. Something systematic is missing that none of them expresses, and it is not the face, not the renderer, not the pen lattice and not the resample geometry (all four now separately controlled). Next candidate: a source whose ink is BOLDER than plain fz coverage (stem darkening or a gamma applied before the downscale), since every fit compensates by inflating em64 to whatever bound it is given (2574→2582→2592). ' +
      'BOLDER INK IS REFUTED AND THE em64 SYMPTOM IS EXPLAINED (2026-08-02, the vertical-compression block at the end of this entry): the resample geometry was never controlled, it was ASSUMED UNIFORM, and the size inflation was the fit buying vertical scale with em. ' +
      'AVERAGING SPACE IDENTIFIED 2026-07-31 — the first thing about the post-processing that is now settled, and it came from FINGERPRINTS, not fit. With the renderer validated, a whole 300 dpi page (56 lines × 74 base64 chars, em64 2555, pen x on the ¼-px lattice, pen y whole px) was synthesised and pushed down each candidate pipeline, then judged on statistics that need no pen phase. The byte-127 rate separates them by an order of magnitude: NAIVE BYTE AVERAGING 0.862%, gamma-2.2 0.068%, sRGB 0.086%, average-coverage-then-fz 0.000% — against the page\'s measured 0.500%. So the producer averaged COMPOSITED PAGE BYTES; a gamma-correct resampler and a supersampling renderer are both refuted, and coverage-space averaging is refuted absolutely (it can never emit 127, exactly like a native render). ' +
      'Widening the Y kernel in byte space then walks the 127 rate straight onto the target: y box(3.125) 0.862% · box(4) 0.641% · box(5) 0.543% · tri(4) 0.473%, with ramps rising 2.09/2.19 → 2.69/2.89 → 3.12/3.50 (target 3.28/2.63). So the vertical kernel IS wider than the plain area box, and around box(5)–tri(4) it matches both the 127 rate and the ramps. ' +
      'THE X ARM, FIXED AND RUN — this SUPERSEDES the caveat this entry carried for one session ("the X arm is invalid, so x tri(4) was never confirmed, and x-blurrier-than-y is weaker than stated"). The fault was the band detector, not the resample: a wide horizontal kernel smears ink into the page margins, the inked-row run then spans the whole text block and blows the detector\'s ≤40 px height cap, so every band was discarded and the config reported zero ink. Measuring over row ranges taken from the ROW LATTICE instead — identical rows for every kernel, plus a per-config ink-count self-check — gives 0 of 40 configs with zero ink and a valid scan. ' +
      'RESULT, and the two methods now AGREE: the best configs all keep y at the PLAIN 8/25 AREA BOX and widen x — x tri(3.125) y box(3.125) is 127 0.473% · ramp x 3.59 y 2.62 · dist 0.152; x box(4.5) y box(3.125) is 0.437% · 3.09 / 2.66 · dist 0.198; x box(4) y box(3.125) is 0.494% · 2.67 / 2.50 · dist 0.246. Target: 127 0.500% · ramp x 3.28 · y 2.62 — and the vertical ramp is matched EXACTLY (2.62) by the bare area box. So the vertical axis is the plain 8/25 area average and the horizontal axis carries an extra tent of about one output pixel, which is what bilinear resampling at this scale IS. The anisotropy is real, it is horizontal, and it is now pinned by fingerprints rather than by fit — independently reproducing the per-glyph fit\'s own choice (x tri(4), y box(3.125)). ' +
      'One measurement caution that survives: the per-axis ramps are COUPLED through the ≤96 core threshold (widening y alone moved the measured x ramp 2.09→2.69), so ramps must always be read as a pair against a control, never one axis alone. The 127 rate has no such coupling and should carry the verdict. ' +

      // ---- 2026-08-02: the fifth session on this family, and the first to move the number ----
      'THE MISSING TERM IS A VERTICAL COMPRESSION, AND "BOLDER INK" IS DEAD (2026-08-02). The face was HELD at cour.ttf for the whole session — five sessions have each re-derived Courier and this one did not re-run that. The null was re-run first through the very same code path (scale 1, box:1 on both axes): it reproduces corpus-cour832 p2 leading ">" BYTE-EXACTLY, 65 of 65, over a 12×15 window with paper on all four sides, so render, fz composite, resample and pen-line are certified before any fit is read. Objective throughout: 57 line-start markers on p2, pens on ONE line (three numbers for 57 glyphs), Σ|Δ| per glyph over that 12×15 window. ' +
      'REFUTED, each given its own best em64 so nothing is condemned by a size mismatch: EMBOLDEN (morphological dilation of the outline, 9-point disk, r = 0.25/0.5/0.75/1.0/1.5 source px) scores 538/964/1310/1847/2851 per glyph against 237 for plain — monotone in r and never once better; x-only 0.5/1.0 gives 471/1006 and y-only 824/1474; DOUBLE-DRAW (draws=2) 365; COVERAGE GAMMA below 1 (bolder) 241/262/305 at 0.9/0.75/0.6 and above 1 also worse (250 at 1.15); a post-composite byte gamma 248/249 either way; UNSHARP 273/331/433 at 0.15/0.3/0.5. Every way of putting more ink on the page makes it worse. The em64-runs-to-the-bound symptom that motivated stem darkening was the fit buying VERTICAL SCALE with size: give it a vertical factor and em64 lands on an interior minimum at ~2550, which is the advance-implied 2555. ' +
      'THE ANISOTROPY IS IN THE RASTER, NOT ONLY THE TYPOGRAPHY. With x pinned at 8/25 the glyph fits ~5% TALLER than Courier New at the advance-pinned width. That ratio is 1.045–1.063 across five different kernel pairs INCLUDING IDENTICAL KERNELS ON BOTH AXES, so it is not per-axis blur trading against size; and it survives every source-resolution hypothesis (aspect 1.04–1.06 at 204, 252, 288, 300 and 336 dpi), so it is not an artifact of assuming 300 dpi. Stated physically: x factor 3.125, y factor 2.92–2.96, i.e. the page is stretched ~5–6% vertically relative to a uniform 8/25. The minimum in the vertical factor is INTERIOR — 2.88/2.92/2.96/3.00/3.04/3.08/3.12 score 188/184/184/189/201/213/228 — and 3.125 itself is 40 per glyph worse than the optimum. What the exact rational is (25/8.5 = 2.941, 3.0, a 1024→1073 stretch, a 204×196 fax aspect) is NOT pinned by this data; the interval is. ' +
      'BOTH KERNELS ARE TENTS, and this supersedes "the vertical axis is the plain 8/25 area average and the horizontal axis carries an extra tent". Two independent measurements agree. (a) Score curves, unimodal, all 57 markers: vertically tri(2.98) 218 against box(3.125) 346, box(2.98) 380 and box(1) 828; horizontally tri(2.5)/tri(2.98) 201 against box(3.125) 218. (b) A NON-PARAMETRIC least-squares solve for the kernel taps — the downscale is linear in the taps, so out = Σk·v/Σk is homogeneous in them and 57 y-phases identify the vertical kernel — gives x sd 0.94 and y sd 1.32 source px, stable across smoothing λ 3/30/300, where box(3.125) is 0.902 and tent(3.125) 1.276. The 127 rate agrees on the part it can see: a synthetic page area-boxed on BOTH axes emits 127 at 0.742% against the page 0.500%, while any tent arm lands at 0.47–0.52%. ' +
      'ONE TENSION LEFT UNRESOLVED, recorded rather than smoothed over: the target ramp pair is x 3.27 / y 2.63 (control 1.49/1.72), and the per-glyph winner run through the fingerprint harness gives 2.61/3.05 — the right magnitudes, the wrong way round. The synthetic page carries a guessed character mix and guessed leading, which the per-glyph fit does not, so the per-glyph evidence is preferred; but the ramp asymmetry is not explained and should not be quoted as if it were. ' +
      'REFUTED AGAIN, now under the corrected geometry: a BITONAL source loses at every resolution (335 vs 246 at 204 dpi, 235 vs 216 at 252, 238 vs 206 at 288, 225 vs 203 at 300, 211 vs 205 at 336), so the source really is antialiased grayscale. And SOURCE RESOLUTION is still not identifiable — 204/252/288/300/336 dpi score 246/216/206/203/205 — shallow and mildly favouring 288–300, exactly as the earlier session found. ' +
      'THE PAGE IS A COMPUTED IMAGE, NOT A SCAN, which is why tolerance 0 stays reachable in principle: paper is exactly 255 with ZERO variance over all 57 marker windows (and the columns beyond the glyph, 104–105, are clean 255, so the fit windows carry no neighbouring ink). No scanner produces that. ' +
      'WHERE IT STANDS: best 184 Σ|Δ| per glyph over 12×15 = 4.73 per ink byte, 0 of 57 byte-exact, at cour.ttf em64 ~2540, x tent(3.125) at scale 3.125, y tent(2.63) at scale 2.92. Against the plateau this entry recorded (330–440 per glyph over a smaller window) that is roughly a halving, and the residual has CHANGED CHARACTER: the soft halo one pixel beyond the glyph is gone, and what is left is feature-localized dipoles of ±5..14 at the arm edges — the signature of a slightly wrong OUTLINE rather than a wrong filter. Next candidates in order: the exact vertical rational; a two-stage vertical pipeline with an intermediate BYTE ROUNDING (which no continuous kernel can express, and which the per-marker blur test could not settle); and hinting or grid-fitting in the source render, which is the one thing on the render side never tested and the only one that moves ink by feature rather than uniformly. ' +
      'WHAT p2 ACTUALLY IS, and every session including this one has fitted on it: the PROSE COVER EMAIL, not base64. A whole-line renderer (all glyphs of a line composited into one source strip, then one downscale) reads it as ordinary English — "> Hello Boris and Sam... I wanted to pass alo", "> Please let me know you have received the i", "> Thanks so much and I hope all is going", "> Thanks, Lesley". The body pages are base64 as this entry always said: pages 10/30/50/70 each carry 1749/1748/1742/1747 blank cells out of 6405 at 72.7% inked — the fixed-line-width signature — against p2\'s 2612 blank at 59.2%, which is ragged prose. THIS IS NOT A READ AND MUST NEVER BE SHIPPED AS ONE: it carries no certificate, it is 4.7 Σ|Δ| per ink byte from byte-exact, and several of its cells are wrong. It is a diagnostic — the geometry is now good enough to identify what the page says, which is how the prose was found at all. ' +
      'THE PROSE ROUTE DOES NOT PIN THE VERTICAL FACTOR, recorded so nobody re-runs it hoping otherwise. The idea was sound — 57 copies of one shape carry almost no vertical structure, while letters carry ascenders and descenders — but with the text held fixed and only the geometry moving, the objective is FLAT: y factor 2.84…3.16 scores 846/…/678/…/712 per inked cell, a shallow scatter whose minimum (3.02) sits inside the noise, against the marker objective\'s clean interior minimum (188/184/184/189/201/213/228 at 2.88…3.12). The reason is that a prose cell scores ~700 where the isolated marker scores 184: cells inherit the advance model\'s error and their neighbours\' ink. Get the per-cell residual down first; until then the marker fit is the better instrument. ' +
      'ONE THING THE PROSE DID SETTLE — the ADVANCE, measured rather than assumed: fitting it on the text gives 23.96 source px = 7.6672 output px, against the independently measured column pitch of 7.6677 (0.007% apart). That also exposes a real inconsistency to chase: Courier\'s own advance at the shape-fitted em64 2540 would be 7.62 output px, 0.6% short — so either em is ~2556 and the shape fit is biased low, or the advance is not 0.6 em. Over 40 columns that 0.6% is 2 output px, which is why an unfitted advance wrecks every cell past the left margin. ' +
      // ---- 2026-08-02, sixth session: the resample is exonerated ----
      'THE HARNESS WAS REBUILT AND RE-CERTIFIED, and monospace-lab/resample-fit.mjs now carries it (the 2026-07-31 model it used to hold — one gaussian sigma per axis, uniform y scale 3300/1073 — was refuted in both halves and is gone). Null first, through the very same code path: scale 1 with box(1) kernels reproduces corpus-cour832 p2\'s 57 leading \'>\' BYTE-EXACTLY, 57 of 57, and recovers the 15.0000 row pitch WITHOUT being told it. Baseline then reproduced at 186.7 Σ|Δ|/glyph (em64 2540, fy 2.92, x tri(3.125) / y tri(2.63)), which is the 184 this entry recorded — so the numbers below are comparable to the ones above. ' +
      'THE FACE IS NOW REFUTED BY MEASUREMENT RATHER THAN HELD, and it costs no session to re-check: \'>\' bbox height over ADVANCE, which every Courier clone shares at 0.6 em, is 0.8499 for cour.ttf and identical for courxp / cour276 / cour~1 (so Courier New\'s VERSION is not it either), against NimbusMonoPS 0.941×, DejaVuSansMono 0.967×, DroidSansMono 0.971×, CascadiaMono 0.984×, lucon 1.016×, consola 1.177× (whose advance is 0.55, i.e. not this metric at all). NOTHING on this machine is the 1.05–1.06× the page needs, so no face substitution can explain the vertical excess. Note what this enumerates (METHOD rule 3): the Courier-METRIC faces, which is the set the earlier per-fit ranking never covered — it ranked cour.ttf against courbd/consola/lucon/OCRAEXT/SimsunExtG. ' +
      'PEN QUANTISATION IS REFUTED, and it was the cheapest remaining explanation of feature-localized dipoles: refining the pen lattice 1/4 → 1/8 → 1/16 → 1/32 → 1/64 source px scores 186.7 / 180.5 / 177.9 / 176.4 / 175.6 per glyph — converged by 1/16 and a 6% move in total. Use 1/16; finer buys nothing. (Stage A\'s lattice and the ±¼ px nudge lattice must be SEPARATE parameters to run this test at all — stage A searches a 12×15 src px box, so refining it costs (box/step)² renders per marker and is unaffordable below ¼ px. Keeping them one number is what hides this question.) ' +
      'THE ANISOTROPY MECHANISM IS NOT IDENTIFIED, AND THE TWO CANDIDATES SCORE THE SAME. A fifth axis this entry had never separated: the ~6% vertical excess can sit in the RESAMPLE (uniform render, squeezed vertically after) or in the TEXT MATRIX (outline stretched BEFORE rasterization, page then resampled uniformly 8/25). For \'>\' — a glyph that is nothing but diagonals — these put the arm edges on different sub-pixel positions, so the page can in principle tell them apart. It does not: the text-matrix model has a clean interior minimum at aspect 1.06, em64 2550–2570, with fy PINNED at 3.125 and IDENTICAL tents on both axes, scoring 195.1/glyph against the resample model\'s 186.7. Comparable, neither byte-exact, and — the point — BOTH LEAVE THE SAME SYSTEMATIC RESIDUAL. So the 1.05–1.06 excess is now confirmed by two independent physics, and the "exact vertical rational" framing is probably a category error: there may be no vertical resample factor to find. ' +
      'THE RESIDUAL IS SYSTEMATIC, NOT PHASE NOISE, which is what makes it a missing TERM and not fit slack. Averaged over all 57 y phases the mean SIGNED residual equals the mean |residual| cell for cell. It is exactly zero on paper on all four sides — so the glyph\'s EXTENT is right and its GREYS are wrong — and under BOTH anisotropy models it has the same shape: the apex too light by +9..+13, the upper-left arm too dark by −4..−7, the lower-left arm tip too light by +4..+7. An upper/lower asymmetry on a glyph that is symmetric about its own middle. ' +
      'THE DECISIVE RESULT — NO RESAMPLE OF ANY KIND EXPLAINS THIS PAGE, ON EITHER AXIS. The downscale is LINEAR in its kernel taps, so an arbitrary non-parametric kernel (41 taps every ¼ src px over ±5) can be solved exactly by least squares, and the 57 markers supply the 57 distinct y phases that identify one. FREE VERTICAL kernel: 194.6/glyph, 0 of 57 byte-exact — it cannot even beat the two-parameter tent\'s 186.7 — stable at smoothing λ 1/3/300 (194.6/194.6/194.8) and converging to centroid 0.037, sd 1.139 src px, i.e. tent-like, agreeing with the independent tap solve this entry already recorded (1.32). Run at each vertical factor it is FLAT and never collapses: fy 2.88/2.94/3.00 give 207.9/193.8/193.1. FREE HORIZONTAL kernel: 169.2/glyph, 0 byte-exact, sd 1.301 against tent 1.276 — and its taps RING (−0.34, +0.57), because 41 taps against only 8 distinct x phases is underdetermined, so 169 is an OVERFIT LOWER BOUND that still does not collapse. ' +
      'WHAT THAT KILLS, explicitly. (1) The exact vertical rational is DEAD as a line of work: no vertical factor and no kernel shape reaches the page, and the objective is flat across the interval, so the rational is neither pinnable nor the thing that is missing. (2) A two-stage vertical pipeline with an INTERMEDIATE BYTE ROUNDING is dead too — but by MAGNITUDE, not by the solve, which is linear and structurally cannot see a rounding: an intermediate byte rounding is bounded by ±0.5 byte per stage and averaging only shrinks it, while the residual is a systematic ±5..13. (3) What is left is the SOURCE RENDER — the third candidate this entry named and the one axis never tested — and it is now the only one standing rather than merely the next in a list. Hinting or grid-fitting is the specific suspect, because it is the only mechanism yet named that moves ink BY FEATURE rather than uniformly, which is what the phase-averaged residual looks like. One constraint for whoever builds it, derived from data already here: the source advance is 1150/48 = 23.9583 source px, NOT an integer, so any renderer that quantises advances to whole pixels at the source resolution is refuted before it is tried. ' +
      // ---- 2026-08-02c: the producer's own layout law breaks the tie ----
      'THE CONTROL FAMILY HAS A LAYOUT LAW, AND IT TRANSFERS. Measured on all four corpus-cour832 documents, pages 2 and 3 (6 of the 8 null-certify 57/57 leading \'>\'): the row pitch is EXACTLY 15.0000 device px on every page, and the pen origin sits on the ¼-px lattice — (45.000, 18.000) on six pages and (45.250, 18.250) on the two cover pages, which is precisely why those two score 27/28 instead of 28/28. The COLUMN pitch is NOT integral (7.8015), matching the suspect\'s non-integral advance of 1150/48 = 23.9583 src px: this producer places each line\'s text operator on an integer grid and lets the glyph advances run fractional off the font metrics. So the law to transfer is about the LINE lattice, never the advance. ' +
      'IMPOSED ON THE SUSPECT IT PICKS A DISCRETE WINNER where the continuous fit was flat. The source row pitch must be an integer number of SOURCE px, and the page\'s output pitch is 14.3386, so only fy = n/14.3386 is admissible. Scored with em free: n = 40/41/42/43/44/45 gives 224.5/195.1/186.9/197.9/229.8/275.6 Σ|Δ| per glyph. **n = 42, fy = 2.92916** — a sharp winner with both neighbours ~10 worse, and the fit self-checks (constrained runs return pitch 42.0008). At pen 1/16 it refines to 177.3 per glyph (4.91 per ink byte) at em64 2530, and the fitted pen origin lands at X0 = 300.250 src px — ON THE ¼-PX LATTICE, the control\'s other law, reproduced independently and never fitted for. ' +
      'THIS SUPERSEDES "the anisotropy mechanism is not identified", written earlier the same day. The layout law discriminates what scoring alone could not: under the uniform-resample + anisotropic-TEXT-MATRIX model (fy pinned 3.125) the source row pitch would have to be 14.3386 × 3.125 = 44.81 px, which is not an integer, and no integer near it fits — n = 45 implies an output pitch of 14.400, which is 3.7 px adrift over the page\'s 61 rows and far outside measurement error. So the ~6% vertical excess is in the RESAMPLE after all, at fy 2.9292 against fx 3.125, and the text-matrix reading is refuted rather than merely out-scored. ' +
      'OFAT SENSITIVITY, every factor on the same objective, which is how to read what any of these numbers is worth (spans in Σ|Δ| per glyph over the plausible interval): aspect 162, ky width 139, ky TYPE 131, fx 111, fy 99, kx TYPE 74, kx width 56, em64 42. Three things fall out. (1) fx has a SHARP INTERIOR MINIMUM AT EXACTLY 25/8 — 23/8, 24/8, 25/8, 26/8, 27/8 score 298/215/187/222/287 — which closes the ambiguity the Δcol=48 identity left open, since that identity pinned only the DENOMINATOR to 8. The x factor is now doubly pinned. (2) BOTH kernels are tents decisively, box against tent being 260 vs 187 in x and 317 vs 187 in y, the largest spans after aspect. (3) em64 IS THE FLATTEST VARIABLE OF ALL, span 42 across 2460–2620 — which RESOLVES the "real inconsistency to chase" this entry recorded between the shape-fitted em64 (~2540) and the advance-implied one (~2555): there is no inconsistency, the shape fit simply does not identify em to better than about ±30, and it never did. It is also why five sessions each reported a different em64 (2540, 2555, 2582, 2600, 2604, 2608). Do not read a size off this fit again. ' +
      'THE OPTIMA DO NOT COMBINE, and that is a result rather than a nuisance: taking each factor\'s OFAT best together (em64 2520, x tent 3.5, y tent 2.75) scores 190.6, WORSE than the 186.7 baseline they were measured around. The parameters trade against each other and coordinate descent cannot get under ~185 — the resample parameter space bottoming out from a completely different direction than the free-kernel solve, and agreeing with it. ' +
      'ROUNDING, which the null structurally CANNOT certify (at scale 1 the resample is the identity, so every value is already an integer and no rule can show itself): truncation is REFUTED at 247.5 against 186.8, while round-half-up and round-half-even are indistinguishable at 186.8 each — exact .5 ties essentially never arise in a continuous weighted average, so the page cannot separate those two and no session should claim it did. ' +
      // ---- 2026-08-03: the source render closes, and one instrument turns out to measure itself ----
      'HINTING IS REFUTED IN BOTH ITS FORMS, which was the last candidate this entry had named. (a) PEN QUANTISATION — a renderer that snaps the pen to a coarser lattice, which no continuous pen line plus a ±¼ px nudge can express: quanta of 1/4, 1/2 and 1 source px score 192.6 / 202.4 / 285.7 per glyph against 186.8 free, monotone in the quantum and never better, on the y axis alone and worse still on both. (b) VERTICAL OUTLINE GRID-FIT — the outline snapped so the glyph\'s top and bottom land on whole source rows (solved as a pair of conditions on em64y and py64, leaving the pen fractional, which is what an alignment zone actually does): worse at EVERY size, 250.7 / 235.7 / 286.5 / 232.2 / 242.7 / 249.4 against plain 212.1 / 192.4 / 186.8 / 190.9 / 202.9 / 224.5 at em64 2470..2620. ' +
      'THE REST OF THE SOURCE-RENDER AXIS GOES WITH IT. The SOURCE COMPOSITE LAW is not the missing term and the page cannot even identify it: fz / src / fzLin / srcLin score 186.8 / 187.1 / 187.3 / 187.7, a span of 0.9 — as the magnitude argument predicts, since the four laws differ by at most a byte or two at the source and the downscale averages that down. A SUPERSAMPLING rasterizer is refuted too: bitonal at K× box-averaged down gives 191.2 / 188.0 / 187.5 at K = 2/3/4, converging to the exact-area value from ABOVE and never beating it, so the source rasterizer computes exact area coverage like FreeType and mupdf. ' +
      'AND THE FACE SURVIVES A TEST IT HAD NOT ACTUALLY PASSED. The 2026-08-02 screen compared bbox PROPORTION, which is not outline SHAPE, and the residual is a shape difference — so the Courier New variants were re-fitted through the forward model itself: cour.ttf 186.8, courxp 186.3, cour276 186.3, cour~1 186.8, i.e. one outline. The number that matters is the control beside them: lucon.ttf scores 1264.7. The fit separates a wrong face by SEVEN TIMES, so a residual of 186 is nowhere near face-scale and the face is settled by discrimination, not by assumption. ' +
      'A NONLINEAR POST-CURVE IS REFUTED, and this is the one the "post-processed" reading most needs. Every structural solve so far is LINEAR and therefore blind to a byte curve applied AFTER the downscale — levels, gamma, a tone curve. That needs no model to test: if any monotone LUT was applied, the page byte must be a FUNCTION of the model\'s continuous value, so bin by that value and measure the scatter of the target inside each bin. The BEST CONCEIVABLE curve — a 256-entry LUT fitted on the very data it is scored against, so optimistically biased — buys only 186.8 to 173.0 per glyph and still 0 of 57 byte-exact, its worst bin spreads 10.5 bytes, and the LUT it produces is not even monotone (120->135, 123->119, 126->123: it is fitting noise). The page byte is NOT a function of the model value, so the residual is SPATIAL, not tonal, and that is a hard floor on every levels/gamma/contrast hypothesis. ' +
      'AN INSTRUMENT THAT MEASURES ITS OWN PREMISE — recorded because it nearly became a finding. Solving for the SOURCE RASTER itself (2091 free source pixels against 10260 equations, conjugate gradient, pitch pinned to the integer 42 so all markers share one raster) bottoms out at a continuous RMS of 3.851 bytes, fully converged by iteration 25 and flat to 1500, against cour.ttf\'s 4.507 — which reads as "no source image whatsoever explains the page". IT IS NOT THAT. The floor comes out 3.851 / 3.855 / 3.857 / 3.859 / 3.863 at fy 2.859 / 2.929 / 2.999 / 3.069 / 3.138 — INVARIANT across every geometry, while cour.ttf\'s own residual swings 4.5 to 6.1 over the same range. A detector that returns one number for every hypothesis is measuring its own assumption, and the arithmetic says which: the pen line scatters 0.27 src px, which against a ~100 byte/px edge gradient and a 9:1 average predicts ~3 bytes. Do not read a shared-raster solve as structural. ' +
      'SO THE SHARED-RASTER PREMISE ITSELF WAS TESTED, model-free, off page pixels alone — every multi-instance argument in this family rests on it and nothing had ever checked it. If the row pitch really is a whole number of source px, markers whose OUTPUT phase frac(k·pitch) coincides must carry near-identical windows. Scanning the output pitch, same-phase distance has a clean interior minimum at 14.335–14.339 (3.64/3.61 bytes/px against 5.4 at 14.320 and 14.345+), which CONFIRMS the pitch model-free and independently of any fit. The premise itself is INCONCLUSIVE and must not be quoted either way: the closest cross-row pair agrees to 0.08 bytes/px — two markers cannot do that unless they share a raster at the same phase — but the mean stays at 3.6 because over 57 rows a pitch error of 1e-3 smears the phase by 0.057, wider than the 0.03 bucket, so most "same-phase" pairs are mis-assigned. Settling it needs the pitch to ~1e-4. That is the next measurement, and it gates the integer-pitch law this entry adopted on 2026-08-02c. ' +
      // ---- 2026-08-03b: the pitch measured, and the shared-raster premise settled ----
      'THE OUTPUT ROW PITCH, MEASURED MODEL-FREE AND TO 5e-5: 14.33868 ± 0.00073 output px (1σ), from the ink CENTROID of each of the 57 markers fitted against its row index — no renderer, no kernel, no pen in it. Residual scatter 0.091 px. This settles a three-way disagreement that had been quietly load-bearing: it EXCLUDES the row detector\'s 14.3260 by 17σ and 43/3 = 14.33333 by 7σ, and agrees with the pen-line fit (14.3391) to 1.7σ. Use 14.33868; the row detector\'s value is a band statistic and is not this number. ' +
      'AND IT CONFIRMS THE INTEGER-PITCH LAW FROM THE OUTSIDE. That law fixed fy = 2.92916 by requiring the SOURCE pitch to be a whole number of source px, n = 42. The independently measured output pitch times that fy is 14.33868 × 2.92916 = 42.0003 source px — three parts in 10^5 of the integer, from a measurement that knew nothing about the law. Two unrelated routes now land on n = 42. ' +
      'INSTRUMENT TRAP, FOUND AND FIXED, and it is the reason the first run of this test read as a refutation: marker windows are cut on the DETECTED INK TOP, an integer row that jumps by ±1 as the phase crosses a threshold. That is a phase-dependent WHOLE-PIXEL shift injected into every window comparison, and it swamps the sub-pixel effect the test is about. Re-cutting every window on the continuous centroid line drops the zero-phase intercept from 3.256 to 1.095 bytes/px and turns D into a clean function of phase. Any cross-marker comparison in this family must be anchored on a continuous line, never on detected ink. ' +
      'THE SHARED-RASTER PREMISE IS CONSISTENT WITH HOLDING — which is what every multi-instance argument here rests on, and nothing had tested it. Model-free, off page pixels: with windows on the centroid line, D = 1.095 + 10.86·|Δφ| over 1596 pairs (mean D 2.095 at |Δφ| ≈ 0.016, 10.427 at |Δφ| ≈ 0.90). The intercept is not a floor — it is fully accounted for by the error in the PHASE itself: the centroid scatters 0.091 px about its own line, so |Δφ| carries an error of 0.091·√2 even between markers truly at the same phase, and E|Δφ_noise| × the measured slope predicts 1.117 against 1.095 observed, a 2% match. The two hypotheses separate cleanly here rather than circularly: REAL per-line jitter would mean the centroid measures true positions, so equal measured φ implies equal true φ and the intercept would be ~0; ESTIMATOR NOISE predicts 1.12. The data land on noise. So there is no evidence of a per-line source raster, the pen positions lie on one line to better than the centroid can resolve, and the integer-pitch law is SUPPORTED — not proven, and it should not be quoted as proven. What limits it is the centroid estimator, whose scatter is partly its own phase-dependent bias; a better PHASE estimator, not more markers, is what would sharpen it. ' +
      'CONSEQUENCE, and it hands the next session a sharper question than it was given: because the premise now stands, the free-source-raster floor can no longer be dismissed as measuring its own assumption. At every geometry tried the free source raster bottoms out at RMS ~3.85 bytes with the kernels held at x tri(3.125) / y tri(2.63), and each of those runs is internally consistent (each fy paired with its own integer source pitch). Read together with the free-kernel solve, that says the resample is NOT a separable tent pair at ANY vertical factor. The gap that remains is the one experiment neither solve performed: free SOURCE and free KERNEL together, which is bilinear and wants alternating least squares, plus the non-separable case. ' +
      // ---- 2026-08-03c: the solves get a positive control, and two of them turn out to have been read against the wrong zero ----
      'THE STRUCTURAL SOLVES NOW HAVE A POSITIVE CONTROL, AND IT SHOULD HAVE EXISTED FROM THE START (--synth). The null certifies the forward path at SCALE 1, where the resample is the identity — so it never touched the two solves that live entirely INSIDE the resample, and both rest on approximations it cannot reach: kernel taps carried at discrete nodes against continuous phases, and 57 markers folded onto one raster. --synth replaces every target with the forward model\'s OWN output at a known configuration, so each solve has a known answer and must find it; --synth-jitter scatters the pen off the line by a stated sd, which is how you find out what a floor is MADE of. Generation is itself checked: regenerate and re-fit with the same config and the harness returns 0.0 per glyph, 57/57 byte-exact, recovering pitch 42.0000. ' +
      'THE FREE-KERNEL SOLVE WAS FLOORED BY ITS OWN TAP BINNING, and this SUPERSEDES "a free vertical kernel scores 194.6 and cannot even beat the two-parameter tent\'s 186.7". Assigning each source pixel to its NEAREST tap node quantises a continuous offset by up to half a node spacing — a phase-dependent error no choice of taps can absorb. On data a tent(2.20) explains EXACTLY, the solve recovered the right shape (sd 0.895 against the true 0.898, centroid 0.000) yet still scored 61.0 per glyph and 0 of 57 byte-exact where the truth is 0.0 and 57/57. Measured floors at the operating point: 53.7 per glyph in y, 23.2 in x. LINEAR INTERPOLATION between the two straddling nodes removes it to second order and drops those floors to 6.0 and 1.2 (16 of 57 byte-exact), with the recovered sds now accurate (y 1.068 vs the true 1.0737, x 1.272 vs 1.2758). ' +
      'THE PER-AXIS REFUTATION SURVIVES AND IS NOW CLEANER, because it is finally read against a measured zero: on the real page a free VERTICAL kernel reaches 186.5 per glyph against a floor of 6.0, and a free HORIZONTAL one 169.2 against 1.2. What dies is the rhetoric, not the result — the old "cannot even beat the tent" compared two DIFFERENT objectives (the tent scored through axisW\'s exact continuous weights, the free kernel through binned taps), and the free kernel was simply paying a 53.7 tax the tent never paid. Corrected, freeing the vertical filter entirely buys 186.8 -> 186.5, i.e. nothing, which says the same thing far better. The file now scores the analytic kernel through the SAME design matrix, with a fitted scale so the per-output-pixel normalisation axisW does and a tap vector cannot is not charged to the reference. ' +
      '--solve-src\'s FLOOR IS NOT STRUCTURAL AND CARRIES NO INFORMATION ABOUT THE RESAMPLE. Measured, not argued: the free source raster floors at RMS 0.133 bytes on a control with a perfect shared raster, and at 3.904 once a per-line sub-pixel phase scatter of one source pixel is injected and NOTHING else is wrong. The real page is 3.851. The entry already suspected this and estimated ~3 bytes from the pen scatter; it is now measured, and the "invariant across every geometry" observation is explained, since a phase scatter does not care about fy. ' +
      'THE LAST CORNER OF THE DOWNSCALE HYPOTHESIS SPACE IS CLOSED, AND IT COMES BACK POSITIVE (--solve-joint, the experiment the previous session named). Free SOURCE and free KERNEL together — bilinear, so alternating least squares, S by conjugate gradient with the kernel held, then the kernel with S held — and with --k2d the kernel is NON-SEPARABLE over the whole node grid, at which point the model is the most general linear downscale there is: any source image whatsoever through any fixed 2D filter whatsoever. Control with a perfect shared raster: RMS 4.212 -> 0.169, and it recovers both kernels (y sd 1.063 against the true 1.074, x 1.296 against 1.276). Real page: 3.836 separable, 3.641 non-separable — against 3.854 for a control whose ONLY defect is the one-source-pixel phase scatter. So the downscale is NOT refuted; it is at the floor of the shared-raster premise, and nothing structural can be read below ~3.85 bytes RMS. THIS SUPERSEDES "read with the free-kernel solve, that says the resample is not a separable tent pair at any vertical factor": that inference was drawn against an unmeasured zero and does not hold. ' +
      'AND THE TENTS ARE NOW IDENTIFIED RATHER THAN ASSUMED, which is the positive result hiding inside a negative-looking one: with the source COMPLETELY FREE to be any image at all, the solved kernels come back AT the tent pair the fit had settled on — y sd 1.069 against tri:2.63\'s 1.074, x 1.258 against tri:3.125\'s 1.276. Total freedom in both the filter and the source chooses the tents. ' +
      'fy IS PINNED TWO ORDERS OF MAGNITUDE HARDER BY THIS SOLVE THAN BY THE FIT. Sweeping it against the joint floor gives 5.096 / 4.160 / 3.837 / 3.842 / 3.900 / 4.679 at fy 2.9280 / 2.9286 / 2.92916 / 2.929204 / 2.9298 / 2.9304 — a sharp interior minimum good to about ±0.0005, against the per-glyph fit\'s ±0.04 (OFAT span 99). Use --solve-joint, not --ofat, to measure fy. With the fold pinned at the integer 42 the optimum implies an OUTPUT pitch of 42/2.92916 = 14.33886, against the model-free centroid measurement of 14.33868 ± 0.00073 — agreement to 0.25σ, and this one is NOT circular. ' +
      'WHICH EXPOSES A CIRCULAR ARGUMENT IN THIS ENTRY, recorded so it is not quoted again: "the independently measured output pitch times that fy is 14.33868 × 2.92916 = 42.0003 ... two unrelated routes now land on n = 42" is arithmetically forced, because fy 2.92916 was DEFINED as 42/14.3386. That product confirms only that two pitch estimates agree to 6 parts in 10^6; it is not independent evidence of integrality. The discreteness of the n = 40..45 sweep is the real evidence, and the fy sweep above is a genuine second check. ' +
      'THE BLOCKER IS NOW A MEASUREMENT, NOT A HYPOTHESIS, and it is per-marker PHASE. The markers do not share one source raster to better than ~0.29 source px: the floor is reproduced quantitatively by injecting exactly that and nothing else (3.854 joint / 3.904 free-source against the page\'s 3.836 / 3.851), and it is NOT an fy drift, because the fy curve has a sharp interior minimum and the floor survives at its optimum. This PARTLY SUPERSEDES 2026-08-03b\'s "the data land on noise ... there is no evidence of a per-line source raster": that test inferred phase from the ink CENTROID, whose scatter is partly its own bias, while --solve-joint never touches the centroid and reads the pixels directly — and it sees real marker-to-marker inconsistency worth 0.29 src px. Note what that number is: 1/sqrt(12) = 0.289 is the sd of a phase spread UNIFORMLY over one source pixel, which is what a non-integer source row pitch produces, so the integer-pitch law and this floor are in tension and one of them is wrong. Until the per-marker phase is measured to ~0.02 src px, every multi-instance solve in this file is floored at 3.85 bytes RMS, 20x the rounding floor, and no source-render or resample hypothesis can be told from any other beneath it. ' +
      'INSTRUMENT TRAP, and it invalidated numbers inside an earlier session before it was caught: the pen-line stage is FRAGILE. Fit the line from too few markers and one marker whose free-pen search fell into the wrong local minimum drags it further than stage B\'s ±¼ px can recover — the same physics scored 817 per glyph at 6 markers and 205 at 8, 12 or 57. With 2σ outlier rejection plus a refinement over (x0, y0, pitch) the number is stable to 6% across 8/12/57. ANY score from a run that placed the line on fewer than 8 markers is instrument noise, not a measurement.' },
  { name: 'verdana-jitter-partial', renderable: false,
    fingerprint: 'mode-3 colour fax pages, verdana@1024 (≡ REFSAN.TTF), m-bank exact 40/40 — but the reader leaves ~⅓ of the bands unread',
    action: 'OPEN, and it is the READ that is open, not the face. tol 0 fails wholesale (2032 □) and tol 1 reads (44 □), which is the registered `jpeg-jitter` law, so the tolerance is justified rather than tuned. What is NOT explained: of 117 ink bands over 3 pages only 80 become lines. Band-picking 853/896 beside 1024 changes nothing (identical 80 lines / 4649 glyphs / 44 □), so the remainder is not a second SIZE — look for a second face, a stamp, or a fax header before widening anything. Do NOT add a glyph-registry pool until a document reads clean; a pool is a proven recipe.',
    record: 'EFTA00688178 (+ 688175 / 912964 / 434761 / 688877 staged in fixtures/corpus/verdana/)' },
  { name: 'tahoma704-descenders', renderable: false,
    fingerprint: 'Tahoma at em64 704: x-height letters exact at tol 0, but every DESCENDER (g p y and parentheses) fails — "followin[g]", "com[p]lainants", "(2)"',
    action: 'OPEN sub-family, 9 documents. Face and size are certain: ±2..±16 read 0 lines, and neither ½-phase baselines nor tol 1/2/4 recovers one descender, so this is a STRUCTURAL descender-row law, not a size or gray error. Do NOT widen the tahoma pool to chase it.',
    record: 'EFTA00172162 (EFTA0017xxxx block)' },
];

// ---------------------------------------------------------------------------
// SUPERSEDED, kept because someone will remember the old entry:
// `stretched-rerender` claimed EFTA01150379 was a stretched-and-rerendered
// page drawn in Cambria, and the hunt was CLOSED as "unwinnable by
// construction". BOTH claims were wrong. It is DejaVu Serif at em64 786,
// natively rendered under plain fz — the entry above. It hid for a week
// because every sweep enumerated C:/Windows/Fonts and DejaVu Serif is a
// per-user install (METHOD rule 3). The generic "recognize a stretch and stop"
// advice went with it: no corpus document is known to be a stretched rerender.
// ---------------------------------------------------------------------------

/** Plausible em64 window for `identify --scan` when nothing above matches:
 *  ~7 px to ~20 px glyphs cover every text size this corpus has shown. Spikes
 *  worth trying first are trunc(pt · 96/72 · 64) for the common point sizes. */
export const SCAN_DEFAULT = { from: 448, to: 1280 };
