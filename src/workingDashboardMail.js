/**
 * Gmail "Fetch Mail", plus the pure mapping from a fetched email into a draft Working Dashboard entry ("Add task").
 *
 * The mail comes straight from Gmail with the person's own Google sign-in (gmailApi.js) - nothing to set up.
 */
import { blankEntry } from './workingDashboard';

async function gmail() {
  const [api, sync] = await Promise.all([import('./gmailApi'), import('./firebaseSync')]);
  const token = await sync.getGoogleAccessToken([api.GMAIL_SCOPE]);
  return { api, token };
}

export async function fetchUnreadEmails() {
  const { api, token } = await gmail();
  return api.listUnread(token);
}

export async function markEmailRead(id) {
  const { api, token } = await gmail();
  await api.markRead(token, id);
}

export async function fetchEmailBody(id) {
  const { api, token } = await gmail();
  return api.messageText(token, id);
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
