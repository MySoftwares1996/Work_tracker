import { normalizeKeyPoints } from './workingDashboardPayments';

/**
 * Converters between the phone's entries and the web app's task documents (Firestore, users/{uid}/tasks), used by
 * Realtime Sync (firebaseSync*.js, RealtimeSync.js). Pure, so they are testable without a network.
 * (The name is from the Google Sheet days: the readers below still accept sheet-style column names.)
 */

const asBool = (v) => v === true || v === 1 || /^(true|yes|y|1|x|✓|✔|☑|checked|dar|included|marked)$/i.test(String(v || '').trim());
const EPOCH = '1970-01-01T00:00:00.000Z';

/** ISO string from an ISO/Date value, a dd/mm/yyyy[ hh:mm] string, or an Excel serial number; null if blank/unreadable. */
export function parseSheetDate(v) {
  if (v === null || v === undefined || v === '') return null;
  let d;
  if (typeof v === 'object') {
    // A Firestore Timestamp (a Realtime Sync document can carry one) or a Date. Read as text, a
    // Timestamp gave no date at all, so the document fell back to its creation time and a newer
    // edit made on the web app never replaced the phone's copy.
    if (v instanceof Date) d = v;
    else if (typeof v.toMillis === 'function') d = new Date(v.toMillis());
    else if (Number.isFinite(v.seconds)) d = new Date(v.seconds * 1000 + Math.round((Number(v.nanoseconds) || 0) / 1e6));
    else return null;
  } else if (typeof v === 'number') {
    if (v > 20000 && v < 80000) {
      // A sheet serial (days since 30 Dec 1899, the fraction being the time of day) is a local
      // wall-clock value: reading it as UTC put every date at 5:30 am in India, and a separate
      // Due Time cell was then ignored because the date "already had a time".
      const whole = Math.floor(v);
      d = new Date(1899, 11, 30 + whole, 0, Math.round((v - whole) * 1440));
    } else d = new Date(v);
  } else {
    const str = String(v).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);        // a bare date is that day locally, not midnight UTC (which is 5:30 am in India)
    const m = iso ? null : /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i.exec(str);
    if (iso) d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    else if (m) {
      let h = Number(m[4] || 0);
      if (m[7] && /pm/i.test(m[7]) && h < 12) h += 12;
      if (m[7] && /am/i.test(m[7]) && h === 12) h = 0;
      d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), h, Number(m[5] || 0), Number(m[6] || 0));
    } else d = new Date(str);
  }
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Applies a separate time-of-day cell ("17:30", "5:30 PM", a 0-1 day fraction) to a date that came in at midnight. */
export function withTime(iso, timeCell) {
  if (!iso || timeCell === undefined || timeCell === null || timeCell === '') return iso;
  const d = new Date(iso);
  if (d.getHours() !== 0 || d.getMinutes() !== 0) return iso; // the date cell already carried a time
  let h; let m;
  if (typeof timeCell === 'number' && timeCell >= 0 && timeCell < 1) {
    const mins = Math.round(timeCell * 1440); h = Math.floor(mins / 60); m = mins % 60;
  } else {
    const t = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(String(timeCell).trim());
    if (!t) return iso;
    h = Number(t[1]); m = Number(t[2]);
    if (t[3] && /pm/i.test(t[3]) && h < 12) h += 12;
    if (t[3] && /am/i.test(t[3]) && h === 12) h = 0;
  }
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const KNOWN_RECURRENCE = ['hourly', 'custom', 'daily', 'weekdays', 'weekly', 'monthly'];
/** The sheet may say "Monthly", "monthly" or "Doesn't repeat"; only the known repeats survive, as lowercase keys. */
const sheetRecurrence = (v) => {
  const k = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  return KNOWN_RECURRENCE.includes(k) ? k : 'none';
};

const squash = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const DONE_STATUS = /^(completed|complete|done|closed|resolved|finished)$/i;
const DEADLINE_KEYS = ['deadlineat', 'deadline', 'deadlinedate', 'deadlinedatetime'];

const DAR_KEYS = ['dar', 'isdar', 'indar', 'darmarked', 'markedfordar', 'includeindar', 'includedindar', 'darflag', 'darstatus', 'dartick', 'reportdar', 'dailyactivityreport'];
// Fields that say HOW an entry was completed - a value of "DAR" there is the DAR mark.
const COMPLETION_KIND_KEYS = ['completiontype', 'completedvia', 'completedas', 'completedwith', 'donetype', 'donevia', 'doneas', 'closetype', 'completionmode', 'completemode', 'donemode', 'reporttype'];

/**
 * The DAR mark, under whichever name the document uses. The phone knew a fixed list of names; a
 * mark stored under any other (darDate, darAt, markedDar...) read as "not marked", and the Daily
 * Report came out empty while the web app listed every entry. A field named like a DAR mark (DAR_NAME)
 * counts when it holds a yes or a date, as does a completion type of "DAR".
 */
// dar, isDar, inDar, markedForDar, darDate, darAt, darMarkedOn... - never calendar, standard, darkMode or radar.
const DAR_NAME = /^(is|in|marked|markedfor|include|included|includein|includedin|for|report|daily)?dar(date|day|at|on|time|ts|timestamp|marked|markedat|markedon|mark|flag|status|done|tick|included|includedat|yn|added|addedat)?$/;
function readDar(byKey) {
  // The web app's own field now: darInclude, "Done + DAR" (true) or "Done" (false). Missing means included.
  const inc = byKey.darinclude;
  if (inc !== undefined && inc !== null && inc !== '') return !(inc === false || /^(false|no|n|0|off)$/i.test(String(inc).trim()));
  const named = DAR_KEYS.find((k) => byKey[k] !== undefined && byKey[k] !== null && byKey[k] !== '');
  if (named) return asBool(byKey[named]);
  for (const k of COMPLETION_KIND_KEYS) if (/\bdar\b|daily ?activity/i.test(String(byKey[k] ?? ''))) return true;
  return Object.keys(byKey).some((k) => DAR_NAME.test(k)
    && (asBool(byKey[k]) || (typeof byKey[k] === 'object' && byKey[k] !== null && Number.isFinite(byKey[k].seconds)) || (typeof byKey[k] === 'string' && !!parseSheetDate(byKey[k]))));
}

/** Whether a row says anything at all about the DAR (any of the names readDar() reads). */
const hasDarInfo = (byKey) => Object.keys(byKey).some((k) => k === 'darinclude' || DAR_KEYS.includes(k) || COMPLETION_KIND_KEYS.includes(k) || DAR_NAME.test(k));

/** An object field that may arrive as JSON text (the sheet stores it so); undefined when absent or unreadable. */
const asObject = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'object') return v;
  try { const j = JSON.parse(String(v)); return j && typeof j === 'object' ? j : undefined; } catch { return undefined; }
};

/*
 * The web app's payment and report fields, kept under their own names: Sub Category and its rule fields,
 * Import Payment details, the Tally narration, the work log the Daily Activity Report reads, the days a
 * Daily task was skipped, and the repeating series it belongs to.
 */
const WEB_OBJECT_FIELDS = [['subcategoryfields', 'subCategoryFields'], ['paymentdetails', 'paymentDetails'], ['narration', 'narration'], ['worklog', 'workLog'], ['skippeddates', 'skippedDates'], ['bankfollowups', 'bankFollowUps'], ['escalation', 'escalation'], ['checklist', 'checklist'], ['attachments', 'attachments'], ['audit', 'audit']];
const WEB_TEXT_FIELDS = [['subcategory', 'subCategory'], ['seriesid', 'seriesId'], ['emailid', 'emailId'], ['nextreminderat', 'nextReminderAt']];

/** Field names seen on the web app's task documents - shown when DAR marks cannot be found. */
export const seenWebFields = new Set();

/** Coerces one sheet row (any column naming, everything possibly a string) into the entry shape; null if unusable. */
export function normalizeSheetTask(raw, blank) {
  if (!raw || typeof raw !== 'object') return null;
  const byKey = {};
  Object.keys(raw).forEach((k) => { const sk = squash(k); if (!(sk in byKey)) byKey[sk] = raw[k]; });
  const pick = (...names) => {
    for (const n of names) { const v = byKey[n]; if (v !== undefined && v !== null && v !== '') return v; }
    return undefined;
  };
  const id = pick('id', 'taskid', 'entryid', 'uid');
  if (id === undefined) return null;
  const text = (v) => (v === undefined ? null : String(v).trim() || null);

  const status = text(pick('status', 'taskstatus')) || blank.status;
  const DUE_KEYS = ['dueat', 'duedate', 'due', 'duedatetime', 'targetdate'];
  // Due date and Deadline are two different fields. Deadline never fills in
  // for Due, unless the sheet has no due column at all.
  const hasDueColumn = DUE_KEYS.some((k) => k in byKey);
  const dueAt = withTime(parseSheetDate(pick(...DUE_KEYS)), pick('duetime', 'time', 'timeslot', 'duehour', 'timeat'))
    || (hasDueColumn ? null : withTime(parseSheetDate(pick(...DEADLINE_KEYS)), pick('deadlinetime')));
  const deadlineAt = withTime(parseSheetDate(pick(...DEADLINE_KEYS)), pick('deadlinetime'));
  const doneFlag = pick('done', 'completed', 'iscompleted', 'isdone');
  const done = (doneFlag !== undefined && asBool(doneFlag)) || DONE_STATUS.test(status || '');
  const createdAt = parseSheetDate(pick('createdat', 'created', 'createddate', 'datecreated', 'loggedat', 'logdate', 'datelogged')) || dueAt || EPOCH;
  const completedAt = parseSheetDate(pick('completedat', 'completedon', 'completeddate', 'completiondate', 'completedtime', 'completiontime', 'datecompleted', 'doneat', 'donedate', 'closedat'));

  const row = {
    ...blank,
    id: String(id),
    title: text(pick('title', 'task', 'taskname', 'subject', 'name', 'description')) || '',
    category: text(pick('category', 'type')),
    priority: text(pick('priority')) || blank.priority,
    status,
    pendingWith: text(pick('pendingwith', 'assignedto', 'assignee', 'owner', 'with')),
    reference: text(pick('reference', 'ref', 'refno', 'referenceno', 'mailchain')) || '',
    recurrence: sheetRecurrence(pick('recurrence', 'repeat')),
    // The web app's own spelling ("Daily", "Doesn't repeat"), sent back unchanged when the repeat is not edited.
    webRecurrence: text(pick('recurrence', 'repeat')),
    recurrenceEveryMin: Number(pick('recurrenceeverymin', 'repeateverymin', 'repeatevery', 'everymin')) || null,
    dueAt,
    deadlineAt,
    notes: text(pick('notes', 'note', 'remarks', 'details')) || '',
    keyPoints: normalizeKeyPoints(pick('keypoints', 'keypoint')),
    dar: readDar(byKey),
    done,
    // Only a real completion column: filling in the sheet's updated/created time made every
    // completed card show the same (sync) time.
    completedAt: done ? completedAt : null,
    binned: asBool(pick('binned', 'deleted', 'isdeleted', 'inbin')),
    binnedAt: parseSheetDate(pick('binnedat', 'deletedat', 'datedeleted')),
    createdAt,
    updatedAt: parseSheetDate(pick('updatedat', 'updated', 'lastmodified', 'modifiedat')) || createdAt,
  };
  // Snooze and "silence today", in the web app's own fields, so either device's Snooze / Silence stops the
  // other one alarming too. Kept only when the document has them, so a sheet row never clears them.
  const snoozeUntil = pick('snoozeuntil');
  if (snoozeUntil !== undefined) row.snoozeUntil = Number(snoozeUntil) || null;
  const snoozeCount = pick('snoozecount');
  if (snoozeCount !== undefined) row.snoozeCount = Number(snoozeCount) || 0;
  const lastAck = pick('lastackdate');
  if (lastAck !== undefined) row.lastAckDate = text(lastAck) || null;
  const deadlineAck = pick('deadlineackdate');
  if (deadlineAck !== undefined) row.deadlineAckDate = text(deadlineAck) || null;
  WEB_OBJECT_FIELDS.forEach(([k, name]) => { const v = asObject(byKey[k]); if (v !== undefined) row[name] = v; });
  WEB_TEXT_FIELDS.forEach(([k, name]) => { const v = byKey[k]; if (v !== undefined && v !== null && v !== '') row[name] = String(v); });
  if (row.narration === null) delete row.narration;
  // Deleted forever on the web app (it keeps the row, flagged): never shown, and removed if the phone has it.
  if (asBool(pick('purged', 'ispurged'))) row.purged = true;
  return row;
}

/* ---------- the web app's task documents (Realtime Sync) ---------- */

/**
 * A task document from the web app's Firestore (users/{uid}/tasks) -> an entry.
 * It uses the same fields as the sheet - description, dueDate + dueTime,
 * mailChain, dateLogged, status "Completed", deleted - so the same reader
 * applies. Spreading the raw document into an entry, as before, left every
 * entry with no title and no due date, and open even when completed.
 */
export function fromWebDoc(d, blank) {
  if (d && typeof d === 'object' && seenWebFields.size < 80) Object.keys(d).forEach((k) => seenWebFields.add(k));
  const row = normalizeSheetTask(d, blank);
  if (!row) return null;
  // The web app lists a completed task in its Daily Activity Report unless it was marked "Done" only
  // (darInclude: false): a document saying nothing about it is in.
  if (d && typeof d === 'object') {
    const byKey = {};
    Object.keys(d).forEach((k) => { byKey[squash(k)] = d[k]; });
    if (!hasDarInfo(byKey)) row.dar = true;
  }
  // The phone's Alarm / Reminder choice rides along in the web app's document (written with merge, so the web
  // app keeps it without knowing it).
  if (d && (d.alertMode === 'alarm' || d.alertMode === 'gentle')) row.alertMode = d.alertMode;
  return { ...row, src: 'cloud' };
}

/**
 * fromWebDoc for a document that arrives over an entry the phone already has. What the document does
 * not carry is kept from the phone's copy: the web app has no deadline, and its dateLogged is only a
 * day. Read whole, the echo of the phone's own write wiped the deadline seconds after it was saved,
 * and moved the logged time to midnight.
 */
export function fromWebDocOver(local, d, blank) {
  const row = fromWebDoc(d, blank);
  if (!row || !local) return row;
  const keys = new Set(Object.keys(d || {}).map(squash));
  if (!DEADLINE_KEYS.some((k) => keys.has(k))) row.deadlineAt = local.deadlineAt ?? null;
  if (!row.alertMode && local.alertMode) row.alertMode = local.alertMode;     // a document from before the choice existed
  // The same for the completion time: a document with only the day (an older copy, the web app's own) must not move it to midnight.
  const ca = row.done && row.completedAt ? new Date(row.completedAt) : null;
  const lca = local.done && local.completedAt ? new Date(local.completedAt) : null;
  if (ca && lca && !Number.isNaN(ca.getTime()) && !Number.isNaN(lca.getTime()) && ca.getHours() === 0 && ca.getMinutes() === 0 && localDay(ca) === localDay(lca)) row.completedAt = local.completedAt;
  const c = row.createdAt ? new Date(row.createdAt) : null;
  const lc = local.createdAt ? new Date(local.createdAt) : null;
  if (c && lc && !Number.isNaN(lc.getTime()) && c.getHours() === 0 && c.getMinutes() === 0 && localDay(c) === localDay(lc)) row.createdAt = local.createdAt;
  return row;
}

const p2 = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const completedDay = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? localDay(d) : ''; };
const WEB_RECURRENCE = { none: "Doesn't repeat", hourly: 'Hourly', custom: 'Custom', daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };

/**
 * An entry -> the fields of the web app's task document, written with
 * { merge: true } so fields the phone does not know (snoozeUntil, seriesId,
 * emailId...) are left as they are. Writing the phone's own field names
 * (title, dueAt, done) instead would have put tasks on the web app that it
 * cannot read.
 */
export function toWebTask(e) {
  const due = e.dueAt ? new Date(e.dueAt) : null;
  const okDue = due && !Number.isNaN(due.getTime());
  const created = e.createdAt ? new Date(e.createdAt) : null;
  const done = !!e.done;
  const keepRecurrence = e.webRecurrence && sheetRecurrence(e.webRecurrence) === (e.recurrence || 'none');
  const doc = {
    id: String(e.id),
    description: e.title || '',
    category: e.category || '',
    priority: e.priority || '',
    // The web app reads "Completed" as done; a reopened entry must not keep it.
    status: done ? 'Completed' : (DONE_STATUS.test(e.status || '') ? 'Pending' : (e.status || '')),
    pendingWith: e.pendingWith || '',
    dueDate: okDue ? localDay(due) : '',
    dueTime: okDue && (due.getHours() || due.getMinutes()) ? `${p2(due.getHours())}:${p2(due.getMinutes())}` : '',
    mailChain: e.reference || '',
    notes: e.notes || '',
    recurrence: keepRecurrence ? e.webRecurrence : (WEB_RECURRENCE[e.recurrence] || WEB_RECURRENCE.none),
    deleted: !!e.binned,
    dateDeleted: e.binned ? (e.binnedAt || null) : null,
    // A day, as the web app writes it: its Daily Activity Report matches completedDate to the report's date.
    completedDate: done ? completedDay(e.completedAt) : '',
    // ...and the moment itself, so every device shows the real completion time (a day alone reads as 12:00 AM).
    completedAt: done ? (e.completedAt || null) : null,
    dateLogged: created && !Number.isNaN(created.getTime()) ? localDay(created) : '',
    updatedAt: new Date(e.updatedAt || 0).getTime() || Date.now(),
    purged: false,
    // "Done + DAR" or "Done" only, in the web app's field; dar is kept for older copies of the phone app.
    darInclude: e.dar !== false,
    dar: e.dar !== false,
    // As the web app keeps them, [{ key, value }]: text written by the phone (String(object)) read "[object Object]" there.
    keyPoints: normalizeKeyPoints(e.keyPoints),
  };
  // The payment fields go only once the entry has them, so a phone that never saw them cannot clear the web app's.
  ['subCategory', 'subCategoryFields', 'paymentDetails', 'narration', 'workLog', 'skippedDates', 'bankFollowUps', 'escalation', 'checklist', 'attachments', 'audit', 'seriesId', 'emailId'].forEach((k) => { if (k in e && e[k] !== undefined) doc[k] = e[k]; });
  if ('nextReminderAt' in e) doc.nextReminderAt = e.nextReminderAt || null;      // the website's "Next reminder"
  if (e.recurrence === 'custom') doc.recurrenceEveryMin = Number(e.recurrenceEveryMin) || null;
  if (e.alertMode === 'alarm' || e.alertMode === 'gentle') doc.alertMode = e.alertMode;
  // Snooze / silence set on the phone reach the web app, which then stops alarming too. Sent only once the
  // entry has them, so a phone that never touched them cannot clear the web app's.
  if ('snoozeUntil' in e) doc.snoozeUntil = Number(e.snoozeUntil) || null;
  if ('snoozeCount' in e) doc.snoozeCount = Number(e.snoozeCount) || 0;
  if ('lastAckDate' in e) doc.lastAckDate = e.lastAckDate || null;
  if ('deadlineAckDate' in e) doc.deadlineAckDate = e.deadlineAckDate || null;
  return doc;
}

// The web app's own names for fields the phone keeps under another name. An entry still carrying one was
// copied in raw by an older version. (snoozeUntil, lastAckDate, seriesId, emailId... are shared by both
// shapes, so they mark nothing: counted as "raw", every synced entry was rebuilt at each start.)
const WEB_ONLY_KEYS = ['description', 'dueDate', 'dueTime', 'mailChain', 'dateLogged', 'completedDate', 'dateDeleted', 'deleted', 'purged'];
const PHONE_KEYS = ['title', 'dueAt', 'deadlineAt', 'done', 'completedAt', 'binned', 'binnedAt', 'createdAt', 'reference', 'src', 'sheetSig', 'webRecurrence'];

/**
 * Entries an older version stored by spreading a raw web-app document over a
 * blank entry: no title or due date, open even when completed. Each is read
 * again from the web app's own fields, keeping what was changed on the phone
 * since (a title typed, a completion, a bin). `updatedAt` is not touched, so
 * nothing is pushed back because of the repair. Returns the same array when
 * there is nothing to repair.
 */
export function repairWebShapedEntries(entries = [], blank = {}) {
  let changed = 0;
  const out = [];
  for (const e of entries) {
    if (!e || !WEB_ONLY_KEYS.some((k) => k in e)) { out.push(e); continue; }
    const webView = { ...e };
    PHONE_KEYS.forEach((k) => delete webView[k]);
    const fresh = fromWebDoc(webView, blank);
    if (!fresh) { out.push(e); continue; }
    if (fresh.purged) { changed++; continue; }
    const fixed = {
      ...fresh,
      title: e.title || fresh.title,
      dueAt: e.dueAt || fresh.dueAt,
      deadlineAt: e.deadlineAt || fresh.deadlineAt,
      reference: e.reference || fresh.reference,
      done: !!e.done || fresh.done,
      completedAt: (e.done && e.completedAt) || fresh.completedAt,
      binned: !!e.binned || fresh.binned,
      binnedAt: (e.binned && e.binnedAt) || fresh.binnedAt,
      dar: e.dar === true || fresh.dar,
      keyPoints: Array.isArray(e.keyPoints) && e.keyPoints.length ? e.keyPoints : fresh.keyPoints,
      updatedAt: e.updatedAt || fresh.updatedAt,
      src: e.src || 'cloud',
    };
    WEB_ONLY_KEYS.forEach((k) => delete fixed[k]);
    changed++;
    out.push(fixed);
  }
  return changed ? out : entries;
}

/** Adds holidays the phone does not have yet (same day + name); never removes or edits one. */
export function mergeHolidays(local = [], incoming = []) {
  const key = (h) => `${h.date}|${String(h.title || '').toLowerCase()}`;
  const have = new Set(local.map(key));
  const added = incoming.filter((h) => !have.has(key(h)));
  return { holidays: [...local, ...added].sort((a, b) => String(a.date).localeCompare(String(b.date))), added: added.length };
}
