/*
 * POST /api/pdf — Vercel function.
 *
 * Same job as handlePdf/renderPdf in server.js: print the page's own markup
 * to a real PDF with headless Chromium. The difference is the environment —
 * a Vercel function is a fresh, stateless invocation each time (no guarantee
 * the same instance runs twice in a row), so there is no browser/page to
 * keep warm across requests the way server.js does for local dev. Every
 * call launches its own browser and closes it when done.
 *
 * puppeteer-core + @sparticuz/chromium replace plain `puppeteer`: Vercel's
 * function bundle has no system Chromium, so @sparticuz/chromium ships a
 * build of it that is packaged to run inside this sandbox.
 */
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

async function renderPdf(html) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();

    // domcontentloaded, not networkidle0: the waits below are the real
    // readiness conditions.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 50000 });

    // The sheet's size comes from Tailwind utilities, which the CDN build
    // generates by scanning the DOM — so a sheet can still be an unstyled
    // block before that runs. Wait for it to report a real width (a sheet is
    // inches wide, so anything under 500px is unstyled) before printing, or
    // the PDF comes out at the wrong size.
    await page.waitForFunction(() => {
      const s = document.querySelector('.sheet');
      return !s || s.offsetWidth > 500;
    }, { timeout: 15000 }).catch(() => {});

    // networkidle0 used to cover the artwork too, so wait for it explicitly:
    // an image still loading prints as a blank gap, and nothing else here
    // would catch that. A broken src also counts as settled, so one missing
    // file cannot hang the print.
    await page.waitForFunction(() => {
      return [...document.images].every((img) => img.complete);
    }, { timeout: 15000 }).catch(() => {});

    await page.evaluateHandle('document.fonts.ready');

    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true, // honour the @page size the markup sets
    });
  } finally {
    await browser.close();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  const html = req.body && req.body.html;
  if (!html) {
    res.status(400).json({ error: 'No html to print.' });
    return;
  }

  try {
    const pdf = await renderPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="soul-chef-dish-cards.pdf"');
    res.status(200).send(Buffer.from(pdf));
  } catch (err) {
    res.status(500).json({ error: 'Could not render the PDF: ' + err.message });
  }
}
