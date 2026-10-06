/*
 * POST /api/parse — Vercel function.
 *
 * Same job as handleParse in server.js: forward the page's chat-completion
 * request to OpenRouter, adding the Authorization header here so the key
 * never reaches the browser. The key comes from the OPENROUTERKEY
 * environment variable (set in the Vercel dashboard), not a committed .env.
 */
export default async function handler(req, res) {
  // The page is served from a different origin than this function (e.g.
  // localhost:3000 for local dev, or wherever index.html ends up hosted), so
  // the browser needs an explicit CORS allow before it will let the fetch
  // through — including its OPTIONS preflight.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  const apiKey = process.env.OPENROUTERKEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENROUTERKEY is not set in the environment.' });
    return;
  }

  // Vercel parses a JSON request body into req.body automatically.
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ error: 'Request body was not JSON.' });
    return;
  }

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach OpenRouter: ' + err.message });
  }
}
