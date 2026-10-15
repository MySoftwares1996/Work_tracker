/**
 * Gmail "Fetch Mail", plus the pure mapping from a fetched email into a draft Working Dashboard entry ("Add task").
 *
 * With no Apps Script (`baseUrl` empty) the mail comes straight from Gmail with the person's own Google sign-in
 * (gmailApi.js) - nothing to set up. Someone who added their own script in Config > Cloud Sync keeps using it.
 */
import { cloudGet } from './cloudSync';
import { blankEntry } from './workingDashboard';

async function gmail() {
  const [api, sync] = await Promise.all([import('./gmailApi'), import('./firebaseSync')]);
  const token = await sync.getGoogleAccessToken([api.GMAIL_SCOPE]);
  return { api, token };
}

export async function fetchUnreadEmails(baseUrl, opts) {
  if (!baseUrl) { const { api, token } = await gmail(); return api.listUnread(token); }
  const data = await cloudGet(baseUrl, { action: 'fetchEmails' }, opts);
  if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Could not fetch mail.');
  return data.emails || [];
}

export async function markEmailRead(baseUrl, id, opts) {
  if (!baseUrl) { const { api, token } = await gmail(); await api.markRead(token, id); return; }
  await cloudGet(baseUrl, { action: 'markEmailRead', id }, opts);
}

export async function fetchEmailBody(baseUrl, id, opts) {
  if (!baseUrl) { const { api, token } = await gmail(); return api.messageText(token, id); }
  const data = await cloudGet(baseUrl, { action: 'emailBody', id }, opts);
  return (data && data.status === 'success') ? (data.body || '') : '';
}

export function filterEmails(emails = [], query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return emails;
  return emails.filter((e) => String(e.subject || '').toLowerCase().includes(q) || String(e.sender || '').toLowerCase().includes(q));
}

const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n)}...` : s || '');

/** "Add task" from a fetched email: subject becomes the title/reference, the body (clipped) becomes a note. */
export function emailToEntryDraft(email) {
  const subject = email.subject || '(No Subject)';
  const header = `From: ${email.sender || ''}\n\n`;
  return {
    ...blankEntry(),
    title: subject,
    reference: subject,
    notes: header + clip(email.body || '', 500),
  };
}
