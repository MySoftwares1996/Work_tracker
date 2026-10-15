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
export const PAYMENT_LIST_KEYS = ['subCategories', 'subCategoryCategories', 'narrationTypes', 'darPaymentIntro'];

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
export const encodeLists = (lists, format) => encodeMeta(lists, format, WEB_LIST_NAMES);

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
export const encodeCalendar = (calendar, format) => encodeMeta(calendar, format, CAL_NAMES);


/*
 * The web app's "in use" note (users/<you>/meta/presence): { webActiveAt, lastInputAt } in ms, written about once
 * a minute while the web app is open, and webActiveAt 0 when it closes. It counts as in use while the note is
 * fresh (the web app is open and awake) AND someone used it recently - a web app left open on an empty desk does
 * not keep the phone quiet.
 */
export const WEB_HEARTBEAT_MS = 3 * 60000;
export const WEB_IDLE_MS = 15 * 60000;

/** Until when (ms) the web app counts as in use, from its note; 0 when it does not (closed, asleep, idle, unknown). */
export function webActiveUntil(presence, now = Date.now(), { heartbeatMs = WEB_HEARTBEAT_MS, idleMs = WEB_IDLE_MS } = {}) {
  const at = Number(presence?.webActiveAt) || 0;
  const input = Number(presence?.lastInputAt) || 0;
  if (!at || !input) return 0;
  // A clock far ahead on the computer must not keep the phone quiet for hours.
  const until = Math.min(at + heartbeatMs, input + idleMs, now + heartbeatMs);
  return until > now ? until : 0;
}
