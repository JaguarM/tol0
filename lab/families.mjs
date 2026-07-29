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
    fingerprint: '816×1073 pages (MediaBox 612×804.75 pt); sub-pixel phase tracks x mod 8, and one glyph shape has ~1800 distinct rasters where a 4-phase producer has 4',
    action: 'NOT a face hunt, and a wider roster will not close it — the pixels are a 300 dpi GRAYSCALE source area-averaged 8/25 down to 96 dpi ("bitonal" here until 2026-07-29, refuted by the mid-tone census and by the grayscale control that reproduces the fingerprint). Tolerance 0 is reachable only by reproducing THAT: rasterize antialiased at 3.125× and apply the same box resample. Until someone builds that, these documents have no pool and no □-free read. Do NOT widen a roster or loosen a tolerance against them.',
    record: '17 documents in lab/base64/unidentified/; (1) and (4) measured on EFTA02715081 (58 pp, 475–477 two-column stems at every height floor 3..8). (2) says 40 pages, so it is one of the OTHER 15 — and the 666-stem figure once quoted for (1) is likewise not this document. Which one went unrecorded; the entry conflates at least two.' },
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
