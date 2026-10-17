#!/usr/bin/env node
/**
 * Browser test of the New entry form (not part of `npm test`; run `npm run test:e2e`). Serves the built site (newweb/dist, built here
 * when missing or with BUILD=1) in the demo mode (?demo, sample data, nothing written anywhere), then checks that Enter and Escape inside the
 * Mail chain and Checklist popups close only the popup - the form stays open and the typed description is intact - and that Save closes the
 * form and the task appears.
 * Playwright: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs (default /opt/node-tools/node_modules/playwright/index.mjs, else `playwright`),
 * browser: CHROMIUM_PATH (default: the newest chrome under /opt/pw-browsers/chromium*, else Playwright's own).
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
const url = `http://localhost:${server.address().port}/?demo`;

const failures = [];
const ok = (name, cond, extra = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${cond ? '' : ` ${extra}`}`); if (!cond) failures.push(name); };

const browser = await chromium.launch({ executablePath: findChrome() });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR|firebase|googleapis/i.test(m.text())) errors.push(`console: ${m.text()}`); });

try {
  await page.goto(url);
  await page.getByRole('button', { name: 'New entry' }).first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'New entry' }).first().click();
  const form = page.getByRole('dialog', { name: 'New entry' });
  await form.waitFor();
  ok('the New entry form opens', await form.isVisible());

  const DESC = `E2E task ${Date.now().toString(36)}`;
  const desc = form.getByPlaceholder('What needs doing?');
  await desc.fill(DESC);
  const intact = async () => (await desc.inputValue()) === DESC;

  // Mail chain popup: Enter in its field must not submit the form; Escape closes only the popup.
  await form.getByRole('button', { name: /Mail chain/ }).first().click();
  const mail = page.getByRole('dialog', { name: 'Mail chain' });
  await mail.waitFor();
  await mail.getByLabel('Mail chain').fill('RE: e2e subject');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  ok('Mail chain: after Enter the form is still open', await form.isVisible());
  ok('Mail chain: after Enter the popup is still open', await mail.isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok('Mail chain: Escape closes only the popup', !(await mail.isVisible()) && await form.isVisible());
  ok('Mail chain: the typed description is intact', await intact());

  // Checklist popup.
  await form.getByRole('button', { name: /Checklist/ }).click();
  const steps = page.getByRole('dialog', { name: 'Checklist' });
  await steps.waitFor();
  await steps.getByPlaceholder('Add a step...').fill('first step');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  ok('Checklist: after Enter the form is still open', await form.isVisible());
  ok('Checklist: Enter added the step', (await steps.getByText('first step').count()) > 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok('Checklist: Escape closes only the popup', !(await steps.isVisible()) && await form.isVisible());
  ok('Checklist: the typed description is intact', await intact());

  // Save closes the form and the task appears.
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(500);
  ok('Save closes the form', !(await form.isVisible()));
  await page.getByText('Register', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  ok('the new task appears', (await page.getByText(DESC).count()) > 0);
  ok('no page or console errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the walk-through ran to the end', false, e.message.split('\n').slice(0, 4).join(' '));
}
await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll browser checks passed');
process.exit(failures.length ? 1 : 0);
