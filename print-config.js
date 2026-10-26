const PRINT = {
  // --- the card (one printed name tag) ---
  CARD_W: 7.93,       // card width,  in
  CARD_H: 5.58,       // card height, in

  // --- the sheet the cards are printed on ---
  SHEET_W: 16.531,    // sheet width,  in
  SHEET_H: 23.385,    // sheet height, in

  // --- how the cards sit on the sheet ---
  COLS: 2,             // cards across
  ROWS: 4,             // cards down
  GAP: 0.18,           // space between cards, in
  // PAD_SIDE is exactly (SHEET_W - COLS*CARD_W - (COLS-1)*GAP) / 2, so the
  // row is centred and fits to the thou. Top/bottom are trimmed because
  // four 5.58in cards plus gaps need 23.21in of the sheet's 23.385in.
  PAD_TOP: 0.2,       // sheet padding, in
  PAD_SIDE: 0.2455,
  PAD_BOTTOM: 0.15,

  // Type inside a card is sized in points so it stays absolute against
  // the card's inch dimensions. This is the card's root font-size: every
  // pt value in the card markup is relative to a card this size, so if
  // you change CARD_W/CARD_H, scale this by the same factor.
  CARD_FONT_PT: 43,

  SHEET_LABEL: 'A2 portrait',   // shown in the preview note
};
PRINT.PER_SHEET = PRINT.COLS * PRINT.ROWS;

/* Check the cards actually fit the sheet. A sheet that is too small does
   not complain on its own — it just clips at the page edge, and the loss
   only shows up on the printed sheet — so say so loudly instead. */
PRINT.fitWarnings = (() => {
  const needW = PRINT.COLS * PRINT.CARD_W + (PRINT.COLS - 1) * PRINT.GAP
              + PRINT.PAD_SIDE * 2;
  const needH = PRINT.ROWS * PRINT.CARD_H + (PRINT.ROWS - 1) * PRINT.GAP
              + PRINT.PAD_TOP + PRINT.PAD_BOTTOM;
  // compared at thou precision: a sheet over by even a few thou clips a
  // hairline off the card, so a looser tolerance would hide a real loss
  const out = [];
  if (needW - PRINT.SHEET_W > 0.0005) {
    out.push(`${PRINT.COLS} card(s) across need ${needW.toFixed(3)}in but the sheet is ` +
             `${PRINT.SHEET_W}in wide — reduce COLS/CARD_W/PAD_SIDE or widen SHEET_W.`);
  }
  if (needH - PRINT.SHEET_H > 0.0005) {
    out.push(`${PRINT.ROWS} card(s) down need ${needH.toFixed(3)}in but the sheet is ` +
             `${PRINT.SHEET_H}in tall — reduce ROWS/CARD_H/padding or lengthen SHEET_H. ` +
             `The footer band also needs a little of the slack.`);
  }
  out.forEach((m) => console.warn('PRINT geometry: ' + m));
  return out;
})();

// the one shared gap between the toque, title, tagline, course badge and
// dish name in a dish card's header stack — every mt-[...] in that stack
// reads this value, so changing it here changes them all together
const GAP_FOR_ELEMENTS = 15; // pt
