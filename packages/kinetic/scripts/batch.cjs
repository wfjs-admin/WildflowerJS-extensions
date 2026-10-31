#!/usr/bin/env node
/**
 * batch.cjs renders one Kinetic page once for each row of a file, in Chrome,
 * through the page's own wildflower.kinetic.render(). A row's values are the
 * composition variables for that render, so a page whose scenes read inputs
 * (data-composition-variables on the root, `inputs` in a scene) becomes one
 * MP4 per row. Nothing else is installed, and the page needs no runtime tag.
 *
 *   node batch.cjs index.html rows.json                an MP4 per row, into renders/
 *   node batch.cjs index.html people.csv --name name   files named by the row's `name`
 *   node batch.cjs http://localhost:3000/ rows.json    a served page
 *   --out DIR        where the files go (default renders)
 *   --name FIELD     the row field that names each file
 *                    (default <composition id>-<row number>)
 *   --root DIR       serve a file from another folder, as check.cjs does
 *   --fps N          passed to render(), with --codec C, --bitrate N and
 *                    --shutter A
 *   --timeout 60     seconds to wait for each row's readiness
 *
 * rows.json is an array of objects, one per video, each field a variable's
 * id with its value, or an object with a `rows` array. A .csv has a header
 * row of ids, and every value arrives as text, which Kinetic converts to the
 * input's declared type (a Number input reads "0.1" as 0.1).
 *
 * A row whose inputs fail (KN-130), whose readiness fails or whose render
 * throws stops the batch with that row's KN lines and exit code 1, after the
 * rows before it have rendered. Exit code 2 is a bad argument or no Playwright.
 *
 * It needs Playwright with Chrome: `npm i -D playwright-core` and Chrome
 * installed, or `npm i -D playwright && npx playwright install chromium`.
 * HTML-in-Canvas is passed to the browser as a command-line feature, so no
 * flags-page setting is needed here.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const args = process.argv.slice(2);
const VALUED = ['--out', '--name', '--root', '--fps', '--codec', '--bitrate', '--shutter', '--timeout'];
const positional = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
const [target, rowsFile] = positional;
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def; };
const usage = 'usage: node batch.cjs <url | path/to/index.html> <rows.json | rows.csv> [--out renders] [--name field] [--root dir] [--fps N] [--codec C] [--bitrate N] [--shutter A] [--timeout 60]';
if (!target || !rowsFile) { console.error(usage); process.exit(2); }
const unknown = args.find((a) => a.startsWith('--') && !VALUED.includes(a));
if (unknown) { console.error('unknown option ' + unknown + '\n' + usage); process.exit(2); }
const outDir = path.resolve(opt('out', 'renders'));
const nameField = opt('name', null);
const timeoutMs = Number(opt('timeout', 60)) * 1000;
if (!(timeoutMs > 0) || !Number.isFinite(timeoutMs)) { console.error('--timeout takes a number of seconds above 0'); process.exit(2); }
const number = (name) => { const v = opt(name, null); if (v === null) return undefined; const n = Number(v); if (!Number.isFinite(n)) { console.error('--' + name + ' takes a number'); process.exit(2); } return n; };
const renderOptions = { download: false };
for (const [k, v] of Object.entries({ fps: number('fps'), bitrate: number('bitrate'), shutter: number('shutter'), codec: opt('codec', undefined) })) if (v !== undefined) renderOptions[k] = v;

// ---- the rows ---------------------------------------------------------------

// A CSV with a header row of ids. Quoted fields may hold commas, quotes
// (doubled) and line breaks.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
  if (!header) return [];
  const ids = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(ids.map((id, i) => [id, r[i] === undefined ? '' : r[i]])));
}

function readRows(file) {
  if (!fs.existsSync(file)) { console.error('no such file: ' + file); process.exit(2); }
  const text = fs.readFileSync(file, 'utf8');
  let rows;
  if (/\.csv$/i.test(file)) rows = parseCsv(text);
  else {
    let data;
    try { data = JSON.parse(text); } catch (e) { console.error(file + ' is not JSON: ' + e.message); process.exit(2); }
    rows = Array.isArray(data) ? data : data && Array.isArray(data.rows) ? data.rows : null;
    if (!rows) { console.error(file + ' holds neither an array of rows nor an object with a rows array'); process.exit(2); }
  }
  const bad = rows.findIndex((r) => !r || typeof r !== 'object' || Array.isArray(r));
  if (bad >= 0) { console.error('row ' + (bad + 1) + ' of ' + file + ' is not an object of variables'); process.exit(2); }
  if (!rows.length) { console.error(file + ' has no rows'); process.exit(2); }
  return rows;
}

// A file name from a row's field: letters, digits, dots and dashes, and
// unique within the batch.
function fileName(row, i, compId, taken) {
  let base = nameField !== null && row[nameField] !== undefined && row[nameField] !== null && String(row[nameField]).trim() !== ''
    ? String(row[nameField]).trim().replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
    : '';
  if (!base) base = (compId || 'video') + '-' + (i + 1);
  let name = base, n = 2;
  while (taken.has(name)) name = base + '-' + n++;
  taken.add(name);
  return name + '.mp4';
}

// ---- the page ---------------------------------------------------------------

// Whether `file` is inside the folder `root`.
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };

// Playwright from the folder the script is run in first, so a copy outside
// the project finds the project's. With playwright-core, Chrome has to be
// installed; with playwright, its own Chromium serves too.
function loadPlaywright() {
  const from = (name) => { try { return require(require.resolve(name, { paths: [process.cwd()] })); } catch (_) {} try { return require(name); } catch (_) {} return null; };
  const pw = from('playwright') || from('playwright-core');
  if (pw) return pw.chromium;
  console.error('batch.cjs needs Playwright: npm i -D playwright-core (with Chrome installed) or npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const LAUNCH = { args: ['--enable-blink-features=CanvasDrawElement'] };
async function launch(chromium) {
  let last = null;
  for (const channel of ['chrome', 'chromium', null]) {
    try { return await chromium.launch(channel ? { ...LAUNCH, channel } : LAUNCH); } catch (e) { last = e; }
  }
  console.error('no Chrome or Chromium could be started: ' + (last && last.message));
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

// Serves a folder so a file path runs as a page would, with relative data paths.
function serve(root) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    if (p === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
    const file = path.join(root, p);
    if (!inside(root, file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

const KN = /\[KN-/;

// One row: a fresh page with the row as the composition's variables, waited
// on for readiness and rendered. Returns the file's bytes, the composition's
// id and the KN lines and errors the page printed, and throws with the lines
// on a failure.
async function renderRow(browser, url, row) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const lines = [];
  let lastWasKn = false;
  page.on('console', (m) => {
    const text = m.text();
    if (KN.test(text)) { lines.push(text); lastWasKn = true; return; }
    if (lastWasKn && /^\s*↳/.test(text)) { lines.push(text); return; }
    lastWasKn = false;
    if (m.type() === 'error') lines.push('error: ' + text);
  });
  page.on('pageerror', (e) => lines.push('page error: ' + e.message));
  const fail = (why) => { const e = new Error(why); e.lines = lines; return e; };
  try {
    await page.addInitScript((vars) => { window.__hfVariables = vars; }, row);
    await page.goto(url, { waitUntil: 'load' });
    const started = Date.now();
    let ready = null;
    while (Date.now() - started < timeoutMs) {
      ready = await page.evaluate(() => {
        const root = document.querySelector('[data-root="true"]') || document.querySelector('[data-composition-id]');
        if (!root) return 'no root';
        return root.getAttribute('data-kinetic-ready') || null;
      });
      if (ready === 'true' || ready === 'failed' || ready === 'no root') break;
      await page.waitForTimeout(100);
    }
    if (ready === 'no root') throw fail('the page has no element with data-composition-id');
    if (ready === 'failed') throw fail('readiness failed; the KN line says why');
    if (ready !== 'true') throw fail('readiness did not settle within ' + (timeoutMs / 1000) + ' s');
    const result = await page.evaluate(async (options) => {
      const k = window.wildflower && window.wildflower.kinetic;
      if (!k) return { error: 'wildflower.kinetic is not on the page' };
      let r;
      try { r = await k.render(options); } catch (e) { return { error: e.message }; }
      const bytes = new Uint8Array(await r.blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { id: document.querySelector('[data-composition-id]').getAttribute('data-composition-id'), frames: r.frames, fps: r.fps, width: r.width, height: r.height, codec: r.codec, audioCodec: r.audioCodec, ms: r.ms, size: bytes.length, b64: btoa(bin) };
    }, renderOptions);
    if (result.error) throw fail('render() threw: ' + result.error);
    return { ...result, lines, bytes: Buffer.from(result.b64, 'base64'), b64: undefined };
  } finally {
    await page.close();
  }
}

(async () => {
  const rows = readRows(path.resolve(rowsFile));
  let url = target, server = null;
  if (!/^https?:\/\//.test(target)) {
    const file = path.resolve(target);
    if (!fs.existsSync(file)) { console.error('no such file: ' + file); process.exit(2); }
    const root = path.resolve(opt('root', path.dirname(file)));
    if (!inside(root, file)) { console.error('the page is outside --root'); process.exit(2); }
    const s = await serve(root);
    server = s.server;
    url = 'http://127.0.0.1:' + s.port + '/' + path.relative(root, file).split(path.sep).join('/');
  }
  fs.mkdirSync(outDir, { recursive: true });
  const chromium = loadPlaywright();
  const browser = await launch(chromium);
  const started = Date.now();
  const taken = new Set();
  let done = 0, exit = 0;
  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let r;
      try { r = await renderRow(browser, url, row); } catch (e) {
        console.log('row ' + (i + 1) + ' of ' + rows.length + ' ' + JSON.stringify(row) + ': ' + e.message);
        if (e.lines && e.lines.length) for (const l of e.lines) console.log('  ' + l);
        exit = 1;
        break;
      }
      const file = path.join(outDir, fileName(row, i, r.id, taken));
      fs.writeFileSync(file, r.bytes);
      done++;
      console.log('row ' + (i + 1) + ' of ' + rows.length + ' ' + JSON.stringify(row) + ' -> ' + file + ': ' + r.frames + ' frames at ' + r.fps + ' fps, ' + r.width + 'x' + r.height + ', ' + r.codec + (r.audioCodec ? ' + ' + r.audioCodec : '') + ', ' + (r.size / 1048576).toFixed(1) + ' MB, ' + (r.ms / 1000).toFixed(1) + ' s');
      for (const l of r.lines) console.log('  ' + l);
    }
  } finally {
    await browser.close();
    if (server) server.close();
  }
  console.log(done + ' of ' + rows.length + ' rendered into ' + outDir + ' in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s' + (exit ? '; stopped at the failed row' : ''));
  process.exit(exit);
})().catch((e) => { console.error(e.message || e); process.exit(2); });
