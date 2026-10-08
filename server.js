/*
 * Minimal local server for the dish-card page.
 *
 *   node server.js   ->   http://localhost:3000
 *
 * It exists for two reasons:
 *   - a file:// page is an opaque origin, so its fetch to OpenRouter is
 *     blocked; served over http it is an ordinary origin and works.
 *   - the OpenRouter key stays here, read from .env. The browser only ever
 *     talks to /api/parse, so the key never reaches the page.
 *
 * No dependencies: Node's own http, fs and fetch cover it (Node 18+).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

/* ---------- .env: KEY=value per line, # comments and blanks skipped ---------- */
function readEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    env[line.slice(0, eq).trim()] = value;
  }
  return env;
}

const API_KEY = readEnv().OPENROUTERKEY || '';
if (!API_KEY) {
  console.error('OPENROUTERKEY is empty in .env — add your OpenRouter key and restart.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
};

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

/* ---------- POST /api/parse: forward the order text to OpenRouter ----------
   The page sends the whole request body it wants made, minus the key; this
   adds the Authorization header and passes the reply straight back. */
async function handleParse(req, res) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) { req.destroy(); return; }   // nothing legitimate is this big
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: 'Request body was not JSON.' });
  }

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(text);
  } catch (err) {
    json(res, 502, { error: 'Could not reach OpenRouter: ' + err.message });
  }
}

/* ---------- POST /api/pdf: print the page's own markup to a real PDF -------
   The browser cannot write a PDF without showing its print dialog, so the
   page sends the finished document here and headless Chromium prints it.
   Puppeteer is loaded on first use, so the parser still works without it. */
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    const puppeteer = require('puppeteer');
    // one browser for the process: launching costs about a second
    browserPromise = puppeteer.launch({ headless: true });
  }
  return browserPromise;
}

/* Forget the browser and its page, so the next print starts a fresh one.
   Chromium can exit on its own — a crash, the OS reclaiming it, a machine
   waking from sleep — and a cached handle to a dead browser fails every
   later print with "Connection closed" until the server restarts. */
function dropBrowser() {
  const dying = browserPromise;
  browserPromise = null;
  pagePromise = null;
  if (dying) dying.then((b) => b.close()).catch(() => {});
}

/* One page for the process, kept open between prints: creating one costs a
   few hundred milliseconds, and setContent replaces the document completely,
   so there is nothing to carry over from the previous render. */
let pagePromise = null;
async function getPage() {
  if (!pagePromise) {
    pagePromise = getBrowser().then((b) => b.newPage());
  }

  const page = await pagePromise;

  // The cached page may have died since the last print, and an already-closed
  // page resolves perfectly well — it only fails once it is used. Check it
  // here so the caller always gets a page that is actually usable.
  if (page.isClosed() || !page.browser().connected) {
    dropBrowser();
    pagePromise = getBrowser().then((b) => b.newPage());
    return pagePromise;
  }
  return page;
}

/* The one page means two prints must not interleave, so each waits for the
   one before it. Printing is a second at most, so a queue is enough; the
   chain keeps going whether the previous print worked or not. */
let pdfQueue = Promise.resolve();
function queuePdf(job) {
  const run = pdfQueue.then(job, job);
  pdfQueue = run.catch(() => {});
  return run;
}

async function renderOnce(html) {
  let page;
  try {
    page = await getPage();
  } catch (err) {
    // a page that failed to open must not be cached, or every later print
    // reuses the same rejected promise
    dropBrowser();
    throw err;
  }

  try {
    // domcontentloaded, not networkidle0: the waits below are the real
    // readiness conditions, so there is no reason to also sit through the
    // network's 500ms idle window on every print
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // The sheet's size comes from Tailwind utilities, which the CDN build
    // generates by scanning the DOM — so a sheet can still be an unstyled
    // block before that runs. Wait for it to report a real width (a sheet is
    // inches wide, so anything under 500px is unstyled) before printing, or
    // the PDF comes out at the wrong size.
    await page.waitForFunction(() => {
      const s = document.querySelector('.sheet');
      return !s || s.offsetWidth > 500;
    }, { timeout: 15000 }).catch(() => {});

    // networkidle0 used to cover the artwork too, so wait for it explicitly:
    // an image still loading prints as a blank gap, and nothing else here
    // would catch that. A broken src also counts as settled, so one missing
    // file cannot hang the print.
    await page.waitForFunction(() => {
      return [...document.images].every((img) => img.complete);
    }, { timeout: 15000 }).catch(() => {});

    await page.evaluateHandle('document.fonts.ready');

    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,   // honour the @page size the markup sets
    });
  } catch (err) {
    // the page may be wedged, so drop it and let the next print open a fresh
    // one rather than reusing a broken tab forever
    dropBrowser();
    throw err;
  }
}

/* A dead browser only shows itself when it is used, so the first print after
   Chromium exits is lost however carefully getPage checks. dropBrowser has
   already cleared the handle by the time we get here, so one retry starts a
   genuinely fresh browser and the user never sees the failure. */
function isDisconnected(err) {
  const m = (err && err.message) || '';
  return /Connection closed|Target closed|Session closed|detached|Protocol error|browser has disconnected/i.test(m);
}

async function renderPdf(html) {
  try {
    return await renderOnce(html);
  } catch (err) {
    if (!isDisconnected(err)) throw err;
    return await renderOnce(html);
  }
}

async function handlePdf(req, res) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2e7) { req.destroy(); return; }   // a big order is still only a few MB
  }

  let html;
  try {
    html = JSON.parse(raw).html;
  } catch {
    return json(res, 400, { error: 'Request body was not JSON.' });
  }
  if (!html) return json(res, 400, { error: 'No html to print.' });

  try {
    const pdf = await queuePdf(() => renderPdf(html));

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="soul-chef-dish-cards.pdf"',
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    const missing = err && err.code === 'MODULE_NOT_FOUND';
    json(res, missing ? 501 : 500, {
      error: missing
        ? 'Puppeteer is not installed. Run "npm install puppeteer" in this folder and restart the server.'
        : 'Could not render the PDF: ' + err.message,
    });
  }
}

/* ---------- static files, confined to this folder ---------- */
// the size-tuning page lives at /test, so it needs no .html in the URL
const PAGES = { '/': '/index.html', '/test': '/test.html' };

function serveFile(urlPath, res) {
  const rel = decodeURIComponent(PAGES[urlPath] || urlPath);
  const file = path.join(ROOT, rel);

  // a crafted path must not climb out of the project folder
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  // .env holds the key; it is never served, whatever the URL asks for
  if (path.basename(file) === '.env') {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + rel);
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/parse') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' });
    return handleParse(req, res);
  }

  if (url.pathname === '/api/pdf') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' });
    return handlePdf(req, res);
  }

  if (req.method !== 'GET') return json(res, 405, { error: 'Use GET.' });
  serveFile(url.pathname, res);
}).listen(PORT, () => {
  console.log('Soul Chef dish cards -> http://localhost:' + PORT);

  // Open the browser and its page now rather than on the first Open PDF, so
  // that click does not pay the launch. A failure here is not fatal: the
  // parser works without Puppeteer, and the print reports the error itself.
  getPage().catch(dropBrowser);
});
