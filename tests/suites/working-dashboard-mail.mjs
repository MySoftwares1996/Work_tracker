import { filterEmails, emailToEntryDraft } from '../../src/workingDashboardMail.js';

export async function run({ ck, section }) {
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
