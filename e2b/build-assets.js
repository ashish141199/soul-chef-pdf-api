/*
 * Template-build step (see e2b.Dockerfile): bakes the page's CSS and fonts
 * into assets/ so render.js needs no network when it runs.
 *
 *   - tailwind-sample.html + tailwind.config.cjs + tailwind.input.css, which
 *     the Tailwind CLI then compiles into assets/tailwind.css
 *   - assets/fonts.css, Google Fonts' own stylesheet with every font file
 *     inlined as a data: URI
 */
import fs from 'fs';
import { buildDocument, normalizeOrder, TAILWIND_THEME } from './render.js';

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Jost:wght@300;400;500;600&family=Caveat:wght@500&family=Poppins:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap';

// Google only serves woff2 to user agents it recognises as a modern browser.
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

// Several class names are built at render time (gap-[0.18in], text-[43pt],
// the badge colour per course and diet...), so Tailwind cannot find them by
// reading render.js alone. This sample hits every branch of dishCard() and
// the sheet layout, and Tailwind scans the HTML it produces.
const SAMPLE_ORDER = {
  eventDate: 'Sample', venue: 'Sample', pax: 'Sample',
  dishes: [
    { name: 'Sample', category: 'Welcome Drink', sub: 'Sample note', diet: 'V' },
    { name: 'Sample', category: 'Soup', sub: '', diet: 'V' },
    { name: 'Sample', category: 'Starters', sub: '', diet: 'V' },
    { name: 'Sample', category: 'Starters', sub: '', diet: 'N' },
    { name: 'Sample', category: 'Main Course', sub: '', diet: 'N' },
    { name: 'Sample', category: 'Accompaniments', sub: '', diet: 'V' },
    { name: 'Sample', category: 'Desserts', sub: '', diet: 'V' },
    { name: 'Sample', category: 'Unlisted', sub: '', diet: 'N' },
  ],
};

fs.writeFileSync('tailwind-sample.html', buildDocument(normalizeOrder(SAMPLE_ORDER)));
fs.writeFileSync('tailwind.input.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
fs.writeFileSync('tailwind.config.cjs', 'module.exports = ' + JSON.stringify({
  content: ['./tailwind-sample.html', './render.js'],
  theme: { extend: TAILWIND_THEME },
}, null, 2) + ';\n');

async function get(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res;
}

let fontsCss = await (await get(FONTS_URL, { 'User-Agent': BROWSER_UA })).text();
const fontUrls = new Set(fontsCss.match(/https:\/\/fonts\.gstatic\.com\/[^)\s]+/g) || []);
if (!fontUrls.size) throw new Error('Google Fonts returned no font files.');

for (const url of fontUrls) {
  const bytes = Buffer.from(await (await get(url)).arrayBuffer());
  fontsCss = fontsCss.split(url).join('data:font/woff2;base64,' + bytes.toString('base64'));
}
if (/https?:\/\//.test(fontsCss)) throw new Error('fonts.css still references the network.');

fs.writeFileSync('assets/fonts.css', fontsCss);
console.log(`Inlined ${fontUrls.size} font files into assets/fonts.css`);
