import { dirtyEntries, ackAfterPush, ackAfterSnapshot, mergeRemoteEntries, applyRemovedIds, isMetaDirty, listsOnReceive, docHashes } from '../../src/firebaseSyncCore.js';

export async function run({ ck, section }) {
  const e = (id, updatedAt) => ({ id, title: `t${id}`, updatedAt });
  const t1 = new Date(2026, 9, 1, 10, 0).toISOString();
  const t2 = new Date(2026, 9, 1, 11, 0).toISOString();

  section('Firebase Sync Core: finding what needs to be pushed');
  const entries = [e('a', t1), e('b', t2)];
  ck('an entry never acked is dirty', dirtyEntries(entries, {}).length === 2);
  ck('an entry already acked at the same stamp is not dirty', dirtyEntries(entries, { a: new Date(t1).getTime(), b: new Date(t2).getTime() }).length === 0);
  ck('an entry edited after its ack is dirty again', dirtyEntries(entries, { a: new Date(t1).getTime() - 1000, b: new Date(t2).getTime() }).length === 1);

  section('Firebase Sync Core: updating the ack map after a push');
  const ack = ackAfterPush({}, [e('a', t1)]);
  ck('a pushed entry is acked at its own timestamp', ack.a === new Date(t1).getTime());
  ck('acking one entry leaves others alone', ackAfterPush({ z: 5 }, [e('a', t1)]).z === 5);

  section('Firebase Sync Core: updating the ack map after a live snapshot');
  const localMatch = [e('a', t1)];
  const ackFromSnap = ackAfterSnapshot({}, [e('a', t1)], localMatch);
  ck('a doc matching the local copy exactly is acked', ackFromSnap.a === new Date(t1).getTime());
  const ackFromStale = ackAfterSnapshot({}, [e('a', t1)], [e('a', t2)]); // local has since moved on
  ck('a doc that no longer matches the local copy is not acked', ackFromStale.a === undefined);

  section('Firebase Sync Core: merging incoming Firestore docs');
  const local = [e('a', t1), e('b', t1)];
  const r1 = mergeRemoteEntries(local, [e('c', t1)], []);
  ck('a new doc is added', r1.added === 1 && r1.entries.some((x) => x.id === 'c'));
  const r2 = mergeRemoteEntries(local, [e('a', t2)], []);
  ck('a newer remote copy updates the local one', r2.updated === 1 && r2.entries.find((x) => x.id === 'a').updatedAt === t2);
  const r3 = mergeRemoteEntries(local, [e('a', new Date(2026, 8, 1).toISOString())], []);
  ck('an older web doc replaces a copy the phone never edited (a stale sheet copy)', r3.updated === 1 && r3.entries.find((x) => x.id === 'a').updatedAt !== t1);
  const r3b = mergeRemoteEntries([{ ...e('a', t1), localEditAt: new Date(t1).getTime() }], [e('a', new Date(2026, 8, 1).toISOString())], []);
  ck('an older web doc never overwrites a newer edit made on the phone', r3b.updated === 0 && r3b.entries[0].updatedAt === t1);
  const r4 = mergeRemoteEntries(local, [e('b', t2)], ['b']);
  ck('a tombstoned id is dropped even if it arrives in the same batch', !r4.entries.some((x) => x.id === 'b'));

  section('Firebase Sync Core: applying removed ids');
  const removed = applyRemovedIds(local, ['a']);
  ck('a removed id is dropped locally', removed.removed === 1 && !removed.entries.some((x) => x.id === 'a'));
  ck('no removed ids is a no-op', applyRemovedIds(local, []).removed === 0);

  section('Firebase Sync Core: meta (lists/calendar) dirty check');
  ck('a newer local timestamp than its ack is dirty', isMetaDirty(100, 50));
  ck('an ack at or past the local timestamp is not dirty', !isMetaDirty(100, 100) && !isMetaDirty(100, 150));

  section('Firebase Sync Core: cloud wins ties (the DAR marks came from here)');
  const sameStamp = '2026-10-01T10:00:00.000Z';
  const sheetCopy = [{ id: 'z', title: 'Pay vendor', done: true, dar: false, updatedAt: sameStamp }];
  const cloudDoc = [{ id: 'z', title: 'Pay vendor', done: true, dar: true, updatedAt: sameStamp }];
  const tie = mergeRemoteEntries(sheetCopy, cloudDoc, []);
  ck('on an equal updatedAt the cloud copy (with its DAR mark) wins', tie.entries[0].dar === true);
  const newerLocal = mergeRemoteEntries([{ ...sheetCopy[0], dar: false, updatedAt: '2026-10-02T10:00:00.000Z', localEditAt: Date.parse('2026-10-02T10:00:00.000Z') }], cloudDoc, []);
  ck('a genuinely newer local edit is still kept', newerLocal.entries[0].dar === false);

  section('Firebase Sync Core: a stale sheet copy never beats the web app (due date lost)');
  const webDoc = [{ id: 's', title: 'Pending statement', dueAt: '2026-09-19T00:00:00.000Z', status: 'In-Progress', pendingWith: 'Rami Reddy', updatedAt: '2026-09-10T10:00:00.000Z', src: 'cloud' }];
  const staleSheet = [{ id: 's', title: 'Pending statement', dueAt: '', status: 'Not Yet Started', pendingWith: 'Self', updatedAt: '2026-09-12T10:00:00.000Z', sheetSig: 'x' }];
  const fixed = mergeRemoteEntries(staleSheet, webDoc, []).entries[0];
  ck('the web app\'s due date, status and assignee win over a newer-stamped sheet copy', fixed.dueAt === webDoc[0].dueAt && fixed.status === 'In-Progress' && fixed.pendingWith === 'Rami Reddy');
  ck('a sheet copy the phone never edited is never pushed over the web app', dirtyEntries(staleSheet, {}).length === 0);
  ck('a copy that came from the web app is never pushed back unedited', dirtyEntries([{ ...webDoc[0], updatedAt: '2026-09-11T10:00:00.000Z' }], {}).length === 0);
  ck('an entry edited on the phone is pushed', dirtyEntries([{ ...staleSheet[0], localEditAt: 1 }], {}).length === 1);
}

export async function runExtra({ ck, section }) {
  const { push, __setMetaFormats } = await import('../../src/firebaseSync.js');
  __setMetaFormats({ lists: 'json' }, [[], [], [], []]);
  const { __batches, __resetBatches } = await import('../stubs/firebase.mjs');
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;

  section('Firebase Sync: a big first push is split under Firestore\'s 500-write limit');
  __resetBatches();
  const stampAt = new Date(2026, 9, 1, 10, 0).toISOString();
  const many = Array.from({ length: 1234 }, (_, i) => ({ id: `e${i}`, title: `t${i}`, updatedAt: stampAt }));
  let failed = null;
  try { await push('u-chunk', { entries: many, deletedIds: Array.from({ length: 450 }, (_, i) => `d${i}`), lists: [['A']], listsUpdatedAt: 5 }); } catch (e) { failed = e; }
  const batches = __batches();
  ck('the push succeeds', !failed, failed && failed.message);
  ck('no batch is over 500 writes', batches.every((b) => b.length <= 500));
  ck('every entry, tombstone and the lists doc is written once', batches.flat().filter((o) => o.op === 'set' && o.path.includes('/tasks/')).length === 1234
    && batches.flat().filter((o) => o.op === 'delete').length === 450
    && batches.flat().filter((o) => o.path.endsWith('meta/lists')).length === 1);
  const ack = JSON.parse(await AsyncStorage.getItem('MPT_RT_ACK_u-chunk'));
  ck('every pushed entry is acked, so the next push sends nothing', Object.keys(ack).filter((k) => k.startsWith('e')).length === 1234 && ack.__lists === 5);
  __resetBatches();
  await push('u-chunk', { entries: many, lists: [['A']], listsUpdatedAt: 5 });
  ck('a second push with nothing changed writes nothing', __batches().length === 0);
  await runExtra2({ ck, section });
  await runExtra3({ ck, section });
}

export async function runExtra2({ ck, section }) {
  const { push, __setMetaFormats } = await import('../../src/firebaseSync.js');
  const { decodeLists, encodeLists, decodeCalendar } = await import('../../src/firebaseSyncCore.js');
  const { fromWebDoc, toWebTask, repairWebShapedEntries } = await import('../../src/cloudSync.js');
  const { blankEntry } = await import('../../src/workingDashboard.js');
  const { __batches, __resetBatches } = await import('../stubs/firebase.mjs');

  // Two task documents exactly as the web app holds them (from its Cloud Sync "what the script sent").
  const rawA = { id: '1788508739697', dateLogged: '2026-09-03', description: 'Cash Inflow & Outflow Statement', category: '', priority: 'Medium', status: 'Completed', pendingWith: 'Self', dueDate: '2026-09-03', dueTime: '08:42', mailChain: '', notes: '', recurrence: 'Daily', deleted: false, lastAckDate: '', snoozeUntil: 0, completedDate: '2026-09-02T18:30:00.000Z', emailId: '', updatedAt: 1789822824863, purged: false, seriesId: '', dateDeleted: null };
  const rawB = { id: '1788509398249', dateLogged: '2026-09-03', description: 'Post TDS Entries.', category: 'Monthly Activity', priority: 'High', status: 'In-Progress', pendingWith: 'Self', dueDate: '2026-10-04', dueTime: '11:23', mailChain: "NCD & OCD's", notes: '', recurrence: 'Monthly', deleted: false, lastAckDate: '', snoozeUntil: 0, completedDate: '', emailId: '', updatedAt: 1789121409894, purged: false, seriesId: '' };

  section('Realtime Sync: the web app\'s task documents are read in its own field names');
  const a = fromWebDoc(rawA, blankEntry());
  const b = fromWebDoc(rawB, blankEntry());
  const dueB = new Date(b.dueAt);
  ck('description becomes the title', a.title === 'Cash Inflow & Outflow Statement' && b.title === 'Post TDS Entries.');
  ck('dueDate + dueTime become the due time (local)', dueB.getDate() === 4 && dueB.getMonth() === 9 && dueB.getHours() === 11 && dueB.getMinutes() === 23);
  ck('status "Completed" is done, anything else open', a.done === true && b.done === false && !a.binned && !b.binned);
  ck('mailChain becomes the reference, dateLogged the logged date', b.reference === "NCD & OCD's" && new Date(b.createdAt).getDate() === 3);
  ck('repeats are read', a.recurrence === 'daily' && b.recurrence === 'monthly');
  ck('the last-changed time is kept, so nothing is re-sent', new Date(a.updatedAt).getTime() === rawA.updatedAt);
  ck('a document flagged purged is marked so it is dropped', fromWebDoc({ ...rawB, purged: true }, blankEntry()).purged === true);

  section('Realtime Sync: an entry is written back in the web app\'s field names');
  const backB = toWebTask(b);
  ck('round trip keeps the web app\'s fields', backB.description === rawB.description && backB.dueDate === rawB.dueDate && backB.dueTime === rawB.dueTime && backB.mailChain === rawB.mailChain && backB.status === rawB.status && backB.recurrence === 'Monthly' && backB.deleted === false && backB.dateLogged === '2026-09-03' && backB.updatedAt === rawB.updatedAt);
  ck('no phone-only field names are written', !('title' in backB) && !('dueAt' in backB) && !('done' in backB));
  const completed = toWebTask({ ...b, done: true, completedAt: '2026-10-04T06:00:00.000Z' });
  ck('completing on the phone is "Completed" on the web app, dated as it dates them (its report matches the day)', completed.status === 'Completed' && completed.completedDate === '2026-10-04');
  ck('reopening drops "Completed"', toWebTask({ ...a, done: false }).status === 'Pending');
  ck('a repeat changed on the phone is written in the web app\'s spelling', toWebTask({ ...b, recurrence: 'weekly' }).recurrence === 'Weekly' && toWebTask({ ...b, recurrence: 'none' }).recurrence === "Doesn't repeat");

  section('Realtime Sync: entries stored raw by the older version are repaired');
  const brokenA = { ...blankEntry(), ...rawA, id: String(rawA.id), src: 'cloud' };
  const brokenB = { ...blankEntry(), ...rawB, id: String(rawB.id), src: 'cloud', done: true, completedAt: '2026-10-04T05:00:00.000Z', updatedAt: '2026-10-04T05:00:00.000Z' };
  const mine = { ...blankEntry(), id: 'phone-1', title: 'Made on the phone' };
  const repaired = repairWebShapedEntries([brokenA, brokenB, mine], blankEntry());
  const rA = repaired.find((x) => x.id === rawA.id); const rB = repaired.find((x) => x.id === rawB.id);
  ck('titles, due dates and completion come back', rA.title === rawA.description && rA.dueAt && rA.done === true && rB.title === rawB.description && !!rB.dueAt);
  ck('a completion made on the phone since is kept', rB.done === true && rB.completedAt === '2026-10-04T05:00:00.000Z' && rB.updatedAt === '2026-10-04T05:00:00.000Z');
  ck('the web app\'s raw field names are cleared out', !('description' in rA) && !('dueDate' in rA) && !('mailChain' in rB));
  ck('the last-changed time is untouched (nothing pushed because of the repair)', rA.updatedAt === rawA.updatedAt);
  ck('entries made on the phone are left alone', repaired.find((x) => x.id === 'phone-1') === mine);
  ck('repairing again changes nothing', repairWebShapedEntries(repaired, blankEntry()) === repaired);
  ck('a purged raw entry is removed', !repairWebShapedEntries([{ ...brokenA, purged: true }], blankEntry()).length);

  section('Realtime Sync: lists and holidays are stored without nested arrays');
  const lists = [['MIS'], ['High', 'Low'], ['Pending'], ['Self']];
  ck('nested arrays are never written (Firestore refuses them)', encodeLists(lists, 'array') === undefined && encodeLists(lists, null) === undefined);
  ck('a JSON-string lists document round-trips', JSON.stringify(decodeLists(encodeLists(lists, 'json')).lists) === JSON.stringify(lists) && decodeLists(encodeLists(lists, 'json')).format === 'json');
  ck('an indexed map round-trips', JSON.stringify(decodeLists(encodeLists(lists, 'indexed')).lists) === JSON.stringify(lists));
  ck('a named map round-trips', JSON.stringify(decodeLists(encodeLists(lists, 'named')).lists) === JSON.stringify(lists) && decodeLists({ categories: ['A'] }).format === 'named');
  const cal = [[{ date: '2026-10-02', title: 'Gandhi Jayanti' }], ['2026-10-05']];
  ck('a named calendar map is read', decodeCalendar({ holidays: cal[0], leaveDays: cal[1] }).calendar[1][0] === '2026-10-05');

  section('Realtime Sync: a push writes the web app\'s shape and never a nested array');
  __resetBatches();
  __setMetaFormats({ lists: null }, null);
  const edited = { ...b, title: 'Post TDS Entries (Oct)', updatedAt: new Date(rawB.updatedAt + 60000).toISOString(), localEditAt: rawB.updatedAt + 60000 };
  await push('u-shape', { entries: [edited], lists, listsUpdatedAt: 9 });
  let ops = __batches().flat();
  const written = ops.find((o) => o.path.endsWith(`/tasks/${rawB.id}`));
  ck('the task is written with description, merged into the web app\'s document', written && written.data.description === 'Post TDS Entries (Oct)' && written.opts && written.opts.merge === true);
  ck('lists wait until the web app\'s lists have been read', !ops.some((o) => o.path.includes('/meta/')));
  __resetBatches();
  __setMetaFormats({ lists: 'json' }, [['GST', 'MIS'], ['High'], ['Pending'], ['Self', 'Bank']]);
  await push('u-shape', { entries: [edited], lists, listsUpdatedAt: 9 });
  ops = __batches().flat();
  const listsDoc = ops.find((o) => o.path.endsWith('meta/lists'));
  const sent = listsDoc && JSON.parse(listsDoc.data.lists);
  ck('then they are written in that format', listsDoc && typeof listsDoc.data.lists === 'string');
  ck('and as they are on this device, so an option deleted here (GST, Bank) is deleted there too', sent && sent[0].join() === 'MIS' && sent[1].join() === 'High,Low' && sent[3].join() === 'Self');
  ck('holidays are never written back', !ops.some((o) => o.path.endsWith('meta/calendar')));
  const nested = (v) => Array.isArray(v) ? v.some((x) => Array.isArray(x) || nested(x)) : (v && typeof v === 'object' ? Object.values(v).some(nested) : false);
  ck('nothing written contains an array inside an array', !ops.some((o) => nested(o.data)));

  {
    section('Phone rings only when the web app is not in use');
    const { webActiveUntil, WEB_HEARTBEAT_MS, WEB_IDLE_MS } = await import('../../src/firebaseSyncCore.js');
    const now = Date.UTC(2026, 9, 5, 10, 0);
    const min = 60000;
    ck('web app open, note a minute old, used 2 minutes ago: in use for about 2 more minutes', webActiveUntil({ webActiveAt: now - min, lastInputAt: now - 2 * min }, now) === now - min + WEB_HEARTBEAT_MS);
    ck('note older than 3 minutes (closed, asleep, offline): not in use - the phone rings', webActiveUntil({ webActiveAt: now - 4 * min, lastInputAt: now - 4 * min }, now) === 0);
    ck('open but nobody used it for 45 minutes (left open on an empty desk): not in use', webActiveUntil({ webActiveAt: now - 30000, lastInputAt: now - 46 * min }, now) === 0);
    ck('used 44 minutes ago: in use until the 45 minutes run out', webActiveUntil({ webActiveAt: now - 30000, lastInputAt: now - 44 * min }, now) === now - 44 * min + WEB_IDLE_MS);
    ck('the idle time can be set: 12 minutes since the last input is idle with a 10 minute limit', webActiveUntil({ webActiveAt: now - 30000, lastInputAt: now - 12 * 60000 }, now, { idleMs: 10 * 60000 }) === 0 && webActiveUntil({ webActiveAt: now - 30000, lastInputAt: now - 12 * 60000 }, now, { idleMs: 30 * 60000 }) > now);
    ck('closed (webActiveAt 0), or no note at all: not in use', webActiveUntil({ webActiveAt: 0, lastInputAt: now }, now) === 0 && webActiveUntil(null, now) === 0);
    ck('a computer clock far ahead cannot keep the phone quiet for long', webActiveUntil({ webActiveAt: now + 60 * min, lastInputAt: now + 60 * min }, now) === now + WEB_HEARTBEAT_MS);
  }

  section('Realtime Sync: lists, newest wins (a deleted option stays deleted)');
  const remoteL = [['Payments', 'MIS', 'Audit'], ['High'], ['Pending'], ['Self']];
  const localL = [['Payments', 'Audit', 'Query'], ['High'], ['Pending'], ['Self']];
  ck('deleted and added here after the web copy: this device\'s lists kept',
    JSON.stringify(listsOnReceive(remoteL, localL, 100, 200)[0]) === '["Payments","Audit","Query"]');
  ck('changed on the web after this device: the web copy as it is (its deletes apply too)',
    JSON.stringify(listsOnReceive(remoteL, localL, 300, 200)[0]) === '["Payments","MIS","Audit"]');
  ck('the echo of this device\'s own push changes nothing', JSON.stringify(listsOnReceive(localL, localL, 200, 200)) === JSON.stringify(localL));
  ck('a copy with no time is joined, as before', listsOnReceive(remoteL, localL, 0, 200)[0].length === 4);
}

/* Sync / data hardening round: field-level push, serialised bookkeeping, timeouts, account switch, damaged copies. */
export async function runExtra3({ ck, section }) {
  const core = await import('../../src/firebaseSyncCore.js');
  const { docHashes, diffWebDoc, createMutator, raceTimeout, dirtyToolKeys } = core;
  const { push, __setMetaFormats } = await import('../../src/firebaseSync.js');
  const { toWebTask } = await import('../../src/cloudSync.js');
  const { __batches, __resetBatches } = await import('../stubs/firebase.mjs');
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  section('Field-level push: only what changed since the last sync is written');
  const doc0 = { id: 'x1', description: 'Pay vendor', dueDate: '2026-10-05', status: 'Pending', deleted: false, purged: false, dateDeleted: null, updatedAt: 100, keyPoints: [{ key: 'a', value: 'b' }] };
  ck('an entry with no snapshot sends everything', diffWebDoc(doc0, null) === doc0);
  const snap0 = docHashes(doc0);
  const only = diffWebDoc({ ...doc0, description: 'Pay vendor (Oct)', updatedAt: 200 }, snap0);
  ck('only the changed field, plus id and updatedAt', Object.keys(only).sort().join() === 'description,id,updatedAt' && only.updatedAt === 200);
  ck('purged is never sent for a known entry', !('purged' in diffWebDoc({ ...doc0, purged: false, description: 'x' }, snap0)));
  ck('a bin made here is sent', diffWebDoc({ ...doc0, deleted: true, dateDeleted: 'now' }, snap0).deleted === true);
  ck('an unchanged "deleted" is not sent (a web-side bin is not undone)', !('deleted' in diffWebDoc({ ...doc0, description: 'y' }, docHashes({ ...doc0, deleted: undefined, purged: undefined }))));
  ck('key order inside a field does not count as a change', !('keyPoints' in diffWebDoc({ ...doc0, keyPoints: [{ value: 'b', key: 'a' }], description: 'z' }, snap0)));

  section('Field-level push: a stale phone does not put old values back on the web app');
  __setMetaFormats({ lists: 'json' }, [[], [], [], []]);
  const e1 = { id: 'fp1', title: 'Pay vendor', dueAt: new Date(2026, 9, 5, 10, 0).toISOString(), status: 'Pending', createdAt: new Date(2026, 9, 1).toISOString(), updatedAt: new Date(2026, 9, 1, 9).toISOString() };
  __resetBatches();
  await push('u-fp', { entries: [e1] });
  let w = __batches().flat().find((o) => o.path.endsWith('/tasks/fp1'));
  ck('a new entry is written whole', w && w.data.description === 'Pay vendor' && w.data.dueDate === '2026-10-05' && w.data.purged === false);
  __resetBatches();
  const e2 = { ...e1, title: 'Pay vendor (Oct)', updatedAt: new Date(2026, 9, 2, 9).toISOString(), localEditAt: Date.now() };
  await push('u-fp', { entries: [e2] });
  w = __batches().flat().find((o) => o.path.endsWith('/tasks/fp1'));
  ck('an edit sends only the changed field and the stamp - not the due date, status, deleted or purged',
    w && w.data.description === 'Pay vendor (Oct)' && w.data.updatedAt && !('dueDate' in w.data) && !('status' in w.data) && !('purged' in w.data) && !('deleted' in w.data), JSON.stringify(w && w.data));
  __resetBatches();
  const e3 = { ...e2, dueAt: new Date(2026, 9, 9, 10, 0).toISOString(), updatedAt: new Date(2026, 9, 3, 9).toISOString() };
  await push('u-fp', { entries: [e3] });
  w = __batches().flat().find((o) => o.path.endsWith('/tasks/fp1'));
  ck('a due date changed here is sent', w && w.data.dueDate === '2026-10-09' && !('description' in w.data));

  section('Serialised bookkeeping: concurrent read-modify-write jobs do not erase each other');
  let store = {};
  const mutate = createMutator(async () => ({ ...store }), async (_k, v) => { await wait(2); store = v; });
  await Promise.all([mutate('k', (a) => ({ ...a, one: 1 })), mutate('k', (a) => ({ ...a, two: 2 })), mutate('k', (a) => ({ ...a, __lists: 7 }))]);
  ck('every writer\'s change is kept', store.one === 1 && store.two === 2 && store.__lists === 7, JSON.stringify(store));
  const failing = createMutator(async () => ({}), async () => {});
  await failing('k', () => { throw new Error('boom'); }).catch(() => {});
  ck('a failed job does not block the next', (await failing('k', () => ({ ok: 1 }))).ok === 1);

  section('Writes that never settle offline report "offline - will retry"');
  let err = null;
  await raceTimeout(new Promise(() => {}), 20).catch((e) => { err = e; });
  ck('a hung commit is reported after the timeout', err && /offline - will retry/.test(err.message));
  ck('a prompt one passes through', (await raceTimeout(Promise.resolve(5), 50)) === 5);

  section('Tools: per-item stamps decide what is sent');
  ck('only items newer here than last sent go', dirtyToolKeys({ links: 5, templates: 3, holdUntil: 0 }, { links: 5, templates: 1 }).join() === 'templates');
  ck('a newer local item stays pending even when a different one arrived later', dirtyToolKeys({ links: 9, templates: 3 }, { templates: 3 }).join() === 'links');

  section('Switching accounts keeps the old account\'s unsent work');
  const acct = await import('../../src/account.js');
  const mem = {};
  const storage = { getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; }, removeItem: async (k) => { delete mem[k]; } };
  const wdA = { accountUid: 'A', accountEmail: 'a@x.com', entries: [{ id: 'a1', title: 'sent', updatedAt: new Date(2026, 9, 1).toISOString() }, { id: 'a2', title: 'unsent', localEditAt: 5, updatedAt: new Date(2026, 9, 2).toISOString() }], deletedIds: ['gone'] };
  mem['MPT_RT_ACK_A'] = JSON.stringify({ a1: new Date(2026, 9, 1).getTime() });
  ck('nothing unsent: nothing kept', acct.unsyncedSnapshot({ accountUid: 'A', entries: [wdA.entries[0]] }, { a1: new Date(2026, 9, 1).getTime() }) === null);
  ck('the unsent entry and deletion are picked out', (() => { const sn = acct.unsyncedSnapshot(wdA, JSON.parse(mem['MPT_RT_ACK_A'])); return sn && sn.entries.length === 1 && sn.entries[0].id === 'a2' && sn.deletedIds[0] === 'gone'; })());
  ck('they are saved under MPT_UNSYNCED_A before the wipe', (await acct.saveUnsyncedBackup(wdA, { storage, flush: false })) === true && !!mem['MPT_UNSYNCED_A']);
  const wiped = acct.forAccount(wdA, 'B', 'b@x.com');
  ck('the wipe still happens for B', wiped.entries.length === 0 && wiped.accountUid === 'B');
  const back = await acct.takeUnsyncedBackup('A', { storage });
  ck('A gets the work back when A signs in again', back && back.entries[0].id === 'a2' && !mem['MPT_UNSYNCED_A']);
  const restored = acct.mergeUnsynced(acct.forAccount(wiped, 'A', 'a@x.com'), back);
  ck('...merged into the account, deletion queued again', restored.entries.some((x) => x.id === 'a2') && restored.deletedIds.includes('gone'));
  ck('no backup: the data is untouched', acct.mergeUnsynced(wiped, null) === wiped);

  section('Damaged stored values are copied once, and a migration never overwrites them');
  const sc = await import('../../src/storeCore.js');
  const first = sc.corruptCopyPlan([['MPT_X', '{bad']], {}, 1);
  ck('the first launch writes a copy', first.writes.length === 1 && first.writes[0][0] === 'MPT_CORRUPT_MPT_X_1');
  ck('the next launch, same damage: no new copy', sc.corruptCopyPlan([['MPT_X', '{bad']], first.seen, 2).writes.length === 0);
  let seen = first.seen; let dropped = [];
  for (let i = 2; i <= 6; i++) { const p = sc.corruptCopyPlan([['MPT_X', '{bad' + i]], seen, i); seen = p.seen; dropped = dropped.concat(p.drop); }
  ck('at most 3 copies kept, the oldest dropped', seen.MPT_X.copies.length === 3 && dropped.length === 3 && dropped[0] === 'MPT_CORRUPT_MPT_X_1');

  section('Gmail: bad entities / bytes do not throw; requests time out and run 5 at a time');
  const gm = await import('../../src/gmailApi.js');
  let threw = false; let txt = '';
  try { txt = gm.decodeEntities('a &#99999999999; b &#55357; c &#65; d'); } catch { threw = true; }
  ck('an out-of-range entity is left alone, the rest decodes', !threw && txt.includes('&#99999999999;') && txt.endsWith('A d'), txt);
  threw = false;
  try { gm.decodeBase64Url('8P__vw'); gm.decodeBase64Url('_____'); } catch { threw = true; }
  ck('invalid UTF-8 / base64 does not throw', !threw);
  let live = 0; let peak = 0;
  const fetchImpl = async (url) => {
    live++; peak = Math.max(peak, live); await wait(5); live--;
    if (url.includes('/messages?')) return { ok: true, status: 200, json: async () => ({ messages: Array.from({ length: 20 }, (_, i) => ({ id: `m${i}` })) }) };
    return { ok: true, status: 200, json: async () => ({ id: url, payload: { headers: [] }, snippet: '' }) };
  };
  const listed = await gm.listUnread('tok', { fetchImpl });
  ck('20 mails are read, never more than 5 requests at once', listed.length === 20 && peak <= 5, `peak ${peak}`);
  let slowErr = null;
  await gm.listUnread('tok', { fetchImpl: () => new Promise(() => {}), timeoutMs: 30 }).catch((e) => { slowErr = e; });
  ck('a request that never answers fails with a clear message', slowErr && /too long/.test(slowErr.message));

  section('Storage: every sync key and recovery copy is listed');
  const sc2 = await import('../../src/storeCore.js');
  const keys2 = ['MPT_DB_V1', 'MPT_RT_ACK_u1', 'MPT_RT_SNAP_u1', 'MPT_UNSYNCED_u1', 'MPT_CORRUPT_SEEN', 'MPT_CORRUPT_MPT_X_5', 'MPT_OTHER'];
  const all2 = sc2.syncStateKeys(keys2);
  ck('every sync key and recovery copy is listed', all2.length === 5 && !all2.includes('MPT_OTHER') && !all2.includes('MPT_DB_V1'));

  section('Storage: recovery copies are capped at 3 per key, one per distinct damage');
  const cp = sc2.corruptCopyPlan;
  let seenC2 = {}; let wr = 0; let dr = [];
  for (let i = 1; i <= 8; i++) { const p = cp([['MPT_X', 'bad' + i]], seenC2, i); seenC2 = p.seen; wr += p.writes.length; dr = dr.concat(p.drop); }
  ck('8 different damages: 8 writes, only the newest 3 remain', wr === 8 && seenC2.MPT_X.copies.length === 3 && dr.length === 5 && seenC2.MPT_X.copies[2] === 'MPT_CORRUPT_MPT_X_8');
  const again = cp([['MPT_X', 'bad8']], seenC2, 9);
  ck('the same damage again writes nothing and drops nothing', !again.writes.length && !again.drop.length);
  const two = cp([['MPT_X', 'bad9'], ['MPT_Y', 'oops']], seenC2, 10);
  ck('each key has its own cap', two.writes.length === 2 && two.seen.MPT_Y.copies.length === 1 && two.seen.MPT_X.copies.length === 3);
  const old2 = ['MPT_CORRUPT_MPT_X_1', 'MPT_CORRUPT_MPT_X_2', 'MPT_CORRUPT_MPT_X_3', 'MPT_CORRUPT_MPT_X_4', 'MPT_CORRUPT_MPT_XY_9', 'MPT_CORRUPT_MPT_Z_1'];
  const pruned = cp([['MPT_X', 'bad']], {}, 99, 3, old2);
  ck('copies from a previous app version (no ledger) are pruned, oldest first', pruned.drop.join() === 'MPT_CORRUPT_MPT_X_1,MPT_CORRUPT_MPT_X_2' && pruned.seen.MPT_X.copies.join() === 'MPT_CORRUPT_MPT_X_3,MPT_CORRUPT_MPT_X_4,MPT_CORRUPT_MPT_X_99');
  const prunedSame = cp([['MPT_X', 'bad']], pruned.seen, 100, 3, [...old2.slice(2, 4), 'MPT_CORRUPT_MPT_X_99']);
  ck('a later launch with the same damage leaves it at 3', !prunedSame.writes.length && !prunedSame.drop.length);
}
