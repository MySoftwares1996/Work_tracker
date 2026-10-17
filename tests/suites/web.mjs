/*
 * The browser build: the screen-size breakpoints, and the browser versions of the phone-only packages
 * (web/shims) that the shared code calls the same way it calls them on Android.
 */
import { layoutFor } from '../../src/layout.js';
import { logAlert, readAlertLog, clearAlertLog } from '../../src/alertLog.js';
import { stampChanges, toolsValue, normalizeLink, parseBookmarks, bookmarksHtml, addLinks, linkFolders, toolsFromRemote } from '../../src/links.js';

export async function run({ ck, section }) {
  section('One UI for every screen size');
  const phone = layoutFor(390), tablet = layoutFor(820), desktop = layoutFor(1440);
  ck('phone: two cards a row, tab bar at the foot', phone.columns === 2 && !phone.tablet && !phone.wide && phone.sideBar === 0);
  ck('tablet: three cards a row, still the tab bar', tablet.columns === 3 && tablet.tablet && !tablet.wide && tablet.sideBar === 0);
  ck('desktop: four cards a row and a side bar', desktop.columns === 4 && desktop.wide && desktop.sideBar > 0);
  ck('breakpoints are inclusive', layoutFor(600).columns === 3 && layoutFor(599).columns === 2 && layoutFor(900).wide && !layoutFor(899).wide);

  section('Links tab (web.app): addresses are tidied');
  ck('https:// is added when missing', normalizeLink(' icegate.gov.in/x ') === 'https://icegate.gov.in/x');
  ck('a full link is kept', normalizeLink('http://a.com') === 'http://a.com');
  ck('text that is not an address is refused', normalizeLink('hello there') === '' && normalizeLink('') === '' && normalizeLink('javascript:alert(1)') === '');

  section('Links tab: folders, bookmarks, sync');
  const sample = [{ id: '1', title: 'ICEGATE', url: 'https://icegate.gov.in', folder: 'Govt' }, { id: '2', title: 'A & B', url: 'https://ab.com/x?a=1&b=2' }];
  const back = parseBookmarks(bookmarksHtml(sample));
  ck('export then import keeps title, address and folder', back.length === 2 && back[0].title === 'A & B' && back[0].url === 'https://ab.com/x?a=1&b=2' && back[1].folder === 'Govt');
  ck('a browser file with folders is read', parseBookmarks('<DL><DT><H3>Banks</H3><DL><DT><A HREF="https://hdfc.com">HDFC</A></DL></DL>')[0].folder === 'Banks');
  ck('bookmarklets are skipped', parseBookmarks('<A HREF="javascript:x()">x</A>').length === 0);
  const added = addLinks(sample, [{ title: 'dup', url: 'HTTPS://icegate.gov.in' }, { title: 'new', url: 'https://new.com' }]);
  ck('addresses already kept are not added twice', added.added === 1 && added.links.length === 3);
  ck('folders are listed', linkFolders(sample).join() === 'Govt');
  const got = toolsFromRemote({ ts: 5, links: sample, reportAiNotes: 'x' }, { links: 3 });
  ck('a newer remote copy is taken (an old document with only ts counts for every item)', got.patch.links.length === 2 && got.patch.reportAiNotes === 'x');
  ck('the website\'s one-time setup flag is taken once, then left alone', toolsFromRemote({ formatSetupAt: 9 }, {}, {}).patch.formatSetupAt === 9 && toolsFromRemote({ formatSetupAt: 9 }, {}, { formatSetupAt: 9 }) === null);
  ck('an older or equal remote copy is ignored', toolsFromRemote({ ts: 3, links: [] }, { links: 3, reportAiNotes: 3, templates: 3, reportFormats: 3, reportAiNotesSummary: 3, holdUntil: 3 }) === null);
  const before = { links: [], templates: [], reportAiNotes: '', reportAiNotesSummary: '', holdUntil: 0 };
  const st = stampChanges(toolsValue({ links: [], alerts: {} }), toolsValue({ links: [{ id: '1', url: 'https://a.com' }], alerts: { holdUntil: 0 } }), { templates: 7 }, 100);
  ck('an edit stamps only the item that changed', st.links === 100 && st.templates === 7 && !('holdUntil' in st) && before.holdUntil === 0);
  const both = toolsFromRemote({ stamps: { links: 9, templates: 2 }, links: sample, templates: [{ id: 'x', name: 'old' }] }, { links: 4, templates: 8 });
  ck('per item: the newer remote links are taken, this phone\'s newer templates are kept', both.patch.links.length === 2 && !('templates' in both.patch) && both.stamps.templates === 8);

  section('Alerts log');
  await clearAlertLog();
  await logAlert('booking', 'Android refused it');
  for (let i = 0; i < 45; i++) await logAlert('job', `x${i}`);
  const lg = await readAlertLog();
  ck('the log keeps the newest 40, newest first', lg.length === 40 && lg[0].text === 'x44');
  await clearAlertLog();
  ck('clearing empties it', (await readAlertLog()).length === 0);

  section('Browser alerts (web/shims/notifications.js)');
  const N = await import('../../web/shims/notifications.js');
  const soon = new Date(Date.now() + 60 * 60000);
  const id = await N.scheduleNotificationAsync({ content: { title: 'Due', body: 'x', data: { kind: 'wd-entry', entryId: 'e1' } }, trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: soon } });
  let all = await N.getAllScheduledNotificationsAsync();
  ck('a booked alert is listed with its data, as the phone lists it', all.length === 1 && all[0].identifier === id && all[0].content.data.entryId === 'e1');
  await N.cancelScheduledNotificationAsync(id);
  ck('cancelling removes it', (await N.getAllScheduledNotificationsAsync()).length === 0);
  await N.scheduleNotificationAsync({ content: { title: 'a' }, trigger: { date: soon } });
  await N.scheduleNotificationAsync({ content: { title: 'b' }, trigger: { date: soon } });
  await N.cancelAllScheduledNotificationsAsync();
  ck('cancel all clears every alert', (await N.getAllScheduledNotificationsAsync()).length === 0);
  const received = [];
  const sub = N.addNotificationReceivedListener((n) => received.push(n.request.content.title));
  await N.scheduleNotificationAsync({ content: { title: 'now' }, trigger: { seconds: 0 } });
  await new Promise((r) => setTimeout(r, 30));
  ck('an alert that falls due reaches the app\'s listeners', received.join() === 'now', received.join());
  sub.remove();
  // The web alarm window opens from an alert's data: an alarm-type alert reaches the listeners with its flag intact.
  const flagged = [];
  const sub2 = N.addNotificationReceivedListener((n) => flagged.push(n.request.content.data));
  await N.scheduleNotificationAsync({ content: { title: 'ring', data: { kind: 'wd-entry', entryId: 'e9', key: 'due', alarm: true } }, trigger: { seconds: 0 } });
  await new Promise((r) => setTimeout(r, 30));
  ck('an alarm-type alert keeps its alarm flag, entry and key for the web alarm window', flagged.length === 1 && flagged[0].alarm === true && flagged[0].entryId === 'e9' && flagged[0].key === 'due');
  sub2.remove();
  ck('no browser notification permission is reported as not granted', (await N.getPermissionsAsync()).granted === false);

  section('Browser storage and files (web/shims)');
  const mem = new Map();
  globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
  try {
    const SS = await import('../../web/shims/secure-store.js');
    await SS.setItemAsync('pin', '1234');
    ck('secure store keeps a value', (await SS.getItemAsync('pin')) === '1234');
    await SS.deleteItemAsync('pin');
    ck('and forgets it', (await SS.getItemAsync('pin')) === null);
  } finally {
    delete globalThis.window;
  }
  const FS = await import('../../web/shims/file-system.js');
  const uri = FS.documentDirectory + 'backup.json';
  await FS.writeAsStringAsync(uri, '{"a":1}', { encoding: 'utf8' });
  ck('a written file reads back (before it is downloaded)', (await FS.readAsStringAsync(uri)) === '{"a":1}');
}
