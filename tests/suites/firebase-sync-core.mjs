import { dirtyEntries, ackAfterPush, ackAfterSnapshot, mergeRemoteEntries, applyRemovedIds, isMetaDirty, listsOnReceive } from '../../src/firebaseSyncCore.js';

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
}

export async function runExtra2({ ck, section }) {
  const { push, __setMetaFormats } = await import('../../src/firebaseSync.js');
  const { decodeLists, encodeLists, decodeCalendar, encodeCalendar } = await import('../../src/firebaseSyncCore.js');
  const { fromWebDoc, toWebTask, repairWebShapedEntries, mergeSheetPull } = await import('../../src/cloudSync.js');
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
  ck('a sheet row flagged purged removes the phone\'s copy', mergeSheetPull([a], [{ ...a, purged: true }], 0).entries.length === 0);

  section('Realtime Sync: lists and holidays are stored without nested arrays');
  const lists = [['MIS'], ['High', 'Low'], ['Pending'], ['Self']];
  ck('nested arrays are never written (Firestore refuses them)', encodeLists(lists, 'array') === undefined && encodeLists(lists, null) === undefined);
  ck('a JSON-string lists document round-trips', JSON.stringify(decodeLists(encodeLists(lists, 'json')).lists) === JSON.stringify(lists) && decodeLists(encodeLists(lists, 'json')).format === 'json');
  ck('an indexed map round-trips', JSON.stringify(decodeLists(encodeLists(lists, 'indexed')).lists) === JSON.stringify(lists));
  ck('a named map round-trips', JSON.stringify(decodeLists(encodeLists(lists, 'named')).lists) === JSON.stringify(lists) && decodeLists({ categories: ['A'] }).format === 'named');
  const cal = [[{ date: '2026-10-02', title: 'Gandhi Jayanti' }], ['2026-10-05']];
  ck('the calendar round-trips as JSON', JSON.stringify(decodeCalendar(encodeCalendar(cal, 'json')).calendar) === JSON.stringify(cal));
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
    ck('open but nobody used it for 15 minutes (left open on an empty desk): not in use', webActiveUntil({ webActiveAt: now - 30000, lastInputAt: now - 16 * min }, now) === 0);
    ck('used 14 minutes ago: in use until the 15 minutes run out', webActiveUntil({ webActiveAt: now - 30000, lastInputAt: now - 14 * min }, now) === now - 14 * min + WEB_IDLE_MS);
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
