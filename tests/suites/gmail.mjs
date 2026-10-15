/* Fetch Mail straight from Gmail with the person's own sign-in (src/gmailApi.js) - no Apps Script needed. */
import { listUnread, markRead, messageText, bodyText, decodeBase64Url, htmlToText } from '../../src/gmailApi.js';

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fakeGmail() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
    if (url.includes('/messages?')) return json({ messages: [{ id: 'm1' }, { id: 'm2' }] });
    if (url.includes('/messages/m1?format=metadata')) return json({ id: 'm1', snippet: 'Please pay &amp; confirm', payload: { headers: [{ name: 'Subject', value: 'Invoice 42' }, { name: 'From', value: 'Vendor <v@x.com>' }] } });
    if (url.includes('/messages/m2?format=metadata')) return json({ id: 'm2', payload: { headers: [{ name: 'From', value: 'a@b.com' }] } });
    if (url.includes('/messages/m1/modify')) return json({});
    if (url.includes('/messages/m1?format=full')) return json({ payload: { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/html', body: { data: b64url('<p>HTML</p>') } }, { mimeType: 'text/plain', body: { data: b64url('Amount ₹50,000 due') } }] } });
    return json({}, 404);
  };
  return { calls, fetchImpl };
}

export async function run({ ck, section }) {
  section('Fetch Mail from Gmail directly');
  const g = fakeGmail();
  const mails = await listUnread('tok', { fetchImpl: g.fetchImpl });
  ck('unread inbox mail, in the shape the screens use', mails.length === 2 && mails[0].id === 'm1' && mails[0].subject === 'Invoice 42' && mails[0].sender === 'Vendor <v@x.com>');
  ck('a mail with no subject says so', mails[1].subject === '(No subject)');
  ck('asks Gmail for unread inbox mail only, with the token', g.calls[0].url.includes(encodeURIComponent('is:unread in:inbox')) && g.calls[0].init.headers.Authorization === 'Bearer tok');
  await markRead('tok', 'm1', { fetchImpl: g.fetchImpl });
  const mod = g.calls.find((c) => c.url.includes('/modify'));
  ck('Ignore marks it read in Gmail', mod.init.method === 'POST' && JSON.parse(mod.init.body).removeLabelIds[0] === 'UNREAD');
  ck('the body: plain text preferred, UTF-8 kept (₹)', (await messageText('tok', 'm1', { fetchImpl: g.fetchImpl })) === 'Amount ₹50,000 due');
  ck('an HTML-only mail is turned into text', bodyText({ mimeType: 'text/html', body: { data: b64url('<div>Line 1</div><div>Line&nbsp;2</div>') } }) === 'Line 1\nLine 2');
  ck('base64url decoding handles every length and non-Latin text', ['a', 'ab', 'abc', 'abcd', 'नमस्ते ✓'].every((s) => decodeBase64Url(b64url(s)) === s));
  ck('styles and scripts are dropped from HTML', htmlToText('<style>p{}</style><p>Hi</p><script>x()</script>') === 'Hi');
  const denied = { fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }) };
  let msg = '';
  try { await listUnread('tok', denied); } catch (e) { msg = e.message; }
  ck('refused access explains the test-user list', /test users/.test(msg));
}
