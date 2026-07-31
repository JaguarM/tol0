// raster-node.mjs — the producer's own page bytes, on the Node side.
//
// The page image is DECODED, never rendered: the largest image XObject's
// samples are taken as stored (mupdf `loadImage(...).toPixmap()`), which is
// the same decision lab/ingest.mjs and tools/rasterize-mupdf.mjs make and for
// the same reason — rendering a page invents pixels the producer never
// emitted, and a byte-exact match against invented pixels certifies nothing.
//
// A page with no embedded image carries VECTOR text. This lab cannot read it
// and says so; it does not fall back to rendering.
import * as mupdf from 'mupdf';
import { readFileSync } from 'node:fs';

const cache = new Map();

export function decodePage(pdfPath, pno) {
  const key = `${pdfPath}#${pno}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const doc = mupdf.PDFDocument.openDocument(readFileSync(pdfPath), 'application/pdf');
  const nPages = doc.countPages();
  if (pno < 1 || pno > nPages) throw new Error(`page ${pno} does not exist (${nPages} pages)`);
  const page = doc.loadPage(pno - 1);
  let best = null, bestPx = -1;
  page.getObject()?.get('Resources')?.get('XObject')?.forEach?.(val => {
    try {
      const im = val.isIndirect?.() ? val.resolve() : val;
      if (im.get('Subtype')?.asName?.() !== 'Image') return;
      const px = (im.get('Width')?.asNumber?.() ?? 0) * (im.get('Height')?.asNumber?.() ?? 0);
      if (px > bestPx) { bestPx = px; best = val; }
    } catch { /* a malformed XObject entry is not the page image */ }
  });
  if (!best) throw new Error('no embedded image on this page — its text is VECTOR, and rendering ' +
    'it would invent pixels this lab is not allowed to invent');
  const pix = doc.loadImage(best).toPixmap();
  const w = pix.getWidth(), h = pix.getHeight(), n = pix.getNumberOfComponents();
  const px = pix.getPixels();
  const gray = new Uint8Array(w * h);
  let spread = 0;
  if (n === 1) for (let i = 0; i < w * h; i++) gray[i] = px[i];
  else for (let i = 0; i < w * h; i++) {
    const r = px[i * n], g = px[i * n + 1], b = px[i * n + 2];
    gray[i] = Math.round((r + g + b) / 3);
    const s = Math.max(r, g, b) - Math.min(r, g, b);
    if (s > spread) spread = s;
  }
  const rec = { w, h, gray, nPages, spread, comps: n };
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  cache.set(key, rec);
  return rec;
}

export function countPages(pdfPath) {
  try {
    return mupdf.PDFDocument.openDocument(readFileSync(pdfPath), 'application/pdf').countPages();
  } catch { return 0; }
}
