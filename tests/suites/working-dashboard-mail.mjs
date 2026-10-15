import { fetchUnreadEmails, markEmailRead, fetchEmailBody, filterEmails, emailToEntryDraft } from '../../src/workingDashboardMail.js';

const fakeFetch = (text) => async () => ({ text: async () => text });

export async function run({ ck, section }) {
  const url = 'https://script.google.com/macros/s/x/exec';

  section('Working Dashboard Mail: fetching');
  const emails = await fetchUnreadEmails(url, { fetchImpl: fakeFetch('{"status":"success","emails":[{"id":"1","subject":"GST filing","sender":"tax@co.com"}]}') });
  ck('fetchUnreadEmails returns the email list', emails.length === 1 && emails[0].subject === 'GST filing');
  let threw = false;
  try { await fetchUnreadEmails(url, { fetchImpl: fakeFetch('{"status":"error","message":"no gmail scope"}') }); } catch (e) { threw = true; }
  ck('a script error surfaces as a thrown error', threw);

  section('Working Dashboard Mail: mark read and body');
  await markEmailRead(url, '1', { fetchImpl: fakeFetch('{"status":"success"}') }); // should not throw
  ck('markEmailRead resolves without throwing', true);
  const body = await fetchEmailBody(url, '1', { fetchImpl: fakeFetch('{"status":"success","body":"Please process this payment."}') });
  ck('fetchEmailBody returns the body text', body === 'Please process this payment.');
  const noBody = await fetchEmailBody(url, '1', { fetchImpl: fakeFetch('{"status":"error"}') });
  ck('a failed body fetch returns an empty string, not a throw', noBody === '');

  section('Working Dashboard Mail: searching the fetched list');
  const pool = [{ id: '1', subject: 'GST filing', sender: 'tax@co.com' }, { id: '2', subject: 'Vendor invoice', sender: 'abc@vendor.com' }];
  ck('an empty query returns everything', filterEmails(pool, '').length === 2);
  ck('matches the subject', filterEmails(pool, 'gst').length === 1);
  ck('matches the sender', filterEmails(pool, 'vendor.com').length === 1);

  section('Working Dashboard Mail: turning an email into a new entry draft');
  const draft = emailToEntryDraft({ id: '1', subject: 'GST filing', sender: 'tax@co.com', body: 'Please file by Friday.' });
  ck('the subject becomes the title', draft.title === 'GST filing');
  ck('the subject becomes the reference', draft.reference === 'GST filing');
  ck('the notes carry the sender and body', draft.notes.includes('From: tax@co.com') && draft.notes.includes('Please file by Friday.'));
  const longBody = 'x'.repeat(600);
  const clippedDraft = emailToEntryDraft({ subject: 'Long one', sender: 'a@b.com', body: longBody });
  ck('a long body is clipped', clippedDraft.notes.includes('...') && clippedDraft.notes.length < 600 + 50);
}
