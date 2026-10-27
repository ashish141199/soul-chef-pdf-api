/*
 * Local preview of the E2B renderer's exact HTML/CSS, without spinning up a
 * sandbox or Puppeteer. Imports buildDocument()/normalizeOrder() straight
 * from render.js, so this can never drift from what render.js actually
 * prints — unlike a hand-copied preview file.
 *
 * Usage: node make-test-html.js   (run from e2b/, after build-assets.js and
 * `npx tailwindcss ...` have produced assets/fonts.css + assets/tailwind.css)
 * Then open the printed path in a browser.
 */
import fs from 'fs';
import { buildDocument, normalizeOrder } from './render.js';

const SAMPLE_ORDER = {
  eventDate: '27 Oct 2026',
  venue: 'Sample Venue',
  pax: '',
  dishes: [
    { name: 'Vada', category: 'Starters', sub: '', diet: 'V' },
    { name: 'Samosa', category: 'Starters', sub: '', diet: 'V' },
  ],
};

const html = buildDocument(normalizeOrder(SAMPLE_ORDER));
fs.writeFileSync('test.html', html);
console.log('Wrote ' + new URL('test.html', import.meta.url).pathname.replace(/^\//, ''));
