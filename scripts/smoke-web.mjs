#!/usr/bin/env node
/**
 * A browser smoke test of the website: serves dist/ (run `npm run build:web` first), opens it as a person would at desktop
 * and phone width, and walks the main screens - tabs, Quick add, the finder, shortcuts, every Config section - failing on
 * any page error or console error. Needs playwright (CI installs it; locally: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const mod = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { chromium } = await import(mod);
const exe = process.env.CHROMIUM_PATH || undefined;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(root, p === '/' ? 'index.html' : p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const failures = [];
const ok = (name, cond, extra = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${cond ? '' : ` ${extra}`}`); if (!cond) failures.push(name); };

const browser = await chromium.launch({ executablePath: exe });
async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR|firebase|googleapis|google/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(url);
  await page.waitForTimeout(2500);
  const skip = page.getByText(/without|local|this device/i).first();
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(1500); }
  return { ctx, page, errors };
}

// ---- Desktop ----
{
  const { ctx, page, errors } = await open(1440, 900);
  for (const tab of ['Dashboard', 'Register', 'Completed', 'Holidays', 'Config', 'Bin', 'Narration', 'Links']) {
    const before = errors.length;
    await page.getByText(tab, { exact: true }).first().click();
    await page.waitForTimeout(500);
    ok(`desktop: ${tab} tab opens without an error`, errors.length === before, errors.slice(before).join(' | '));
  }
  await page.getByText('Dashboard', { exact: true }).first().click();
  await page.waitForTimeout(400);
  const quick = page.getByPlaceholder(/Quick add/i).first();
  ok('desktop: the Quick add bar is there', (await quick.count()) > 0);
  if (await quick.count()) {
    await quick.fill('Pay vendor tomorrow 5pm high');
    await page.waitForTimeout(300);
    ok('desktop: Quick add shows what it understood', (await page.getByText(/High · Tomorrow/).count()) > 0);
    await page.getByText('Add', { exact: true }).first().click();
    await page.waitForTimeout(600);
    ok('desktop: Quick add opens the New Entry form', (await page.getByText('New Entry').count()) > 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  ok('desktop: Ctrl+K opens the finder', (await page.getByPlaceholder(/Search entries/i).count()) > 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);      // the finder fades out; its input must be gone before a shortcut key counts
  await page.keyboard.press('?');
  await page.waitForTimeout(400);
  ok('desktop: ? opens the keyboard shortcuts', (await page.getByText('Keyboard shortcuts').count()) > 0);
  await page.keyboard.press('Escape');
  await page.getByText('Config', { exact: true }).first().click();
  await page.waitForTimeout(500);
  for (const section of ['Appearance', 'Text Size', 'Security & PIN Lock', 'Recent Changes', 'Quick Add', 'Activity Log', 'Fixed Daily Activities', 'Time Slots', 'Leave Days', 'Settings & Tools', 'Daily Activity Report', 'Report Style Samples', 'Alarm Sound', 'Walk Reminder', 'Water Reminder', 'Realtime Sync', 'Cloud Sync', 'Data Backup', 'System']) {
    const before = errors.length;
    const link = page.getByText(section, { exact: true }).first();
    if (await link.count()) { await link.click(); await page.waitForTimeout(300); }
    ok(`desktop: Config > ${section} opens without an error`, (await link.count()) > 0 && errors.length === before, errors.slice(before).join(' | '));
  }
  ok('desktop: no page or console errors in the whole walk', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---- Phone width ----
{
  const { ctx, page, errors } = await open(390, 844);
  for (const tab of ['Dashboard', 'Register', 'Completed', 'Holidays', 'Config', 'Bin']) {
    const before = errors.length;
    await page.getByText(tab, { exact: true }).last().click();
    await page.waitForTimeout(500);
    ok(`phone width: ${tab} tab opens without an error`, errors.length === before, errors.slice(before).join(' | '));
  }
  ok('phone width: no Narration tab', (await page.getByText('Narration', { exact: true }).count()) === 0);
  ok('phone width: no Quick add bar and no New entry button', (await page.getByPlaceholder(/Quick add/i).count()) === 0 && (await page.getByLabel('New entry').count()) === 0);
  await page.getByText('Config', { exact: true }).last().click();
  await page.waitForTimeout(500);
  const before = errors.length;
  const item = page.getByText('Appearance', { exact: true }).first();
  if (await item.count()) { await item.click(); await page.waitForTimeout(400); }
  ok('phone width: a Config section opens from the list', (await page.getByText('‹ Config').count()) > 0 && errors.length === before, errors.slice(before).join(' | '));
  ok('phone width: no page or console errors in the whole walk', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll website checks passed.');
process.exit(failures.length ? 1 : 0);
