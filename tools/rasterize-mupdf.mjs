// rasterize-mupdf.mjs — fill the reader's raster cache. This is the ONLY
// rasterizer in this repo; the previous one also had a headless-Chrome +
// pdf.js path, and cut 1 dropped it (see DROPPING CHROME below).
//
// mupdf decodes the page's embedded image DIRECTLY (Image.toPixmap = raw
// decode of the stored stream) rather than rendering the page. That
// distinction is the whole point: rendering would invent pixels the producer
// never emitted, and this toolkit certifies against the producer's own bytes.
// It is also the more robust path — pdf.js throws InvalidPDFException on a
// real slice of the eDiscovery corpus (broken xref subsections that mupdf
// repairs and reads happily), so those documents could not be cached at all.
//
//   node tools/rasterize-mupdf.mjs --pdf fixtures/corpus/v3.pdf
//   node tools/rasterize-mupdf.mjs --pdf x.pdf --force        # re-write cache
//
// Also importable: cacheDoc(pdfPath, opts) runs the same pipeline in-process
// and returns { key, numPages, written, cached, vector } — vector > 0 means
// some pages carry no embedded image, which this tool cannot serve.
//
// Writes fixtures/raster-cache/<sha256[:16]>/page-NNNN.gray.gz + meta.json;
// the record format lives in tools/raster-cache.mjs. Written here:
//   mode 1 = u8 gray (1-component images — the corpus/courier/nimbus families)
//   mode 2 = u16le R+G+B sums (multi-component, so blind-read's achromatic
//            "sum ≡ 0 (mod 3)" colour logic keeps working)
//
// DROPPING CHROME WAS MEASURED, NOT ASSUMED. All 7 gate documents were
// re-rasterized through this path and their transcripts byte-compared against
// fixtures/gate-ref/, which was recorded from the old Chrome caches — see
// fixtures/gate-ref/README.md for what moved and what did not.
//
// A page whose content is VECTOR text (no embedded image) is left uncached and
// reported: rendering it would invent pixels, which is exactly what byte-exact
// certification forbids. Such a document is simply out of scope here.
import * as mupdf from 'mupdf';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheDirFor, pageFile } from './raster-cache.mjs';

// largest embedded image on the page — the producer's page raster
function pageImageRef(page) {
  const xo = page.getObject()?.get('Resources')?.get('XObject');
  let best = null, bestPx = -1;
  xo?.forEach?.(val => {
    try {
      const im = val.isIndirect?.() ? val.resolve() : val;
      if (im.get('Subtype')?.asName?.() !== 'Image') return;
      const px = (im.get('Width')?.asNumber?.() ?? 0) * (im.get('Height')?.asNumber?.() ?? 0);
      if (px > bestPx) { bestPx = px; best = val; }
    } catch {}
  });
  return best;
}

function encode(mode, w, h, body) {
  const hdr = Buffer.alloc(16);
  hdr.writeUInt32LE(0x31595247, 0);          // 'GRY1'
  hdr.writeUInt32LE(mode, 4);
  hdr.writeUInt32LE(w, 8);
  hdr.writeUInt32LE(h, 12);
  return gzipSync(Buffer.concat([hdr, body]));
}

/** Cache every embedded-image page of pdfPath; identical bytes to the CLI. */
export function cacheDoc(pdfPath, { force = false, quiet = true } = {}) {
  const bytes = readFileSync(pdfPath);
  const { sha, key, dir } = cacheDirFor(pdfPath);
  mkdirSync(dir, { recursive: true });
  const pagePath = pno => join(dir, pageFile(pno));

  const doc = mupdf.PDFDocument.openDocument(bytes, 'application/pdf');
  const numPages = doc.countPages();

  let written = 0, cached = 0, vector = 0;
  for (let pno = 1; pno <= numPages; pno++) {
    if (!force && existsSync(pagePath(pno))) { cached++; continue; }
    const page = doc.loadPage(pno - 1);
    const ref = pageImageRef(page);
    if (!ref) { vector++; page.destroy?.(); continue; }
    const pix = doc.loadImage(ref).toPixmap();
    const w = pix.getWidth(), h = pix.getHeight(), n = pix.getNumberOfComponents();
    const px = pix.getPixels();
    let buf;
    if (n === 1) {
      buf = encode(1, w, h, Buffer.from(px.buffer ?? px, px.byteOffset ?? 0, w * h));
    } else {
      // Multi-component: carry the CHANNEL SPREAD (max−min), not just the sum.
      // The reader needs it to tell real colour from producer JPEG jitter, and
      // it is the difference between reading the /Indexed palette family and
      // not: on the nimbusrom gate document, mode 2's legacy "sum ≡ 0 (mod 3)"
      // flood swallows whole letters — 13,034 glyphs / 38 □ becomes 4,957 /
      // 472 □. Mode 3 reproduces the reference exactly.
      // Emit mode 1 when every pixel really is neutral, matching the rule the
      // retired browser rasterizer used (mode = anySpread ? 3 : mod3 ? 1 : 2)
      // so an all-gray RGB page keeps the compact form.
      const sums = Buffer.alloc(w * h * 2), spread = Buffer.alloc(w * h);
      let anySpread = false;
      for (let i = 0; i < w * h; i++) {
        const r = px[i * n], g = px[i * n + 1], b = px[i * n + 2];
        sums.writeUInt16LE(r + g + b, i * 2);
        const s = Math.max(r, g, b) - Math.min(r, g, b);
        spread[i] = s;
        if (s) anySpread = true;
      }
      if (anySpread) buf = encode(3, w, h, Buffer.concat([sums, spread]));
      else {
        const gray = Buffer.alloc(w * h);
        for (let i = 0; i < w * h; i++) gray[i] = px[i * n];
        buf = encode(1, w, h, gray);
      }
    }
    writeFileSync(pagePath(pno), buf);
    written++;
    pix.destroy?.();
    page.destroy?.();
    if (!quiet && written % 25 === 0) process.stderr.write(`\r  ${written} pages written…   `);
  }
  if (!quiet && written >= 25) process.stderr.write('\n');
  doc.destroy?.();

  writeFileSync(join(dir, 'meta.json'), JSON.stringify({
    pdf: basename(pdfPath), sha256: sha, numPages,
    format: 'gzip(GRY1 mode 1 u8 gray | mode 3 u16le R+G+B sums + u8 channel spread) — written by rasterize-mupdf.mjs (embedded-image decode; see tools/raster-cache.mjs)',
  }, null, 2));
  return { key, numPages, written, cached, vector };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
  const PDF = opt('pdf', null);
  if (!PDF) { console.error('usage: node tools/rasterize-mupdf.mjs --pdf <file.pdf> [--force] [--quiet]'); process.exit(2); }
  const r = cacheDoc(PDF, { force: args.includes('--force'), quiet: args.includes('--quiet') });
  console.log(`${r.key}: ${r.written} rasterized, ${r.cached} already cached` +
    (r.vector ? `, ${r.vector} VECTOR pages skipped (no embedded image to decode)` : ''));
}
