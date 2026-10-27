/**
 * Pure bookkeeping for the Firestore realtime layer - ported from the web
 * app's `rt` object (mergeTasks/dirtyTasks/the ack map). Kept separate from
 * firebaseSync.js (the actual Firestore/Google Sign-In wiring, which isn't
 * unit-testable the same way) so every rule here is tested without a
 * network or a signed-in device.
 */

/**
 * Entries whose Firestore copy (per the ack map) is stale or missing - but
 * only ones this phone actually changed (`localEditAt`) or created itself.
 * A copy that came from the Google Sheet or an older build's merge can carry
 * a newer `updatedAt` than the web app's doc without being newer at all, and
 * pushing it overwrote the web app's due date, status and assignee with the
 * sheet's stale ones.
 */
export function dirtyEntries(entries = [], ack = {}) {
  return entries.filter((e) => e && e.id
    && (Number(e.localEditAt) > 0 || (!e.sheetSig && e.src !== 'cloud'))
    && ack[String(e.id)] !== (Number(e.updatedAt && new Date(e.updatedAt).getTime()) || 0));
}

const stamp = (e) => Number(e.updatedAt && new Date(e.updatedAt).getTime()) || 0;

/** New ack map after a push: every entry just written is marked up to date. */
export function ackAfterPush(ack = {}, sentEntries = []) {
  const next = { ...ack };
  sentEntries.forEach((e) => { next[String(e.id)] = stamp(e); });
  return next;
}

/** New ack map after a live snapshot arrives: a doc is "acked" once the local copy matches it exactly. */
export function ackAfterSnapshot(ack = {}, incomingDocs = [], localEntries = []) {
  const next = { ...ack };
  const byId = new Map(localEntries.map((e) => [String(e.id), e]));
  incomingDocs.forEach((d) => {
    if (!d || !d.id) return;
    const local = byId.get(String(d.id));
    if (local && stamp(local) === stamp(d)) next[String(d.id)] = stamp(d);
  });
  return next;
}

/**
 * Merges Firestore's incoming docs into the local entry list - a tombstoned
 * id is dropped, everything else is kept. The web app's doc wins unless this
 * phone edited the entry after it (`localEditAt`, set only by edits made
 * here). Comparing `updatedAt` alone let a stale copy from the Google Sheet,
 * whose stamp was newer than the doc's, beat the web app: the phone showed no
 * due date, the old status and the old assignee for the same entry. On an
 * equal stamp the cloud copy wins too, so web-only fields (the DAR mark) are
 * never lost.
 */
export function mergeRemoteEntries(localEntries = [], incomingDocs = [], tombstoneIds = []) {
  const tomb = new Set((tombstoneIds || []).map(String));
  const byId = new Map(localEntries.map((e) => [String(e.id), e]));
  let added = 0;
  let updated = 0;
  incomingDocs.forEach((d) => {
    if (!d || d.id === undefined || d.id === null || d.id === '') return;
    const key = String(d.id);
    if (tomb.has(key)) { byId.delete(key); return; }
    const local = byId.get(key);
    if (!local) { byId.set(key, d); added++; return; }
    if (!(Number(local.localEditAt) > stamp(d))) { byId.set(key, { ...local, ...d }); updated++; }
  });
  return { entries: [...byId.values()], added, updated };
}

/* ---------- field-level push (what changed since this phone last synced the entry) ---------- */

/** Where the per-account acknowledgement map and the per-entry field snapshot are kept. */
export const ackKey = (uid) => `MPT_RT_ACK_${uid}`;
export const snapKey = (uid) => `MPT_RT_SNAP_${uid}`;

// A short stable fingerprint of one field value (djb2 over its JSON), so the snapshot stays small.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v) || 'null';
}
function fieldHash(v) {
  const str = stable(v);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36) + str.length.toString(36);
}

// A missing field and an empty/false one are the same to the web app: neither counts as a change.
const NULLISH_KEYS = new Set(['deleted', 'purged', 'dateDeleted', 'completedAt', 'completedDate', 'snoozeUntil', 'snoozeCount', 'lastAckDate', 'deadlineAckDate', 'nextReminderAt']);
function normField(k, v) {
  if (v === undefined || v === null) return NULLISH_KEYS.has(k) ? 0 : null;
  if (NULLISH_KEYS.has(k) && (v === false || v === '' || v === 0)) return 0;
  return v;
}

/** { field: fingerprint } of a task document (the web app's field names) - what the server holds for it. */
export function docHashes(doc = {}) {
  const out = {};
  Object.keys(doc || {}).forEach((k) => { out[k] = fieldHash(normField(k, doc[k])); });
  return out;
}

/**
 * The fields of `fullDoc` to write: only those that differ from `prevHashes`, what this phone last sent or
 * received for the entry. `id` and `updatedAt` always go, and `purged` never does once the entry is known (a
 * phone that was offline must not undo a delete-forever, or a bin, made on the web app meanwhile). With no
 * snapshot (a new entry, or one first seen before snapshots existed) everything is sent, as before.
 */
export function diffWebDoc(fullDoc = {}, prevHashes = null) {
  if (!prevHashes || typeof prevHashes !== 'object') return fullDoc;
  const out = {};
  Object.keys(fullDoc).forEach((k) => {
    if (k === 'id' || k === 'updatedAt') { out[k] = fullDoc[k]; return; }
    if (k === 'purged') return;
    if (prevHashes[k] !== fieldHash(normField(k, fullDoc[k]))) out[k] = fullDoc[k];
  });
  return out;
}

/**
 * Field-wise merge of a web document that arrives over an entry this phone has an unsent edit on.
 * All three inputs are in the web app's field names: `localDoc` is the phone's entry as `toWebTask` writes it,
 * `incomingDoc` the document that arrived, `snapshotHashes` what the server held when the phone last saw it
 * (`docHashes`, MPT_RT_SNAP_<uid>). Per field: only the server changed -> the server's value; only the phone
 * changed -> the phone's; both changed to different values -> the one with the newer stamp (`localEditAt` against
 * `docStamp`; the phone wins a tie only if strictly newer, as in mergeRemoteEntries). `id` and `updatedAt` come from
 * the incoming document (the caller decides the stamp). A deleted-forever (`purged`) or binned (`deleted`) document
 * always wins whole. With no snapshot the old whole-entry rule applies: the phone's copy if its edit is newer than
 * the document, else the document laid over it.
 * Returns { doc, localFields } - the merged document and the fields where the phone's value was kept.
 * Pure. The listener (firebaseSync.js) reads the snapshot before it remembers the incoming document and hands the old
 * hashes on (`prevHashes`), so RealtimeSync can run this merge with what the phone last saw.
 */
export function mergeEntryFieldwise(localDoc = {}, incomingDoc = {}, snapshotHashes = null, localEditAt = 0, docStamp = 0) {
  const local = localDoc || {};
  const incoming = incomingDoc || {};
  if (incoming.purged === true || incoming.purged === 'true') return { doc: { ...incoming }, localFields: [] };
  const phoneNewer = Number(localEditAt) > Number(docStamp);
  if (!snapshotHashes || typeof snapshotHashes !== 'object') {
    return phoneNewer ? { doc: { ...local }, localFields: Object.keys(local) } : { doc: { ...local, ...incoming }, localFields: [] };
  }
  const serverWasDeleted = (v) => v === true || v === 'true';
  if (serverWasDeleted(incoming.deleted) && snapshotHashes.deleted !== fieldHash(normField('deleted', incoming.deleted))) {
    return { doc: { ...local, ...incoming }, localFields: [] };      // binned on the web app since the phone last saw it
  }
  const doc = {};
  const localFields = [];
  const keys = new Set([...Object.keys(local), ...Object.keys(incoming)]);
  keys.forEach((k) => {
    if (k === 'id' || k === 'updatedAt') { if (k in incoming) doc[k] = incoming[k]; else if (k in local) doc[k] = local[k]; return; }
    const was = k in snapshotHashes ? snapshotHashes[k] : fieldHash(normField(k, undefined));
    const hl = fieldHash(normField(k, local[k]));
    const hi = fieldHash(normField(k, incoming[k]));
    const serverChanged = hi !== was;
    const phoneChanged = k in local && hl !== was;       // a field the phone does not write at all (not in its document) is not a phone change
    let useLocal;
    if (!serverChanged) useLocal = true;               // the server still has what it had: the phone's value (changed or not)
    else if (!phoneChanged) useLocal = false;
    else useLocal = hl !== hi && phoneNewer;           // both changed: the same value either way, else the newer stamp
    const src = useLocal ? local : incoming;
    if (useLocal && hl !== hi) localFields.push(k);
    if (k in src) doc[k] = src[k];
  });
  return { doc, localFields };
}

/** Runs read-modify-write jobs for one key one after another, each on the freshly loaded value (no lost updates). */
export function createMutator(load, save) {
  const chains = new Map();
  return (key, fn) => {
    const run = (chains.get(key) || Promise.resolve()).then(async () => {
      const next = fn(await load(key));
      if (next !== undefined) await save(key, next);
      return next;
    });
    chains.set(key, run.catch(() => {}));
    return run;
  };
}

/** Rejects with `message` after `ms` unless `promise` settled first; the promise itself is left running (a queued offline write stays queued). */
export function raceTimeout(promise, ms, message = 'offline - will retry') {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Tool items (links, templates...) whose stamp here is newer than the last one sent or received. */
export function dirtyToolKeys(stamps = {}, sent = {}, keys = Object.keys(stamps || {})) {
  return keys.filter((k) => (Number(stamps && stamps[k]) || 0) > (Number(sent && sent[k]) || 0));
}

/** A removed/deleted Firestore doc id list applied as local deletions. */
export function applyRemovedIds(entries = [], removedIds = []) {
  if (!removedIds.length) return { entries, removed: 0 };
  const gone = new Set(removedIds.map(String));
  const kept = entries.filter((e) => !gone.has(String(e.id)));
  return { entries: kept, removed: entries.length - kept.length };
}

export const isMetaDirty = (localTs, ackTs) => (Number(localTs) || 0) > (Number(ackTs) || 0);

/* ---------- meta documents (lists, calendar) ---------- */

/**
 * Firestore cannot store an array inside an array, so the web app cannot keep
 * `lists` ([categories, priorities, statuses, assignees]) or `calendar`
 * ([holidays, leaveDays]) as nested arrays the way the phone holds them - and
 * the phone writing them like that failed every push ("Nested arrays are not
 * supported"). Whatever flat form the document actually holds is read here,
 * and remembered, so the phone writes back in that same form.
 *
 * Formats: 'json' (a JSON string), 'indexed' ({ "0": [...], "1": [...] }),
 * 'named' ({ categories: [...], ... } / { holidays: [...], leaveDays: [...] }).
 */
const LIST_NAMES = ['categories', 'priorities', 'statuses', 'assignees'];
const CAL_NAMES = ['holidays', 'leaveDays'];

function decodeMeta(v, names) {
  let value = v;
  let format = null;
  if (typeof v === 'string') {
    try { value = JSON.parse(v); } catch { return { value: null, format: null }; }
    format = 'json';
  }
  if (Array.isArray(value)) return { value, format: format || 'array' };
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
      return { value: keys.sort((a, b) => a - b).map((k) => value[k]), format: format || 'indexed' };
    }
    if (names.some((n) => n in value)) return { value: names.map((n) => value[n]), format: format ? 'json-named' : 'named' };
  }
  return { value: null, format: null };
}

function encodeMeta(parts, format, names) {
  switch (format) {
    case 'json': return JSON.stringify(parts);
    case 'json-named': return JSON.stringify(Object.fromEntries(names.map((n, i) => [n, parts[i] ?? []])));
    case 'indexed': return Object.fromEntries(parts.map((p, i) => [String(i), p ?? []]));
    case 'named': return Object.fromEntries(names.map((n, i) => [n, parts[i] ?? []]));
    default: return undefined;                // unknown (or nested arrays, which Firestore refuses): not written
  }
}

// The web app's lists document names the fourth list pendingWith; the phone calls it assignees.
const WEB_LIST_NAMES = ['categories', 'priorities', 'statuses', 'pendingWith'];
// The web app's payment lists, carried in the same document: read by the phone, never written back.
export const PAYMENT_LIST_KEYS = ['subCategories', 'subCategoryCategories', 'narrationTypes', 'reminderCategories', 'fileCategories', 'darPaymentIntro'];

/**
 * meta/lists `lists` field -> { lists: [categories, priorities, statuses, assignees] | null, format, extra }.
 * `extra` holds the web app's payment lists (Sub Categories and which categories carry one, Tally narration
 * types, the report's payment lines) that the document has.
 */
export function decodeLists(v) {
  let obj = v;
  if (typeof v === 'string') { try { obj = JSON.parse(v); } catch { obj = null; } }
  const extra = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    PAYMENT_LIST_KEYS.forEach((k) => { if (Array.isArray(obj[k])) extra[k] = obj[k]; });
    // Named by the web app (pendingWith), or by an older phone (assignees).
    if (WEB_LIST_NAMES.some((n) => n in obj) || 'assignees' in obj) {
      const named = { ...obj, pendingWith: Array.isArray(obj.pendingWith) ? obj.pendingWith : obj.assignees };
      const lists = WEB_LIST_NAMES.map((n) => (Array.isArray(named[n]) ? named[n] : undefined));
      return { lists, format: typeof v === 'string' ? 'json-named' : 'named', extra };
    }
  }
  const { value, format } = decodeMeta(v, LIST_NAMES);
  if (!value) return { lists: null, format: null, extra };
  return { lists: LIST_NAMES.map((_, i) => (Array.isArray(value[i]) ? value[i] : undefined)), format, extra };
}
/** Written in the web app's names, merged into its document, so its payment lists are left as they are. */
export const encodeLists = (lists, format, extra) => {
  const out = encodeMeta(lists, format, WEB_LIST_NAMES);
  if (!extra || !Object.keys(extra).length) return out;
  // The web app's payment lists ride in the same document (only the named formats can carry them).
  if (format === 'named') return { ...out, ...extra };
  if (format === 'json-named') return JSON.stringify({ ...JSON.parse(out), ...extra });
  return out;
};

/**
 * The lists to write: the web app's own (as last received) with the phone's
 * additions after them, case-insensitively. Never drops a value the web app
 * has, so a stale phone copy cannot overwrite its lists.
 */
export function mergeListsForPush(remote, local) {
  return LIST_NAMES.map((_, i) => {
    const out = [];
    const seen = new Set();
    for (const v of [...(Array.isArray(remote?.[i]) ? remote[i] : []), ...(Array.isArray(local?.[i]) ? local[i] : [])]) {
      const s = String(v ?? '').trim();
      if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
    }
    return out;
  });
}

/**
 * The lists to keep when the other side's lists arrive. Newest wins, so a deleted option stays deleted:
 * the device's own when it changed them after the arriving copy was written, else the arriving copy as it is.
 * An arriving copy with no time (an older writer) is joined with the device's, as before.
 */
export function listsOnReceive(remote, local, remoteTs, localTs) {
  const r = Number(remoteTs) || 0;
  if (!r) return mergeListsForPush(remote, local);
  return (Number(localTs) || 0) > r ? mergeListsForPush(local, []) : mergeListsForPush(remote, []);
}

/** meta/calendar `calendar` field -> { calendar: [holidays, leaveDays] | null, format }. */
export function decodeCalendar(v) {
  const { value, format } = decodeMeta(v, CAL_NAMES);
  if (!value) return { calendar: null, format: null };
  return { calendar: [value[0] ?? [], value[1] ?? []], format };
}

/*
 * The web app's "in use" note (users/<you>/meta/presence): { webActiveAt, lastInputAt } in ms, written about once
 * a minute while the web app is open, and webActiveAt 0 when it closes. It counts as in use while the note is
 * fresh (the web app is open and awake) AND someone used it recently - a web app left open on an empty desk does
 * not keep the phone quiet. "Recently" is 45 minutes. While it counts as in use the phone shows no alarm and no notification.
 */
export const WEB_HEARTBEAT_MS = 3 * 60000;
export const WEB_IDLE_MS = 45 * 60000;

/** Until when (ms) the web app counts as in use, from its note; 0 when it does not (closed, asleep, idle, unknown). */
export function webActiveUntil(presence, now = Date.now(), { heartbeatMs = WEB_HEARTBEAT_MS, idleMs = WEB_IDLE_MS } = {}) {
  const at = Number(presence?.webActiveAt) || 0;
  const input = Number(presence?.lastInputAt) || 0;
  if (!at || !input) return 0;
  // A clock far ahead on the computer must not keep the phone quiet for hours.
  const until = Math.min(at + heartbeatMs, input + idleMs, now + heartbeatMs);
  return until > now ? until : 0;
}
