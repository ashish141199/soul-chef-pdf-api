# Soul Chef Dish Cards — Production Notes

What's actually live, where, and how the pieces connect. There are three separate production surfaces; they are NOT all the same deployment of the same code.

## 1. The real user-facing frontend: n8n form

- **URL**: `https://automations.autive.io/form/generate-menu-cards`
- This is an **n8n-hosted form** (n8n's own native Form Trigger UI), not `index.html`. It is the actual production entry point people use — not the Vercel-deployed web app.
- Workflow definition in this repo: `n8n flow/soulchef-dish-cards.workflow.json` (an exported copy — editing this file does **not** change the live workflow; changes must be re-imported/updated into the live n8n instance by hand).
- Styled with custom CSS (gold/cream theme, Poppins font) injected via the form node's `customCss` option, to visually match the web app's look. It is still n8n's own form renderer under the hood, not this project's HTML/CSS, so it can never be pixel-identical.

### Pipeline (on form submit)
1. **On form submission** — collects the "Order" textarea (pre-filled with a sample menu as its default value), the "Duplicate Dishes" checkbox, and a new **Mode** dropdown: *Dish Cards* or *Onepage Poster*.
2. **Which mode?** — an IF node that branches on the Mode field.
   - **Onepage Poster** (true branch) → **Build onepage**: a Code node that does the SAME local, AI-free text parsing as `app.js`'s `parseOnepage()` — first blank-line-separated block is the counter title, every block after that is one item (name + optional description). No OpenRouter call at all for this branch.
   - **Dish Cards** (false branch) → the original AI path:
     3. **Set system prompt** — a Code node holding the exact `SYSTEM_PROMPT` text, kept as a manual copy of `app.js`'s constant. Update both together if the prompt changes.
     4. **Parse order** — an HTTP Request node that POSTs to the Vercel-hosted `/api/parse` endpoint (see §2), `stream` omitted (plain JSON, not SSE), `usage: { include: true }` so OpenRouter returns real token counts, same `messages`/`response_format`/model/temperature shape the web app sends.
     5. **Build replacements** — reads the HTTP response (`choices[0].message.content` + `usage`), applies the egg → non-veg override rule, dedupes dishes unless "Duplicate Dishes" is checked, builds the output filename, and computes a token/cost note (same $0.10/$0.01 cached/$0.50 per-1M pricing the web app's usage display uses).
3. Both branches converge: **Create sandbox** → **Write order.json** → **Run render.js** → **Download PDF** → **Kill sandbox** — an [E2B](https://e2b.dev) cloud sandbox is spun up from the `soulchef-pdf` template (Puppeteer + Chromium baked in), the order is written to `order.json` (either `{ dishes: [...] }` or `{ onepage: { title, items } }`), `node render.js` picks the right document builder by that shape and prints a real PDF, the file is downloaded back into the workflow, and the sandbox is destroyed.
4. **Name PDF** — renames the download, records timing breakdown, and carries the veg/non-veg review list and token/cost note (if any) through to the completion screen. Reads from whichever Build step actually ran.
5. **Return PDF** — the completion screen: returns the PDF as a binary download, shows the veg/non-veg double-check message (Dish Cards only), the token/cost note (Dish Cards only — Onepage has nothing to report since it made no AI call), and a "Generate another order" link.

### Why E2B instead of Vercel for the PDF here
n8n's Code nodes run plain JS in a sandboxed runtime — no way to launch a real Chromium/Puppeteer browser process. E2B provides a real disposable Linux VM that can, standing in for what Vercel's serverless functions do natively via `@sparticuz/chromium`.

### ⚠️ PDF design is a hand-synced copy, not shared code
`e2b/render.js` holds its **own separate copy** of the dish-card markup/CSS/layout (`cardShell`, `dishCard`, `brandMark`, `PRINT` geometry) and, as of this session, a ported `buildOnepageDocument()` matching `app.js`'s `renderOnepage()`. Neither is imported from `app.js` or `api/pdf.js` — this is a plain Node/Puppeteer script with no DOM, so the browser code cannot run there directly. Both card and onepage layouts were brought back in sync with `app.js` in this session; any **future** design change made in `app.js` (fonts, spacing, colors, card or poster layout) will **not** automatically appear in n8n-generated PDFs until `e2b/render.js` (and, for a onepage asset/font change, `e2b/build-assets.js` too) is updated by hand and the E2B template is rebuilt — see §4.

## 2. The Vercel deployment (backend API)

- **Base URL**: `https://soulchef-pdf-api.vercel.app` (hardcoded in `app.js` as `API_BASE`/`ASSET_BASE` production fallback, and hit directly by the n8n workflow's "Parse order" HTTP Request node).
- Deploys the whole repo root as a static site + two serverless functions, configured by `vercel.json`:
  - `api/parse.js` — `POST /api/parse`. Forwards the page's chat-completion request to OpenRouter, adding the `Authorization` header server-side so the key never reaches the browser or n8n. Reads `OPENROUTERKEY` from the Vercel project's environment variables (**not** a committed `.env` — that file is git-ignored and never deployed). Supports both streamed (SSE, used by the web app) and non-streamed (plain JSON, used by n8n) calls depending on whether the request body sets `stream: true`.
  - `api/pdf.js` — `POST /api/pdf`. Renders arbitrary HTML to a PDF using `@sparticuz/chromium` + `puppeteer-core` (Vercel's own answer to "no Chromium in a serverless function"). Used by:
    - `index.html`/`app.js`'s "Open PDF" / Onepage auto-download flow (hit directly from the browser).
    - `server.js` locally (dynamically imports this same file — so local dev and Vercel production execute the identical PDF renderer).
  - Configured in `vercel.json`: `api/pdf.js` gets 2048MB memory / 60s timeout (headless Chromium is heavy); `api/parse.js` gets a 30s timeout.
- Static files served as-is: `index.html`, `app.js`, `print-config.js`, `assets/**` (including `assets/onepage/`).

### Environment variables required (Vercel dashboard → Settings → Environment Variables)
- `OPENROUTERKEY` — the OpenRouter API key. Required in the **Production** scope or `/api/parse` returns a 500 with "OPENROUTERKEY is not set in the environment."

### Deploying
- Push to the branch Vercel is connected to (commonly `main`) — this triggers an automatic rebuild/redeploy if the project is already linked.
- If not yet linked: Vercel dashboard → Add New Project → import this repo. No framework preset needed (static + serverless functions auto-detected).
- **As of the last check in this session, `https://soulchef-pdf-api.vercel.app` returned Vercel's own platform 404** ("The deployment could not be found on Vercel") when the n8n workflow's HTTP Request node called it — meaning either the deployment is currently down/removed, or the hostname has changed. **This needs verifying/fixing before the n8n "Parse order" step (and the web app's production fallback) will work.**

## 3. The local dev app (`bun dev` / `server.js`)

- Not production, but shares all the same frontend code (`index.html`, `app.js`, `print-config.js`) and the same `api/pdf.js` renderer as the Vercel deployment — see `local.md` for the full feature list.
- Differs only in how the two API routes are served: `server.js` has its own inline `/api/parse` proxy and dynamically imports `api/pdf.js` for `/api/pdf`, both reading the OpenRouter key from a local `.env` file (never committed, never deployed).

## Summary: three independent "productions" of the same idea

| Surface | Frontend | AI parsing | PDF rendering | Dish Cards | Onepage Poster |
|---|---|---|---|---|---|
| n8n form (real users) | n8n native form UI, with a Mode dropdown | Shared — calls Vercel `/api/parse` (Dish Cards only; Onepage has no AI step) | `e2b/render.js` in an E2B sandbox | Yes, design re-synced this session | Yes, ported this session |
| Vercel deployment | `index.html`/`app.js` (same as local) | `api/parse.js` (own copy of the prompt, same logic as `server.js`'s) | `api/pdf.js` | Yes — source of truth | Yes — source of truth |
| Local dev (`bun dev`) | `index.html`/`app.js` | `server.js`'s inline proxy → OpenRouter | `api/pdf.js` (imported) | Yes — source of truth | Yes — source of truth |

## Open items / things to check before calling this "live"

1. **Rebuild and republish the E2B template** — `e2b/render.js`, `e2b/build-assets.js` and `e2b/assets/onepage/*.png` were all changed/added this session (dish-card layout fix, onepage support, Agbalumo font). None of this reaches production until the template is rebuilt:
   ```
   cd e2b
   npx @e2b/cli template create soulchef-pdf --dockerfile e2b.Dockerfile --cpu-count 2 --memory-mb 2048
   ```
   (confirmed logged in this session as `aayushmore17082003@gmail.com`, project "Aayush's Project"). Not yet run as of this writing.
2. **Re-import the updated `n8n flow/soulchef-dish-cards.workflow.json`** into the live n8n instance — the Mode dropdown, pre-filled sample Order, "Which mode?" branch, "Build onepage" node and the token/cost completion-message text all only exist in this repo's file until re-imported.
3. **Vercel deployment status** — confirm `soulchef-pdf-api.vercel.app` is actually live (it 404'd during n8n testing earlier in this session). The Dish Cards branch's "Parse order" step depends on it; Onepage Poster does not (no AI call).
4. **`OPENROUTERKEY`** must be set in Vercel's Production environment variables, separately from the local `.env`.
5. **After the template rebuild**, smoke-test both Mode options end-to-end on the live n8n form before considering this done — this session's changes were verified by syntax-checking and directly executing `render.js`'s document builders in Node (no browser/Chromium, no live E2B sandbox), not by an actual PDF render.
