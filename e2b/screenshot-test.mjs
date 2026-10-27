import puppeteer from 'puppeteer';
import { pathToFileURL } from 'url';
import path from 'path';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1200 });
const htmlPath = path.join(process.cwd(), 'test.html');
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
await page.screenshot({ path: 'test-screenshot.png', fullPage: true });
await browser.close();
console.log('done');
