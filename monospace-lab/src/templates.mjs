// templates.mjs — what a template IS, and how it is named on disk.
//
// One file per template, JSON, holding the RAW GRAY BYTES of the rect it was
// cut from. Not a PNG: the old lab stored PNGs and every load went through a
// canvas, a decoder and a colour-management path, which is three chances to
// hand the matcher a byte the producer never emitted. A JSON array of integers
// survives a round trip through anything.
//
// A template is identified by (char, phase). The phase is the ¼-px bucket of
// the cell it was cut from — see lattice.mjs. Four buckets means four
// rasterizations of every character, and a template only ever matches cells of
// its own bucket, so "have I covered this character" is really "have I covered
// these four buckets", which is what the coverage panel counts.

// Stem ↔ char, same convention as engine/core.js so files can be moved between
// the lab and the reader's set without renaming. '_' is spelled out because a
// literal '_' collides with the variant separator.
export const STEM_TO_CHAR = {
  less: '<', greater: '>', colon: ':', doublequote: '"', slash: '/', backslash: '\\',
  pipe: '|', question: '?', asterisk: '*', eq: '=', plus: '+', minus: '-', caret: '^',
  tilde: '~', period: '.', comma: ',', semicolon: ';', exclamation: '!', quote: "'",
  backtick: '`', lparen: '(', rparen: ')', lbracket: '[', rbracket: ']', lbrace: '{',
  rbrace: '}', at: '@', hash: '#', dollar: '$', percent: '%', ampersand: '&',
  underscore: '_', space: ' ',
};
const CHAR_TO_STEM = Object.fromEntries(Object.entries(STEM_TO_CHAR).map(([k, v]) => [v, k]));

export function charToStem(ch) {
  return CHAR_TO_STEM[ch] ?? (ch.length === 1 && ch >= 'A' && ch <= 'Z' ? ch + '_UPPER' : ch);
}

export function stemToChar(stem) {
  const base = stem.split('_')[0];
  return STEM_TO_CHAR[base] ?? (stem.includes('_UPPER') ? stem.split('_UPPER')[0] : base);
}

/** Filename stem for a template, before the collision suffix: `A_UPPER-p2`. */
export const fileStem = (char, phase) => `${charToStem(char)}-p${phase}`;

/**
 * The record. `ox/oy` are the rect's offset from the cell origin (normally
 * 0,0 — a human nudge is what makes them anything else), `src` is where it was
 * cut from, kept because a template that turns out to be wrong is only
 * findable again through its provenance.
 */
export function makeTemplate({ char, phase, ox = 0, oy = 0, w, h, bytes, src }) {
  return {
    char, phase, ox, oy, w, h,
    bytes: Array.from(bytes),
    src,
    cut: new Date().toISOString(),
  };
}

/** JSON on disk -> the shape the matcher wants (typed bytes). */
export function reviveTemplate(rec, id) {
  return { ...rec, id, bytes: Uint8Array.from(rec.bytes) };
}

/** char × 4 phases coverage, for the panel that tells the human what to cut next. */
export function coverage(templates) {
  const by = new Map();
  for (const t of templates) {
    if (!by.has(t.char)) by.set(t.char, [0, 0, 0, 0]);
    by.get(t.char)[t.phase & 3]++;
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
