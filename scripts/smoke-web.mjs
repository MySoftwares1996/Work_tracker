#!/usr/bin/env node
/**
 * A browser smoke test of the website (newweb/): serves newweb/dist (run `npx vite build` in newweb/ first), opens it in demo mode
 * (?demo, sample data, nothing written anywhere) as a person would at desktop and phone width, and walks every tab and every Config
 * topic, failing on any page error or console error. Needs playwright (CI installs it; locally: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'newweb', 'dist');
if (!fs.existsSync(path.join(root, 'index.html'))) { console.error('newweb/dist is missing: run `npx vite build` in newweb/ first.'); process.exit(1); }
const mod = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : (fs.existsSync('/opt/node-tools/node_modules/playwright/index.mjs') ? 'file:///opt/node-tools/node_modules/playwright/index.mjs' : 'playwright');
const { chromium } = await import(mod);
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(root, p === '/' ? 'index.html' : p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/?demo`;

const failures = [];
const ok = (name, cond, extra = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${cond ? '' : ` ${extra}`}`); if (!cond) failures.push(name); };

const TABS = ['Dashboard', 'Register', 'Completed', 'Holidays', 'Bin', 'Report', 'Links', 'Config'];
const TOPICS = ['Alerts', 'Appearance', 'Entry form options', 'Sub categories', 'Next reminder', 'Report formats', 'Report points', 'Gemini key', 'Export a backup', 'Import'];

const browser = await chromium.launch({ executablePath: exe });
for (const [label, width, height] of [['desktop', 1360, 900], ['phone width', 390, 800]]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR|firebase|googleapis|google/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(url);
  await page.addStyleTag({ content: '.alert-overlay{display:none!important}' });      // the demo's due-now pop-up covers the page
  await page.waitForSelector('header.top', { timeout: 15000 });
  ok(`${label}: the app opens`, (await page.locator('.tabs .tab').count()) === TABS.length, `(${await page.locator('.tabs .tab').count()} tabs)`);
  for (const tab of TABS) {
    const before = errors.length;
    await page.locator('.tabs .tab', { hasText: new RegExp(`^${tab}`) }).first().click();
    await page.waitForTimeout(250);
    ok(`${label}: ${tab} opens without errors`, errors.length === before && (await page.locator('main.page').count()) === 1, errors.slice(before).join(' | '));
  }
  await page.locator('.tabs .tab', { hasText: /^Config/ }).first().click();
  await page.waitForSelector('nav.menu .menu-item button', { timeout: 10000 });
  for (const topic of TOPICS) {
    const before = errors.length;
    const link = page.getByRole('button', { name: topic, exact: true }).first();
    if (!(await link.count())) { ok(`${label}: Config > ${topic} exists`, false); continue; }
    await link.click();
    await page.waitForTimeout(200);
    ok(`${label}: Config > ${topic} opens without errors`, errors.length === before, errors.slice(before).join(' | '));
  }
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(`${label}: no sideways scrolling`, noScroll);
  await ctx.close();
}
await browser.close();
server.close();
if (failures.length) { console.error(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log('\nAll website smoke checks passed.');
