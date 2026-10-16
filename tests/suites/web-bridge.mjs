import { WEB_APP_URL, isOwnUrl, parseBridgeMessage, replyScript, safeFileName } from '../../src/webBridge.js';

export async function run({ ck, section }) {
  section('Phone app: the website shown inside it');
  ck('the site itself may load in the app', isOwnUrl(WEB_APP_URL) && isOwnUrl(`${WEB_APP_URL}/#x`) && isOwnUrl('about:blank'));
  ck('other sites and look-alike addresses do not', !isOwnUrl('https://example.com') && !isOwnUrl(`${WEB_APP_URL}.evil.com`) && !isOwnUrl('http://work-dashboard-3b728.web.app') && !isOwnUrl('mailto:a@b.c') && !isOwnUrl('') && !isOwnUrl('javascript:alert(1)'));
  ck('a request from the site is understood', parseBridgeMessage('{"id":3,"type":"copy","text":"hi"}').text === 'hi' && parseBridgeMessage('{"id":"4","type":"token"}').id === 4);
  ck('unknown or broken messages are ignored', parseBridgeMessage('{"id":1,"type":"rm -rf"}') === null && parseBridgeMessage('nonsense') === null && parseBridgeMessage('{"type":"copy"}') === null && parseBridgeMessage('null') === null);
  ck('the answer script carries the id and the value as data', replyScript(7, 'a"b</script>') === 'window.__wdNative&&window.__wdNative(7,"a\\"b</script>");true;' && replyScript(2, null).includes('(2,null)') && replyScript(2).includes('(2,null)'));
  ck('a file name is made safe', safeFileName('daily/report:2026?.csv') === 'daily report 2026 .csv' && safeFileName('') === 'file' && safeFileName('a'.repeat(200)).length === 80);
}
