#!/usr/bin/env node
/**
 * Browser test of the empty states, skeleton rows, bulk actions and the notification explainer (run `npm run test:e2e`). Serves newweb/dist in
 * the demo mode (?demo = sample data, ?demo&empty = no tasks, ?demo&skeleton = first server answer not arrived). SHOTS=/dir saves screenshots (web-*.png).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..', '..');
const dist = path.join(site, 'dist');
if (process.env.BUILD || !fs.existsSync(path.join(dist, 'index.html'))) {
  const r = spawnSync('npx', ['vite', 'build'], { cwd: site, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

const modPath = process.env.PLAYWRIGHT_MODULE || (fs.existsSync('/opt/node-tools/node_modules/playwright/index.mjs') ? '/opt/node-tools/node_modules/playwright/index.mjs' : '');
const { chromium } = await import(modPath ? pathToFileURL(modPath).href : 'playwright');
const findChrome = () => {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  if (!fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base).filter((x) => x.startsWith('chromium')).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome']) { const f = path.join(base, d, rel); if (fs.existsSync(f)) return f; }
  }
  return undefined;
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(dist, p === '/' ? 'index.html' : p);
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const shots = process.env.SHOTS || '';
if (shots) fs.mkdirSync(shots, { recursive: true });
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `web-${name}.png`) }); };

const failures = [];
const ok = (name, cond, extra = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${cond ? '' : ` ${extra}`}`); if (!cond) failures.push(name); };

const browser = await chromium.launch({ executablePath: findChrome() });
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Count calls to the browser's own permission prompt: it must only happen after "Allow alerts".
  await ctx.addInitScript(() => { window.__asked = 0; try { Object.defineProperty(Notification, 'requestPermission', { value: async () => { window.__asked += 1; return 'granted'; }, configurable: true }); } catch { /* none */ } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR|firebase|googleapis/i.test(m.text())) page.errors.push(`console: ${m.text()}`); });
  return page;
};
const tab = (page, name) => page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
// Due alerts and the notification explainer may cover the page in the demo: dismiss them.
const clearOverlays = async (page) => {
  await page.waitForTimeout(1500);
  for (let i = 0; i < 12; i += 1) {
    if (await page.getByRole('alertdialog').count()) await page.getByRole('button', { name: 'Dismiss this alert' }).first().click();
    else if (await page.getByRole('dialog', { name: 'Allow alerts?' }).count()) await page.getByRole('button', { name: 'Not now' }).click();
    else break;
    await page.waitForTimeout(300);
  }
};

try {
  // ---- empty states (no tasks) ----
  let page = await newPage();
  await page.goto(`${base}?demo&empty`);
  await page.getByRole('button', { name: 'New entry' }).first().waitFor({ timeout: 15000 });
  await tab(page, 'Register');
  ok('Register with no tasks: "All clear"', await page.getByRole('heading', { name: 'All clear' }).isVisible());
  ok('Register with no tasks: reused wording', await page.getByText('No open tasks. Enjoy the quiet - or add the next one.').isVisible());
  await shot(page, 'empty-register');
  await page.locator('.empty-state').getByRole('button', { name: 'New entry' }).click();
  const formDlg = page.getByRole('dialog', { name: 'New entry' });
  await formDlg.waitFor({ timeout: 8000 }).catch(() => {});
  ok('"All clear" New entry button opens the form', await formDlg.isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await tab(page, 'Completed');
  ok('Completed with none: "Nothing completed yet"', await page.getByRole('heading', { name: 'Nothing completed yet' }).isVisible());
  await tab(page, 'Dashboard');
  ok('Dashboard lists show empty states', (await page.getByRole('heading', { name: /Nothing overdue|Nothing due today/ }).count()) === 2);
  await tab(page, 'Bin');
  ok('Bin: empty state', await page.getByRole('heading', { name: 'The bin is empty' }).isVisible());
  ok('empty states: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await page.context().close();

  // ---- skeleton rows ----
  page = await newPage();
  await page.goto(`${base}?demo&skeleton#register`);
  await page.locator('.skeleton-card').first().waitFor({ timeout: 15000 });
  ok('skeleton rows show before the first snapshot', (await page.locator('.skeleton-card').count()) >= 4);
  ok('no empty state while loading', (await page.locator('.empty-state').count()) === 0);
  await shot(page, 'skeleton-register');
  await page.context().close();

  // ---- filter with no match, bulk selection ----
  page = await newPage();
  await page.goto(`${base}?demo#register`);
  await page.getByRole('button', { name: 'New entry' }).first().waitFor({ timeout: 15000 });
  await clearOverlays(page);
  await tab(page, 'Register');
  await page.getByLabel('Search', { exact: true }).fill('zzzz-no-such-task');
  ok('filter with no match: "Nothing matches"', await page.getByRole('heading', { name: 'Nothing matches' }).isVisible());
  await shot(page, 'empty-nomatch');
  await page.locator('.empty-state').getByRole('button', { name: 'Clear filters' }).click();
  ok('"Clear filters" brings the list back', (await page.locator('article.card').count()) > 2);

  const boxes = page.locator('article.card .sel-box');
  ok('each card has a checkbox', (await boxes.count()) > 2);
  const before = await page.locator('article.card').count();
  await boxes.nth(0).check({ force: true });
  await boxes.nth(1).check({ force: true });
  ok('bar shows "2 selected"', await page.getByText('2 selected').isVisible());
  ok('bar has Done, DAR, Move date, Bin, Clear', (await page.getByRole('toolbar').getByRole('button').count()) === 4 && await page.getByLabel('Move date').isVisible());
  await page.mouse.move(700, 120);
  await shot(page, 'bulk-bar');
  await page.getByRole('toolbar').getByRole('button', { name: 'Clear' }).click();
  ok('Clear removes the bar', (await page.getByRole('toolbar').count()) === 0);
  await boxes.nth(0).check({ force: true });
  ok('one selected', await page.getByText('1 selected').isVisible());
  await page.keyboard.press('Escape');
  ok('Escape clears the selection', (await page.getByRole('toolbar').count()) === 0);

  // Bulk Done: the two selected tasks leave the open list (tasks that need Sub Category fields are skipped and named in the toast).
  await boxes.nth(0).check({ force: true });
  await boxes.nth(1).check({ force: true });
  await page.getByRole('toolbar').getByRole('button', { name: /Done/ }).click();
  await page.waitForTimeout(400);
  const toast = (await page.locator('.toast').innerText()).trim();
  ok('bulk Done shows a toast', /marked done/.test(toast) || /skipped/.test(toast), toast);
  const after = await page.locator('article.card').count();
  ok('bulk Done: completed tasks leave the Register', after <= before && (/skipped/.test(toast) || after === before - 2), `${before} -> ${after}; ${toast}`);
  await page.keyboard.press('Escape');

  // Bulk Move date + Bin.
  await boxes.nth(0).check({ force: true });
  await page.getByLabel('Move date').fill('2030-01-15');
  await page.waitForTimeout(300);
  ok('Move date moves the task and clears the selection', (await page.getByRole('toolbar').count()) === 0 && /moved to 2030-01-15/.test(await page.locator('.toast').innerText()));
  await boxes.nth(0).check({ force: true });
  const n1 = await page.locator('article.card').count();
  await page.getByRole('toolbar').getByRole('button', { name: /Bin/ }).click();
  await page.waitForTimeout(300);
  ok('Bin removes the selected task from the Register', (await page.locator('article.card').count()) === n1 - 1);
  // Table view has checkboxes too.
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.locator('tbody .sel-box').first().check();
  ok('table rows can be selected', await page.getByText('1 selected').isVisible());
  await page.keyboard.press('Escape');
  ok('bulk: no page errors', page.errors.length === 0, page.errors.join(' | '));

  // ---- notification explainer ----
  await tab(page, 'Config');
  await page.getByRole('button', { name: /Alerts/ }).first().click();
  const notifyBox = page.getByLabel(/Desktop notification/);
  if (await notifyBox.isEnabled()) {
    await notifyBox.click();
    const dlg = page.getByRole('dialog', { name: 'Allow alerts?' });
    await dlg.waitFor();
    ok('explainer text', await dlg.getByText('Allow alerts so due tasks pop up even when this tab is in the background').isVisible());
    ok('the browser prompt is not called before "Allow alerts"', (await page.evaluate(() => window.__asked)) === 0);
    ok('focus starts on "Allow alerts"', await page.evaluate(() => document.activeElement && document.activeElement.textContent === 'Allow alerts'));
    await shot(page, 'notify-explainer');
    await dlg.getByRole('button', { name: 'Not now' }).click();
    ok('"Not now" closes it without asking the browser', (await dlg.count()) === 0 && (await page.evaluate(() => window.__asked)) === 0);
    ok('"Not now" is remembered for about 7 days', await page.evaluate(() => { const v = Number(localStorage.getItem('wd-notify-explainer-until')); return v > Date.now() + 6.9 * 86400000 && v < Date.now() + 7.1 * 86400000; }));
    await notifyBox.click();
    await dlg.waitFor();
    await dlg.getByRole('button', { name: 'Allow alerts' }).click();
    await page.waitForTimeout(300);
    ok('"Allow alerts" asks the browser once', (await page.evaluate(() => window.__asked)) === 1);
  } else ok('explainer (desktop notification not available in this browser)', true);
  ok('explainer: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await page.context().close();
} catch (e) {
  ok('the walk-through ran to the end', false, e.message.split('\n').slice(0, 12).join(' '));
}
await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll browser checks passed');
process.exit(failures.length ? 1 : 0);
