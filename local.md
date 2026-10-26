# Soul Chef Dish Cards — Local Feature Notes

Notes on what the local web app (`index.html` + `app.js` + `print-config.js`, served by `server.js` on `http://localhost:3000`) currently does.

## Dish Cards mode (default)

- Paste a free-form WhatsApp catering order into the **Order** textarea.
- **Generate cards** sends the text to OpenRouter (`openai/gpt-6-luna`) via `/api/parse`, using a detailed system prompt that extracts:
  - every dish (name, optional serving note, course category, veg/non-veg, confidence)
  - event date, venue, pax count, report/start time
  - handles multi-message pastes, "&"-joined dish lists, parentheticals, duplicate items
- Renders each dish as a styled card (Soul Chef branding, course badge, veg/non-veg mark, leaf ornaments) laid out on A2 portrait sheets (2 cards × 4 rows per sheet), matching the project's `PRINT` geometry in `print-config.js`.
- **Permit duplicate dishes** toggle — off (default) dedupes identical dish names to one card each; on prints every occurrence as its own card.
- **Use Sample Menu** button — fills the textarea with a canned sample order (vada / samosa / Chiken Biryani / Egg Roll) for quick testing.
- **View system prompt** button — opens a read-only dialog showing the exact `SYSTEM_PROMPT` sent to the model, sourced live from the constant (can't drift out of sync).
- Live preview panel ("Card preview") scales the sheet to fit the panel width, with its own internal scroll.
- **Open PDF** — posts the rendered markup to `/api/pdf` (same server-side renderer used by the n8n/E2B pipeline's equivalent `api/pdf.js`), which prints via headless Chromium and returns a real PDF; opens in a new tab and auto-downloads.
- **Token usage / cost note** — after each generate, shows real token counts, cost in USD and INR (model pricing: $0.10/M input, $0.01/M cached input, $0.50/M output), and whether OpenRouter's prompt cache was hit for that call (cache is short-lived, not persistent).

## Onepage mode

- **Onepage** button toggles a second generation mode, no AI call involved — purely local text parsing.
- Input format: first blank-line-separated block = counter title (e.g. "Pani Puri Counter"); every block after that = one item, first line = item name, remaining lines = description.
- Renders a single real A4 portrait page (8.27in × 11.69in): Soul Chef logo top-left beside the title, item names + descriptions centered below, a dish illustration anchored at the bottom (from `assets/onepage/`).
- Title Case is applied automatically regardless of how the text was typed.
- On-screen preview scales to fit the panel width/height (CSS transform, both axes resized so there's no dead space or horizontal scroll) — the downloaded PDF itself is unscaled.
- Generating automatically builds and downloads a PDF ("Soul Chef - Onepage.pdf") via the same `/api/pdf` endpoint, no extra click needed.
- Currently uses one illustration (`assets/onepage/puris_image.png`) — no image picker (removed by request); add more files + entries to `ONEPAGE_IMAGES` in `app.js` to extend.

## Shared architecture

- `app.js` holds all client-side logic (parsing prompts, card/onepage markup builders, PDF pipeline, UI wiring) — shared by `index.html` locally and in the Vercel deployment, so there's one source of truth instead of duplicated logic per environment.
- `print-config.js` holds the shared `PRINT` sizing constants (card/sheet dimensions, columns/rows) that both the Tailwind config and `app.js` depend on.
- `api/parse.js` and `api/pdf.js` are the Vercel serverless functions (production); `server.js` proxies the same job locally (`handleParse` inline, dynamically imports `api/pdf.js`).
- `ASSET_BASE` switches between the local `/assets` folder and the deployed Vercel asset host automatically based on hostname.

## Known separate/duplicated systems (not unified)

- The **n8n-hosted form** (`automations.autive.io/form/generate-menu-cards`) is a third, independent frontend — not this web app. Its "Parse order" step calls the same `/api/parse` endpoint (via an HTTP Request node) instead of its own embedded AI prompt, so the Dish Cards parsing logic is shared, not duplicated.
- **PDF rendering for the n8n path** uses its own separate copy of the card markup AND now a ported copy of the onepage poster builder, both in `e2b/render.js`, run inside an E2B sandbox (Vercel can't be reached from n8n's Puppeteer step the same way). This is NOT the same code path as `api/pdf.js` / `app.js`'s builders — it is kept in sync by hand. As of this session, `e2b/render.js` was brought back in line with `app.js`'s current dish-card layout and gained a `buildOnepageDocument()` matching `renderOnepage()`; any further design change to either feature in `app.js` still needs the same change copied into `e2b/render.js` and the E2B template rebuilt.
- The n8n form's own CSS was manually restyled (gold/cream theme, Poppins) in `n8n flow/soulchef-dish-cards.workflow.json` to visually match this app, but it is still n8n's native form renderer, not this HTML.
- The n8n form now has a **Mode** dropdown (Dish Cards / Onepage Poster) that branches the workflow — Onepage Poster skips the AI step entirely (a Code node does the same local text parsing `parseOnepage()` does) and both branches converge on the same E2B render step, which picks the right document by `order.json`'s shape. See `production.md` for the full pipeline.

## Known limitations

- Onepage mode has no AI parsing, no veg/non-veg detection, no PDF schema validation — it's intentionally simple, fixed-structure text parsing only, on both the web app and the n8n branch.
- The OpenRouter prompt-cache discount shown in the usage note is not guaranteed between sessions — it resets after a few minutes of inactivity.
- `e2b/render.js`'s card and onepage design must be manually kept in sync with `app.js` if either layout changes — no shared module between the two yet, and every change requires rebuilding/republishing the E2B sandbox template (`npx @e2b/cli template create soulchef-pdf ...`) before it takes effect in production.
- "Use Sample Menu" and "View system prompt" have no equivalent on the n8n form — the former is approximated there by pre-filling the Order field's default value with the same sample text; the latter has no UI equivalent in a one-shot form (the prompt is still visible in the workflow's "Set system prompt" node for anyone editing it).
