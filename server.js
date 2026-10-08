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
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

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

/* ---------- POST /api/pdf -------------------------------------------------
   Hand the request to the very function Vercel runs in production, so a card
   rendered here is the same card the deployed endpoint draws. api/pdf.js is
   an ES module and this server is CommonJS, hence the dynamic import; it is
   cached after the first call. */
let pdfHandlerPromise = null;
function getPdfHandler() {
  if (!pdfHandlerPromise) {
    pdfHandlerPromise = import('./api/pdf.js').then((m) => m.default);
  }
  return pdfHandlerPromise;
}

async function handlePdf(req, res) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2e7) { req.destroy(); return; }   // a big order is still only a few MB
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: 'Request body was not JSON.' });
  }

  // api/pdf.js is written against Vercel's req/res, which give it a parsed
  // body and the express-style helpers below; Node's own objects have
  // neither, so they are filled in here.
  req.body = body;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { json(res, res.statusCode || 200, payload); return res; };
  res.send = (payload) => { res.end(payload); return res; };

  try {
    const handler = await getPdfHandler();
    await handler(req, res);
  } catch (err) {
    if (!res.headersSent) json(res, 500, { error: 'Could not render the PDF: ' + err.message });
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

  // Load the render module now rather than on the first Open PDF, so that
  // click does not pay the import. A failure here is not fatal: the parser
  // works without it, and the print reports the error itself.
  getPdfHandler().catch(() => {});
});
