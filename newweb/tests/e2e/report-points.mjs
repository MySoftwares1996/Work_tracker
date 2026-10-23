// Report points: a payment category shows the picker; nothing is fixed or ticked by default.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const root = new URL('../../dist', import.meta.url).pathname;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/json' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); let f = path.join(root, p === '/' ? 'index.html' : p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html'); res.setHeader('content-type', T[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
await new Promise((r) => server.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
let bad = 0; const ck = (n, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) bad = 1; };
await p.goto(`http://localhost:${server.address().port}/?demo`); await p.waitForTimeout(800);
await p.getByRole('button', { name: /new entry/i }).first().click(); await p.waitForSelector('textarea[placeholder="What needs doing?"]');
ck('no picker before a payment category is chosen', (await p.locator('.report-points').count()) === 0);
await p.selectOption('select[aria-label="Category"]', 'Payments');
ck('the picker shows for Payments', (await p.locator('.report-points').count()) === 1);
ck('with no points written, nothing is pre-filled', (await p.locator('.report-points input[type=checkbox]').count()) === 0 && /No report points yet/i.test(await p.locator('.report-points').innerText()));
await b.close(); server.close(); process.exitCode = bad;
