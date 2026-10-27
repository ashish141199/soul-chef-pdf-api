/* ---------- the leaf flourish, reused on every card ---------- */
const LEAF = `<svg viewBox="0 0 40 16" class="h-[15pt] w-[40pt]" aria-hidden="true">
  <path d="M20 14 C20 8, 20 4, 20 2" stroke="#A98B4F" stroke-width="0.8" fill="none"/>
  <path d="M20 11 C16 11, 13 9, 12 6 C16 6, 19 8, 20 11 Z" fill="#A98B4F" opacity="0.75"/>
  <path d="M20 11 C24 11, 27 9, 28 6 C24 6, 21 8, 20 11 Z" fill="#A98B4F" opacity="0.75"/>
  <path d="M20 7 C17 7, 15 5.5, 14 3 C17 3, 19 4.5, 20 7 Z" fill="#A98B4F" opacity="0.55"/>
  <path d="M20 7 C23 7, 25 5.5, 26 3 C23 3, 21 4.5, 20 7 Z" fill="#A98B4F" opacity="0.55"/>
</svg>`;

/* absolute, not relative: this markup is serialized and posted to
   server.js's /api/pdf handler, which renders it in a sandboxed Chromium
   with no access to this page's own origin, so a relative "assets/..."
   path resolves to nothing there even though it works fine on-screen.
   This app is local-only (served by server.js), so this is always the
   local origin's own /assets folder. */
const ASSET_BASE = location.origin + '/assets';

const TOQUE = `<img src="${ASSET_BASE}/Cheif_Hat-removebg-preview.png" alt="" aria-hidden="true"
  class="mx-auto h-[30pt] w-auto">`;

/* the rule-and-sprig divider that closes each dish card */
const BOTTOM_RULE = `<img src="${ASSET_BASE}/card bottom line.png" alt="" aria-hidden="true"
  class="h-auto w-[230pt]">`;

/* a smaller leaf sprig, used in the poster's footer corners */
const CORNER_SPRIG = `<img src="${ASSET_BASE}/bottom_left_leaf-removebg-preview.png" alt="" aria-hidden="true"
  class="h-[30pt] w-auto">`;

/* foliage that fills a bottom corner and spills inward. The right sprig is
   the same artwork mirrored with a transform, not a second asset, so it is
   always a true mirror of the left one rather than its own separate lean. */
const EDGE_SPRIG = `<img src="${ASSET_BASE}/bottom_left_leaf-removebg-preview.png" alt="" aria-hidden="true"
  class="h-[78pt] w-auto">`;
const EDGE_SPRIG_R = `<img src="${ASSET_BASE}/bottom_left_leaf-removebg-preview.png" alt="" aria-hidden="true"
  class="h-[78pt] w-auto [transform:scaleX(-1)]">`;

/* small diamond ornament under the title card's tagline */
const FLEURON = `<svg viewBox="0 0 40 10" class="mx-auto h-[8pt] w-[41pt]" aria-hidden="true">
  <path d="M4 5 L16 5" stroke="#B49A63" stroke-width="0.5" opacity="0.8"/>
  <path d="M24 5 L36 5" stroke="#B49A63" stroke-width="0.5" opacity="0.8"/>
  <path d="M20 1 C20.6 3.6, 21.4 4.4, 24 5 C21.4 5.6, 20.6 6.4, 20 9 C19.4 6.4, 18.6 5.6, 16 5 C18.6 4.4, 19.4 3.6, 20 1 Z" fill="#B49A63"/>
</svg>`;

/* The sheet's own utilities, built from the PRINT block so the grid, the
   padding and the gap all follow one set of numbers. Tailwind's CDN scans
   the DOM for class names, and these are whole strings by the time they land
   in the markup, so it sees them as written. */
const SHEET_CLASS = [
  'sheet box-border grid justify-center bg-cream origin-top-left',
  'w-sheet h-sheet-h',
  `gap-[${PRINT.GAP}in]`,
  `p-[${PRINT.PAD_TOP}in_${PRINT.PAD_SIDE}in_${PRINT.PAD_BOTTOM}in]`,
  `[grid-template-columns:repeat(${PRINT.COLS},${PRINT.CARD_W}in)]`,
  // the card rows at their own height, then a final row that takes up the
  // slack so the footer always sits on the sheet's bottom edge
  `[grid-template-rows:repeat(${PRINT.ROWS},min-content)_1fr]`,
  'scale-[var(--sheet-scale,1)]',
].join(' ');

/* the footer spans every column and sits in the slack row after the cards */
const FOOTER_CLASS =
  `sheet-footer col-[1/-1] row-[${PRINT.ROWS + 1}] self-end ` +
  'flex items-end justify-center px-[6pt] pt-[4pt] pb-[2pt]';

/* the decorative band across the bottom of the poster */
function sheetFooter() {
  // one piece of artwork: it already carries the end sprigs, both rules and
  // the centre leaf, so it just spans the grid at the sheet's full width
  // the band sits in the sheet's slack row, so its height is capped and the
  // artwork is fitted inside: a w-full image would scale to its own aspect
  // ratio and push the sheet past one page
  return `<div class="${FOOTER_CLASS}">
    <img src="${ASSET_BASE}/footer.png" alt="" aria-hidden="true"
      class="block max-h-[48pt] w-full object-contain">
  </div>`;
}

/* ---------- badge colour per course ---------- */
const BADGE = {
  'Welcome Drink': 'bg-leaf',
  'Soup':          'bg-leaf',
  'Starters':      'bg-[#D9A842]',
  'Main Course':   'bg-leaf',
  'Accompaniments':'bg-leaf',
  'Desserts':      'bg-leaf',
};

/* ================= the parser: the model reads the order ===================
   The order text is read by a model rather than by regexes, so wording the
   rules never anticipated (an unlisted course heading, a dish whose diet is
   a judgment call) is still read correctly.
   The key lives server-side (server.js) and forwards this to OpenRouter,
   so the key is never in the page. This app is local-only, so the parse
   endpoint is always this same origin's own /api/parse. */
const PARSE_URL = '/api/parse';
const MODEL = 'openai/gpt-6-luna';

const SYSTEM_PROMPT = `You extract catering order details from free-form WhatsApp text and return JSON only.

- THE TEXT MAY HOLD SEVERAL ORDERS, not just one. A paste often carries a whole
  forwarded chat: several messages back to back, each starting with a line like
  "[10/8, 1:23 PM] +91 75068 67906: *Order 3: 9 October 2026*" and each with its
  own "Menu for the event" and its own "*Note* -" block. Read EVERY message to
  the very end of the text and merge all of their menus into ONE dishes array,
  in the order they appear. Never stop after the first message. A six-message
  paste whose menus hold 30 items must return all 30, not the first message's 4.

Rules:
- dishes: every menu item from every message, in menu order. Ignore non-menu
  lines (name, phone, pax, location/venue, report/start time). A "Note" block
  ends only ITS OWN message — skip to the next message's header and keep going;
  it never ends the whole text.
- The same item may appear more than once, whether repeated within one message
  or across several messages (an AM and a PM slot both listing "Tea/Coffee").
  Emit EVERY occurrence as its own entry, in the order it appears. Do not
  deduplicate dishes.
- A COURSE HEADING IS NOT A DISH. Headings are often bold or on their own line
  with no bullet: "Welcome Drinks", "Soup", "Starters on Buffet", "Main Course
  on Buffet", "Accompaniments", "Deserts", "Desserts". Never emit a dish whose
  name is just a heading. A heading that is followed by its items on later
  lines still only sets the category, e.g.

    Soup

    Broccoli & Roasted Almond Soup with Garlic Stick

  is ONE dish, "Broccoli & Roasted Almond Soup with Garlic Stick", in the
  "Soup" category — not a dish called "Soup".
- An "&"-joined list of items on one menu line is SEVERAL SEPARATE DISHES, one
  per segment, each emitted as its own entry (same category, same position in
  menu order) -- UNLESS the "&" instead joins two words that only make sense
  together as a single dish's name. Test each segment on its own: if it reads
  as a complete, independently-orderable dish by itself, split it out.
    "Choley & Bread Kulcha (Amritsari Black Chole) & Biryani & Raita (Add Paneer)"
    -> FOUR dishes: "Choley", "Bread Kulcha", "Biryani", "Raita" (every
    parenthetical is dropped entirely regardless of splitting -- see below).
    "Broccoli & Roasted Almond Soup with Garlic Stick" -> ONE dish, because
    "Broccoli" alone and "Roasted Almond Soup with Garlic Stick" alone are not
    each a complete dish -- the "&" is part of this one soup's name. Keep its
    "&" as written.
- name: the dish name, Title Cased, with any parenthetical detail REMOVED and
  any trailing serving phrase REMOVED (see sub).
- Every parenthetical is DROPPED ENTIRELY, on every dish, never kept as sub:
  "Mix Fruit Tetra Pack (Real or Tropicana brand only)" -> name "Mix Fruit
  Tetra Pack", sub "". "Raita (Add Paneer)" -> name "Raita", sub "".
- sub: ONLY a trailing serving phrase, which must be CUT from the name:
      "Blueberry Panncotta Served in Shot Glass" -> name "Blueberry Panncotta",
      sub "Served in Shot Glass".
      "Chocolate mousse in shot glass" -> name "Chocolate Mousse",
      sub "Served in Shot Glass".
  Empty string when there is none, including every parenthetical case above.
- category: which course the dish belongs to, as one of EXACTLY these labels:
  "Welcome Drink", "Soup", "Starters", "Main Course", "Accompaniments", "Desserts".
  Map the message's wording onto that list: "Welcome Drinks" -> "Welcome Drink",
  "Starters on Buffet" -> "Starters", "Main Course on Buffet" -> "Main Course",
  "Deserts" -> "Desserts". Items after a heading inherit it until the next heading.
  If a dish fits none of them, use the closest one; never invent a new label.
- diet: "N" ONLY when the dish NAME ITSELF names meat, fish, poultry, seafood or egg.
  Chicken, mutton, lamb, prawn, fish, crab, bacon, ham, egg, anda and omelette
  in the name are "N".
  Everything else is "V". This is the single most important rule, so apply it
  literally:
    * A dish a restaurant MIGHT make with a hidden animal ingredient is still
      "V" when its name does not say so. "Pad Thai Noodles" is "V", not "N" —
      fish sauce is not in the name. Likewise "Caesar Salad" (anchovy),
      "Kimchi Fried Rice" (shrimp paste), "Panna Cotta" (gelatin): all "V".
      Record the doubt in dietConfidence, NEVER in diet.
    * Read the whole menu before deciding. An all-vegetarian menu almost never
      contains one hidden non-veg dish, so a borderline name on such a menu is
      "V".
    * EGG NAMED IN THE DISH makes it "N": "Egg Curry", "Masala Omelette",
      "Egg Fried Rice", "Egg Bhurji" and "Anda Curry" are all "N". Egg that is
      only HIDDEN inside a dish does NOT: pasta, ravioli, noodles, mayonnaise,
      cake or custard whose name does not say egg stay "V", so "Pumpkin Ravioli
      with Sage Butter Cream Sauce" is "V". "Eggless" and "Eggplant" are not
      egg: "Eggless Chocolate Cake" and "Eggplant Parmigiana" are "V".
  Marking a vegetarian dish "N" is the worst error you can make: it puts a red
  NON-VEG mark on a veg buffet table. When unsure, choose "V" and flag it.
- dietConfidence: "high" when the dish name makes the diet obvious, "low" when
  a hidden animal ingredient is plausible even though the name does not say so
  (Caesar Salad may contain anchovy; a mousse or panna cotta may contain
  gelatin; Pad Thai and many South-East Asian dishes carry fish sauce or
  shrimp paste). "low" is how you express doubt — the diet field stays "V".
The remaining fields describe the event as a whole, not a single dish. When the
text holds several messages, take each one from the FIRST message that has it.
- eventDate: the date as written, e.g. "28 September 2026". Empty string if absent.
- venue: the place, from a "Venue:" or "Location:" line. Shorten it for a card:
  drop a leading floor number and turn "Birla Centurion-Worli" into
  "Birla Centurion, Worli". If the line is only a URL (e.g. a Google Maps link)
  with no readable place name, return an empty string.
- pax: the guest count, from a line like "No. of pax:", "No of pax:" or "Pax:".
  Keep any bracketed note, upper case, e.g. "38 pax (2 Jain)" -> "38 PAX · 2 JAIN",
  and "32" -> "32 PAX". Empty string if absent.
- reportTime: the crew's reporting time, from a "Report time:" line, upper case
  and tidied, e.g. "10:00 am" -> "10:00 AM", "10 am" -> "10 AM". Empty string if absent.
- startTime: the event start time, from a "Start time:" line, same formatting.
  Empty string if absent.
- eventName: a short label for the order, e.g. "Order 5". Empty string if absent.

Return ONLY the JSON object. No prose, no code fences.`;

const ORDER_SCHEMA = {
  type: 'object',
  properties: {
    eventName: { type: 'string' },
    eventDate: { type: 'string' },
    venue: { type: 'string' },
    pax: { type: 'string' },
    reportTime: { type: 'string' },
    startTime: { type: 'string' },
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          sub: { type: 'string' },
          category: { type: 'string' },
          diet: { type: 'string', enum: ['V', 'N'] },
          dietConfidence: { type: 'string', enum: ['high', 'low'] },
        },
        required: ['name', 'sub', 'category', 'diet', 'dietConfidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['eventName', 'eventDate', 'venue', 'pax', 'reportTime', 'startTime', 'dishes'],
  additionalProperties: false,
};

/* Reads an OpenRouter chat-completion SSE body and returns the reassembled
   message.content string, calling onProgress(chunkCount) on every "data: "
   event so the caller can drive a progress indicator off real network
   activity instead of a blind wait. */
async function readSseContent(body, onProgress) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let chunks = 0;
  let usage = null; // OpenRouter sends this on the stream's final chunk

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop(); // last line may be a partial event; keep it for next read

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue; // a stray/partial SSE line; skip rather than fail the whole parse
      }

      const delta = event?.choices?.[0]?.delta?.content;
      if (delta) {
        content += delta;
        chunks += 1;
        onProgress?.(chunks);
      }
      if (event?.usage) usage = event.usage;
    }
  }

  return { content, usage };
}

/* Ask the model to read the order, streamed over SSE so onProgress can report
   real incremental chunks as they arrive rather than one blocking wait.
   A chat-completion stream never states its own final length up front (no
   API exposes that), so onProgress is fed raw chunk events, not a percent —
   the caller (render()) turns that into the smoothed 0-100% shown to the
   user. Returns the shape the renderer expects: { date, venue, pax,
   reportTime, startTime, dishes: [{ course, name, note, veg, unsure }] }. */
async function parseOrder(text, onProgress) {
  const res = await fetch(PARSE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: 'Extract the order details from this message:\n\n' + text },
      ],
      // the schema is enforced by the API, so the reply needs no repair
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'order', strict: true, schema: ORDER_SCHEMA },
      },
      // asks OpenRouter to append a usage object to the stream's final chunk,
      // so the sidebar can show real token counts rather than an estimate
      usage: { include: true },
    }),
  });

  if (res.status === 404) {
    throw new Error('No parser reachable at ' + API_BASE + ' — check the Vercel deployment is live.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Parsing failed (' + res.status + '). ' + detail.slice(0, 300));
  }

  const { content, usage } = await readSseContent(res.body, onProgress);
  if (!content) throw new Error('OpenRouter returned no content.');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Could not read the model\'s reply as JSON.');
  }

  return {
    date: parsed.eventDate || '',
    venue: parsed.venue || '',
    pax: parsed.pax || '',
    reportTime: parsed.reportTime || '',
    startTime: parsed.startTime || '',
    dishes: (parsed.dishes || [])
      .filter((d) => d && d.name)
      .map((d) => ({
        course: d.category || 'Main Course',
        name: d.name,
        note: d.sub || '',
        veg: d.diet !== 'N',
        unsure: d.dietConfidence === 'low',
      })),
    usage,
  };
}

/* ---------- card markup: every card is CARD_W x CARD_H from the PRINT block ---------- */
function cardShell(inner, extra = '', frameClass = '') {
  return `<div class="dish-card relative box-border flex w-card h-card-h flex-none flex-col items-center overflow-hidden bg-card px-[15pt] py-[15pt] text-[${PRINT.CARD_FONT_PT}pt] ${extra}">
    <div class="card-frame ${frameClass} pointer-events-none absolute inset-[10pt] border-[2pt] border-solid border-gold"><i></i><i></i></div>
    ${inner}
  </div>`;
}

function brandMark() {
  return `<div class="relative w-full pt-[20pt]">
    ${TOQUE}
    <p class="mt-[1pt] text-center font-display text-[32pt] font-semibold leading-none tracking-[0.26em] text-ink">SOUL CHEF</p>
    <p class="mt-[${GAP_FOR_ELEMENTS}pt] text-center font-sans text-[13pt] font-medium uppercase leading-none tracking-[0.08em] text-gold">
      &mdash; Stress Free Experience For Your Event &mdash;
    </p>
  </div>`;
}

function titleCard(date, venue, pax) {
  return cardShell(`
    <div class="relative flex h-full w-full flex-col items-center justify-center text-center">
      <div class="pointer-events-none absolute bottom-[5pt] left-[5pt]">${EDGE_SPRIG}</div>
      <div class="pointer-events-none absolute bottom-[5pt] right-[5pt]">${EDGE_SPRIG_R}</div>
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

/* The starting size for every dish name. fitNames then measures the whole set
   and steps them all down together until the longest fits, so the cards share
   one size rather than each picking its own from a character count. This is
   only the starting point and the size used if scripting never runs. */
function nameSize() {
  return 'text-[38pt]';
}

function dishCard(d) {
  // Starters/Main Course badges flip to red for non-veg dishes; other courses keep a fixed colour.
  const FLIPS_FOR_NONVEG = d.course === 'Starters' || d.course === 'Main Course';
  const badge = (FLIPS_FOR_NONVEG && !d.veg) ? 'bg-nonveg' : (BADGE[d.course] || 'bg-leaf');
  const dotColor = d.veg ? 'bg-veg' : 'bg-nonveg';
  const dotBorder = d.veg ? 'border-veg' : 'border-nonveg';
  const dotText = d.veg ? 'text-veg' : 'text-nonveg';
  const dotLabel = d.veg ? 'VEG' : 'NON-VEG';
  return cardShell(`
    <!-- The brand mark, badge and name sit together as one centred group with
         one fixed gap between them, while the rule and diet mark are pinned to
         the card's bottom edge. Stretching all four to fill the height is what
         left a hole between the course badge and the dish name. -->
    <div class="relative flex h-full w-full flex-col items-center">
      <div class="pointer-events-none absolute bottom-[5pt] left-[5pt]">${EDGE_SPRIG}</div>
      <div class="pointer-events-none absolute bottom-[5pt] right-[5pt]">${EDGE_SPRIG_R}</div>

      <!-- the diet mark is the one thing a guest must read at a glance, so it
           gets the FSSAI-style bordered square, pinned to the top-left corner -->
      <div class="absolute left-[12pt] top-[12pt] z-10 flex items-center gap-[9pt]">
        <span class="flex h-[25pt] w-[25pt] items-center justify-center border-[2.5pt] border-solid ${dotBorder}">
          <span class="h-[15pt] w-[15pt] rounded-full ${dotColor}"></span>
        </span>
        <span class="font-sans text-[19pt] font-bold uppercase leading-none tracking-[0.12em] ${dotText}">${dotLabel}</span>
      </div>

      <div class="flex w-full flex-1 flex-col items-center justify-center">
        ${brandMark()}

        <div class="mt-[${GAP_FOR_ELEMENTS}pt] flex w-full justify-center">
          <span class="ribbon w-[330pt] [-webkit-mask-image:var(--brush)] [mask-image:var(--brush)] [-webkit-mask-size:100%_100%] [mask-size:100%_100%] [-webkit-mask-repeat:no-repeat] [mask-repeat:no-repeat] ${badge} whitespace-nowrap px-[20pt] py-[11pt] text-center font-sans text-[17pt] font-semibold uppercase leading-none tracking-[0.14em] text-white">
            ${d.course}
          </span>
        </div>

        <div class="relative z-10 mt-[${GAP_FOR_ELEMENTS}pt] flex w-full flex-col items-center px-[26pt]">
          <!-- h-[128pt] is the room between the course badge and the bottom
               rule: about two lines at the shared size. fitNames measures the
               inner span against it, so it decides how large the set can be.
               justify-start (not -center): a one-line name should sit right
               after the badge gap, not be pushed down to the middle of the
               space reserved for a two-line name. -->
          <!-- the sub-note belongs to the name, so it sits inside the same
               box: outside it, the box's fixed height pushed the note away
               from the name it describes -->
          <div class="flex h-[128pt] w-full flex-col items-center justify-start overflow-hidden">
            <h3 class="dish-name text-balance text-center font-playfair ${nameSize(d.name)} font-bold leading-[1.15] text-ink">
              ${d.name}
            </h3>
            ${d.note ? `<p class="mt-[5pt] text-center font-display text-[19pt] italic leading-tight text-ink">${d.note}</p>` : ''}
          </div>
        </div>
      </div>

      <div class="pointer-events-none absolute mt-[10rem] left-0 z-10 flex w-full flex-col items-center">
        ${BOTTOM_RULE}
      </div>
    </div>`);
}

/* ---------- wire it up ---------- */
const form = document.getElementById('orderForm');
const orderEl = document.getElementById('order');
const dupToggle = document.getElementById('dupToggle');
const onepageBtn = document.getElementById('onepageBtn');
const onepageWrap = document.getElementById('onepageWrap');
const onepageSheet = document.getElementById('onepageSheet');
const onepageBox = document.getElementById('onepageBox');
const cardsPreviewGroup = document.getElementById('cardsPreviewGroup');

/* toggles a flex panel's visibility with an inline style, not the `hidden`
   attribute: these panels carry Tailwind's `flex` utility, which has the
   same specificity as the UA stylesheet's `[hidden]{display:none}` rule and
   wins the tie since it is injected later — so `.hidden = true` alone
   silently does nothing on them. */
function setPanelVisible(el, visible) {
  if (!el) return;
  el.style.display = visible ? '' : 'none';
}
const cardsEl = document.getElementById('cards');
const wrapEl = document.getElementById('previewWrap');
const previewBoxEl = document.getElementById('previewBox');
const errEl = document.getElementById('error');
const countEl = document.getElementById('count');
const sheetNote = document.getElementById('sheetNote');
const printBtn = document.getElementById('printBtn');
const generateBtn = document.getElementById('generateBtn');
const spinner = document.getElementById('spinner');
const generateLabel = document.getElementById('generateLabel');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const usageNote = document.getElementById('usageNote');
const promptBtn = document.getElementById('promptBtn');
const promptDialog = document.getElementById('promptDialog');
const promptCloseBtn = document.getElementById('promptCloseBtn');
const promptText = document.getElementById('promptText');

/* a read-only view of the exact instructions sent to the model on every
   call — the dialog shows the real SYSTEM_PROMPT constant, not a copy, so
   it can never drift out of sync with what is actually sent */
if (promptBtn && promptDialog) {
  promptBtn.addEventListener('click', () => {
    promptText.textContent = SYSTEM_PROMPT;
    promptDialog.showModal();
  });
  promptCloseBtn?.addEventListener('click', () => promptDialog.close());
  // clicking the backdrop (outside the dialog's own box) also closes it
  promptDialog.addEventListener('click', (e) => {
    if (e.target === promptDialog) promptDialog.close();
  });
}

/* "Permit duplicate dishes" toggle — same default (off) and same rule as
   the n8n workflow's own checkbox: off dedupes identical dish names down to
   one card each; on keeps every occurrence as its own card. */
let allowDuplicates = false;
if (dupToggle) {
  dupToggle.addEventListener('click', () => {
    allowDuplicates = !allowDuplicates;
    dupToggle.setAttribute('aria-checked', String(allowDuplicates));
    dupToggle.classList.toggle('bg-gold', allowDuplicates);
    dupToggle.classList.toggle('bg-slate-300', !allowDuplicates);
    const knob = dupToggle.firstElementChild;
    knob.classList.toggle('translate-x-[3px]', !allowDuplicates);
    knob.classList.toggle('translate-x-[20px]', allowDuplicates);
  });
}

/* Keeps only the first card per dish name unless duplicates are permitted,
   matching the n8n workflow's "Build replacements" Code node exactly:
   trim, lowercase, collapse internal whitespace before comparing. */
function dedupeDishes(dishes) {
  if (allowDuplicates) return dishes;
  const seen = new Set();
  return dishes.filter((d) => {
    const key = d.name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ONEPAGE_IMAGES = [
  { file: 'puris_image.png', label: 'Pani Puri Counter' },
];

let onepageMode = false;
const ONEPAGE_PLACEHOLDER =
  'PANI PURI COUNTER\n\nPani Puri\nStuffing: Aloo & Ragda  Paani: Teekha Pudina & Meetha Pani\n\nPALAK PATTA CHAAT';
const CARDS_PLACEHOLDER = orderEl.getAttribute('placeholder');

if (onepageBtn) {
  onepageBtn.addEventListener('click', () => {
    onepageMode = !onepageMode;
    onepageBtn.setAttribute('aria-pressed', String(onepageMode));
    onepageBtn.classList.toggle('bg-gold', onepageMode);
    onepageBtn.classList.toggle('border-gold', onepageMode);
    generateLabel.textContent = onepageMode ? 'Generate onepage' : 'Generate cards';
    orderEl.placeholder = onepageMode ? ONEPAGE_PLACEHOLDER : CARDS_PLACEHOLDER;
    // switching modes always starts from a clean preview
    wrapEl.hidden = true;
    setPanelVisible(onepageWrap, false);
    setPanelVisible(cardsPreviewGroup, true);
    printBtn.hidden = true;
    countEl.textContent = '';
    sheetNote.textContent = '';
    if (usageNote) usageNote.textContent = '';
  });
}

/* Splits the order text into { title, items: [{ name, desc }] } with no AI
   call: first non-empty line is the title, every blank-line-separated block
   after it is one item — its first line the name, any further lines (joined
   with a space) its description. */
/* "sev puri" -> "Sev Puri": capitalises the first letter of every word,
   so typing in lowercase still prints correctly on the poster. */
function titleCase(str) {
  return str.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function parseOnepage(text) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) return { title: '', items: [] };

  // the first block is the counter's own heading, e.g. "Pani Puri Counter" —
  // never an item, even if it happens to span more than one line
  const title = titleCase(blocks[0].split('\n')[0].trim());

  const items = blocks.slice(1).map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    return { name: titleCase(lines[0] || ''), desc: lines.slice(1).join(' ') };
  }).filter((item) => item.name);

  return { title, items };
}

/* Builds the onepage poster: logo top-left, centred title, centred items
   (name + optional description line), centred illustration — one static
   page, not a sheet of cards. */
function renderOnepage() {
  const { title, items } = parseOnepage(orderEl.value);

  if (!title && !items.length) {
    errEl.hidden = false;
    errEl.className = 'mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[10px] text-red-700 ring-1 ring-red-200';
    errEl.textContent = 'Paste a counter title, then one blank line, then each item (name, then optionally a description line).';
    wrapEl.hidden = true;
    printBtn.hidden = true;
    return;
  }

  const imageFile = ONEPAGE_IMAGES[0]?.file;
  const itemsHtml = items.map((item) => `
    <p class="mt-6 text-center font-script text-[28pt] font-normal uppercase leading-tight text-[#E6762C]">${item.name}</p>
    ${item.desc ? `<p class="mt-1 text-center font-sans text-[14pt] font-bold italic text-[#1F5D8C]">${item.desc}</p>` : ''}
  `).join('');

  // a real A4 portrait page (8.27 x 11.69in), not just floating content, so
  // the on-screen preview shows the same page bounds the PDF prints
  onepageSheet.innerHTML = `
    <div class="onepage-sheet relative box-border flex w-[8.27in] h-[11.69in] flex-none flex-col items-center bg-white px-[0.6in] py-[0.6in] shadow-md ring-1 ring-slate-300">
      <div class="relative flex w-full items-center">
        <img src="${ASSET_BASE}/onepage/soulcheflogo.png" alt="" aria-hidden="true"
          class="h-[1.4in] w-auto shrink-0">
        <p class="flex-1 pr-[1.4in] text-center font-script text-[32pt] font-normal uppercase leading-tight text-[#1F5D8C]">${title}</p>
      </div>
      ${itemsHtml}
      <div class="flex flex-1 items-end justify-center pb-[0.6in]">
        <img src="${ASSET_BASE}/onepage/${imageFile}" alt="" aria-hidden="true"
          class="h-[4.5in] w-auto">
      </div>
    </div>
  `;

  errEl.hidden = true;
  wrapEl.hidden = false;
  setPanelVisible(cardsPreviewGroup, false);
  setPanelVisible(onepageWrap, true);
  printBtn.hidden = true;
  countEl.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;

  fitOnepageScale();

  // the PDF download starts the moment the preview is up, same as the
  // dish-card flow — no extra click needed
  autoDownloadOnepagePdf();
}

/* Scales the fixed-size A4 sheet down to fit the preview box's real width,
   the same problem the dish-card sheets solve with --sheet-scale — the PDF
   itself is unaffected since it prints printableOnepageDocument()'s own
   unscaled markup, not this transformed on-screen copy. */
function fitOnepageScale() {
  const sheet = onepageSheet.querySelector('.onepage-sheet');
  if (!sheet || !onepageBox) return;
  const PX_PER_IN_ONEPAGE = 96;
  const sheetWidthPx = 8.27 * PX_PER_IN_ONEPAGE;
  const style = getComputedStyle(onepageBox);
  const padL = parseFloat(style.paddingLeft), padR = parseFloat(style.paddingRight);
  const available = onepageBox.clientWidth - padL - padR;
  if (!available) return;
  const scale = Math.min(1, (available - 12) / sheetWidthPx);
  sheet.style.transform = `scale(${scale})`;
  sheet.style.transformOrigin = 'top center';
  // the scaled box still reserves its full unscaled footprint (8.27 x 11.69in)
  // by default — both the dead space below it and the horizontal scrollbar
  // come from that, so the wrapper is shrunk to the scaled size on both axes
  onepageSheet.style.width = (8.27 * PX_PER_IN_ONEPAGE * scale) + 'px';
  onepageSheet.style.height = (11.69 * PX_PER_IN_ONEPAGE * scale) + 'px';
}

window.addEventListener('resize', () => { if (!onepageWrap.hidden) fitOnepageScale(); });

/* the button doubles as the progress indicator, first while the order is
   read and then while the server prints the PDF */
function setBusy(on, label) {
  spinner.hidden = !on;
  generateBtn.disabled = on;
  printBtn.disabled = on;
  generateLabel.textContent = on ? (label || 'Generating…') : 'Generate cards';
  if (!on) hideProgress();
}

/* ---------- progress bar ----------
   No chat-completion API states its own final output length up front, so a
   literal "63% of the model's answer is done" number would be fiction. This
   instead shows a bar that is honestly driven by real events (every SSE
   chunk that actually arrived moves it), staged so it reads as smooth
   0->100% rather than a blind spinner:
     0-15%   request sent, waiting for the first token
     15-90%  streaming — each chunk nudges the bar some fraction of the way
             to 90%, so it keeps moving but can never reach 90% on its own
     90-100% parsing the reply and building the cards, once the stream ends */
const PROGRESS_STREAM_CEILING = 90;
let progressPct = 0;

function showProgress(label) {
  progressWrap.hidden = false;
  progressPct = 0;
  progressBar.style.width = '0%';
  progressLabel.textContent = label;
}

function setProgress(pct, label) {
  progressPct = pct;
  progressBar.style.width = Math.min(100, Math.max(0, pct)) + '%';
  if (label) progressLabel.textContent = label;
}

/* called once per streamed chunk: moves part of the way from where the bar
   is now to the ceiling, so it keeps crawling forward but visibly slows down
   rather than parking at 99% — the behaviour Microsoft's progress-bar
   guidance warns against for genuinely unknown-length work */
function nudgeProgress(label) {
  const target = Math.max(progressPct, 15);
  const next = Math.min(
    PROGRESS_STREAM_CEILING,
    Math.max(target, progressPct + (PROGRESS_STREAM_CEILING - progressPct) * 0.08)
  );
  setProgress(next, label);
}

function hideProgress() {
  progressWrap.hidden = true;
}

/* Reading the order costs an API call, so it runs on submit rather than on
   every keystroke. `busy` keeps a second submit from racing the first. */
let busy = false;

async function render(opts = {}) {
  const text = orderEl.value;

  if (!text.trim()) {
    // an empty box is a blank slate, not a mistake
    errEl.hidden = true;
    wrapEl.hidden = true;
    printBtn.hidden = true;
    countEl.textContent = '';
    sheetNote.textContent = '';
    if (usageNote) usageNote.textContent = '';
    return;
  }

  if (busy) return;
  busy = true;
  errEl.hidden = true;
  countEl.textContent = 'Reading the order…';
  setBusy(true);
  showProgress('Generating cards…');
  setProgress(8);

  let data;
  try {
    data = await parseOrder(text, () => nudgeProgress('Generating cards…'));
    data.dishes = dedupeDishes(data.dishes);
  } catch (err) {
    errEl.hidden = false;
    errEl.className = 'mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[10px] text-red-700 ring-1 ring-red-200';
    errEl.textContent = err.message;
    countEl.textContent = '';
    wrapEl.hidden = true;
    printBtn.hidden = true;
    busy = false;
    setBusy(false);
    return;
  }
  setProgress(92, 'Building cards…');

  // real cost from OpenRouter's usage object and this model's posted price
  // ($0.10/1M input, $0.50/1M output) — skipped for the no-API design
  // preview shown on page load. The USD->INR rate is a fixed approximation,
  // not a live quote, so it drifts slightly from the day's real rate.
  if (usageNote) {
    if (data.usage) {
      // this model's posted OpenRouter price: $0.10 input / $0.50 output /
      // $0.01 cached-input per 1M tokens — a cache hit on the (always
      // identical) system prompt bills at the cached rate, not the full
      // input rate, so split the two out instead of pricing all input the
      // same way
      const IN_PER_M = 0.10, CACHED_IN_PER_M = 0.01, OUT_PER_M = 0.50, USD_TO_INR = 95;
      const inTok = data.usage.prompt_tokens ?? 0, outTok = data.usage.completion_tokens ?? 0;
      const totalTok = data.usage.total_tokens ?? (inTok + outTok);
      // OpenRouter reports this as prompt_tokens_details.cached_tokens when a
      // provider actually served part of the prompt from cache; 0/absent
      // means this call got no discount, usually because the prefix was new
      // or the cache had already expired since the last call
      const cachedTok = data.usage.prompt_tokens_details?.cached_tokens ?? 0;
      const freshInTok = Math.max(0, inTok - cachedTok);
      const costUsd = freshInTok / 1e6 * IN_PER_M + cachedTok / 1e6 * CACHED_IN_PER_M + outTok / 1e6 * OUT_PER_M;
      const costInr = costUsd * USD_TO_INR;
      const cacheLine = cachedTok > 0
        ? `Cache: ${cachedTok} of ${inTok} input tokens hit (billed at $${CACHED_IN_PER_M.toFixed(2)}/M instead of $${IN_PER_M.toFixed(2)}/M)`
        : `Cache: no hit this call (full $${IN_PER_M.toFixed(2)}/M input rate)`;
      usageNote.textContent =
        `Tokens: ${inTok} in + ${outTok} out = ${totalTok} total · ` +
        `Cost: $${costUsd.toFixed(4)} (₹${costInr.toFixed(2)}) · ${cacheLine}`;
    } else {
      usageNote.textContent = '';
    }
  }

  if (!data.dishes.length) {
    errEl.hidden = false;
    errEl.textContent = 'No dishes found in that message. Check it includes a menu with course headings.';
    wrapEl.hidden = true;
    printBtn.hidden = true;
    countEl.textContent = '';
    sheetNote.textContent = '';
    if (usageNote) usageNote.textContent = '';
    busy = false;
    setBusy(false);
    return;
  }

  errEl.hidden = true;
  await renderCards(data, opts);
  setProgress(100, 'Done');
  busy = false;
  setBusy(false);

  // download the PDF in the background the moment the preview is up, so it
  // is already on disk by the time the user goes looking for it — unless
  // opts.pdf is about to open it in a visible tab anyway (openPdfTab()
  // downloads it itself once that finishes)
  if (!opts.preview && !opts.pdf) autoDownloadPdf();
}

/* Builds the card sheets and drops them into the page — the part of render()
   that is pure layout, with no API call. Split out so a static design
   preview can call it directly with dummy data on load, instead of forcing
   a parse just to see the current card design. */
async function renderCards(data, opts = {}) {
  // kept for openPdfTab(), which has no access to the parsed order itself —
  // only to the rendered markup — but needs the date/venue for the filename
  lastOrder = data;

  // every card, in print order
  const main = [
    ...data.dishes.map(dishCard),
  ];

  // Cap each sheet to CARDS_PER_SHEET (PRINT.COLS x PRINT.ROWS) so a sheet
  // always holds to one page; anything beyond that continues on the next
  // sheet rather than stretching this one.
  const sheets = [];
  for (let i = 0; i < main.length; i += CARDS_PER_SHEET) {
    sheets.push(main.slice(i, i + CARDS_PER_SHEET));
  }

  cardsEl.innerHTML = sheets.map((chunk) =>
    `<div class="sheet-frame overflow-hidden"><div class="${SHEET_CLASS} shadow-md ring-1 ring-slate-300">${
      chunk.join('') + sheetFooter()
    }</div></div>`
  ).join('');

  wrapEl.hidden = false;
  setPanelVisible(cardsPreviewGroup, true);
  setPanelVisible(onepageWrap, false);
  printBtn.hidden = opts.preview ? true : false;

  const n = data.dishes.length;
  countEl.textContent = opts.preview ? '' : `${n} dish card${n === 1 ? '' : 's'}`;

  // dishes the model was unsure about: worth an eye before printing, since a
  // wrong veg/non-veg dot is the one mistake that matters on a buffet table
  if (!opts.preview) {
    const review = data.dishes.filter((d) => d.unsure);
    if (review.length) {
      errEl.hidden = false;
      errEl.className = 'mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800 ring-1 ring-amber-200';
      errEl.textContent = 'Please double-check the veg/non-veg mark on: ' +
        review.map((d) => d.name).join(', ');
    } else {
      errEl.className = 'mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[10px] text-red-700 ring-1 ring-red-200';
    }
  }
  // the sheets have just been rebuilt, so any PDF held from before is stale
  if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = null; pdfKey = null; }

  // a different card count means a different layout, so re-fit it
  if (cardCount !== main.length) fitScale = null;
  cardCount = main.length;   // the sheet note is written once the sheet is measured

  // The Tailwind CDN generates classes by scanning the DOM, so the utilities
  // on a sheet it has never seen are not in the stylesheet the instant
  // innerHTML returns. Measuring then reads an unstyled box, so wait until
  // the sheet reports its real width before fitting or printing.
  await sheetsStyled();

  // the names are measured against the real webfont, not the fallback, or a
  // name that fits in Georgia but not Cormorant would slip through
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  fitNames();

  updateSheetScale();
  if (opts.scroll) wrapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (opts.pdf) openPdfTab();
}

/* Sample dishes shown on load, so the card design can be checked (and
   tweaked) without waiting on a parse call every time. Covers the same
   course badges and both veg/non-veg marks real orders use. */
const PREVIEW_DATA = {
  dishes: [
    { course: 'Welcome Drink', name: 'Classic Lemonade', note: '', veg: true, unsure: false },
    { course: 'Starters', name: 'Chicken Tikka', note: '', veg: false, unsure: false },
    { course: 'Main Course', name: 'Palak Paneer', note: '', veg: true, unsure: false },
    { course: 'Desserts', name: 'Angoori Ras Malai', note: '', veg: true, unsure: false },
  ],
};

function renderPreview() {
  renderCards(PREVIEW_DATA, { preview: true });
}

/* Shrink any dish name that still does not fit its card.
   nameSize picks one size for almost every dish so the names read as a set,
   but character count only approximates how wide a name actually draws: a
   name of wide letters can overflow where a narrower one of the same length
   fits. So measure each one after layout and step it down until it fits,
   which keeps every card at the shared size except the few that cannot be.
   Run after the webfonts are ready, or the measurement is of a fallback. */
function fitNames() {
  const names = [...cardsEl.querySelectorAll('.dish-name')];
  if (!names.length) return;

  // A name is allowed to wrap: demanding one line would size the whole set to
  // whatever the longest dish needs, which is tiny. Only running past the
  // fixed box around it — the room between the course badge and the bottom
  // rule — counts as not fitting.
  const fits = (el) => {
    const box = el.parentElement;
    return el.offsetHeight <= box.clientHeight + 1 &&
           el.offsetWidth <= box.clientWidth + 1;
  };

  // Start every name at the same size and step the whole set down together
  // until the longest one fits. One size for all of them is the point: a card
  // that sized itself independently would read as a different card.
  const START_PX = 38 * (96 / 72);   // 38pt
  let px = START_PX;
  names.forEach((el) => { el.style.fontSize = px + 'px'; });

  for (let i = 0; i < 20; i++) {
    if (names.every(fits)) break;
    px *= 0.94;
    names.forEach((el) => { el.style.fontSize = px + 'px'; });
  }

  // One freakishly long name would otherwise drag every card down with it, so
  // below this floor it alone keeps shrinking and the rest hold the set size.
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
}

/* Resolve once the CDN has applied the sheet's utilities, i.e. the sheet
   measures its true width. Falls back after ~2s so a layout that never
   matches still renders rather than hanging. */
function sheetsStyled() {
  const sheet = cardsEl.querySelector('.sheet');
  if (!sheet) return Promise.resolve();
  const targetPx = Math.round(SHEET_W_IN * PX_PER_IN);
  return new Promise((resolve) => {
    const deadline = performance.now() + 2000;
    (function poll() {
      if (Math.abs(sheet.offsetWidth - targetPx) <= 2 || performance.now() > deadline) {
        return resolve();
      }
      requestAnimationFrame(poll);
    })();
  });
}

/* ---------- the sheets, rendered to a real PDF by the server ----------
   The browser cannot write a PDF file without putting its print dialog in
   front of the user, so the page hands the finished markup to /api/pdf,
   where headless Chromium prints it. What comes back is an actual PDF, which
   opens in the browser's own viewer with no dialog in the way. */

/* the exact document the server should print: this page's head (fonts,
   Tailwind config and the stylesheet) over the sheets at their true size */
function printableDocument() {
  const head = [...document.head.querySelectorAll('link, script, style')]
    .map((el) => el.outerHTML).join('\n');

  // outerHTML carries the inline font-size fitNames wrote, so the PDF prints
  // the names at the size that was measured here rather than re-fitting them
  // in a browser that may lay the text out a hair differently
  const sheets = [...cardsEl.querySelectorAll('.sheet')]
    .map((el) => `<div class="sheet-frame">${el.outerHTML}</div>`).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Soul Chef Dish Cards</title>
<base href="${location.origin}/">
${head}
<style>
  @page { size: ${SHEET_W_IN.toFixed(2)}in ${SHEET_H_IN.toFixed(2)}in; margin: 0; }
  body { margin: 0; background: #fff; }
  #cards { display: block; }
  .sheet-frame {
    width: auto !important; height: auto !important; overflow: hidden !important;
    break-inside: avoid; page-break-inside: avoid;
  }
  .sheet-frame + .sheet-frame { break-before: page; page-break-before: always; }
  .sheet-frame:last-child { break-after: avoid; page-break-after: avoid; }
  .sheet {
    transform: none !important; box-shadow: none !important; margin: 0 !important;
    overflow: hidden !important;
  }
  .dish-card { break-inside: avoid; page-break-inside: avoid; }
</style>
</head><body><div id="cards">${sheets}</div></body></html>`;
}

let pdfUrl = null;    // the last PDF, revoked before a new one replaces it
let pdfKey = null;    // the markup that PDF was made from, so a repeat click is free
let lastOrder = null; // the parsed order, for the downloaded file's name

/* "Soul Chef - <venue>, <date>.pdf", trimmed to what is actually known —
   falls back to a plain default when the order carries neither. Strips
   characters Windows/macOS file systems reject so the name always saves. */
function pdfFileName() {
  const parts = [lastOrder?.venue, lastOrder?.date].filter(Boolean);
  const label = parts.length ? parts.join(', ') : 'Dish Cards';
  return ('Soul Chef - ' + label)
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() + '.pdf';
}

/* what the placeholder tab shows while the PDF is still being made, so the
   tab is never a blank white page the user wonders about */
const PDF_WAITING_DOC =
  '<!doctype html><title>Soul Chef Dish Cards</title>' +
  '<body style="margin:0;display:grid;place-items:center;height:100vh;' +
  'font:14px system-ui,sans-serif;color:#2F2A24;background:#FBF6EC">' +
  '<p>Making the PDF…</p>';

/* triggers a real save-to-disk under a proper name, in addition to the
   preview tab — a blob: URL alone downloads as a hash-named file, since the
   browser has no filename to go on without this */
function downloadPdf(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* Renders the current sheets to a PDF blob URL and caches it, reusing the
   cached one when the sheets have not changed since. Shared by the visible
   "Open PDF" flow and the silent auto-download that fires as soon as the
   preview is shown — both just need the blob URL, not a tab. */
let pdfPromise = null; // in-flight render, so a second caller awaits the same request instead of starting another
async function buildPdf() {
  const html = printableDocument();

  if (pdfUrl && pdfKey === html) return pdfUrl;
  if (pdfPromise) return pdfPromise;

  pdfPromise = (async () => {
    const res = await fetch(API_BASE + '/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(detail.slice(0, 300) || ('The server could not make the PDF (' + res.status + ').'));
    }
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(await res.blob());
    pdfKey = html;
    return pdfUrl;
  })();

  try {
    return await pdfPromise;
  } finally {
    pdfPromise = null;
  }
}

/* fires right after the preview renders, so the PDF lands on disk with no
   extra click — failures are silent here (no tab, no sidebar error) since
   the user never asked for this one directly; "Open PDF" still surfaces
   any real problem if they go looking for the file */
async function autoDownloadPdf() {
  try {
    downloadPdf(await buildPdf());
  } catch {}
}

async function openPdfTab() {
  // Open the tab FIRST, inside the click, for two reasons: the tab appears at
  // once instead of after the render, and window.open survives the popup
  // blocker here, which it would not after an await.
  const tab = window.open('', '_blank');
  if (tab) {
    try { tab.document.write(PDF_WAITING_DOC); tab.document.close(); } catch {}
  }

  setBusy(true, 'Making the PDF…');
  try {
    const url = await buildPdf();
    if (tab) {
      // replace, not assign, so the placeholder leaves no history entry
      tab.location.replace(url);
    } else {
      errEl.hidden = false;
      errEl.className = 'mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800 ring-1 ring-amber-200';
      errEl.textContent = 'Allow pop-ups for this site to open the PDF in a new tab, then press Open PDF.';
    }
    downloadPdf(url);
  } catch (err) {
    // the placeholder tab would sit on "Making the PDF…" forever, so say what
    // went wrong there too rather than only in the sidebar
    if (tab) {
      try {
        tab.document.body.textContent = err.message;
      } catch {}
    }
    errEl.hidden = false;
    errEl.className = 'mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[10px] text-red-700 ring-1 ring-red-200';
    errEl.textContent = err.message;
  } finally {
    setBusy(false);
  }
}

/* ---------- the onepage poster, printed to a real A4 PDF the same way ----------
   Reuses /api/pdf exactly as the dish cards do: the page's own fonts/Tailwind
   config travel in <head>, and the sheet's outerHTML becomes the whole body. */
function printableOnepageDocument() {
  const head = [...document.head.querySelectorAll('link, script, style')]
    .map((el) => el.outerHTML).join('\n');
  const sheet = onepageSheet.querySelector('.onepage-sheet');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Soul Chef Onepage</title>
<base href="${location.origin}/">
${head}
<style>
  @page { size: 8.27in 11.69in; margin: 0; }
  body { margin: 0; background: #fff; }
  .onepage-sheet { box-shadow: none !important; }
</style>
</head><body>${sheet ? sheet.outerHTML : ''}</body></html>`;
}

let onepagePdfUrl = null;
let onepagePdfKey = null;

function onepagePdfFileName() {
  return 'Soul Chef - Onepage.pdf';
}

let onepagePdfPromise = null;
async function buildOnepagePdf() {
  const html = printableOnepageDocument();

  if (onepagePdfUrl && onepagePdfKey === html) return onepagePdfUrl;
  if (onepagePdfPromise) return onepagePdfPromise;

  onepagePdfPromise = (async () => {
    const res = await fetch(API_BASE + '/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(detail.slice(0, 300) || ('The server could not make the PDF (' + res.status + ').'));
    }
    if (onepagePdfUrl) URL.revokeObjectURL(onepagePdfUrl);
    onepagePdfUrl = URL.createObjectURL(await res.blob());
    onepagePdfKey = html;
    return onepagePdfUrl;
  })();

  try {
    return await onepagePdfPromise;
  } finally {
    onepagePdfPromise = null;
  }
}

function downloadOnepagePdf(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = onepagePdfFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function autoDownloadOnepagePdf() {
  setBusy(true, 'Making the PDF…');
  try {
    downloadOnepagePdf(await buildOnepagePdf());
  } catch (err) {
    errEl.hidden = false;
    errEl.className = 'mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[10px] text-red-700 ring-1 ring-red-200';
    errEl.textContent = err.message;
  } finally {
    setBusy(false);
  }
}

/* ---------- the printed page is sized to the poster, so print == preview ---------- */
const printPageStyle = document.createElement('style');
document.head.appendChild(printPageStyle);
function setPrintPageSize(wIn, hIn) {
  printPageStyle.textContent =
    `@media print { @page { size: ${wIn.toFixed(2)}in ${hIn.toFixed(2)}in; margin: 0; } }`;
}

/* ---------- fit the poster sheet to the preview column's real width ---------- */
const PX_PER_IN = 96;      // CSS reference pixel: 1in = 96px
// all of these come from the PRINT block at the top of the file
const SHEET_W_IN = PRINT.SHEET_W, SHEET_H_IN = PRINT.SHEET_H;
const CARD_W_IN = PRINT.CARD_W, CARD_H_IN = PRINT.CARD_H;
const CM_PER_IN = 2.54;
const SHEET_COLS = PRINT.COLS, SHEET_ROWS = PRINT.ROWS;
const CARDS_PER_SHEET = PRINT.PER_SHEET;
let cardCount = 0;
let fitScale = null;   // set on first layout; reset when the card count changes
function updateSheetScale() {
  if (wrapEl.hidden) return;
  // measure previewBoxEl, the fixed-size scroll container, not cardsEl:
  // cardsEl is a flex container that hugs its (scale-dependent) children,
  // which would make this circular. The box has a fixed width, so its
  // clientWidth (minus its own padding) is the real space to fit into.
  const style = getComputedStyle(previewBoxEl);
  const padL = parseFloat(style.paddingLeft), padR = parseFloat(style.paddingRight);
  const available = previewBoxEl.clientWidth - padL - padR;
  if (!available) return;
  const sheetWidthPx = SHEET_W_IN * PX_PER_IN;
  // a small gutter keeps the sheet off the box edges
  const GUTTER_PX = 12;
  const widthScale = (available - GUTTER_PX) / sheetWidthPx;

  const sheetEls = cardsEl.querySelectorAll('.sheet');
  if (!sheetEls.length) return;
  // the sheet is a fixed box set by PRINT, so its height is known up front
  const sheetHeightIn = SHEET_H_IN;

  // Fit to the available WIDTH only, and let the page scroll vertically.
  // Fitting the height too kept the sheet small, since a tall poster nearly
  // fills the viewport before it has a chance to use the width.
  // Set on the first layout, then held: browser zoom shrinks innerWidth in CSS
  // px, so recomputing on every zoom would cancel the zoom out.
  if (fitScale === null) fitScale = widthScale * 0.95;
  const scale = fitScale;
  cardsEl.style.setProperty('--sheet-scale', scale.toFixed(4));

  // make the printed page exactly the sheet's size, so print == preview
  setPrintPageSize(SHEET_W_IN, sheetHeightIn);

  const cm = (inches) => (inches * CM_PER_IN).toFixed(1);
  const sheetCount = sheetEls.length;
  sheetNote.innerHTML =
    `${cardCount} cards &middot; ` +
    `${sheetCount} ${PRINT.SHEET_LABEL} sheet${sheetCount === 1 ? '' : 's'} &middot; ` +
    `card ${CARD_W_IN}in &times; ${CARD_H_IN}in (${cm(CARD_W_IN)} &times; ${cm(CARD_H_IN)} cm) &middot; ` +
    `sheet ${SHEET_W_IN}in &times; ${sheetHeightIn.toFixed(2)}in ` +
    `(${cm(SHEET_W_IN)} &times; ${cm(sheetHeightIn)} cm)` +
    // a sheet too small for its cards clips silently, so say so on the page
    (PRINT.fitWarnings.length
      ? `<br><span class="text-nonveg font-semibold">${PRINT.fitWarnings.join(' ')}</span>`
      : '');

  // size each frame to its scaled sheet
  cardsEl.querySelectorAll('.sheet-frame').forEach((frame) => {
    const s = frame.querySelector('.sheet');
    if (!s) return;
    frame.style.width = (s.offsetWidth * scale) + 'px';
    frame.style.height = (s.offsetHeight * scale) + 'px';
  });
}

window.addEventListener('resize', () => { fitScale = null; updateSheetScale(); });

// Webfonts and the artwork both change the sheet's size after first paint, so
// discard the cached fit and measure again once they have settled — otherwise
// the first (wrong) measurement is held forever.
function refit() { fitScale = null; updateSheetScale(); }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
window.addEventListener('load', refit);

// Reading the order is an API call, so it happens on submit — not on every
// keystroke. Editing the text clears the stale preview so what is on screen
// always matches what was last read.
orderEl.addEventListener('input', () => {
  if (wrapEl.hidden) return;
  wrapEl.hidden = true;
  printBtn.hidden = true;
  countEl.textContent = '';
  sheetNote.textContent = '';
  if (usageNote) usageNote.textContent = '';
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (onepageMode) {
    renderOnepage();
    onepageWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  render({ scroll: true });
});

// the preview is already on screen by now, so this just prints it
printBtn.addEventListener('click', openPdfTab);

const SAMPLE_ORDER = `vada

samosa

Chiken Biryani

Egg Roll`;

document.getElementById('sampleBtn').addEventListener('click', () => {
  orderEl.value = SAMPLE_ORDER;
  orderEl.dispatchEvent(new Event('input'));
});

// show the current card design on load, with no order text and no API
// call, so the layout can be checked and tweaked immediately
renderPreview();
