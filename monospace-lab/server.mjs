// server.mjs — the lab's only server. Serves the UI, decodes pages, and owns
// the template folder.
//
//   node monospace-lab/server.mjs                 # http://127.0.0.1:8770
//   node monospace-lab/server.mjs --port 9000 --corpus F:/scans
//
// WHY A SERVER AT ALL. The page has to reach the browser as the PRODUCER'S OWN
// BYTES. The old lab pulled the embedded image out with pdf.js in the browser;
// this repo dropped pdf.js on measurement, not taste (tools/rasterize-mupdf.mjs
// documents the 38 □ -> 472 □ regression and the corpus it could not open at
// all), so decoding happens here through mupdf — the same
// largest-image-XObject decode lab/ingest.mjs uses — and travels to the
// browser as raw gray in a 16-byte envelope. No PNG, no canvas, no colour
// management, nothing between the producer's bytes and the matcher.
//
// The server holds no opinions about reading. It decodes, it lists, it saves
// what the human labelled. Every measurement lives in src/ and runs in the
// browser, where it can be looked at.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, relative, extname, basename, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePage, countPages } from './src/raster-node.mjs';

const LAB = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(LAB, '..');
const TEMPLATES = join(LAB, 'templates');
const OUT = join(LAB, 'out');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const all = (n) => argv.reduce((a, v, i) => (v === `--${n}` ? [...a, argv[i + 1]] : a), []);
const PORT = +opt('port', 8770);
const CORPORA = [...all('corpus'), join(REPO, 'lab', 'base64'), join(REPO, 'fixtures', 'corpus')]
  .map(p => resolve(p)).filter(p => existsSync(p));

// ---- corpus listing -----------------------------------------------------
function listPdfs(dir, out = [], depth = 0) {
  if (depth > 4) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listPdfs(p, out, depth + 1);
    else if (extname(e.name).toLowerCase() === '.pdf') out.push(p);
  }
  return out;
}

// A document's POOL is its folder name: templates cut from one corpus are only
// ever offered to that corpus. Mixing pools is how a matcher starts reading a
// Times page with Courier templates and calling it a certificate.
const poolOf = p => basename(dirname(p));

// ---- template store -----------------------------------------------------
const poolDir = pool => join(TEMPLATES, pool.replace(/[^A-Za-z0-9._-]/g, '_'));

function loadTemplates(pool) {
  const dir = poolDir(pool);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    const rec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return { ...rec, id: f };
  });
}

function saveTemplate(pool, rec) {
  const dir = poolDir(pool);
  mkdirSync(dir, { recursive: true });
  const stem = rec.stem || 'char';
  let name = `${stem}.json`;
  for (let n = 2; existsSync(join(dir, name)); n++) name = `${stem}_${n}.json`;
  writeFileSync(join(dir, name), JSON.stringify(rec, null, 1));
  return name;
}

// ---- http ---------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

const json = (res, code, body) => {
  const b = Buffer.from(JSON.stringify(body));
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length });
  res.end(b);
};

function serveFile(res, path) {
  if (!existsSync(path) || !statSync(path).isFile()) { res.writeHead(404); return res.end('not found'); }
  const body = readFileSync(path);
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream',
    'cache-control': 'no-store', 'content-length': body.length });
  res.end(body);
}

// Paths from the browser name files inside the repo. Resolve, then check the
// resolved path is still inside it — a lab is not a reason to serve C:\.
function safeRepoPath(rel) {
  const p = resolve(REPO, rel);
  return (p === REPO || p.startsWith(REPO + sep)) ? p : null;
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    if (p === '/api/docs') {
      const docs = CORPORA.flatMap(root => listPdfs(root)).map(f => ({
        path: relative(REPO, f).split(sep).join('/'),
        name: basename(f), pool: poolOf(f),
      })).sort((a, b) => a.path.localeCompare(b.path));
      return json(res, 200, { repo: REPO, corpora: CORPORA, docs });
    }
    if (p === '/api/page') {
      const doc = safeRepoPath(url.searchParams.get('doc') ?? '');
      const pno = +(url.searchParams.get('page') ?? 1);
      if (!doc || !existsSync(doc)) return json(res, 404, { error: 'no such document' });
      const rec = decodePage(doc, pno);
      const hdr = Buffer.alloc(20);
      hdr.write('MGP1', 0, 'ascii');
      hdr.writeUInt32LE(rec.w, 4); hdr.writeUInt32LE(rec.h, 8);
      hdr.writeUInt32LE(rec.nPages, 12); hdr.writeUInt32LE(rec.spread, 16);
      const out = Buffer.concat([hdr, Buffer.from(rec.gray.buffer, rec.gray.byteOffset, rec.w * rec.h)]);
      res.writeHead(200, { 'content-type': 'application/octet-stream',
        'cache-control': 'no-store', 'content-length': out.length });
      return res.end(out);
    }
    if (p === '/api/pagecount') {
      const doc = safeRepoPath(url.searchParams.get('doc') ?? '');
      if (!doc || !existsSync(doc)) return json(res, 404, { error: 'no such document' });
      return json(res, 200, { pages: countPages(doc) });
    }
    if (p === '/api/templates') {
      const pool = url.searchParams.get('pool') || 'default';
      if (req.method === 'GET') return json(res, 200, { pool, templates: loadTemplates(pool) });
      if (req.method === 'POST') {
        const rec = JSON.parse(await body(req));
        const id = saveTemplate(pool, rec);
        return json(res, 200, { id });
      }
      if (req.method === 'DELETE') {
        const id = url.searchParams.get('id') ?? '';
        if (!/^[A-Za-z0-9._-]+\.json$/.test(id)) return json(res, 400, { error: 'bad id' });
        const f = join(poolDir(pool), id);
        if (existsSync(f)) unlinkSync(f);
        return json(res, 200, { deleted: id });
      }
    }
    if (p === '/api/export' && req.method === 'POST') {
      const { name, text } = JSON.parse(await body(req));
      mkdirSync(OUT, { recursive: true });
      const safe = (name || 'transcript').replace(/[^A-Za-z0-9._-]/g, '_');
      const f = join(OUT, safe);
      writeFileSync(f, text);
      return json(res, 200, { written: relative(REPO, f).split(sep).join('/') });
    }
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    // engine/ — the reader's own object detection and banding, reused as-is
    if (p.startsWith('/engine/')) return serveFile(res, join(REPO, p.slice(1)));
    const file = p === '/' ? 'index.html' : p.replace(/^\//, '');
    const target = resolve(LAB, file);
    if (target !== LAB && !target.startsWith(LAB + sep)) { res.writeHead(403); return res.end('no'); }
    return serveFile(res, target);
  } catch (e) {
    return json(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`monospace lab  http://127.0.0.1:${PORT}`);
  console.log(`corpora: ${CORPORA.map(c => relative(REPO, c) || c).join(', ') || '(none found)'}`);
  console.log(`templates: ${relative(REPO, TEMPLATES)}`);
});
