// uitest.mjs — drive the browser half of the lab without a human, so that the
// half that cannot be unit-tested is at least never silently broken.
//
//   node monospace-lab/uitest.mjs
//   node monospace-lab/uitest.mjs --chrome "C:/path/to/chrome.exe"
//
// It starts the real server, opens the real page in headless Chrome, and then
// plays the human loop through window.LAB: measure, read, open the first □,
// name it, save, and check that the page re-read and that identical cells
// elsewhere turned green too. Templates are cut into the throwaway pool
// `__uitest` and deleted on the way out.
//
// SKIPS LOUDLY when no Chrome is installed — a skipped browser test must never
// look like a passing one.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(LAB, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const POOL = '__uitest';

const CHROMES = [opt('chrome', null),
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const chrome = CHROMES.find(p => existsSync(p));

let puppeteer = null;
try { puppeteer = (await import('puppeteer-core')).default; } catch { /* not installed */ }

if (!chrome || !puppeteer) {
  console.log(`SKIPPED — ${!chrome ? 'no Chrome/Edge found' : 'puppeteer-core is not installed'}. ` +
    `This is a SKIP, not a pass: the browser half of the lab was not exercised.`);
  process.exit(0);
}

const freePort = () => new Promise(res => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(LAB, 'server.mjs'), '--port', String(port)],
  { cwd: REPO, stdio: 'ignore' });
const deadline = Date.now() + 30000;
for (;;) {
  try { if ((await fetch(`${base}/api/docs`)).ok) break; } catch { /* not up yet */ }
  if (Date.now() > deadline) { console.log('FAILED — server never came up'); server.kill(); process.exit(1); }
  await new Promise(r => setTimeout(r, 200));
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.LAB && window.LAB.S.page', { timeout: 60000 });

  // load the canonical courier page into the throwaway pool
  await page.evaluate(async () => {
    await window.LAB.loadDoc('lab/base64/corpus-cour832/EFTA00434905.pdf', 2);
  });
  await page.evaluate(async (pool) => {
    document.getElementById('pool').value = pool;
    window.LAB.S.pool = pool;
    await window.LAB.loadTemplates();
    window.LAB.read();
  }, POOL);

  const m = await page.evaluate(() => ({
    rows: window.LAB.S.det.rows.length,
    pitch: window.LAB.S.grid.pitch,
    tw: window.LAB.S.grid.tw,
    unread: window.LAB.S.result.unread,
    read: window.LAB.S.result.read,
    fit: document.getElementById('fitinfo').textContent,
  }));
  check('the page loads, measures and reads in the browser', m.rows === 65 && m.read === 0,
    `${m.rows} rows, pitch ${m.pitch.toFixed(4)}, template width ${m.tw}, ${m.unread} □ before any template`);
  check('the browser measures the same lattice as the Node selftest',
    Math.abs(m.pitch - 7.8015) < 0.01, `pitch ${m.pitch.toFixed(4)}`);

  // the human loop: open the first □, name it, save
  const after = await page.evaluate(async () => {
    const S = window.LAB.S;
    const before = S.result.unread;
    window.LAB.nextUnread();
    const cell = S.modal.cell;
    document.getElementById('label-input').value = 'Q';
    await window.LAB.commitTemplate();
    return { before, after: S.result.unread, read: S.result.read,
      cell: `row ${cell.row.k} col ${cell.i} phase ${cell.phase}`, templates: S.templates.length };
  });
  check('labelling one cell saves a template and re-reads the page',
    after.templates === 1 && after.after < after.before,
    `${after.cell}: ${after.before} □ -> ${after.after} □, ${after.read} cells read from 1 template`);
  check('one template answers for many cells', after.read > 5, `${after.read} cells`);

  const txt = await page.evaluate(() => document.getElementById('transcript').textContent);
  check('the transcript shows the character and the unread boxes',
    txt.includes('Q') && txt.includes('□'), `${txt.split('\n').length} rows rendered`);

  const cert = await page.evaluate(() => document.getElementById('certificate').textContent);
  check('the certificate panel states what is unverified',
    /gutter/i.test(cert), cert.split('\n').map(s => s.trim()).filter(Boolean)[0]?.slice(0, 80));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean console');
} finally {
  await browser.close();
  // throw the test pool away — a template dictionary is evidence, and evidence
  // a test invented does not belong beside evidence a human cut
  try { rmSync(join(LAB, 'templates', POOL), { recursive: true, force: true }); } catch { /* never existed */ }
  server.kill();
}

console.log(`\n${fail ? 'FAILED' : 'PASSED'}  ${pass} checks${fail ? `, ${fail} failed` : ''}`);
process.exit(fail ? 1 : 0);
