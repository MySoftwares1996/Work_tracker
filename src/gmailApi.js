/**
 * Fetch Mail straight from Gmail, with the person's own Google sign-in. Returns mail as { id, subject, sender, date, body }.
 *
 * `token` is a Google access token allowing GMAIL_SCOPE (firebaseSync.getGoogleAccessToken). `fetchImpl` is
 * injectable for the tests.
 */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_MAILS = 25;

const CALL_TIMEOUT_MS = 20000;      // one Gmail request (the answer included) gets this long
const MAX_PARALLEL = 5;             // at most this many requests at once

async function call(path, token, { method = 'GET', body, fetchImpl = fetch, timeoutMs = CALL_TIMEOUT_MS } = {}) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => { try { if (ctrl) ctrl.abort(); } catch { /* nothing to abort */ } reject(new Error('Gmail took too long to answer - try again in a moment.')); }, timeoutMs);
  });
  const work = (async () => {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      ...(ctrl ? { signal: ctrl.signal } : null),
    });
    if (res.status === 401) throw new Error('Gmail access has expired. Tap Fetch Mail again to allow it.');
    if (res.status === 403) throw new Error('Gmail access was refused. Your Google account may not be on this app\'s list of test users - ask the owner to add it.');
    if (!res.ok) throw new Error(`Gmail answered ${res.status}.`);
    return res.status === 204 ? null : res.json();
  })();
  work.catch(() => {});             // after a timeout its late failure is not an unhandled rejection
  try { return await Promise.race([work, guard]); } finally { clearTimeout(timer); }
}

/** Runs `fn` over `items` with at most `limit` in flight; results in the items' order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

const header = (msg, name) => {
  const h = (msg?.payload?.headers || []).find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? String(h.value || '') : '';
};

/** Unread mail in the inbox, newest first (at most 25). */
export async function listUnread(token, { fetchImpl, timeoutMs } = {}) {
  const list = await call(`/messages?maxResults=${MAX_MAILS}&q=${encodeURIComponent('is:unread in:inbox')}`, token, { fetchImpl, timeoutMs });
  const ids = (list?.messages || []).map((m) => m.id);
  const metas = await mapLimit(ids, MAX_PARALLEL, (id) => call(
    `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, token, { fetchImpl, timeoutMs },
  ).catch(() => null));
  return metas.filter(Boolean).map((m) => ({
    id: m.id,
    subject: header(m, 'Subject') || '(No subject)',
    sender: header(m, 'From'),
    date: header(m, 'Date'),
    snippet: decodeEntities(m.snippet || ''),
  }));
}

/** Removes the UNREAD label: the mail no longer comes back on the next fetch. */
export async function markRead(token, id, { fetchImpl, timeoutMs } = {}) {
  await call(`/messages/${encodeURIComponent(id)}/modify`, token, { method: 'POST', body: { removeLabelIds: ['UNREAD'] }, fetchImpl, timeoutMs });
}

/** The mail's text: its plain-text part, else its HTML part without the tags, else Gmail's snippet. */
export async function messageText(token, id, { fetchImpl, timeoutMs } = {}) {
  const m = await call(`/messages/${encodeURIComponent(id)}?format=full`, token, { fetchImpl, timeoutMs });
  return bodyText(m?.payload) || decodeEntities(m?.snippet || '');
}

/* ---------- pure helpers (tested) ---------- */

export function bodyText(payload) {
  const parts = [];
  (function walk(p) {
    if (!p) return;
    if (p.body?.data) parts.push({ type: String(p.mimeType || ''), text: decodeBase64Url(p.body.data) });
    (p.parts || []).forEach(walk);
  })(payload);
  const plain = parts.find((x) => x.type.startsWith('text/plain'));
  if (plain) return plain.text.trim();
  const html = parts.find((x) => x.type.startsWith('text/html'));
  return html ? htmlToText(html.text) : '';
}

export function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** String.fromCodePoint that never throws: an out-of-range or surrogate value gives `fallback` instead. */
function safeCodePoint(cp, fallback = '\ufffd') {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return fallback;
  try { return String.fromCodePoint(cp); } catch { return fallback; }
}

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (whole, n) => safeCodePoint(Number(n), whole));
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Gmail's base64url body -> text (UTF-8), without depending on atob / TextDecoder being on the device. */
export function decodeBase64Url(data) {
  const s = String(data || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = [];
  for (let i = 0; i < s.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < s.length ? B64.indexOf(s[i + k]) : -1));
    bytes.push((n[0] << 2) | (n[1] >> 4));
    if (n[2] >= 0) bytes.push(((n[1] & 15) << 4) | (n[2] >> 2));
    if (n[3] >= 0) bytes.push(((n[2] & 3) << 6) | n[3]);
  }
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let cp;
    let len;
    if (b < 0x80) { cp = b; len = 1; }
    else if (b >= 0xf0) { cp = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63); len = 4; }
    else if (b >= 0xe0) { cp = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63); len = 3; }
    else if (b >= 0xc0) { cp = ((b & 31) << 6) | (bytes[i + 1] & 63); len = 2; }
    else { cp = 0xfffd; len = 1; }
    out += safeCodePoint(cp);
    i += len;
  }
  return out;
}
