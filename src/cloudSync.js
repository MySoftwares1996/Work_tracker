import { normalizeKeyPoints } from './workingDashboardPayments';

/**
 * Generic client for the user's existing Apps Script web app (the Google
 * Sheets delta-sync / Gmail / Gemini backend they already run for their web
 * app) - the request/response mechanics shared by Cloud Sync, Gmail Fetch
 * Mail and the AI Daily Report. Kept pure and fetch-injectable so it is
 * testable without a network, the same way every other module here is.
 */

export const SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/;
export const isValidScriptUrl = (url) => SCRIPT_URL_RE.test(String(url || '').trim());

export function buildGetUrl(baseUrl, params = {}) {
  const url = String(baseUrl || '').trim();
  if (!url) return '';
  const q = Object.keys(params).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  return q ? `${url}?${q}` : url;
}

/** Turns Google's HTML error page into a plain, specific instruction. */
export function explainHtmlReply(html) {
  const t = String(html || '');
  const title = ((/<title[^>]*>([^<]*)<\/title>/i.exec(t) || [])[1] || '').trim();
  const text = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500);
  const low = (title + ' ' + text).toLowerCase();
  if (/accounts\.google\.com|sign in|servicelogin/.test(low)) {
    return 'Google asked for a sign-in — in Apps Script set Deploy > Manage deployments > Edit > Who has access: Anyone.';
  }
  if (/authori[sz]ation required|needs? permission|access denied|\b403\b/.test(low)) {
    return 'The script needs your permission again — open Apps Script, press Run on any function and approve.';
  }
  if (/too many times|quota|rate limit|\b429\b/.test(low)) {
    return 'Google is rate-limiting the script for a while — retrying automatically, more slowly.';
  }
  if (/unable to open the file at this time|try again|temporar|\bbusy\b|\b50[023]\b/.test(low)) {
    return 'Google Apps Script was busy for a moment (temporary) — retrying automatically.';
  }
  return `Google returned a temporary error page${title ? ` ("${title}")` : ''} — retrying automatically.`;
}

export function parseCloudResponse(text) {
  try { return JSON.parse(text); } catch { throw new Error(explainHtmlReply(text)); }
}

const DEFAULT_TIMEOUT_MS = 30000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Google took too long to answer — try again in a moment.')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** POST { action, ... } to the deployed Apps Script, returns the parsed JSON body. */
export async function cloudRequest(baseUrl, payload, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = String(baseUrl || '').trim();
  if (!url) throw new Error('Cloud Sync URL is not configured (Config > Cloud Sync).');
  const res = await withTimeout(fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  }), timeoutMs);
  const text = await res.text();
  return parseCloudResponse(text);
}

/** GET for the Gmail endpoints (fetchEmails/markEmailRead/emailBody). */
export async function cloudGet(baseUrl, params, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = buildGetUrl(baseUrl, params);
  if (!url) throw new Error('Cloud Sync URL is not configured (Config > Cloud Sync).');
  const res = await withTimeout(fetchImpl(url, { method: 'GET' }), timeoutMs);
  const text = await res.text();
  return parseCloudResponse(text);
}

/** Config > Cloud Sync's "Test connection" button. */
export async function testConnection(baseUrl, opts) {
  if (!isValidScriptUrl(baseUrl)) {
    return { ok: false, message: 'URL looks wrong. It must look like https://script.google.com/macros/s/…/exec (copy it from Deploy > Manage deployments).' };
  }
  try {
    const data = await cloudRequest(baseUrl, { action: 'ping' }, opts);
    if (data && data.status === 'success') {
      return { ok: true, message: `Connected — your sheet has ${data.taskCount || 0} entries.`, taskCount: data.taskCount, sheet: data.sheet, scriptVersion: data.scriptVersion };
    }
    return { ok: false, message: (data && data.message) || 'Unexpected reply from the script.' };
  } catch (err) {
    return { ok: false, message: err.message || 'Could not reach the script.' };
  }
}

/* ---------- Pulling entries down from the sheet ---------- */

// The web app's script has gone by several names for "give me every task";
// try them in turn and use the first that answers with a list.
const PULL_ACTIONS = ['getTasks', 'pullTasks', 'getAllTasks', 'fetchTasks', 'loadTasks'];

const taskListOf = (data) => {
  if (!data || typeof data !== 'object') return null;
  for (const k of ['tasks', 'entries', 'data', 'items', 'rows']) {
    if (Array.isArray(data[k])) return data[k];
  }
  return Array.isArray(data) ? data : null;
};

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

/** The fields a person can change on the phone, as one string - what the sheet said vs what is there now. */
export function entrySig(e) {
  return JSON.stringify([e.title, e.category, e.priority, e.status, e.pendingWith, e.reference, e.recurrence, e.recurrenceEveryMin || null, e.dueAt, e.deadlineAt, e.notes, !!e.done, !!e.binned, !!e.dar, e.keyPoints || [],
    e.subCategory || null, e.subCategoryFields || null, e.paymentDetails || null, e.narration || null]);
}

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
const WEB_TEXT_FIELDS = [['subcategory', 'subCategory'], ['seriesid', 'seriesId'], ['emailid', 'emailId']];

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
  row.sheetSig = entrySig(row);       // lets a later pull tell "unchanged since I loaded it" from "edited on the phone"
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
  delete row.sheetSig;
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

const countBy = (list, keys) => {
  const out = {};
  list.forEach((r) => { const k = keys.find((x) => r && r[x] !== undefined); const v = k ? String(r[k]) : '(none)'; out[v] = (out[v] || 0) + 1; });
  return out;
};

/** Asks the script for every entry in the sheet. Resolves { ok, tasks } or { ok:false, message }. */
export async function pullSheetEntries(baseUrl, blank, opts) {
  let lastMessage = '';
  let empty = null;
  for (const action of PULL_ACTIONS) {
    let data;
    try { data = await cloudRequest(baseUrl, { action }, opts); } catch (err) { lastMessage = err.message; continue; }
    const list = taskListOf(data);
    if (list) {
      const found = { ok: true, action, columns: Object.keys(list[0] || {}), sample: list.slice(0, 2), statuses: countBy(list, ['Status', 'status', 'taskStatus']), tasks: list.map((r) => normalizeSheetTask(r, blank)).filter(Boolean) };
      if (list.length) return found;
      empty = empty || found;           // an action that answers with no rows may just be a "changes since" call; try the others first
      continue;
    }
    lastMessage = (data && (data.message || data.error)) || lastMessage;
  }
  if (empty) return empty;
  return { ok: false, message: `The script has your sheet but did not hand back its entries${lastMessage ? ` (${lastMessage})` : ''}.` };
}

const HOLIDAY_ACTIONS = ['getHolidays', 'getCalendar', 'pullHolidays', 'holidays'];

/** Asks the script for the holiday list; { ok, holidays } or { ok:false } when it has none (the script may not offer it). */
export async function pullSheetHolidays(baseUrl, opts) {
  for (const action of HOLIDAY_ACTIONS) {
    let data;
    try { data = await cloudRequest(baseUrl, { action }, opts); } catch (err) { continue; }
    if (!data || typeof data !== 'object') continue;
    const list = Array.isArray(data) ? data : ['holidays', 'calendar', 'data', 'items', 'rows'].map((k) => data[k]).find((v) => Array.isArray(v) || (v && typeof v === 'object'));
    if (list && (Array.isArray(list) ? list.length : Object.keys(list).length)) return { ok: true, action, holidays: list };
  }
  return { ok: false };
}

/** Adds holidays the phone does not have yet (same day + name); never removes or edits one. */
export function mergeHolidays(local = [], incoming = []) {
  const key = (h) => `${h.date}|${String(h.title || '').toLowerCase()}`;
  const have = new Set(local.map(key));
  const added = incoming.filter((h) => !have.has(key(h)));
  return { holidays: [...local, ...added].sort((a, b) => String(a.date).localeCompare(String(b.date))), added: added.length };
}

/**
 * Merges a sheet pull into the local entries. The sheet wins for every entry
 * that has not been touched on the phone since it was loaded; an entry that
 * was edited here (its fields no longer match what the sheet said when it was
 * loaded) is kept, so a later pull cannot undo your edit with the sheet's old
 * copy. Local-only entries are always kept. `lastPullAt` is only used for
 * entries loaded by an older version, which carry no record of what the sheet said.
 * `addOnly` (set while Realtime Sync is signed in, where the web app's live
 * data is the source of truth) only adds entries the phone does not have yet:
 * the sheet's copy of an existing entry lags the web app and used to replace it.
 */
export function mergeSheetPull(local = [], pulled = [], lastPullAt = 0, purgedIds = [], { addOnly = false } = {}) {
  const stamp = (e) => (e && e.updatedAt ? new Date(e.updatedAt).getTime() || 0 : 0);
  const byId = new Map(local.map((e) => [String(e.id), e]));
  // Entries deleted forever on the phone: the sheet still has them, and every pull brought them back.
  const purged = new Set((purgedIds || []).map(String));
  let added = 0;
  let replaced = 0;
  let keptLocal = 0;
  pulled.forEach((p) => {
    if (purged.has(String(p.id))) return;
    if (p.purged) { if (byId.delete(String(p.id))) replaced++; return; }   // deleted forever on the web app
    const cur = byId.get(String(p.id));
    if (!cur) { byId.set(String(p.id), p); added++; return; }
    if (addOnly) { keptLocal++; return; }
    // A copy that arrived from Realtime Sync (the web app's live data) is fuller than the sheet's: the sheet
    // lacks web-only fields such as the DAR mark. Keep it unless the sheet row is strictly newer - decided
    // by the timestamps alone, not also by when the sheet was last pulled.
    const keep = (row) => (cur.alertMode && !row.alertMode ? { ...row, alertMode: cur.alertMode } : row);   // the sheet has no column for it
    if (cur.src === 'cloud') {
      if (stamp(p) <= stamp(cur)) { keptLocal++; return; }
      byId.set(String(p.id), keep(p));
      replaced++;
      return;
    }
    const edited = cur.sheetSig ? entrySig(cur) !== cur.sheetSig : !!lastPullAt && stamp(cur) > lastPullAt;
    if (edited) { keptLocal++; return; }
    byId.set(String(p.id), keep(p));
    replaced++;
  });
  return { entries: [...byId.values()], added, replaced, keptLocal };
}
