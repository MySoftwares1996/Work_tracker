// New entry draft: what is typed survives a refresh / a closed form; Reset clears it; Save clears it.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const root = new URL('../../dist', import.meta.url).pathname;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/json' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); let f = path.join(root, p === '/' ? 'index.html' : p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html'); res.setHeader('content-type', T[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
await new Promise((r) => server.listen(0, r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const url = `http://localhost:${server.address().port}/?demo`;
let bad = 0;
const ck = (n, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) bad = 1; };
const open = async () => { await p.getByRole('button', { name: /new entry/i }).first().click(); await p.waitForSelector('textarea[placeholder="What needs doing?"]'); };
const title = () => p.inputValue('textarea[placeholder="What needs doing?"]');

await p.goto(url); await p.waitForTimeout(800); await open();
await p.fill('textarea[placeholder="What needs doing?"]', 'Pay vendor invoice');
// pick the first real category
const sel = p.locator('select[aria-label="Category"]');
const cats = await sel.locator('option').allTextContents();
await sel.selectOption({ index: 1 });
const cat = cats[1];
// switch the rule on for this category from the attach popup, then close it
await p.getByRole('button', { name: /Attach PDF \/ image/ }).click();
await p.getByLabel(/Ask for an attachment/).check();
ck('the popup offers a file chooser', (await p.locator('input[type=file]').count()) === 1);
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
ck('the button shows it is required', /Attach PDF \/ image \*/.test(await p.locator('.files-row').innerText()));
await p.keyboard.press('Control+Enter'); await p.waitForTimeout(300);
ck('Save is refused with no file and no Not required', await p.getByText(/Attach a PDF or an image/).count() > 0);
ck('the form is still open', (await p.inputValue('textarea[placeholder="What needs doing?"]')) === 'Pay vendor invoice');
// attach a small PNG
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await p.getByRole('button', { name: /Attach PDF \/ image/ }).click();
await p.locator('input[type=file]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png });
await p.waitForSelector('.file-item');
ck('the attached file is listed', (await p.locator('.file-item').innerText()).includes('receipt.png'));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
ck('Not required is locked while a file is attached', await p.getByLabel('Not required').isDisabled());
await p.keyboard.press('Control+Enter'); await p.waitForTimeout(500);
ck('Save works with a file', await p.locator('textarea[placeholder="What needs doing?"]').count() === 0);
// second task, same category: Not required instead of a file
await open();
await p.fill('textarea[placeholder="What needs doing?"]', 'Second task');
await p.locator('select[aria-label="Category"]').selectOption(cat);
await p.keyboard.press('Control+Enter'); await p.waitForTimeout(300);
ck('refused again without a file', await p.getByText(/Attach a PDF or an image/).count() > 0);
await p.getByLabel('Not required').check();
await p.keyboard.press('Control+Enter'); await p.waitForTimeout(500);
ck('Save works with Not required', await p.locator('textarea[placeholder="What needs doing?"]').count() === 0);
await b.close(); server.close(); process.exitCode = bad;
