/*
 * POST /api/pdf — Vercel function.
 *
 * Takes the PARSED order (the same shape api/parse.js's caller builds from
 * OpenRouter's reply — eventDate/venue/pax/dishes[]) and returns a rendered
 * PDF of the dish cards. This is the single source of truth for the card
 * markup: both index.html's browser flow and the n8n workflow call this
 * same endpoint with the same payload shape, so there is one place that
 * draws a card rather than two copies drifting apart.
 *
 * Card markup, PRINT geometry and colours are ported verbatim from
 * index.html's own <script> block (cardShell/brandMark/titleCard/dishCard/
 * sheetFooter, the PRINT constants, the Tailwind config, and the print CSS).
 * Keep the two in step if the design changes.
 *
 * puppeteer-core + @sparticuz/chromium replace plain `puppeteer`: Vercel's
 * function bundle has no system Chromium, so @sparticuz/chromium ships a
 * build of it that is packaged to run inside this sandbox. Every call
 * launches its own browser and closes it when done — a Vercel function is a
 * fresh, stateless invocation each time, so there is no page to keep warm
 * across requests the way server.js does for local dev.
 */
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

/* assets/*.png live in this same Vercel project (see vercel.json / the
   assets/ folder next to api/), so Chromium can reach them over the network
   regardless of where the calling page (index.html, n8n, ...) is hosted. */
const ASSET_BASE = 'https://soulchef-pdf-api.vercel.app/assets';

/* ==================== PRINT SIZE — keep in step with index.html ====================
   All lengths are INCHES. See index.html's own PRINT block for the full
   explanation of these numbers (A2 portrait, 1 card across, 4 down). */
const PRINT = {
  CARD_W: 14.272,
  CARD_H: 5.58,
  SHEET_W: 16.531,
  SHEET_H: 23.385,
  COLS: 1,
  ROWS: 4,
  GAP: 0.18,
  PAD_TOP: 0.2,
  PAD_SIDE: 1.1295,
  PAD_BOTTOM: 0.15,
  CARD_FONT_PT: 43,
};
PRINT.PER_SHEET = PRINT.COLS * PRINT.ROWS;

/* ---------- reused artwork/ornament snippets, ported from index.html ---------- */
const TOQUE = `<img src="${ASSET_BASE}/Cheif_Hat-removebg-preview.png" alt="" aria-hidden="true"
  class="mx-auto h-[30pt] w-auto">`;

const BOTTOM_RULE = `<img src="${ASSET_BASE}/card bottom line.png" alt="" aria-hidden="true"
  class="h-auto w-[230pt]">`;

const EDGE_SPRIG = `<img src="${ASSET_BASE}/bottom_left_leaf-removebg-preview.png" alt="" aria-hidden="true"
  class="h-[78pt] w-auto">`;
const EDGE_SPRIG_R = `<img src="${ASSET_BASE}/bottom_right_leaf-removebg-preview.png" alt="" aria-hidden="true"
  class="h-[78pt] w-auto">`;

const FLEURON = `<svg viewBox="0 0 40 10" class="mx-auto h-[8pt] w-[41pt]" aria-hidden="true">
  <path d="M4 5 L16 5" stroke="#B49A63" stroke-width="0.5" opacity="0.8"/>
  <path d="M24 5 L36 5" stroke="#B49A63" stroke-width="0.5" opacity="0.8"/>
  <path d="M20 1 C20.6 3.6, 21.4 4.4, 24 5 C21.4 5.6, 20.6 6.4, 20 9 C19.4 6.4, 18.6 5.6, 16 5 C18.6 4.4, 19.4 3.6, 20 1 Z" fill="#B49A63"/>
</svg>`;

const SHEET_CLASS = [
  'sheet box-border grid justify-center bg-cream origin-top-left',
  'w-sheet h-sheet-h',
  `gap-[${PRINT.GAP}in]`,
  `p-[${PRINT.PAD_TOP}in_${PRINT.PAD_SIDE}in_${PRINT.PAD_BOTTOM}in]`,
  `[grid-template-columns:repeat(${PRINT.COLS},${PRINT.CARD_W}in)]`,
  `[grid-template-rows:repeat(${PRINT.ROWS},min-content)_1fr]`,
].join(' ');

const FOOTER_CLASS =
  `sheet-footer col-[1/-1] row-[${PRINT.ROWS + 1}] self-end ` +
  'flex items-end justify-center px-[6pt] pt-[4pt] pb-[2pt]';

function sheetFooter() {
  return `<div class="${FOOTER_CLASS}">
    <img src="${ASSET_BASE}/footer.png" alt="" aria-hidden="true"
      class="block max-h-[48pt] w-full object-contain">
  </div>`;
}

const BADGE = {
  'Welcome Drink': 'bg-leaf',
  'Soup':          'bg-leaf',
  'Starters':      'bg-[#D9A842]',
  'Main Course':   'bg-leaf',
  'Accompaniments':'bg-leaf',
  'Desserts':      'bg-leaf',
};

function cardShell(inner, extra = '', frameClass = '') {
  return `<div class="dish-card relative box-border flex w-card h-card-h flex-none flex-col items-center overflow-hidden bg-card px-[15pt] py-[15pt] text-[${PRINT.CARD_FONT_PT}pt] ${extra}">
    <div class="card-frame ${frameClass} pointer-events-none absolute inset-[10pt] border-[2pt] border-solid border-gold"><i></i><i></i></div>
    ${inner}
  </div>`;
}

function brandMark() {
  return `<div class="relative w-full pt-[2pt]">
    ${TOQUE}
    <p class="mt-[5pt] text-center font-display text-[32pt] font-semibold leading-none tracking-[0.26em] text-ink">SOUL CHEF</p>
    <p class="mt-[7pt] text-center font-sans text-[13pt] font-medium uppercase leading-none tracking-[0.08em] text-gold">
      &mdash; Stress Free Experience For Your Event &mdash;
    </p>
  </div>`;
}

function titleCard(date, venue, pax) {
  return cardShell(`
    <div class="relative flex h-full w-full flex-col items-center justify-center text-center">
      <div class="pointer-events-none absolute bottom-[2pt] left-[2pt]">${EDGE_SPRIG}</div>
      <div class="pointer-events-none absolute bottom-[2pt] right-[2pt]">${EDGE_SPRIG_R}</div>
      <img src="${ASSET_BASE}/Cheif_Hat-removebg-preview.png" alt="" aria-hidden="true" class="mx-auto h-[36pt] w-auto">
      <p class="mt-[5pt] font-display text-[40pt] font-semibold leading-none tracking-[0.12em] text-ink">SOUL CHEF</p>
      <p class="mt-[7pt] font-sans text-[12pt] font-medium uppercase leading-none tracking-[0.1em] text-ink/75">
        &mdash; Stress Free Experience For Your Event &mdash;
      </p>
      <div class="mt-[7pt]">${FLEURON.replace('h-[8pt] w-[41pt]', 'h-[13pt] w-[66pt]')}</div>
      <p class="mt-[9pt] font-sans text-[24pt] font-medium leading-none tracking-[0.08em] text-ink">${(date || '').toUpperCase() || '&mdash;'}</p>
      <p class="mt-[9pt] font-playfair text-[19pt] italic leading-tight text-ink/85">${venue || ''}</p>
      ${pax ? `<p class="mt-[7pt] font-sans text-[15pt] font-medium uppercase leading-none tracking-[0.12em] text-gold">${pax}</p>` : ''}
    </div>`, '', 'is-plain');
}

function dishCard(d) {
  const FLIPS_FOR_NONVEG = d.course === 'Starters' || d.course === 'Main Course';
  const badge = (FLIPS_FOR_NONVEG && !d.veg) ? 'bg-nonveg' : (BADGE[d.course] || 'bg-leaf');
  const dotColor = d.veg ? 'bg-veg' : 'bg-nonveg';
  const dotBorder = d.veg ? 'border-veg' : 'border-nonveg';
  const dotText = d.veg ? 'text-veg' : 'text-nonveg';
  const dotLabel = d.veg ? 'VEG' : 'NON-VEG';
  return cardShell(`
    <div class="relative flex h-full w-full flex-col items-center">
      <div class="pointer-events-none absolute bottom-[2pt] left-[2pt]">${EDGE_SPRIG}</div>

      <div class="absolute left-[12pt] top-[12pt] z-10 flex items-center gap-[10pt]">
        <span class="flex h-[26pt] w-[26pt] items-center justify-center border-[2.5pt] border-solid ${dotBorder}">
          <span class="h-[15pt] w-[15pt] rounded-full ${dotColor}"></span>
        </span>
        <span class="font-sans text-[20pt] font-bold uppercase leading-none tracking-[0.12em] ${dotText}">${dotLabel}</span>
      </div>

      <div class="flex w-full flex-1 flex-col items-center justify-center gap-[16pt]">
        ${brandMark()}

        <div class="flex w-full justify-center">
          <span class="ribbon w-[330pt] [-webkit-mask-image:var(--brush)] [mask-image:var(--brush)] [-webkit-mask-size:100%_100%] [mask-size:100%_100%] [-webkit-mask-repeat:no-repeat] [mask-repeat:no-repeat] ${badge} whitespace-nowrap px-[20pt] py-[11pt] text-center font-sans text-[17pt] font-semibold uppercase leading-none tracking-[0.14em] text-white">
            ${d.course}
          </span>
        </div>

        <div class="relative z-10 flex w-full flex-col items-center px-[26pt]">
          <div class="flex h-[128pt] w-full flex-col items-center justify-center overflow-hidden">
            <h3 class="dish-name text-balance text-center font-playfair text-[38pt] font-bold leading-[1.15] text-ink">
              ${d.name}
            </h3>
            ${d.note ? `<p class="mt-[5pt] text-center font-display text-[19pt] italic leading-tight text-ink">${d.note}</p>` : ''}
          </div>
        </div>
      </div>

      <div class="relative z-10 flex flex-col items-center">
        ${BOTTOM_RULE}
      </div>
    </div>`);
}

/* ---------- the parsed order -> renderer input shape, same mapping as
   index.html's parseOrder() does client-side ---------- */
function normalizeOrder(parsed) {
  return {
    date: parsed.eventDate || '',
    venue: parsed.venue || '',
    pax: parsed.pax || '',
    dishes: (parsed.dishes || [])
      .filter((d) => d && d.name)
      .map((d) => ({
        course: d.category || 'Main Course',
        name: d.name,
        note: d.sub || '',
        veg: d.diet !== 'N',
      })),
  };
}

const CARDS_PER_SHEET = PRINT.PER_SHEET;

/* ---------- the standalone document Chromium prints ---------- */
function buildDocument(order) {
  const main = [
    ...order.dishes.map(dishCard),
  ];

  const sheets = [];
  for (let i = 0; i < main.length; i += CARDS_PER_SHEET) {
    sheets.push(main.slice(i, i + CARDS_PER_SHEET));
  }

  const sheetsHtml = sheets.map((chunk) =>
    `<div class="sheet-frame"><div class="${SHEET_CLASS}">${chunk.join('') + sheetFooter()}</div></div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Soul Chef Dish Cards</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Jost:wght@300;400;500;600&family=Caveat:wght@500&family=Poppins:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap">
<script src="https://cdn.tailwindcss.com"><\/script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
          sans: ['Jost', 'system-ui', 'sans-serif'],
          script: ['Caveat', 'cursive'],
          poppins: ['Poppins', 'system-ui', 'sans-serif'],
          playfair: ['"Playfair Display"', 'Georgia', 'serif'],
        },
        colors: {
          cream: '#F3EBDD', card: '#FBF6EC', gold: '#A98B4F', ink: '#2F2A24',
          leaf: '#7D9A5F', veg: '#2E8B2E', nonveg: '#C0392B', rose: '#D08A8A',
        },
        spacing: {
          card: '${PRINT.CARD_W}in', 'card-h': '${PRINT.CARD_H}in',
          sheet: '${PRINT.SHEET_W}in', 'sheet-h': '${PRINT.SHEET_H}in',
        },
      },
    },
  };
<\/script>
<style>
  :root {
    --brush: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='28 23 444 87' preserveAspectRatio='none'%3E%3Cpath fill='%23000' d='M60 25 C45 25 35 33 35 42 C35 47 40 51 45 54 C38 57 30 62 30 70 C30 77 38 82 48 84 C40 88 35 93 35 98 C35 106 50 108 70 108 L430 108 C450 108 465 106 465 98 C465 93 460 88 452 84 C462 82 470 77 470 70 C470 62 462 57 455 54 C460 51 465 47 465 42 C465 33 455 25 440 25 Z'/%3E%3C/svg%3E");
  }
  .card-frame { --w: 2pt; --m: 15pt; }
  .card-frame::before, .card-frame::after, .card-frame > i {
    content: ''; position: absolute; width: calc(var(--m) * 1.414); height: var(--w); background: #A98B4F;
  }
  .card-frame::before { top: calc(var(--m) / 2); left: calc(var(--m) / 2); transform: translate(-50%, -50%) rotate(-45deg); }
  .card-frame::after { top: calc(var(--m) / 2); right: calc(var(--m) / 2); transform: translate(50%, -50%) rotate(45deg); }
  .card-frame > i:first-child { bottom: calc(var(--m) / 2); left: calc(var(--m) / 2); transform: translate(-50%, 50%) rotate(45deg); }
  .card-frame > i:last-child { bottom: calc(var(--m) / 2); right: calc(var(--m) / 2); transform: translate(50%, 50%) rotate(-45deg); }
  .card-frame.is-plain::before, .card-frame.is-plain::after, .card-frame.is-plain > i { display: none; }

  @page { size: ${PRINT.SHEET_W.toFixed(2)}in ${PRINT.SHEET_H.toFixed(2)}in; margin: 0; }
  body { margin: 0; background: #fff; }
  #cards { display: block; }
  .sheet-frame {
    width: auto !important; height: auto !important; overflow: hidden !important;
    break-inside: avoid; page-break-inside: avoid;
  }
  .sheet-frame + .sheet-frame { break-before: page; page-break-before: always; }
  .sheet-frame:last-child { break-after: avoid; page-break-after: avoid; }
  .sheet { margin: 0 !important; overflow: hidden !important; }
  .dish-card { break-inside: avoid; page-break-inside: avoid; }
</style>
</head><body><div id="cards">${sheetsHtml}</div></body></html>`;
}

/* Shrink any dish name that still does not fit its card, same algorithm as
   fitNames() in index.html — run here via page.evaluate so it measures the
   real rendered layout inside Chromium, not an approximation. */
const FIT_NAMES_SCRIPT = `
  (function () {
    const names = [...document.querySelectorAll('.dish-name')];
    if (!names.length) return;
    const fits = (el) => {
      const box = el.parentElement;
      return el.offsetHeight <= box.clientHeight + 1 && el.offsetWidth <= box.clientWidth + 1;
    };
    const START_PX = 38 * (96 / 72);
    let px = START_PX;
    names.forEach((el) => { el.style.fontSize = px + 'px'; });
    for (let i = 0; i < 20; i++) {
      if (names.every(fits)) break;
      px *= 0.94;
      names.forEach((el) => { el.style.fontSize = px + 'px'; });
    }
    const FLOOR_PX = 22 * (96 / 72);
    if (px < FLOOR_PX) {
      names.forEach((el) => { el.style.fontSize = FLOOR_PX + 'px'; });
      names.filter((el) => !fits(el)).forEach((el) => {
        let own = FLOOR_PX;
        for (let i = 0; i < 12 && !fits(el); i++) {
          own *= 0.92;
          el.style.fontSize = own + 'px';
        }
      });
    }
  })();
`;

async function renderPdf(order) {
  const html = buildDocument(order);

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 50000 });

    // Tailwind's CDN build scans the DOM and injects classes asynchronously,
    // so the sheet can still be unstyled right after setContent.
    await page.waitForFunction(() => {
      const s = document.querySelector('.sheet');
      return !s || s.offsetWidth > 500;
    }, { timeout: 15000 }).catch(() => {});

    await page.waitForFunction(() => {
      return [...document.images].every((img) => img.complete);
    }, { timeout: 15000 }).catch(() => {});

    await page.evaluateHandle('document.fonts.ready');

    // size dish names to fit, same as the browser does before printing
    await page.evaluate(FIT_NAMES_SCRIPT);

    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}

export default async function handler(req, res) {
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

  const body = req.body || {};

  // two accepted shapes: { order: <parsed OpenRouter order JSON> } for the
  // n8n workflow, or the legacy { html: '<...>' } for index.html's own flow
  let pdf;
  try {
    if (body.order) {
      pdf = await renderPdf(normalizeOrder(body.order));
    } else if (body.html) {
      pdf = await renderPdfFromHtml(body.html);
    } else {
      res.status(400).json({ error: 'No order or html to print.' });
      return;
    }
  } catch (err) {
    res.status(500).json({ error: 'Could not render the PDF: ' + err.message });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="soul-chef-dish-cards.pdf"');
  res.status(200).send(Buffer.from(pdf));
}

/* kept for index.html's existing flow, which still posts fully-built HTML
   (it already has the real DOM to run fitNames against before serializing) */
async function renderPdfFromHtml(html) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 50000 });
    await page.waitForFunction(() => {
      const s = document.querySelector('.sheet');
      return !s || s.offsetWidth > 500;
    }, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => {
      return [...document.images].every((img) => img.complete);
    }, { timeout: 15000 }).catch(() => {});
    await page.evaluateHandle('document.fonts.ready');
    return await page.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
