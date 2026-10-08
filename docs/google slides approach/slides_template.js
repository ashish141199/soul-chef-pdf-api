/**
 * Google Apps Script — container-bound script.
 * Open the target Google Slides presentation itself, then
 * Extensions > Apps Script (this creates/opens a script bound to that
 * file), paste this whole file in as Code.gs.
 *
 * Setup — run ONCE, in this order:
 *   1. In this script's editor: Services (+) > add "Slides API"
 *      (identifier "Slides", version v1) — exposes the `Slides`
 *      advanced-service global used below.
 *   2. In the Slides file: File > Page setup > Custom, 16.531in x 23.385in.
 *      That is A2 portrait, the HTML poster's sheet: one 14.272 x 5.58in card
 *      across and four down. The width is exact (1.1295 + 14.272 + 1.1295 =
 *      16.531); the height carries 4 rows plus gaps (23.21in) and leaves
 *      0.175in for the footer band. Any other page size will NOT lay out
 *      correctly — every measurement below is derived from these two numbers.
 *   3. Fill in the ART urls below. Every one must be a public, direct-to-image
 *      URL (ibb.co and similar) — the Slides API fetches them server-side, so
 *      Drive links and local assets/ paths will NOT work.
 *   4. Run buildCardsRaw(), authorize when prompted.
 *   5. Use this presentation's file ID as the "Copy template" source in
 *      the n8n workflow (soulchef-dish-cards.workflow.json).
 *
 * Plain JavaScript — paste as-is into the .gs editor.
 *
 * Unlike the previous version, this script draws the whole sheet itself: there
 * is no background artwork bitmap. Every card is built from real Slides
 * objects, so nothing is baked into a raster and the layout is driven by the
 * numbers in SHEET below. Per card:
 *   - the cream card fill, the gold frame rule and its four chamfered corners
 *   - the chef-hat mark, SOUL CHEF wordmark and tagline
 *   - CHIP_n: the course badge. A pre-rendered brush PNG, so n8n swaps its
 *     image URL per category/diet rather than recolouring a shape.
 *   - DOT_n: a small circle, recoloured green (veg) or red (non-veg) by n8n
 *   - {{CAT_n}}, {{DISH_n}}, {{SUB_n}}, {{DIET_n}}: text placeholders filled
 *     by n8n via replaceAllText
 *   - {{EVENT_DATE}}, {{VENUE}}: filled onto the title card in slot 1
 * n8n's "Build replacements" Code node assumes these exact objectId names
 * (CHIP_n / DOT_n) — do not rename them without updating that node.
 *
 * Layout: 1 across x 4 down on A2 portrait. Slot 1 of page 1 is the title
 * card, leaving 3 dish cards there and 4 on every later page. There is no
 * legend card: at 4 slots to a page it would cost a quarter of every sheet,
 * and each card's own diet mark already carries that information.
 */

const IN = 72; // Slides API works in points; 1 inch = 72pt

// ---------------------------------------------------------------------------
// ARTWORK — fill these in before running.
// Each must be a public direct-to-image URL. Leave a value as '' and that
// piece is simply skipped, so the template still builds while you gather them.
// ---------------------------------------------------------------------------
const ART = {
  toque: 'https://i.ibb.co/Lz0qH15Y/Cheif-Hat-removebg-preview.png',
  bottomRule: 'https://i.ibb.co/BK3d6JrY/card-bottom-line.png',
  sprigLeft: 'https://i.ibb.co/fYzM2v5P/bottom-left-leaf-removebg-preview.png',
  sprigRight: 'https://i.ibb.co/6RsXjVDj/bottom-right-leaf-removebg-preview.png',
  goodFood: 'https://i.ibb.co/TDVfWbB4/good-food-leaf.png',
  footer: 'https://i.ibb.co/QjJMw69N/footer.png'
};

// Each artwork's true width/height, read off the uploaded files. Slides
// stretches an image to whatever box it is given, so every placement below
// derives one dimension from the other through these — hard-coding both would
// distort the art. Re-measure if you replace a file.
const AR = {
  toque: 131 / 98,     // 1.337
  bottomRule: 225 / 49,     // 4.592
  sprigLeft: 166 / 231,    // 0.719
  sprigRight: 160 / 189,    // 0.847
  goodFood: 134 / 101,    // 1.327
  footer: 640 / 40      // 16.000
};

// The course badge, pre-rendered as a transparent brush stroke in each colour.
// n8n picks one of these per dish; the template starts every chip on `olive`.
// Keep these keys in step with the CHIP_URL map in the workflow's
// "Build replacements" node.
const CHIP_ART = {
  olive: '',  // #7D9A5F — welcome drink, main course, accompaniments, desserts
  amber: '',  // #D9A842 — starters
  red: ''     // #C0392B — any non-veg starter or main course
};

// ---------------------------------------------------------------------------
// Palette — sampled from the HTML's tailwind config
// ---------------------------------------------------------------------------
const C = {
  cream: rgb('F3EBDD'),   // sheet background
  card: rgb('FBF6EC'),   // card fill
  gold: rgb('A98B4F'),   // frame rule, tagline
  ink: rgb('2F2A24'),   // dish name, wordmark
  vegDot: rgb('2E8B2E'),
  nonvegDot: rgb('C0392B'),
  white: rgb('FFFFFF'),
  fleuron: rgb('B49A63')
};

function rgb(hex) {
  return {
    red: parseInt(hex.substring(0, 2), 16) / 255,
    green: parseInt(hex.substring(2, 4), 16) / 255,
    blue: parseInt(hex.substring(4, 6), 16) / 255
  };
}

// The HTML's five families, mapped to what Slides can actually render.
// Cormorant Garamond, Playfair Display, Jost and Caveat are all on Google
// Fonts, so Slides accepts them by name.
const F = {
  display: 'Cormorant Garamond', // dish names, wordmark, legend
  sans: 'Jost',                // tagline, chip label, diet label
  script: 'Caveat',               // "Good Food Creates Great Moments"
  playfair: 'Playfair Display'      // title card heading and venue
};

// ---------------------------------------------------------------------------
// Sheet geometry — the HTML poster, in inches
// ---------------------------------------------------------------------------
const SHEET = {
  w: 16.531,     // A2 portrait
  h: 23.385,
  padX: 1.1295,  // exactly (w - cardW) / 2, so the card is centred to the thou
  padTop: 0.2,
  cardW: 14.272,
  cardH: 5.58,
  gap: 0.18,
  cols: 1,
  rows: 4
};

// How many sheets the template holds. A page is 4 slots; slot 1 on page 1 is
// the title card, so page 1 gives 3 dish slots and every later page gives 4.
// Raise this if orders routinely exceed the current capacity, re-run
// buildCardsRaw(), and set the workflow's TEMPLATE_PAGES to match.
const TEMPLATE_PAGES = 6; // 3 + 5x4 = 23 dish slots

/**
 * Builds the template. PAGES controls how many identical sheets are created;
 * placeholders are numbered continuously across them, so page 2 holds cards
 * 15-29, page 3 holds 30-44, and so on.
 */
function buildCardsRaw(pages) {
  const PAGES = pages || TEMPLATE_PAGES;
  const pres = SlidesApp.getActivePresentation();
  const presentationId = pres.getId();

  // Slides objectIds must be unique across the WHOLE presentation, not just one
  // page. Removing elements one by one leaves stragglers behind (anything on a
  // layout/master is untouched), so a re-run then fails with "object ID should
  // be unique". Appending brand-new slides and deleting every pre-existing one
  // releases all the old IDs outright, which makes the build idempotent.
  const fresh = [];
  for (let p = 0; p < PAGES; p++) {
    fresh.push(pres.appendSlide(SlidesApp.PredefinedLayout.BLANK));
  }
  const keep = {};
  fresh.forEach(function (s) { keep[s.getObjectId()] = true; });
  pres.getSlides().forEach(function (s) {
    if (!keep[s.getObjectId()]) s.remove();
  });
  fresh.forEach(function (s) {
    s.getPageElements().forEach(function (e) { e.remove(); });
  });
  const slideIds = fresh.map(function (s) { return s.getObjectId(); });

  // A stale shape can also sit on a layout or master, where deleting slides
  // never reaches it, and it still occupies the objectId. Sweep those too.
  [].concat(pres.getLayouts(), pres.getMasters()).forEach(function (page) {
    page.getPageElements().forEach(function (e) {
      if (/^(SHEETBG_|CARD_|FRAME_|CORNER_|CHIP_|CATBOX_|DOT_|DOTBOX_|DISHBOX_|SUBBOX_|DOTLABEL_|TOQUE_|WORDMARK_|TAGLINE_|RULE_|SPRIG_|TITLE_|LEGEND_|FOOTER_)/.test(e.getObjectId())) {
        e.remove();
      }
    });
  });

  // Read page dimensions while the presentation is still open — saveAndClose()
  // below invalidates this object.
  const PAGE_W = pres.getPageWidth();
  const PAGE_H = pres.getPageHeight();

  // The whole layout is derived from SHEET, so a page set to the wrong size
  // silently produces a skewed sheet. Fail loudly instead.
  const wantW = SHEET.w * IN, wantH = SHEET.h * IN;
  if (Math.abs(PAGE_W - wantW) > 2 || Math.abs(PAGE_H - wantH) > 2) {
    throw new Error(
      'Page is ' + (PAGE_W / IN).toFixed(2) + 'in x ' + (PAGE_H / IN).toFixed(2) +
      'in. Set File > Page setup > Custom to ' + SHEET.w + 'in x ' + SHEET.h +
      'in before running.');
  }

  // Apps Script buffers structural edits. Committing them before the raw
  // Slides API batch runs avoids "the page could not be found", which happens
  // when the batch is sent against a view that still predates the edits above.
  pres.saveAndClose();

  const requests = [];

  // Dish numbering runs continuously across pages so n8n can address card 15+
  // on sheet 2 without knowing anything about pagination. Only page 1 carries
  // the title card; on later pages that slot becomes an ordinary dish card,
  // which is why a 2-page template holds 14 + 15 = 29 dishes rather than 28.
  let dishNo = 1;
  for (let p = 0; p < slideIds.length; p++) {
    const slideId = slideIds[p];
    const page = p + 1;

    // The cream sheet itself, edge to edge behind everything.
    requests.push(rect('SHEETBG_' + page, slideId, 0, 0, SHEET.w, SHEET.h));
    requests.push(fill('SHEETBG_' + page, C.cream));

    for (let r = 0; r < SHEET.rows; r++) {
      for (let col = 0; col < SHEET.cols; col++) {
        const i = r * SHEET.cols + col;
        const x = SHEET.padX + col * (SHEET.cardW + SHEET.gap);
        const y = SHEET.padTop + r * (SHEET.cardH + SHEET.gap);

        // A page now holds only 4 cards, so the legend no longer earns a slot
        // of its own: giving it one would cost a quarter of every sheet. The
        // diet mark on each card carries the same information.
        if (p === 0 && i === 0) {
          requests.push.apply(requests, titleCard(slideId, x, y));
        } else {
          requests.push.apply(requests, cardRequests(slideId, dishNo++, x, y));
        }
      }
    }

    // The footer band sits in the strip left under the last row.
    if (ART.footer) {
      const footerY = SHEET.padTop + SHEET.rows * (SHEET.cardH + SHEET.gap);
      const avail = SHEET.h - footerY - 0.05;
      // The band is 16:1. At the sheet's full width it would need ~0.78in,
      // more than the strip under the last row, so fit it to the strip height
      // and let the width follow — never the other way round, which would
      // stretch it. It then sits narrower than the sheet, so centre it.
      const maxW = SHEET.w - SHEET.padX * 2;
      let footerH = avail;
      let footerW = footerH * AR.footer;
      if (footerW > maxW) { footerW = maxW; footerH = footerW / AR.footer; }
      requests.push(image('FOOTER_' + page, slideId, ART.footer,
        (SHEET.w - footerW) / 2, footerY + (avail - footerH) / 2,
        footerW, footerH));
    }
  }

  Slides.Presentations.batchUpdate({ requests: requests }, presentationId);
}

// ---------------------------------------------------------------------------
// Request helpers. Every x/y/w/h below is in INCHES; pt() converts.
//
// Slides rejects any objectId shorter than 5 characters, which is why the sheet
// background is SHEETBG_n rather than BG_n. DOT_n sits exactly on that limit —
// do not shorten these prefixes.
// ---------------------------------------------------------------------------
function pt(v) { return { magnitude: v, unit: 'PT' }; }

function xf(x, y, deg) {
  // Slides has no rotation field on a transform — rotation is expressed as the
  // 2x2 part of the affine matrix, with translate still naming the element's
  // top-left in page space.
  if (!deg) {
    return { scaleX: 1, scaleY: 1, translateX: x * IN, translateY: y * IN, unit: 'PT' };
  }
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    scaleX: cos, scaleY: cos, shearX: -sin, shearY: sin,
    translateX: x * IN, translateY: y * IN, unit: 'PT'
  };
}

function shape(id, slideId, type, x, y, w, h, deg) {
  return {
    createShape: {
      objectId: id, shapeType: type,
      elementProperties: {
        pageObjectId: slideId,
        size: { width: pt(w * IN), height: pt(h * IN) },
        transform: xf(x, y, deg)
      }
    }
  };
}

function rect(id, slideId, x, y, w, h, deg) {
  return shape(id, slideId, 'RECTANGLE', x, y, w, h, deg);
}

function image(id, slideId, url, x, y, w, h) {
  return {
    createImage: {
      objectId: id, url: url,
      elementProperties: {
        pageObjectId: slideId,
        size: { width: pt(w * IN), height: pt(h * IN) },
        transform: xf(x, y)
      }
    }
  };
}

function fill(id, color) {
  return {
    updateShapeProperties: {
      objectId: id,
      shapeProperties: {
        shapeBackgroundFill: { solidFill: { color: { rgbColor: color } } },
        outline: { propertyState: 'NOT_RENDERED' }
      },
      fields: 'shapeBackgroundFill.solidFill.color,outline.propertyState'
    }
  };
}

/** A hairline rule drawn as a filled rectangle, so thickness is exact. */
function hairline(id, slideId, x, y, w, thickIn, color, deg) {
  return [
    rect(id, slideId, x, y, w, thickIn, deg),
    fill(id, color)
  ];
}

function textBox(slideId, id, x, y, w, h) {
  return {
    createShape: {
      objectId: id, shapeType: 'TEXT_BOX',
      elementProperties: {
        pageObjectId: slideId,
        size: { width: pt(w * IN), height: pt(h * IN) },
        transform: xf(x, y)
      }
    }
  };
}

function styleText(id, opts) {
  const style = {
    fontFamily: opts.font || F.display,
    fontSize: pt(opts.size),
    foregroundColor: { opaqueColor: { rgbColor: opts.color || C.ink } }
  };
  let fields = 'fontFamily,fontSize,foregroundColor';
  if (opts.bold) { style.bold = true; fields += ',bold'; }
  if (opts.italic) { style.italic = true; fields += ',italic'; }
  // Slides expresses letter-spacing in points, not em.
  if (opts.track) { style.weightedFontFamily = undefined; }
  return { updateTextStyle: { objectId: id, style: style, fields: fields } };
}

function para(id, align, lineSpacing) {
  const style = { alignment: align || 'CENTER' };
  let fields = 'alignment';
  if (lineSpacing) { style.lineSpacing = lineSpacing; fields += ',lineSpacing'; }
  return { updateParagraphStyle: { objectId: id, style: style, fields: fields } };
}

/** Middle-anchor a text box, and drop the insets Slides adds by default. */
function tight(id) {
  return {
    updateShapeProperties: {
      objectId: id,
      shapeProperties: {
        contentAlignment: 'MIDDLE',
        outline: { propertyState: 'NOT_RENDERED' }
      },
      fields: 'contentAlignment,outline.propertyState'
    }
  };
}

/**
 * The card's cream panel plus its gold frame: a rectangle outline inset from
 * the card edge, with a short diagonal across each corner so the corner reads
 * as a chamfered bracket — the HTML's .card-frame, rebuilt from real shapes.
 * `plain` omits the diagonals, as the title card's frame does.
 */
function cardFrame(slideId, tag, x, y, plain) {
  const W = SHEET.cardW, H = SHEET.cardH;
  const inset = 10 / 72;     // the HTML's inset-[10pt]
  const rule = 2 / 72;       // --w: 2pt
  const m = 15 / 72;         // --m: 15pt, how far along each edge the chamfer starts
  const fx = x + inset, fy = y + inset;
  const fw = W - inset * 2, fh = H - inset * 2;

  const out = [
    // the card panel
    rect('CARD_' + tag, slideId, x, y, W, H),
    fill('CARD_' + tag, C.card),
    // the frame rectangle, as four hairlines: a RECTANGLE with an outline would
    // also work, but Slides renders a 1pt outline straddling the path, so the
    // rule would sit half a point outside the geometry given here.
    rect('FRAME_' + tag + '_T', slideId, fx, fy, fw, rule),
    fill('FRAME_' + tag + '_T', C.gold),
    rect('FRAME_' + tag + '_B', slideId, fx, fy + fh - rule, fw, rule),
    fill('FRAME_' + tag + '_B', C.gold),
    rect('FRAME_' + tag + '_L', slideId, fx, fy, rule, fh),
    fill('FRAME_' + tag + '_L', C.gold),
    rect('FRAME_' + tag + '_R', slideId, fx + fw - rule, fy, rule, fh),
    fill('FRAME_' + tag + '_R', C.gold)
  ];

  if (plain) return out;

  // Each diagonal spans the two points sitting `m` along the edges that meet at
  // a corner, so its length is m * sqrt(2) and its midpoint is (m/2, m/2) in
  // from that corner. Slides positions by top-left and rotates about the
  // element's centre, so each one is placed by subtracting half its own span.
  const len = m * Math.SQRT2;
  const half = len / 2;
  const corners = [
    ['TL', fx + m / 2, fy + m / 2, -45],
    ['TR', fx + fw - m / 2, fy + m / 2, 45],
    ['BL', fx + m / 2, fy + fh - m / 2, 45],
    ['BR', fx + fw - m / 2, fy + fh - m / 2, -45]
  ];
  corners.forEach(function (c) {
    const id = 'CORNER_' + tag + '_' + c[0];
    out.push(rect(id, slideId, c[1] - half, c[2] - rule / 2, len, rule, c[3]));
    out.push(fill(id, C.gold));
  });
  return out;
}

/**
 * The hat / SOUL CHEF / tagline block at the top of every dish card.
 * Mirrors brandMark() in the HTML.
 */
function brandMark(slideId, tag, x, y) {
  const W = SHEET.cardW;
  const out = [];
  let cursor = y + 15 / 72;  // the card's py-[15pt]

  if (ART.toque) {
    const hatH = 30 / 72;
    const hatW = hatH * AR.toque;
    out.push(image('TOQUE_' + tag, slideId, ART.toque,
      x + (W - hatW) / 2, cursor, hatW, hatH));
    cursor += hatH;
  }

  const markId = 'WORDMARK_' + tag;
  out.push(textBox(slideId, markId, x + 0.2, cursor + 4 / 72, W - 0.4, 0.42));
  out.push({ insertText: { objectId: markId, text: 'SOUL CHEF' } });
  out.push(styleText(markId, { size: 26, bold: true, color: C.ink }));
  out.push(para(markId));
  out.push(tight(markId));

  const tagId = 'TAGLINE_' + tag;
  out.push(textBox(slideId, tagId, x + 0.16, cursor + 0.46, W - 0.32, 0.22));
  out.push({ insertText: { objectId: tagId, text: '— Stress Free Experience For Your Event —' } });
  out.push(styleText(tagId, { font: F.sans, size: 10, bold: true, color: C.gold }));
  out.push(para(tagId));
  out.push(tight(tagId));

  return out;
}

/**
 * One dish card, 3in x 2in. Vertical positions are fractions of the card so the
 * stack reads the same as the HTML's flex column: brand mark, chip, dish name
 * (optically centred in the space left), divider, diet mark.
 */
function cardRequests(slideId, n, x, y) {
  const W = SHEET.cardW, H = SHEET.cardH;
  const chipId = 'CHIP_' + n;
  const dishId = 'DISHBOX_' + n;
  const subId = 'SUBBOX_' + n;
  const dotId = 'DOT_' + n;
  const dotLabelId = 'DOTLABEL_' + n;

  const out = cardFrame(slideId, n, x, y, false);

  // Foliage spilling out of the bottom-left corner, under everything else.
  if (ART.sprigLeft) {
    const sH = 78 / 72;
    out.push(image('SPRIG_' + n, slideId, ART.sprigLeft,
      x + 2 / 72, y + H - sH - 2 / 72, sH * AR.sprigLeft, sH));
  }

  out.push.apply(out, brandMark(slideId, n, x, y));

  // The course badge. A pre-rendered brush PNG rather than a shape, so the
  // lobed silhouette survives; n8n swaps this image's URL per category/diet.
  // The HTML gives the ribbon a fixed 330pt width rather than an inset, so a
  // long course name is not squeezed on this much wider card.
  const chipW = 330 / 72;
  const chipH = 32 / 72;
  const chipY = y + H * 0.32;
  if (CHIP_ART.olive) {
    out.push(image(chipId, slideId, CHIP_ART.olive,
      x + (W - chipW) / 2, chipY, chipW, chipH));
  } else {
    // No brush art yet — fall back to a rounded rect so the template still
    // builds and still carries a CHIP_n for n8n to find.
    out.push(shape(chipId, slideId, 'ROUND_RECTANGLE',
      x + (W - chipW) / 2, chipY, chipW, chipH));
    out.push(fill(chipId, rgb('7D9A5F')));
  }

  // The chip label is its own box: an image cannot hold text, and keeping the
  // label separate means swapping the brush art never disturbs the words.
  const catId = 'CATBOX_' + n;
  out.push(textBox(slideId, catId, x + (W - chipW) / 2, chipY, chipW, chipH));
  out.push({ insertText: { objectId: catId, text: '{{CAT_' + n + '}}' } });
  out.push(styleText(catId, { font: F.sans, size: 13, bold: true, color: C.white }));
  out.push(para(catId));
  out.push(tight(catId));

  // Dish name — the card's focal text. Middle-anchored across the whole blank
  // middle so a one-line and a three-line name both sit centred between the
  // chip and the divider.
  // The HTML sizes this by measuring every name and stepping the whole set
  // down together (fitNames). Slides cannot measure, so the box is given the
  // shared starting size and enough height for two lines; a very long name
  // relies on Slides' own shrink-on-overflow rather than a fitted size.
  const dishY = y + H * 0.42;
  const dishH = H * 0.24;
  out.push(textBox(slideId, dishId, x + W * 0.05, dishY, W * 0.90, dishH));
  out.push({ insertText: { objectId: dishId, text: '{{DISH_' + n + '}}' } });
  out.push(styleText(dishId, { font: F.playfair, size: 38, bold: true, color: C.ink }));
  out.push(para(dishId, 'CENTER', 100));
  out.push(tight(dishId));

  // Sub line, e.g. "Roti | Paratha | Garlic Bread" or "Served in Shot Glass".
  out.push(textBox(slideId, subId, x + W * 0.05, y + H * 0.665, W * 0.90, H * 0.07));
  out.push({ insertText: { objectId: subId, text: '{{SUB_' + n + '}}' } });
  out.push(styleText(subId, { size: 19, italic: true, color: C.ink }));
  out.push(para(subId));
  out.push(tight(subId));

  // The rule-and-sprig divider that closes the card.
  const ruleW = 230 / 72;
  const ruleY = y + H * 0.755;
  // Height follows from the width so the leaf at its centre stays round. The
  // diet mark below is positioned off this, so it is computed either way.
  const ruleH = ART.bottomRule ? ruleW / AR.bottomRule : 0.05;
  if (ART.bottomRule) {
    out.push(image('RULE_' + n, slideId, ART.bottomRule,
      x + (W - ruleW) / 2, ruleY, ruleW, ruleH));
  } else {
    out.push.apply(out, hairline('RULE_' + n, slideId,
      x + (W - ruleW) / 2, ruleY + 0.05, ruleW, 0.5 / 72, C.gold));
  }

  // Veg / non-veg mark: the FSSAI-style bordered square with a dot inside it,
  // then the label. This is the one thing a guest must read at a glance, so it
  // is much larger than the old plain dot.
  //
  // n8n recolours DOT_n only, so the border box keeps a neutral gold outline
  // rather than tracking the diet: updateShapeProperties would need a second
  // objectId per card, and the dot plus the word already carry the meaning.
  // The rule art is 230pt wide at 4.592:1, so it is ~50pt tall and ends well
  // below the y it is placed at. Sit the mark clear of that, not on top of it.
  const boxSize = 20 / 72;
  const dotSize = 11 / 72;
  const markY = ruleY + ruleH + 10 / 72;
  const gap = 9 / 72;
  const labelW = W * 0.20;
  // Centre on the INK, not the boxes: the label box is far wider than the word
  // inside it, so centring box+label as one block pushes the visible pair left
  // of the card's axis. Budgeting roughly the real text width keeps it on axis.
  const inkW = boxSize + gap + labelW * 0.34;
  const boxX = x + W / 2 - inkW / 2;

  const dotBoxId = 'DOTBOX_' + n;
  out.push(rect(dotBoxId, slideId, boxX, markY, boxSize, boxSize));
  out.push(fill(dotBoxId, C.card));
  out.push({
    updateShapeProperties: {
      objectId: dotBoxId,
      shapeProperties: {
        outline: {
          outlineFill: { solidFill: { color: { rgbColor: C.gold } } },
          weight: pt(2),
          dashStyle: 'SOLID'
        }
      },
      fields: 'outline'
    }
  });

  out.push(shape(dotId, slideId, 'ELLIPSE',
    boxX + (boxSize - dotSize) / 2, markY + (boxSize - dotSize) / 2,
    dotSize, dotSize));
  out.push(fill(dotId, C.vegDot));

  // A Slides text box carries a top inset, so a box only as tall as the text
  // renders the word below the square's centreline. Give it real height and
  // middle-anchor it, then centre that height on the square.
  const labelH = H * 0.07;
  out.push(textBox(slideId, dotLabelId,
    boxX + boxSize + gap, markY + boxSize / 2 - labelH / 2, labelW, labelH));
  out.push({ insertText: { objectId: dotLabelId, text: '{{DIET_' + n + '}}' } });
  out.push(styleText(dotLabelId, { font: F.sans, size: 16, bold: true, color: C.ink }));
  out.push(para(dotLabelId, 'START'));
  out.push(tight(dotLabelId));

  return out;
}

/**
 * Slot 1 on page 1. The HTML's titleCard: hat, wordmark, tagline, a fleuron,
 * then the event date, venue and guest count. Its frame is a plain rectangle,
 * with no chamfered corners. The HTML's "MENU NAME TAGS" heading was dropped,
 * so there is none here either.
 */
function titleCard(slideId, x, y) {
  const W = SHEET.cardW, H = SHEET.cardH;
  const out = cardFrame(slideId, 'TITLE', x, y, true);

  // Foliage in both bottom corners.
  const sH = 78 / 72;
  if (ART.sprigLeft) {
    out.push(image('SPRIG_TITLE_L', slideId, ART.sprigLeft,
      x + 2 / 72, y + H - sH - 2 / 72, sH * AR.sprigLeft, sH));
  }
  if (ART.sprigRight) {
    const rw = sH * AR.sprigRight;
    out.push(image('SPRIG_TITLE_R', slideId, ART.sprigRight,
      x + W - rw - 2 / 72, y + H - sH - 2 / 72, rw, sH));
  }

  let cursor = y + 0.45;
  if (ART.toque) {
    const hatH = 36 / 72;
    const hatW = hatH * AR.toque;
    out.push(image('TOQUE_TITLE', slideId, ART.toque,
      x + (W - hatW) / 2, cursor, hatW, hatH));
    cursor += hatH + 0.05;
  }

  out.push(textBox(slideId, 'TITLE_MARK', x + 0.2, cursor, W - 0.4, 0.62));
  out.push({ insertText: { objectId: 'TITLE_MARK', text: 'SOUL CHEF' } });
  out.push(styleText('TITLE_MARK', { size: 40, bold: true, color: C.ink }));
  out.push(para('TITLE_MARK'));
  out.push(tight('TITLE_MARK'));
  cursor += 0.62;

  out.push(textBox(slideId, 'TITLE_TAG', x + 0.16, cursor, W - 0.32, 0.24));
  out.push({ insertText: { objectId: 'TITLE_TAG', text: '— Stress Free Experience For Your Event —' } });
  out.push(styleText('TITLE_TAG', { font: F.sans, size: 12, bold: true, color: C.ink }));
  out.push(para('TITLE_TAG'));
  out.push(tight('TITLE_TAG'));
  cursor += 0.24;

  // The fleuron: two short rules with a small diamond between them. Slides has
  // a DIAMOND preset, so this is three real shapes rather than the HTML's SVG.
  const fl = 66 / 72, dia = 11 / 72;
  const flY = cursor + 0.06;
  const flX = x + (W - fl) / 2;
  out.push.apply(out, hairline('TITLE_FL_L', slideId, flX, flY + dia / 2, fl * 0.32, 1 / 72, C.fleuron));
  out.push.apply(out, hairline('TITLE_FL_R', slideId, flX + fl * 0.68, flY + dia / 2, fl * 0.32, 1 / 72, C.fleuron));
  out.push(shape('TITLE_FL_D', slideId, 'DIAMOND', x + (W - dia) / 2, flY, dia, dia));
  out.push(fill('TITLE_FL_D', C.fleuron));
  cursor = flY + dia + 0.12;

  out.push(textBox(slideId, 'TITLE_DATE', x + 0.16, cursor, W - 0.32, 0.42));
  out.push({ insertText: { objectId: 'TITLE_DATE', text: '{{EVENT_DATE}}' } });
  out.push(styleText('TITLE_DATE', { font: F.sans, size: 24, bold: true, color: C.ink }));
  out.push(para('TITLE_DATE'));
  out.push(tight('TITLE_DATE'));
  cursor += 0.46;

  out.push(textBox(slideId, 'TITLE_VENUE', x + 0.16, cursor, W - 0.32, 0.34));
  out.push({ insertText: { objectId: 'TITLE_VENUE', text: '{{VENUE}}' } });
  out.push(styleText('TITLE_VENUE', { font: F.playfair, size: 19, italic: true, color: C.ink }));
  out.push(para('TITLE_VENUE'));
  out.push(tight('TITLE_VENUE'));
  cursor += 0.38;

  out.push(textBox(slideId, 'TITLE_PAX', x + 0.16, cursor, W - 0.32, 0.28));
  out.push({ insertText: { objectId: 'TITLE_PAX', text: '{{PAX}}' } });
  out.push(styleText('TITLE_PAX', { font: F.sans, size: 15, bold: true, color: C.gold }));
  out.push(para('TITLE_PAX'));
  out.push(tight('TITLE_PAX'));

  return out;
}

/**
 * The bottom-right slot: the veg/non-veg key and the "Good Food Creates Great
 * Moments" line. The HTML's legend card has no frame and no card fill — it sits
 * directly on the cream sheet — so this draws neither.
 */
function legendCard(slideId, page, x, y) {
  const W = SHEET.cardW, H = SHEET.cardH;
  const out = [];
  const tag = 'LEGEND_' + page;
  const dot = 8 / 72;
  const rowGap = 7 / 72;
  const keyX = x + W * 0.28;
  let cursor = y + 0.22;

  [['VEG', C.vegDot, '=  Vegetarian'], ['NON', C.nonvegDot, '=  Non-Vegetarian']]
    .forEach(function (row) {
      const dotId = tag + '_DOT_' + row[0];
      out.push(shape(dotId, slideId, 'ELLIPSE', keyX, cursor, dot, dot));
      out.push(fill(dotId, row[1]));

      const txtId = tag + '_TXT_' + row[0];
      const h = 0.15;
      out.push(textBox(slideId, txtId,
        keyX + dot + rowGap, cursor + dot / 2 - h / 2, W * 0.55, h));
      out.push({ insertText: { objectId: txtId, text: row[2] } });
      out.push(styleText(txtId, { size: 9, color: C.ink }));
      out.push(para(txtId, 'START'));
      out.push(tight(txtId));

      cursor += dot + rowGap * 1.6;
    });

  cursor += 0.04;
  out.push.apply(out, hairline(tag + '_RULE', slideId,
    x + (W - 60 / 72) / 2, cursor, 60 / 72, 0.5 / 72, C.gold));
  cursor += 0.08;

  const sloganId = tag + '_SLOGAN';
  out.push(textBox(slideId, sloganId, x + 0.1, cursor, W - 0.2, 0.62));
  out.push({
    insertText: {
      objectId: sloganId,
      text: 'Good Food\nCreates Great\nMoments'
    }
  });
  out.push(styleText(sloganId, { font: F.script, size: 15, color: C.ink }));
  out.push(para(sloganId, 'CENTER', 100));
  out.push(tight(sloganId));
  cursor += 0.62;

  if (ART.goodFood) {
    const gH = 20 / 72;
    const gW = gH * AR.goodFood;
    out.push(image(tag + '_SPRIG', slideId, ART.goodFood,
      x + (W - gW) / 2, Math.min(cursor, y + H - gH - 0.04), gW, gH));
  }

  return out;
}

/**
 * Diagnostic. Run this AFTER buildCardsRaw() to print what the Slides API
 * actually rendered, rather than what the build code intended. Apps Script
 * reports a text box's real inset and the height Slides gave it once text was
 * laid out, which is what makes a label drift off a dot it was positioned
 * against. Read the output in View > Logs (or View > Execution log).
 *
 * Adjust the constants in cardRequests() from the OFFSET lines below: a
 * positive dy means the label renders that many points lower than the dot's
 * centre, so subtract it from the label's y.
 */
function measureCard(n) {
  const card = n || 1;
  const pres = SlidesApp.getActivePresentation();
  const byId = {};
  pres.getSlides().forEach(function (s) {
    s.getPageElements().forEach(function (e) { byId[e.getObjectId()] = e; });
  });

  const names = ['CARD_', 'CHIP_', 'CATBOX_', 'DISHBOX_', 'SUBBOX_', 'DOT_', 'DOTLABEL_'];
  const box = {};
  names.forEach(function (prefix) {
    const el = byId[prefix + card];
    if (!el) { Logger.log('%s%s  MISSING', prefix, card); return; }
    const b = {
      left: el.getLeft(), top: el.getTop(),
      w: el.getWidth(), h: el.getHeight()
    };
    b.cx = b.left + b.w / 2;
    b.cy = b.top + b.h / 2;
    box[prefix] = b;
    Logger.log('%s%s  left=%s top=%s w=%s h=%s  centre=(%s, %s)',
      prefix, card,
      b.left.toFixed(2), b.top.toFixed(2), b.w.toFixed(2), b.h.toFixed(2),
      b.cx.toFixed(2), b.cy.toFixed(2));
  });

  // Text boxes carry an inset Slides applies on top of the box geometry; it is
  // the usual reason a label does not sit where the box says it does.
  ['CATBOX_', 'DISHBOX_', 'SUBBOX_', 'DOTLABEL_'].forEach(function (prefix) {
    const el = byId[prefix + card];
    if (!el || el.getPageElementType() !== SlidesApp.PageElementType.SHAPE) return;
    const sh = el.asShape();
    try {
      Logger.log('%s%s  insets T/B/L/R = %s / %s / %s / %s',
        prefix, card,
        sh.getTopInset(), sh.getBottomInset(), sh.getLeftInset(), sh.getRightInset());
    } catch (err) {
      Logger.log('%s%s  insets unavailable (%s)', prefix, card, err.message);
    }
  });

  if (box['DOT_'] && box['DOTLABEL_']) {
    const dy = box['DOTLABEL_'].cy - box['DOT_'].cy;
    const dx = box['DOTLABEL_'].left - (box['DOT_'].left + box['DOT_'].w);
    Logger.log('OFFSET dot -> label: dy=%s pt (label is lower when positive)', dy.toFixed(2));
    Logger.log('OFFSET gap after dot: dx=%s pt', dx.toFixed(2));
  }
  if (box['DOT_'] && box['CARD_']) {
    const cardCx = box['CARD_'].cx;
    Logger.log('OFFSET dot vs card axis: %s pt (negative = left of centre)',
      (box['DOT_'].cx - cardCx).toFixed(2));
    if (box['DOTLABEL_']) {
      Logger.log('OFFSET label-box vs card axis: %s pt',
        (box['DOTLABEL_'].cx - cardCx).toFixed(2));
    }
  }
  return box;
}
