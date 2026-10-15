import { isValidScriptUrl, buildGetUrl, explainHtmlReply, parseCloudResponse, cloudRequest, cloudGet, testConnection, pullSheetEntries, normalizeSheetTask, parseSheetDate, mergeSheetPull, withTime, entrySig, toWebTask, fromWebDocOver } from '../../src/cloudSync.js';
import { mergeRemoteEntries } from '../../src/firebaseSyncCore.js';

const fakeFetch = (text, { ok = true } = {}) => async () => ({ ok, text: async () => text });

export async function run({ ck, section }) {
  section('Cloud Sync: URL validation and GET urls');
  ck('a real Apps Script exec URL is valid', isValidScriptUrl('https://script.google.com/macros/s/AKfycbx123/exec'));
  ck('a trailing slash or path is rejected', !isValidScriptUrl('https://script.google.com/macros/s/AKfycbx123/exec/'));
  ck('a non-script URL is rejected', !isValidScriptUrl('https://example.com'));
  ck('blank is rejected', !isValidScriptUrl(''));
  ck('GET params are encoded onto the URL', buildGetUrl('https://x/exec', { action: 'fetchEmails', id: 'a b' }) === 'https://x/exec?action=fetchEmails&id=a%20b');
  ck('no base URL gives an empty string', buildGetUrl('', { action: 'ping' }) === '');

  section('Cloud Sync: explaining Google\'s HTML error pages');
  ck('a sign-in page is explained', /sign-in/.test(explainHtmlReply('<html><title>Sign in - Google Accounts</title>accounts.google.com</html>')));
  ck('a permission page is explained', /permission/.test(explainHtmlReply('<html><body>Authorization required</body></html>')));
  ck('a busy page is explained as temporary', /temporary|busy/i.test(explainHtmlReply('<html><body>Sorry, unable to open the file at this time.</body></html>')));
  ck('an unrecognised page still gets a plain message', /temporary error/.test(explainHtmlReply('<html><title>Oops</title></html>')));

  section('Cloud Sync: parsing a response');
  ck('valid JSON parses through', parseCloudResponse('{"status":"success"}').status === 'success');
  let threw = false;
  try { parseCloudResponse('<html>busy</html>'); } catch (e) { threw = true; }
  ck('HTML throws a friendly error, not a JSON parse error', threw);

  section('Cloud Sync: cloudRequest / cloudGet with an injected fetch');
  const okData = await cloudRequest('https://script.google.com/macros/s/x/exec', { action: 'ping' }, { fetchImpl: fakeFetch('{"status":"success","taskCount":12}') });
  ck('cloudRequest returns the parsed body', okData.status === 'success' && okData.taskCount === 12);
  let rejected = false;
  try { await cloudRequest('', { action: 'ping' }); } catch (e) { rejected = true; }
  ck('no URL configured rejects before fetching', rejected);
  const emails = await cloudGet('https://script.google.com/macros/s/x/exec', { action: 'fetchEmails' }, { fetchImpl: fakeFetch('{"status":"success","emails":[{"id":"1"}]}') });
  ck('cloudGet returns the parsed body', emails.emails.length === 1);

  section('Cloud Sync: testConnection');
  const bad = await testConnection('not-a-url');
  ck('an obviously wrong URL is rejected without a network call', bad.ok === false && /looks wrong/.test(bad.message));
  const good = await testConnection('https://script.google.com/macros/s/x/exec', { fetchImpl: fakeFetch('{"status":"success","taskCount":5,"sheet":"Tasks_default"}') });
  ck('a working script reports success with the entry count', good.ok === true && /5/.test(good.message));
  const errored = await testConnection('https://script.google.com/macros/s/x/exec', { fetchImpl: fakeFetch('{"status":"error","message":"Unknown action: ping"}') });
  ck('a script error surfaces its message', errored.ok === false && /Unknown action/.test(errored.message));

  section('Cloud Sync: pulling entries from the sheet');
  const blank = { id: 'x', title: '', keyPoints: [], done: false, binned: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const unknown = async () => ({ text: async () => '{"error":"Unknown action"}' });
  const answers = async (_u, init) => ({ text: async () => (JSON.parse(init.body).action === 'getTasks' ? '{"status":"success","tasks":[{"id":7,"title":"GST","done":"TRUE","keyPoints":"[\\"a\\"]","dueAt":"2026-10-05"},{"title":"no id"}]}' : '{"error":"Unknown action"}') });
  const pulled = await pullSheetEntries('https://x/exec', blank, { fetchImpl: answers });
  ck('pull returns usable rows only', pulled.ok && pulled.tasks.length === 1);
  ck('pull coerces string fields', pulled.tasks[0].id === '7' && pulled.tasks[0].done === true && pulled.tasks[0].keyPoints[0].value === 'a' && /^2026-10-0[45]/.test(pulled.tasks[0].dueAt));
  const none = await pullSheetEntries('https://x/exec', blank, { fetchImpl: unknown });
  ck('pull reports failure when no action returns a list', !none.ok && /did not hand back/.test(none.message));
  ck('a row without an id is skipped', normalizeSheetTask({ title: 'x' }, blank) === null);

  section('Cloud Sync: real-world sheet columns');
  const b2 = { ...blank, status: 'Pending', priority: 'Medium' };
  const row = normalizeSheetTask({ ID: 'a1', 'Task Name': 'Pay GST', Status: 'Completed', 'Due Date': '05/10/2026 17:30', Category: 'Domestic Payments', 'Assigned To': 'Self' }, b2);
  ck('status Completed marks the entry done', row.done === true && row.status === 'Completed');
  ck('differently named columns are recognised', row.title === 'Pay GST' && row.category === 'Domestic Payments' && row.pendingWith === 'Self');
  ck('dd/mm/yyyy reads day-first', new Date(row.dueAt).getMonth() === 9 && new Date(row.dueAt).getDate() === 5 && new Date(row.dueAt).getHours() === 17);
  ck('a pending row with a deadline stays open and dated', (() => { const r = normalizeSheetTask({ id: 2, status: 'Pending', deadline: '2026-10-09T10:00:00.000Z' }, b2); return !r.done && !!r.dueAt; })());
  ck('Excel serial dates parse', parseSheetDate(46300).startsWith('2026-'));
  ck('blank dates are null', parseSheetDate('') === null);
  const m = mergeSheetPull([{ id: '1', updatedAt: '2026-10-01T00:00:00.000Z', done: false }, { id: '2', updatedAt: '2026-10-03T00:00:00.000Z' }, { id: '9' }], [{ id: '1', done: true }, { id: '2', done: true }, { id: '3' }], new Date('2026-10-02T00:00:00.000Z').getTime());
  ck('sheet replaces unedited local copies', m.entries.find((e) => e.id === '1').done === true && m.replaced === 1);
  ck('a local edit after the last pull is kept', m.keptLocal === 1 && !m.entries.find((e) => e.id === '2').done);
  ck('new sheet rows are added and local-only rows kept', m.added === 1 && m.entries.length === 4);
  const ao = mergeSheetPull([{ id: '1', dueAt: '2026-09-19T00:00:00.000Z', status: 'In-Progress', src: 'cloud', updatedAt: '2026-09-10T00:00:00.000Z' }], [{ id: '1', dueAt: null, status: 'Not Yet Started', updatedAt: '2026-09-12T00:00:00.000Z' }, { id: '3' }], 0, [], { addOnly: true });
  ck('while Realtime Sync is on, the sheet only adds - it never replaces the web app\'s copy', ao.entries.find((e) => e.id === '1').status === 'In-Progress' && ao.entries.find((e) => e.id === '1').dueAt && ao.added === 1 && ao.replaced === 0);

  const wt = new Date(withTime(new Date(2026, 9, 5).toISOString(), '5:30 PM'));
  ck('a separate time column is applied to a midnight date', wt.getHours() === 17 && wt.getMinutes() === 30);
  ck('a time given as a day fraction works', new Date(withTime(new Date(2026, 9, 5).toISOString(), 0.75)).getHours() === 18);
  ck('a date that already has a time is left alone', withTime(new Date(2026, 9, 5, 9, 15).toISOString(), '17:00') === new Date(2026, 9, 5, 9, 15).toISOString());
  ck('a Due Time column feeds the entry', new Date(normalizeSheetTask({ id: 1, 'Due Date': '05/10/2026', 'Due Time': '14:45' }, blank).dueAt).getHours() === 14);

  const dd = normalizeSheetTask({ id: 1, 'Due Date': '05/10/2026', 'Due Time': '10:00', 'Deadline Date': '09/10/2026', 'Deadline Time': '16:30' }, blank);
  ck('due and deadline stay separate', new Date(dd.dueAt).getDate() === 5 && new Date(dd.deadlineAt).getDate() === 9 && new Date(dd.deadlineAt).getHours() === 16);
  const noDl = normalizeSheetTask({ id: 2, 'Due Date': '05/10/2026', 'Due Time': '10:00' }, blank);
  ck('a missing deadline stays empty, not copied from due', noDl.deadlineAt === null && !!noDl.dueAt);
  const onlyDl = normalizeSheetTask({ id: 3, Deadline: '09/10/2026' }, blank);
  ck('a sheet with only a deadline column still gets a due date', !!onlyDl.dueAt);

  ck('sheet recurrence text is normalised', normalizeSheetTask({ id: 1, Recurrence: 'Monthly' }, blank).recurrence === 'monthly' && normalizeSheetTask({ id: 2, Recurrence: "Doesn't repeat" }, blank).recurrence === 'none');

  section('Cloud Sync: edits on the phone survive later pulls');
  const sheetRow = (over = {}) => normalizeSheetTask({ id: 'r1', Title: 'Pay GST', Status: 'Not Yet Started', 'Due Date': '05/10/2026', ...over }, blank);
  const loaded = mergeSheetPull([], [sheetRow()], 0).entries;
  const second = mergeSheetPull(loaded, [sheetRow()], Date.now());
  ck('an untouched entry is simply refreshed from the sheet', second.replaced === 1 && second.keptLocal === 0);
  const edited = loaded.map((e) => ({ ...e, done: true, status: 'Completed' }));           // completed on the phone: updatedAt is not bumped by that
  const third = mergeSheetPull(edited, [sheetRow()], Date.now());
  ck('an entry completed on the phone is kept, even though updatedAt never changed', third.keptLocal === 1 && third.entries[0].done === true);
  const fourth = mergeSheetPull(third.entries, [sheetRow()], Date.now() + 1000);
  ck('and still kept on the pull after that (the old rule lost it here)', fourth.keptLocal === 1 && fourth.entries[0].done === true);
  ck('a sheet change on an untouched entry still arrives', mergeSheetPull(loaded, [sheetRow({ Status: 'In-Progress' })], Date.now()).entries[0].status === 'In-Progress');
  ck('the signature ignores bookkeeping fields', entrySig({ ...loaded[0], updatedAt: 'x', sheetSig: 'y' }) === loaded[0].sheetSig);
  ck('a bare ISO date is that day locally, so a Due Time can still be applied', (() => { const r = normalizeSheetTask({ id: 9, 'Due Date': '2026-10-05', 'Due Time': '17:30' }, blank); const d = new Date(r.dueAt); return d.getDate() === 5 && d.getHours() === 17 && d.getMinutes() === 30; })());
  const emptyFirst = async (_u, init) => ({ text: async () => (JSON.parse(init.body).action === 'getTasks' ? '{"status":"success","tasks":[]}' : '{"status":"success","tasks":[{"id":1,"title":"x"}]}') });
  ck('an empty first answer does not stop the search', (await pullSheetEntries('https://x/exec', blank, { fetchImpl: emptyFirst })).tasks.length === 1);
  const allEmpty = async () => ({ text: async () => '{"status":"success","tasks":[]}' });
  ck('if every action is empty the result is empty, not an error', (await pullSheetEntries('https://x/exec', blank, { fetchImpl: allEmpty })).ok === true);

  section('Cloud Sync: a sheet pull does not undo what Realtime Sync brought');
  const cloudCopy = { ...sheetRow({ Status: 'Completed' }), src: 'cloud', dar: true, sheetSig: undefined, updatedAt: '2026-10-03T10:00:00.000Z' };
  const olderSheet = sheetRow({ Status: 'Completed' });
  const keep = mergeSheetPull([cloudCopy], [{ ...olderSheet, updatedAt: '2026-10-01T10:00:00.000Z' }], Date.now());
  ck('an older sheet row does not replace the cloud copy (and its DAR mark)', keep.keptLocal === 1 && keep.entries[0].dar === true);
  const newer = mergeSheetPull([cloudCopy], [{ ...olderSheet, updatedAt: '2026-10-09T10:00:00.000Z' }], Date.now());
  ck('a strictly newer sheet row still arrives', newer.replaced === 1);
  const darCols = ['DAR', 'In DAR', 'DAR Marked', 'Include in DAR'].map((h) => normalizeSheetTask({ id: 1, [h]: 'Yes' }, blank).dar);
  ck('common ways of naming the DAR column are read', darCols.every(Boolean));
  ck('ticks and X count as marked; blanks and No do not', normalizeSheetTask({ id: 1, DAR: '✓' }, blank).dar === true && normalizeSheetTask({ id: 1, DAR: 'No' }, blank).dar === false && normalizeSheetTask({ id: 1, DAR: '' }, blank).dar === false);
  ck('a completed row without a completion column does not borrow its updated time', normalizeSheetTask({ id: 1, Status: 'Completed', 'Updated At': '2026-10-03T10:00:00Z' }, blank).completedAt === null);
  ck('a Completed On column is read as the completion time', !!normalizeSheetTask({ id: 1, Status: 'Completed', 'Completed On': '03/10/2026 16:12' }, blank).completedAt);
}

export async function runExtra({ ck, section }) {
  section('Cloud Sync: sheet serial dates are local time, and deleted entries stay deleted');
  const d = new Date(parseSheetDate(46298.375));      // 46298 = 2026-10-03, .375 of a day = 09:00
  ck('a serial date-time keeps its local wall-clock time', d.getFullYear() === 2026 && d.getMonth() === 9 && d.getDate() === 3 && d.getHours() === 9 && d.getMinutes() === 0);
  // A Realtime Sync document may carry Firestore Timestamps; read as text they gave no date at all.
  const ms = Date.UTC(2026, 9, 3, 7, 30);
  ck('a Firestore Timestamp (toMillis) is read', parseSheetDate({ toMillis: () => ms, seconds: ms / 1000, nanoseconds: 0 }) === new Date(ms).toISOString());
  ck('a plain { seconds, nanoseconds } is read', parseSheetDate({ seconds: ms / 1000, nanoseconds: 5e6 }) === new Date(ms + 5).toISOString());
  ck('a Date is read', parseSheetDate(new Date(ms)) === new Date(ms).toISOString());
  ck('any other object is no date', parseSheetDate({ foo: 1 }) === null);
  const webDoc = normalizeSheetTask({ id: 'w1', description: 'Pay vendor', dueDate: '2026-10-05', updatedAt: { toMillis: () => ms } }, { status: 'Pending', priority: 'Medium' });
  ck("a web document's Timestamp becomes its updatedAt", webDoc.updatedAt === new Date(ms).toISOString(), webDoc.updatedAt);
  // Realtime Sync: the phone's own write comes straight back as a snapshot. The web document has no
  // deadline and only the day it was logged, and reading it over the entry wiped the deadline.
  const mine = { id: 'd1', title: 'File GST', category: null, priority: 'High', status: 'Pending', pendingWith: null, reference: '', recurrence: 'none', recurrenceEveryMin: null,
    dueAt: new Date(2026, 9, 5, 10, 0).toISOString(), deadlineAt: new Date(2026, 9, 7, 18, 0).toISOString(), notes: '', keyPoints: [], dar: false, done: false, completedAt: null,
    binned: false, binnedAt: null, createdAt: new Date(2026, 9, 3, 14, 25).toISOString(), updatedAt: new Date(2026, 9, 3, 14, 30).toISOString() };
  const echo = JSON.parse(JSON.stringify(toWebTask(mine)));
  const back = fromWebDocOver(mine, echo, { status: 'Pending', priority: 'Medium' });
  const after = mergeRemoteEntries([mine], [back], []).entries[0];
  ck('the echo of a push keeps the deadline', after.deadlineAt === mine.deadlineAt, after.deadlineAt);
  ck('...and the time it was logged', after.createdAt === mine.createdAt, after.createdAt);
  ck('...and everything the web app does carry', after.title === 'File GST' && after.dueAt === mine.dueAt && after.priority === 'High');
  // A completed task keeps the moment it was completed on every device: the day alone reads as 12:00 AM.
  const finished = { ...mine, done: true, status: 'Completed', completedAt: new Date(2026, 9, 5, 13, 12).toISOString(), updatedAt: new Date(2026, 9, 5, 13, 12).toISOString() };
  const finishedDoc = JSON.parse(JSON.stringify(toWebTask(finished)));
  const finishedBack = fromWebDocOver(undefined, finishedDoc, { status: 'Pending', priority: 'Medium' });
  ck('the completion time travels in the document, not just the day', finishedDoc.completedDate === '2026-10-05' && finishedBack.completedAt === finished.completedAt, finishedBack.completedAt);
  const dayOnly = { ...finishedDoc }; delete dayOnly.completedAt;
  const dayOnlyBack = fromWebDocOver(finished, dayOnly, { status: 'Pending', priority: 'Medium' });
  ck('a document with only the day (the web app\'s own) leaves the time the phone has', dayOnlyBack.completedAt === finished.completedAt, dayOnlyBack.completedAt);
  const webDeadline = fromWebDocOver(mine, { ...echo, deadline: '2026-10-09' }, { status: 'Pending', priority: 'Medium' });
  ck("a deadline the web app does send still wins", new Date(webDeadline.deadlineAt).getDate() === 9);
  const fresh = fromWebDocOver(undefined, echo, { status: 'Pending', priority: 'Medium' });
  ck('a document new to the phone is read as it is', fresh && fresh.deadlineAt === null && fresh.title === 'File GST');
  const plain = new Date(parseSheetDate(46298));
  ck('a serial date alone is local midnight, so a Due Time cell can be applied', plain.getHours() === 0 && plain.getMinutes() === 0 && plain.getDate() === 3);
  const blank = { status: 'Not Yet Started', priority: 'Medium' };
  const withDueTime = normalizeSheetTask({ id: 7, 'Due Date': 46300, 'Due Time': '17:30' }, blank);
  ck('a serial due date takes the separate Due Time', new Date(withDueTime.dueAt).getHours() === 17 && new Date(withDueTime.dueAt).getMinutes() === 30);
  const purged = mergeSheetPull([{ id: 'keep', title: 'k' }], [{ id: 'gone', title: 'g' }, { id: 'new', title: 'n' }], 0, ['gone']);
  ck('an entry deleted forever on the phone is not re-added by a sheet pull', !purged.entries.some((e) => e.id === 'gone') && purged.entries.some((e) => e.id === 'new') && purged.added === 1);
  const cloud = { id: 'c', src: 'cloud', updatedAt: '2026-10-03T10:00:00.000Z', title: 'cloud' };
  const sheetNewer = { id: 'c', updatedAt: '2026-10-09T10:00:00.000Z', title: 'sheet' };
  const farFuturePull = new Date('2030-01-01T00:00:00Z').getTime();
  const longAgoPull = new Date('2020-01-01T00:00:00Z').getTime();
  ck('a strictly newer sheet row replaces a cloud copy whenever the last pull was',
    mergeSheetPull([cloud], [sheetNewer], longAgoPull).entries[0].title === 'sheet' && mergeSheetPull([cloud], [sheetNewer], farFuturePull).entries[0].title === 'sheet');

  section('Realtime Sync: the DAR mark is read under any field name');
  const b3 = { status: 'Not Yet Started', priority: 'Medium' };
  const darOf = (extra) => normalizeSheetTask({ id: 'x', description: 'Pay vendor', status: 'Completed', ...extra }, b3).dar;
  ck('dar: true', darOf({ dar: true }) === true);
  ck('a date-valued DAR field (darDate) counts', darOf({ darDate: '2026-10-03' }) === true);
  ck('a Firestore timestamp in a DAR field counts', darOf({ darAt: { seconds: 1790000000, nanoseconds: 0 } }) === true);
  ck('a completion type of "DAR" counts', darOf({ completionType: 'DAR' }) === true && darOf({ completedVia: 'dar' }) === true);
  ck('a plain completion is not DAR', darOf({ completionType: 'Done' }) === false && darOf({}) === false);
  ck('dar: false stays false', darOf({ dar: false, darDate: '2026-10-03' }) === false);
  ck('a "calendar" field is not mistaken for DAR', darOf({ calendarDay: '2026-10-03' }) === false);
  ck('nor darkMode, radar or standard', darOf({ darkMode: true }) === false && darOf({ radar: true }) === false && darOf({ standardLines: true }) === false);
  ck('markedForDar and darMarkedOn count', darOf({ markedForDar: 'yes' }) === true && darOf({ darMarkedOn: '03/10/2026' }) === true);
}
