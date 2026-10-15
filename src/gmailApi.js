/**
 * Fetch Mail straight from Gmail, with the person's own Google sign-in - no Apps Script to set up. Returns mail in
 * the same shape the Apps Script did ({ id, subject, sender, date, body }), so the screens are unchanged.
 *
 * `token` is a Google access token allowing GMAIL_SCOPE (firebaseSync.getGoogleAccessToken). `fetchImpl` is
 * injectable for the tests.
 */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_MAILS = 25;

async function call(path, token, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error('Gmail access has expired. Tap Fetch Mail again to allow it.');
  if (res.status === 403) throw new Error('Gmail access was refused. Your Google account may not be on this app\'s list of test users - ask the owner to add it.');
  if (!res.ok) throw new Error(`Gmail answered ${res.status}.`);
  return res.status === 204 ? null : res.json();
}

const header = (msg, name) => {
  const h = (msg?.payload?.headers || []).find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? String(h.value || '') : '';
};

/** Unread mail in the inbox, newest first (at most 25). */
export async function listUnread(token, { fetchImpl } = {}) {
  const list = await call(`/messages?maxResults=${MAX_MAILS}&q=${encodeURIComponent('is:unread in:inbox')}`, token, { fetchImpl });
  const ids = (list?.messages || []).map((m) => m.id);
  const metas = await Promise.all(ids.map((id) => call(
    `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, token, { fetchImpl },
  ).catch(() => null)));
  return metas.filter(Boolean).map((m) => ({
    id: m.id,
    subject: header(m, 'Subject') || '(No subject)',
    sender: header(m, 'From'),
    date: header(m, 'Date'),
    snippet: decodeEntities(m.snippet || ''),
  }));
}

/** Removes the UNREAD label: the mail no longer comes back on the next fetch. */
export async function markRead(token, id, { fetchImpl } = {}) {
  await call(`/messages/${encodeURIComponent(id)}/modify`, token, { method: 'POST', body: { removeLabelIds: ['UNREAD'] }, fetchImpl });
}

/** The mail's text: its plain-text part, else its HTML part without the tags, else Gmail's snippet. */
export async function messageText(token, id, { fetchImpl } = {}) {
  const m = await call(`/messages/${encodeURIComponent(id)}?format=full`, token, { fetchImpl });
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

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
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
    out += String.fromCodePoint(Number.isFinite(cp) ? cp : 0xfffd);
    i += len;
  }
  return out;
}
