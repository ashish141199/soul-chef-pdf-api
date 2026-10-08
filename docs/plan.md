# Soul Chef: Buffet Dish Name Tags (Automation Plan)

## What the client actually needs

**"Name tag" means buffet dish cards, not guest badges.** Every order Soul Chef (caterer) sends comes as a WhatsApp message with the event menu. For each dish on the buffet they print a card (dish name, veg/non-veg mark, Soul Chef branding) and place it in front of or under the dish.

Today this is done by hand: someone retypes every dish into a design and sends back a PDF (e.g. `Order 1 - 14 sep revised.pdf`). The goal is **order message in → print-ready A4 PDF out**, with a quick human check in between.

## Input: the order message (real example, Order 5)

```
Order 5: 28 September 2026
Name: Ashwini - 91526 41139
No. of pax: 38 pax (2 Jain)
Report time: 10 am | Start time: 11 am
Venue: 4th floor Birla Centurion-Worli

Welcome Drinks:  Guava Lime cooler
Starters on Buffet:  Mexican Slider, Kajun spiced bbq chicken kebab
Main Course on Buffet:  Paneer Kolhapuri, Zucchini and sun dried tomato canneloni, Malvani Chicken masala
Accompaniments:  Dal Makhani, Saffron rice with fried cashew, Assorted Breads (Roti, Paratha, garlic bread),
                 Papad and pickle, Caesar Salad, Three baked bean salad
Deserts:  Chocolate and caramel mousse in shot glass, Angoori rasmalai

Note - Entire catering. Carry Induction and Oven
```

What the input is like:
- Free text. Section headers vary ("Starters on Buffet", "Deserts"), bullets are sometimes missing, and there are typos (Kajun, canneloni).
- It carries details in brackets or phrases: "(Roti, Paratha, garlic bread)", "in shot glass".
- Veg/non-veg is **never stated**; it has to be inferred (chicken → non-veg).
- It has lines that aren't dishes: contact, pax, times, venue, logistics notes. These must not become cards.
- Jain or Paryushan groupings sometimes appear (see Order 1: "Paryushan based snacks :", "Normal Jain Items :").

## Output: two card designs seen so far

**Design 1: current Soul Chef print (Order 1 PDF)**
- A4 portrait, **3 wide strip cards per page**, dashed cut lines between them, crop marks at the corners, "✱ Soul Chef ✱" footer.
- Each card: blue Soul Chef hand logo (left), dish name centred in large serif, orange asterisk decoration and a veg/non-veg square mark (right).
- Optional **qualifier line** above the dish name: "Paryushan based snacks :", "Normal Jain Items :".
- Long names wrap to 2–3 lines ("Avocado & Sundried tomatoes bruschetta with plum compote dressing on Top"), so the text has to **shrink to fit**.

**Design 2: new mockup (Order 5, 28 Sep)**
- Cream and gold style, **4 × 4 grid** of portrait cards.
- A **cover card**: "Menu Name Tags · 28 September 2026 · Birla Centurion, Worli".
- Each card: Soul Chef logo, tagline, a **category chip** (Welcome Drink / Starters / Main Course / Accompaniments / Desserts), dish name, optional sub-line ("Roti | Paratha | Garlic Bread", "Served in Shot Glass"), and a veg/non-veg dot.
- Chip colour: green for veg, red/terracotta for non-veg, mustard for starters.
- A legend card (● Vegetarian / ● Non-Vegetarian) and a "Good Food Creates Great Moments" sign-off.

Both designs use the same data. Only the layout differs, so the system should support **several templates over one data format**.

### Card size (confirmed)

**3 in wide × 2 in tall** per card, portrait or landscape orientation on the buffet still to be checked physically (vertical vs horizontal placement in front of/under the dish). Layout math against A4 (8.27 in × 11.69 in, minus margins):

- Portrait A4, 3 in × 2 in cards: **2 across × 5 down = 10 cards/page** (with ~0.27 in margin each side, no gap) — adjust for gutter/cut-margins in the actual template.
- Implement the grid at this default size first; ideal size can be tuned in parallel once Anish/Soul Chef confirm how it reads from buffet distance.

## Data model (one per order)

```json
{
  "order_no": 5,
  "event_date": "2026-09-28",
  "venue": "Birla Centurion, Worli",
  "pax": 38, "jain_pax": 2,
  "template": "cream_grid",
  "dishes": [
    { "category": "Welcome Drink", "name": "Guava Lime Cooler", "sub": "", "diet": "veg", "qualifier": "" },
    { "category": "Starters", "name": "Cajun Spiced BBQ Chicken Kebab", "sub": "", "diet": "non-veg", "qualifier": "" },
    { "category": "Accompaniments", "name": "Assorted Breads", "sub": "Roti | Paratha | Garlic Bread", "diet": "veg", "qualifier": "" },
    { "category": "Desserts", "name": "Chocolate & Caramel Mousse", "sub": "Served in Shot Glass", "diet": "veg", "qualifier": "" }
  ]
}
```

- `diet`: `veg` | `non-veg` | `egg` | `jain`. Jain could instead be a separate flag.
- `qualifier`: the optional heading line above the name ("Paryushan based snacks :").
- `sub`: the optional second line. It comes from brackets or "in/served in …".

## Chosen stack (updated 2026-09-30)

**Self-hosted n8n (`automations.autive.io`) + HTML/CSS card template rendered directly to A4 PDF. No Canva, no Google Slides.**

- Same visual design as before (blue strip / cream grid), rebuilt as an HTML page with the card grid in CSS, sized to real inches (3 in × 2 in per card) and the sheet to real A4.
- n8n renders that HTML to PDF in one step (e.g. an HTML-to-PDF HTTP node/service, or a Code node using a headless-Chromium/Puppeteer-style call) — no external design tool, no template IDs to keep in sync, no autofill job polling.
- Superseded: the Canva Autofill/Export approach below (Parts A2–A5, A7, Part B rows 6–10) and the Google Slides "copy template + batchUpdate" approach in `soulchef-dish-cards.workflow.json`. Kept in this doc for history; do not build against them.

## Flow

```
Soul Chef WhatsApp menu
      │  (our team copies it, or they paste it themselves)
      ▼
[1] n8n Form: paste menu text (or dish list), pick template
      ▼
[2] Claude: menu text → clean dish list (JSON)
      ▼
[3] n8n Form page 2: review dish list, fix veg/non-veg, confirm
      ▼
[4] Code: dish list → HTML (card grid, 3in x 2in cards, A4 sheet(s))
      ▼
[5] HTML → PDF render (n8n HTTP/Code node)
      ▼
[6] Return PDF on form end page (+ save to Drive / send on WhatsApp later)
      ▼
Client prints, cuts, places cards under each dish
```

## Part A: one-time setup (superseded — Canva approach, kept for history)

> Not building this. See "Chosen stack" above — moved to HTML → PDF, no Canva.

### A1. Canva account
1. Use the Canva **Pro** (or Teams) account that will own the templates.
2. Turn on **MFA**: Canva → Settings → Login & security.

### A2. Canva developer integration
1. Open the Canva Developer Portal → Your integrations → **Create integration**.
2. Under Scopes, turn on:
   - `design:content` Read + Write
   - `design:meta` Read
   - `brandtemplate:meta` Read
   - `brandtemplate:content` Read
   - `asset` Read + Write
3. Add redirect URL: `https://automations.autive.io/rest/oauth2-credential/callback`
4. Save the **Client ID** and **Client secret**.

### A3. n8n credential for Canva
In n8n → Credentials → New → **OAuth2 API**:

| Field | Value |
|---|---|
| Grant type | **PKCE** (Canva requires it) |
| Authorization URL | `https://www.canva.com/api/oauth/authorize` |
| Access token URL | `https://api.canva.com/rest/v1/oauth/token` |
| Client ID / Secret | from A2 |
| Scope | `design:content:read design:content:write design:meta:read brandtemplate:meta:read brandtemplate:content:read asset:read asset:write` |
| Authentication | Header |

Click **Connect**, log in to Canva and approve. n8n refreshes the token automatically after that.

### A4. The A4 template in Canva
1. Build the A4 card sheet (start with Design 2, the cream grid).
2. Make it **3 pages** (enough for ~45 dishes). Every page has the same card slots.
3. Open the **Data autofill** app in Canva and tag each element as a field:

| Field (per slot, n = 1…48) | Type | Filled with |
|---|---|---|
| `DISH_n` | text | Dish name |
| `SUB_n` | text | Sub-line ("Roti / Paratha / Garlic Bread") or empty |
| `CAT_n` | text | Category chip (Starters, Main Course…) |
| `DIET_n` | image | Veg / non-veg / blank icon |
| `EVENT_DATE`, `VENUE` | text | Cover card (once per design) |

4. Size each `DISH_n` text box for the **longest** name expected (e.g. "Zucchini and Sun-dried Tomato Cannelloni"). Autofill doesn't shrink text reliably.
5. Publish as a **Brand Template**. The ID is at the end of the URL: `canva.com/brand/brand-templates/<ID>`.

### A5. Upload the icons once
Upload three PNGs to Canva with `POST /asset-uploads` (a one-off n8n workflow): `veg.png`, `nonveg.png` and `blank.png` (transparent). Save their three **asset IDs**. External image URLs don't work for autofill, and a field left out keeps the template's default, which is why a blank icon is needed.

### A6. Store config in n8n
Keep these in one **Set** node at the start of the workflow (or n8n Variables):
`BRAND_TEMPLATE_ID`, `SLOTS_PER_PAGE` (e.g. 16), `TOTAL_PAGES` (3), `ASSET_VEG`, `ASSET_NONVEG`, `ASSET_BLANK`.

### A7. Claude credential
In n8n, add an **Anthropic** credential (Claude API key). This is for the AI step.

## Part B: the n8n workflow, node by node (superseded — Canva approach, kept for history)

> Not building this. Nodes 6–10 (Canva autofill/export) are replaced by a single HTML → PDF render step.

| # | Node | What it does |
|---|---|---|
| 1 | **n8n Form Trigger** | Fields: `Menu text` (textarea), `Template` (dropdown). This gives a link like `automations.autive.io/form/soulchef-cards`. |
| 2 | **Set: Config** | IDs and numbers from A6. |
| 3 | **Basic LLM Chain** + **Anthropic Chat Model** + **Structured Output Parser** | Prompt: turn the menu into the JSON in "Data model". Fix spelling and title case, put bracket details into `sub`, infer veg/non-veg, drop non-dish lines, and mark anything unsure with `"check": true`. |
| 4 | **n8n Form (page 2)** | Shows the dish list, one line per dish, `Name ; Sub ; Category ; V/NV`, in an editable textarea, plus a "Looks correct" checkbox. The person fixes mistakes and submits. |
| 5 | **Code: Build autofill data** | Parses the confirmed lines. For each slot `n` up to `SLOTS_PER_PAGE × TOTAL_PAGES`, it fills the dish or empty text plus the blank icon. It also works out `pages_used = ceil(dishes / SLOTS_PER_PAGE)`. |
| 6 | **HTTP Request: Create autofill** | `POST https://api.canva.com/rest/v1/autofills`, body `{ "brand_template_id": "...", "title": "Order 5 - 28 Sep", "data": { "DISH_1": {"type":"text","text":"Guava Lime Cooler"}, "DIET_1": {"type":"image","asset_id":"..."}, ... } }` |
| 7 | **Wait** 3 s → **HTTP Request: Get autofill** `GET /autofills/{job.id}` → **IF** status | `in_progress` → back to Wait. `failed` → stop with an error. `success` → take `result.design.id`. |
| 8 | **HTTP Request: Create export** | `POST https://api.canva.com/rest/v1/exports`, body `{ "design_id": "...", "format": { "type": "pdf", "size": "a4", "pages": [1..pages_used] } }`. Exporting only the used pages drops the empty ones, so no PDF merging is needed (check the `pages` option on the Create export job docs). |
| 9 | **Wait** 3 s → **HTTP Request: Get export** `GET /exports/{job.id}` → **IF** status | Loop until `success`, then take `urls[0]`. |
| 10 | **HTTP Request: Download** | GET the export URL with response format **File**. The URL expires, so download it straight away. |
| 11 | **n8n Form Ending** | "Return binary file" hands the PDF straight to the browser. Also include the Canva design link, so small fixes can be made in Canva before printing. |
| 12 | *(later)* **Google Drive** / **WhatsApp** | Save the PDF to a Soul Chef folder, and/or send it on WhatsApp. |
| — | **Error Trigger** workflow | Sends a message (email or WhatsApp) if any Canva call fails, so an order never gets missed silently. |

## Part C: build order

1. **A1–A3**: Canva account, integration and n8n credential. Test with `GET /users/me`.
2. **A4–A5**: template with 16 slots on 1 page first, plus the icons. Test `GET /brand-templates/{id}/dataset` and check that all field names come back.
3. **Nodes 6–10 only**, with hard-coded dishes: get a PDF out of Canva from n8n.
4. **Nodes 1, 3, 5**: real menu text → Claude → autofill data. Test on Order 5 and Order 1.
5. **Node 4**: the review page.
6. **Node 11**: return the PDF.
7. Grow the template to 3 pages and test a 30+ dish menu.
8. Test print on Soul Chef's real printer: margins, cut lines, whether it reads from buffet distance.
9. Go live on the next real order, alongside the manual process once, then switch over.

## Risks and limits

- **Long dish names** can overflow the card. Mitigations: size the boxes for long names, have the AI make a short display name (≤ 35 characters), and use the Canva design link to fix it by hand before printing.
- **Empty slots**: every unused slot must get empty text and the blank icon, or the template's dummy text will print.
- **Wrong veg/non-veg**: this is the costliest mistake. Review step 4 is required, never skip it.
- **Canva usage limits**: Canva says these "will be introduced in the future". A few orders a week should be fine.
- **Export and download URLs expire**: download right away (node 10).
- **Changing the design** means re-tagging the fields in Canva, and the `DISH_n` names must stay the same.

## Open questions for Soul Chef

1. Which design going forward: blue strip (Design 1), cream grid (Design 2), or both, chosen per event?
2. Physical card size, and folded tent card or flat?
3. Who confirms veg/non-veg before printing: our team or theirs?
4. Jain / Paryushan handling: separate qualifier line (as in Order 1), a separate mark, or both?
5. Any extra fields: allergens, spice level, a "Contains nuts" line?
6. Who pastes the menu into the form: us, or them?
7. Do they print themselves (A4 at home/office) or at a print shop (bleed and crop marks needed)?
8. ~~Whose Canva Pro account holds the template: ours or Soul Chef's?~~ (moot — no Canva now)
9. **Card orientation on the buffet**: does a 3in × 2in card sit better as landscape (3 wide) or portrait (2 wide) in front of/under the dish? Check physically. — *tag Anish*

## References

- Canva Autofill guide: https://www.canva.dev/docs/apps/rest-apis/autofill-guide/
- Autofill API: https://www.canva.dev/docs/apps/rest-apis/reference/autofills/create-design-autofill-job/
- Brand template dataset: https://www.canva.dev/docs/apps/rest-apis/reference/brand-templates/get-brand-template-dataset/
- Automate Canva with n8n: https://www.canva.dev/blog/developers/automate-canva-with-n8n/
- n8n Canva community node: https://github.com/canva-sdks/n8n-nodes-canva

