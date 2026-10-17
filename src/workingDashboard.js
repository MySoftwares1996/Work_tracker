/**
 * Working Dashboard: a work-item register (Dashboard/Register/Done/Holidays/
 * Bin), ported from the user's own existing web app. Kept pure, like
 * investmentFilter.js/investmentPlans.js, so every count and rule is tested
 * without a screen.
 *
 * One entry shape, used everywhere below:
 * { id, title, category, priority, status, pendingWith, reference, recurrence,
 *   dueAt, deadlineAt, notes, keyPoints: [], dar, done, completedAt,
 *   binned, binnedAt, createdAt, updatedAt }
 */
import { uid } from './storeCore';
import { nextOccurrence } from './todoCore';
import { noteWork, keyPointText } from './workingDashboardPayments';

export const RECURRENCES = ['none', 'hourly', 'custom', 'daily', 'weekdays', 'weekly', 'monthly'];
export const RECURRENCE_LABELS = { none: "Doesn't repeat", hourly: 'Every hour', custom: 'Every … min', daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };
export const RECURRENCE_PRESETS = [5, 10, 15, 30, 45, 90, 120, 180];

/** "Every hour", "Every 25 min", "Every 2 h" - or the plain label for the calendar repeats. */
export function recurrenceLabel(e) {
  if (!e || !e.recurrence || e.recurrence === 'none') return RECURRENCE_LABELS.none;
  if (e.recurrence === 'hourly') return 'Every hour';
  if (e.recurrence === 'custom') {
    const m = Math.round(Number(e.recurrenceEveryMin) || 0);
    if (m < 1) return 'Every … min';
    return m === 60 ? 'Every hour' : m % 60 === 0 ? `Every ${m / 60} h` : `Every ${m} min`;
  }
  return RECURRENCE_LABELS[e.recurrence] || e.recurrence;
}

/**
 * Completing a repeating entry closes it and opens the next one: same
 * details, due at the next occurrence (the deadline moves by the same gap),
 * status reset. Returns null for a one-off, or if that occurrence is already
 * on the register (so a sheet/Firebase sync can't duplicate it).
 */
export function nextRecurringEntry(entry, existing = [], now = new Date(), { holidays = [], leaveDays = [] } = {}) {
  if (!entry || !entry.recurrence || entry.recurrence === 'none') return null;
  if (entry.recurrence === 'custom' && !(Number(entry.recurrenceEveryMin) >= 1)) return null;
  const base = entry.dueAt || now.toISOString();
  // A monthly entry keeps its day of the month: rolled on from 28 Feb by that date alone, a task due on
  // the 31st stayed on the 28th for good. The remembered day only counts while it still matches the due
  // date (moved by hand to the 15th, it repeats on the 15th).
  let monthDay;
  if (entry.recurrence === 'monthly') {
    const b = new Date(base);
    const inMonth = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
    monthDay = entry.monthDay && Math.min(entry.monthDay, inMonth) === b.getDate() ? entry.monthDay : b.getDate();
  }
  let next = nextOccurrence(base, entry.recurrence, monthDay, now.getTime(), Number(entry.recurrenceEveryMin) || 0);
  // As on the web app, a Daily task's next occurrence skips the days the office is closed: Sundays, holidays
  // and leave days.
  if (entry.recurrence === 'daily') {
    for (let i = 0; i < 30 && isNonWorkingDay(toDateKey(next), holidays, leaveDays); i++) next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1, next.getHours(), next.getMinutes());
  }
  const dueAt = next.toISOString();
  const gap = new Date(dueAt).getTime() - new Date(base).getTime();
  const deadlineAt = entry.deadlineAt ? new Date(new Date(entry.deadlineAt).getTime() + gap).toISOString() : null;
  const dupe = existing.some((x) => x.id !== entry.id && !x.done && !x.binned && x.title === entry.title && x.recurrence === entry.recurrence && x.dueAt === dueAt);
  if (dupe) return null;
  const stamp = now.toISOString();
  return {
    ...entry, id: uid(), status: 'Not Yet Started', dueAt, deadlineAt, done: false, completedAt: null,
    binned: false, binnedAt: null, dar: true, keyPoints: [], createdAt: stamp, updatedAt: stamp, localEditAt: now.getTime(),
    // One series on both devices (the web app checks it before adding an occurrence); a fresh work log and
    // skip list, so the new occurrence is not reported as worked on today.
    seriesId: entry.seriesId || String(entry.id), workLog: [], skippedDates: [],
    // A new occurrence starts unanswered: the old one's snooze and "silence today" do not carry over (an hourly
    // task silenced and then done came back silenced for the rest of the day).
    snoozeUntil: null, lastAckDate: null, deadlineAckDate: null,
    ...(monthDay ? { monthDay } : {}),
  };
}

export function blankEntry() {
  const now = new Date().toISOString();
  return {
    id: uid(), title: '', category: null, priority: 'Medium', status: 'Pending', pendingWith: null,
    reference: '', recurrence: 'none', recurrenceEveryMin: null, dueAt: null, deadlineAt: null, notes: '', keyPoints: [],
    // In the Daily Activity Report once completed, as on the web app (its "Done + DAR"); untick for "Done" only.
    dar: true, done: false, completedAt: null, binned: false, binnedAt: null,
    createdAt: now, updatedAt: now,
  };
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const isOpen = (e) => !e.done && !e.binned;
const dueDate = (e) => (e.dueAt ? new Date(e.dueAt) : null);

/**
 * Counted by calendar day, the way the web app counts: an entry is overdue once its due DAY has passed,
 * and one due today stays "Due Today" until midnight even after its time (the web app showed 13 due
 * today at 11:57 pm where the phone, counting by the minute, showed 0 and 12 more overdue).
 */
/** A due time of exactly 00:00 means the entry was given a date only - it is due all that day. */
export const isDateOnly = (d) => d.getHours() === 0 && d.getMinutes() === 0;
export function isOverdue(e, now = new Date()) {
  const d = dueDate(e);
  if (!isOpen(e) || !d) return false;
  // As the web app counts: a timed entry is overdue once its time passes; a date-only one once its day has passed.
  return isDateOnly(d) ? startOfDay(d) < startOfDay(now) : d < now;
}
/** Due today and not yet overdue - "still on the clock". */
export function isDueToday(e, now = new Date()) {
  const d = dueDate(e);
  return isOpen(e) && !!d && startOfDay(d).getTime() === startOfDay(now).getTime() && !isOverdue(e, now);
}
export function isDueInNext7Days(e, now = new Date()) {
  const d = dueDate(e);
  if (!isOpen(e) || !d) return false;
  const today = startOfDay(now);
  const in7 = addDays(today, 7);
  const day = startOfDay(d);
  return day > today && day <= in7;
}
export function isDueThisMonth(e, now = new Date()) {
  const d = dueDate(e);
  return isOpen(e) && !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
export function isDueNextMonth(e, now = new Date()) {
  const d = dueDate(e);
  const n = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return isOpen(e) && !!d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}
export const hasNoDueDate = (e) => isOpen(e) && !e.dueAt;

/**
 * The Category / Priority / Status / Pending-with lists with every value the
 * given entries use added (case-insensitive, existing spelling kept). Entries
 * loaded from the sheet use values the app's lists have never seen, and a
 * value missing from its list cannot be picked in a filter or the entry form.
 */
export function listsWithEntryValues(w, entries = []) {
  const add = (list = [], values) => {
    const have = new Set(list.map((x) => String(x).toLowerCase()));
    const out = [...list];
    for (const v of values) {
      const k = String(v ?? '').trim();
      if (k && !have.has(k.toLowerCase())) { have.add(k.toLowerCase()); out.push(k); }
    }
    return out;
  };
  return {
    categories: add(w.categories, entries.map((e) => e.category)),
    priorities: add(w.priorities, entries.map((e) => e.priority)),
    statuses: add(w.statuses, entries.map((e) => e.status)),
    assignees: add(w.assignees, entries.map((e) => e.pendingWith)),
  };
}

/** The Dashboard tab's 7 stat tiles. */
export function dashboardStats(entries = [], now = new Date()) {
  const open = entries.filter(isOpen);
  const overdue = open.filter((e) => isOverdue(e, now));
  const dueToday = open.filter((e) => isDueToday(e, now));
  return {
    pendingAsOnToday: overdue.length + dueToday.length,
    dueToday: dueToday.length,
    overdue: overdue.length,
    next7Days: open.filter((e) => isDueInNext7Days(e, now)).length,
    thisMonth: open.filter((e) => isDueThisMonth(e, now)).length,
    nextMonth: open.filter((e) => isDueNextMonth(e, now)).length,
    noDueDate: open.filter(hasNoDueDate).length,
    pending: open.filter((e) => e.status === 'Pending').length,
    totalOpen: open.length,
  };
}

/** [{label, count}], busiest first - used for By Category/Status/Priority/Pending With. */
export function groupCounts(entries, keyOf, fallback = NO_VALUE_LABEL) {
  const map = new Map();
  for (const e of entries) {
    const k = keyOf(e) || fallback;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

/* ---------- Register: filters ---------- */

export const ANY = 'All';
// The labels groupCounts() gives entries with no value; as a filter they mean "has none".
export const NO_VALUE_LABEL = 'Uncategorised';
export const NO_ASSIGNEE_LABEL = 'Unassigned';
// Overdue or due today - what the "Pending as on Today" tile counts. Not one of the segmented options.
export const DUE_TILL_TODAY = 'Till Today';
export const EMPTY_WD_FILTER = { query: '', category: ANY, priority: ANY, status: ANY, pendingWith: ANY, dueWithin: ANY, bank: '' };
export const DUE_WITHIN_OPTIONS = [ANY, 'Overdue', 'Today', 'Next 7 Days', 'This Month', 'Next Month', 'No Due Date'];

export function isWdFilterActive(f = {}) {
  return !!String(f.query || '').trim()
    || (f.category && f.category !== ANY) || (f.priority && f.priority !== ANY)
    || (f.status && f.status !== ANY) || (f.pendingWith && f.pendingWith !== ANY)
    || (f.dueWithin && f.dueWithin !== ANY) || !!f.bank;
}

/** The bank a bank follow-up was last followed up with ('' when none was named) - the web app's "by bank" view. */
export function lastNamedBank(e) {
  const log = Array.isArray(e?.bankFollowUps) ? e.bankFollowUps : [];
  return log.map((x) => String(x?.bank || '').trim()).filter(Boolean).pop() || '';
}

const DUE_WITHIN_CHECK = {
  Overdue: isOverdue, Today: isDueToday, 'Next 7 Days': isDueInNext7Days, 'This Month': isDueThisMonth, 'Next Month': isDueNextMonth, 'No Due Date': hasNoDueDate,
  [DUE_TILL_TODAY]: (e, now) => isOverdue(e, now) || isDueToday(e, now),
};

/** A field filter: the "no value" label matches entries that have none (they are listed under it). */
const fieldMatches = (value, want, noneLabel) => (want === noneLabel ? !value || value === noneLabel : value === want);

/** Everything a search looks through - it used to be the title and mail chain only. */
// Key Points are { key, value } (the web app's shape); "Amount: ₹50,000" is searched as one text.
const searchText = (e) => [e.title, e.reference, e.notes, e.category, e.pendingWith, e.status, e.priority, ...(Array.isArray(e.keyPoints) ? e.keyPoints.map((k) => (typeof k === 'string' ? k : k?.text ?? keyPointText(k))) : [])]
  .map((v) => String(v ?? '')).join('\n').toLowerCase();

/** `deep` search also looks through bank follow-ups (remarks, bank, banker) and the Tally narration. */
const deepText = (e) => [
  ...(Array.isArray(e.bankFollowUps) ? e.bankFollowUps.flatMap((x) => [x?.remarks, x?.bank, x?.banker]) : []),
  e.narration && (e.narration.text || e.narration.reportText), e.narration && e.narration.typeName,
].map((v) => String(v ?? '')).join('\n').toLowerCase();

export function filterEntries(entries = [], f = EMPTY_WD_FILTER, now = new Date(), { deep = false } = {}) {
  // Every word must appear somewhere, in any order and any field: "rami gst" finds a GST entry pending with Rami.
  const words = String(f.query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (words.length) { const text = deep ? `${searchText(e)}\n${deepText(e)}` : searchText(e); if (!words.every((w) => text.includes(w))) return false; }
    if (f.category && f.category !== ANY && !fieldMatches(e.category, f.category, NO_VALUE_LABEL)) return false;
    if (f.priority && f.priority !== ANY && !fieldMatches(e.priority, f.priority, NO_VALUE_LABEL)) return false;
    if (f.status && f.status !== ANY && !fieldMatches(e.status, f.status, NO_VALUE_LABEL)) return false;
    if (f.pendingWith && f.pendingWith !== ANY && !fieldMatches(e.pendingWith, f.pendingWith, NO_ASSIGNEE_LABEL)) return false;
    // web.app's "by bank" view: one bank's follow-ups ('-' = those with no bank named).
    if (f.bank && (f.bank === '-' ? lastNamedBank(e) : lastNamedBank(e).toLowerCase() !== String(f.bank).toLowerCase())) return false;
    if (f.dueWithin && f.dueWithin !== ANY) {
      const check = DUE_WITHIN_CHECK[f.dueWithin];
      if (check && !check(e, now)) return false;
    }
    return true;
  });
}

export const SORTS = [
  { key: 'dueAsc', label: 'Due date' },
  { key: 'logged', label: 'Logged' },
  { key: 'title', label: 'Task' },
  { key: 'category', label: 'Category' },
  { key: 'priority', label: 'Priority' },
];
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

/**
 * When an entry was completed, in ms (0 = not recorded). The web app, the sheet and older
 * versions used different field names, and a 1970 placeholder means "unknown", not a date.
 */
const COMPLETED_KEYS = ['completedAt', 'completedOn', 'completedDate', 'completionDate', 'doneAt', 'doneOn', 'closedAt', 'dateCompleted'];
export function completedTime(e) {
  for (const k of COMPLETED_KEYS) {
    const v = e && e[k];
    if (!v) continue;
    const ms = typeof v === 'object' && typeof v.seconds === 'number' ? v.seconds * 1000 : new Date(v).getTime();
    if (ms > 86400000) return ms;           // anything on 1 Jan 1970 is a placeholder
  }
  return 0;
}
/** An entry with its completion time read from whichever field holds it, as completedAt. */
export function withCompletedAt(e) {
  if (!e || !e.done) return e;
  const ms = completedTime(e);
  const iso = ms ? new Date(ms).toISOString() : null;
  return iso === e.completedAt ? e : { ...e, completedAt: iso };
}

export const DONE_SORTS = [
  { key: 'completedDesc', label: 'Newest' },
  { key: 'completedAsc', label: 'Oldest' },
  { key: 'dueAsc', label: 'Due date' },
  { key: 'title', label: 'Task' },
  { key: 'category', label: 'Category' },
  { key: 'priority', label: 'Priority' },
];

const dueSortKey = (e) => {
  const d = e.dueAt ? new Date(e.dueAt) : null;
  if (!d || Number.isNaN(d.getTime())) return Infinity;
  return isDateOnly(d) ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime() : d.getTime();
};

export function sortEntries(entries, sortBy = 'dueAsc') {
  const arr = [...entries];
  arr.sort((a, b) => {
    if (sortBy === 'logged') return new Date(b.createdAt) - new Date(a.createdAt);
    // Completion time, newest or oldest first; an entry whose time was never recorded goes last either way.
    if (sortBy === 'completedDesc' || sortBy === 'completedAsc') {
      const ac = completedTime(a);
      const bc = completedTime(b);
      if (!ac || !bc) return (ac ? 0 : 1) - (bc ? 0 : 1) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      return sortBy === 'completedDesc' ? bc - ac : ac - bc;
    }
    if (sortBy === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
    if (sortBy === 'category') return String(a.category || '').localeCompare(String(b.category || ''));
    if (sortBy === 'priority') return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    // dueAsc: no due date sorts last, not first. A date with no time sorts at the end of its day, after
    // that day's timed entries, as on the web app - it had "21 Sept" before "21 Sept · 12:03 PM".
    return dueSortKey(a) - dueSortKey(b);
  });
  return arr;
}

/* ---------- swipe / card actions ---------- */

// Every change stamps updatedAt: Realtime Sync decides what to upload from it, so a
// completion, bin, restore or DAR toggle that left it alone was never sent to the web app.
/**
 * An edit made on this phone: the change time, and `localEditAt` (ms) marking it as the phone's own work.
 * Only entries carrying it are pushed to the web app and win over its copy; anything that merely arrived
 * (from the sheet, or an older copy) always takes the web app's version.
 */
export const editedNow = (now = new Date()) => {
  const d = now instanceof Date ? now : new Date();
  return { updatedAt: d.toISOString(), localEditAt: d.getTime() };
};
// The web app treats status "Completed" as done, so the status follows completing and reopening.
const DONE_STATUS_RE = /^(completed|complete|done|closed|resolved|finished)$/i;
// Completing is a day's work: the work log records it, so the report (on either device) knows.
export const completeEntry = (e, now = new Date()) => ({ ...noteWork(e, 'Completed', now), done: true, status: 'Completed', completedAt: now.toISOString(), binned: false, binnedAt: null, snoozeUntil: null, lastAckDate: null, ...editedNow(now) });
/** A status picked on the phone: a real move (not back to "Not yet started") goes into the work log. */
export const withStatus = (e, status, now = new Date()) => (status && status !== e.status ? noteWork({ ...e, status }, status, now) : { ...e, status: status || e.status });
export const reopenEntry = (e, now = new Date()) => ({ ...e, done: false, status: DONE_STATUS_RE.test(e.status || '') ? 'Pending' : e.status, completedAt: null, ...editedNow(now) });
export const binEntry = (e, now = new Date()) => ({ ...e, binned: true, binnedAt: now.toISOString(), ...editedNow(now) });
export const restoreEntry = (e, now = new Date()) => ({ ...e, binned: false, binnedAt: null, ...editedNow(now) });
// In the report unless marked "Done" only (dar: false) - the web app's darInclude, which is on unless unticked.
export const toggleEntryDar = (e, now = new Date()) => ({ ...e, dar: e.dar === false, ...editedNow(now) });

/*
 * Snooze and "silence today" are kept on the entry in the web app's own fields (snoozeUntil in ms, lastAckDate /
 * deadlineAckDate as YYYY-MM-DD) and synced, so pressing either on one device stops the other alarming too.
 */
export const snoozeEntry = (e, untilMs, now = new Date()) => ({ ...e, snoozeUntil: Math.round(Number(untilMs)) || null, snoozeCount: (Number(e.snoozeCount) || 0) + 1, ...editedNow(now) });
/** Snoozed this many times in a row: the alert then suggests moving the task instead (see snoozeSuggestions). */
export const SNOOZE_NUDGE_AFTER = 3;
export function silenceEntryToday(e, now = new Date()) {
  const today = toDateKey(now);
  const dl = e.deadlineAt ? new Date(e.deadlineAt) : null;
  const crossed = dl && !Number.isNaN(dl.getTime()) && dl <= now;
  return { ...e, lastAckDate: today, ...(crossed ? { deadlineAckDate: today } : {}), ...editedNow(now) };
}
/**
 * The web app's Skip: today's work was not done, and that is not a completion. The entry stays open (and
 * overdue), is silenced for today, and is marked skipped today so today's report never lists it.
 */
export function skipEntryToday(e, now = new Date()) {
  const today = toDateKey(now);
  const skippedDates = Array.isArray(e.skippedDates) ? e.skippedDates.slice() : [];
  if (!skippedDates.includes(today)) skippedDates.push(today);
  return { ...e, lastAckDate: today, deadlineAckDate: today, skippedDates, ...editedNow(now) };
}
export const isSkippedToday = (e, now = new Date()) => Array.isArray(e?.skippedDates) && e.skippedDates.includes(toDateKey(now));
/** Snoozed (on either device) right now. */
export const isSnoozed = (e, now = new Date()) => Number(e?.snoozeUntil) > now.getTime();
/** Silenced for today (on either device). */
export const isSilencedToday = (e, now = new Date()) => !!e?.lastAckDate && e.lastAckDate === toDateKey(now);

/* ---------- Holidays ---------- */

/**
 * Any date the web app, the sheet or Firestore might hold -> "YYYY-MM-DD" (local day), or ''.
 * Accepts ISO strings (bare or with a time), dd/mm/yyyy, Excel serials, ms numbers, Firestore timestamps.
 */
export function holidayDateKey(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (typeof v.toDate === 'function') return holidayDateKey(v.toDate());
    if (typeof v.seconds === 'number') return holidayDateKey(v.seconds * 1000);
    if (typeof v._seconds === 'number') return holidayDateKey(v._seconds * 1000);
    return holidayDateKey(v.date || v.start || v.from || '');
  }
  if (typeof v === 'number') return holidayDateKey(v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 86400000) + 12 * 3600000) : new Date(v));
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : toDateKey(v);
  const str = String(v).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T ])/.exec(str);
  if (iso && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(str.slice(10))) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(str);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? '' : toDateKey(d);
}

/** One holiday in whatever shape arrived -> { id, title, date, endDate, tag }, or null when it has no usable date. */
export function normalizeHoliday(h, i = 0) {
  if (h === null || h === undefined || h === '') return null;
  if (typeof h === 'string' || typeof h === 'number' || h instanceof Date) {
    const date = holidayDateKey(h);
    return date ? { id: `h-${date}`, title: 'Holiday', date, endDate: '', tag: '' } : null;
  }
  const pick = (...keys) => { for (const k of keys) { if (h[k] !== undefined && h[k] !== null && h[k] !== '') return h[k]; } return ''; };
  const date = holidayDateKey(pick('date', 'Date', 'start', 'startDate', 'from', 'day', 'holidayDate'));
  if (!date) return null;
  let endDate = holidayDateKey(pick('endDate', 'EndDate', 'end', 'to', 'toDate', 'until'));
  if (endDate && endDate <= date) endDate = '';
  const title = String(pick('title', 'Title', 'name', 'Name', 'holiday', 'Holiday', 'occasion', 'description', 'label') || 'Holiday');
  const tag = String(pick('tag', 'Tag', 'type', 'Type', 'category', 'kind') || '');
  const out = { id: String(pick('id', 'Id', 'ID') || `h-${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`), title, date, endDate, tag };
  // The web app's "Office closed" tick, kept when set (see isOfficeClosed).
  if (typeof h.officeClosed === 'boolean') out.officeClosed = h.officeClosed;
  // The web app's per-holiday alert switch (on unless turned off).
  if (h.alert === false) out.alert = false;
  return out;
}

/** Normalises a list of holidays, drops unreadable rows and duplicates, sorted by date. */
export function normalizeHolidays(list) {
  const arr = Array.isArray(list) ? list : (list && typeof list === 'object' ? Object.values(list) : []);
  const seen = new Set();
  const out = [];
  arr.forEach((h, i) => {
    const n = normalizeHoliday(h, i);
    if (!n) return;
    const key = `${n.date}|${n.endDate}|${n.title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/*
 * A leave or holiday range is read day by day. One from the web app or the sheet with a mistyped end year
 * (9999 for 2026) meant millions of days on the UI thread - the screen froze - so a range stops after this.
 */
const MAX_RANGE_DAYS = 400;

/** Leave days: strings / dates / {date} objects / ranges -> sorted unique "YYYY-MM-DD" list. */
export function normalizeLeaveDays(list) {
  const arr = Array.isArray(list) ? list : (list && typeof list === 'object' ? Object.values(list) : []);
  const set = new Set();
  arr.forEach((x) => {
    if (x && typeof x === 'object' && !(x instanceof Date) && (x.endDate || x.end || x.to)) {
      const a = holidayDateKey(x.date || x.start || x.from); const b = holidayDateKey(x.endDate || x.end || x.to);
      if (a && b && a <= b) {
        let d = new Date(`${a}T12:00:00`); const end = new Date(`${b}T12:00:00`);
        for (let n = 0; d <= end && n < MAX_RANGE_DAYS; n++) { set.add(toDateKey(d)); d = addDays(d, 1); }
        return;
      }
    }
    const k = holidayDateKey(x);
    if (k) set.add(k);
  });
  return [...set].sort();
}

/**
 * The calendar document the web app stores: normally [holidays, leaveDays], but accept
 * { holidays, leaveDays | leave | leaves } and a bare holidays array too.
 */
export function normalizeCalendar(raw) {
  let hol; let leave;
  if (Array.isArray(raw)) {
    if (raw.length === 2 && Array.isArray(raw[0]) && (Array.isArray(raw[1]) || raw[1] === undefined || raw[1] === null)) { hol = raw[0]; leave = raw[1]; }
    else hol = raw;
  } else if (raw && typeof raw === 'object') {
    hol = raw.holidays ?? raw.holiday ?? raw[0];
    leave = raw.leaveDays ?? raw.leave ?? raw.leaves ?? raw[1];
  }
  return { holidays: normalizeHolidays(hol), leaveDays: normalizeLeaveDays(leave) };
}

/**
 * Whether the office is closed on a holiday - the web app's "Office closed" tick. Not set: Indian, company and
 * office holidays are closed, USD (market) holidays are not. A holiday added on the phone with no calendar
 * named is a day off.
 */
export function isOfficeClosed(h) {
  if (!h) return false;
  if (typeof h.officeClosed === 'boolean') return h.officeClosed;
  const tag = String(h.tag ?? h.type ?? '').trim();
  return !tag || /indian|india|company|office/i.test(tag);
}

/** Sunday, a holiday the office is closed on, or a leave day ("YYYY-MM-DD"). */
export function isNonWorkingDay(dateKey, holidays = [], leaveDays = []) {
  const k = holidayDateKey(dateKey);
  if (!k) return false;
  if (new Date(`${k}T12:00:00`).getDay() === 0) return true;
  if ((holidays || []).some((h) => isOfficeClosed(h) && holidayDateStrings(h).includes(k))) return true;
  return (leaveDays || []).some((d) => holidayDateKey(d) === k);
}

/** One or more calendar days forward, skipping Sundays, holidays the office is closed on, and leave days. */
export function nextWorkingDay(dateStr, holidays = [], leaveDays = []) {
  const closed = new Set(holidays.filter(isOfficeClosed).flatMap((h) => holidayDateStrings(h)));
  const leaveSet = new Set(leaveDays.map(holidayDateKey));
  let d = new Date(`${holidayDateKey(dateStr) || toDateKey(new Date())}T12:00:00`);
  // Sunday is the weekly off, so a moved entry never lands on one.
  do { d = addDays(d, 1); } while (d.getDay() === 0 || closed.has(toDateKey(d)) || leaveSet.has(toDateKey(d)));
  return toDateKey(d);
}

/**
 * Daily tasks never fall on a day the office is closed: an open Daily entry due on such a day (today or
 * later) moves to the next working day, recorded as skipped, not done - the web app's autoSkipDailyOnNonWorking.
 * Returns { entries, moved: [{ entry, off, next }] }; the same array when nothing moved.
 */
export function autoSkipDailyOnNonWorking(entries = [], holidays = [], leaveDays = [], now = new Date()) {
  const today = toDateKey(now);
  const moved = [];
  const out = entries.map((e) => {
    if (!isOpen(e) || e.recurrence !== 'daily' || !e.dueAt) return e;
    const due = new Date(e.dueAt);
    if (Number.isNaN(due.getTime())) return e;
    const off = toDateKey(due);
    if (off < today || !isNonWorkingDay(off, holidays, leaveDays)) return e;
    const next = nextWorkingDay(off, holidays, leaveDays);
    if (!next || next === off) return e;
    const [y, m, d] = next.split('-').map(Number);
    const dueAt = new Date(y, m - 1, d, due.getHours(), due.getMinutes()).toISOString();
    const gap = new Date(dueAt).getTime() - due.getTime();
    const dl = e.deadlineAt ? new Date(e.deadlineAt) : null;
    const skippedDates = Array.isArray(e.skippedDates) ? e.skippedDates.slice() : [];
    if (!skippedDates.includes(off)) skippedDates.push(off);
    const row = {
      ...e, dueAt, skippedDates, lastAckDate: null, deadlineAckDate: null, snoozeUntil: null,
      deadlineAt: dl && !Number.isNaN(dl.getTime()) ? new Date(dl.getTime() + gap).toISOString() : e.deadlineAt, ...editedNow(now),
    };
    moved.push({ entry: row, off, next });
    return row;
  });
  return moved.length ? { entries: out, moved } : { entries, moved };
}

export const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A holiday may span date..endDate (a continuous holiday); every day in the range. */
export function holidayDateStrings(h) {
  const a = holidayDateKey(h.date);
  const b = holidayDateKey(h.endDate);
  if (!a) return [];
  if (!b || b <= a) return [a];
  const out = [];
  let d = new Date(`${a}T12:00:00`);
  const end = new Date(`${b}T12:00:00`);
  for (let n = 0; d <= end && n < MAX_RANGE_DAYS; n++) { out.push(toDateKey(d)); d = addDays(d, 1); }
  return out;
}

export function holidaysWithinDays(holidays = [], now = new Date(), days = 7) {
  const today = startOfDay(now);
  const limit = addDays(today, days);
  return holidays.filter((h) => {
    const k = holidayDateKey(h.date);
    if (!k) return false;
    const d = startOfDay(new Date(`${k}T12:00:00`));
    const e = h.endDate && holidayDateKey(h.endDate) > k ? startOfDay(new Date(`${holidayDateKey(h.endDate)}T12:00:00`)) : d;
    return e >= today && d <= limit;       // a multi-day holiday already under way still counts
  }).sort((a, b) => holidayDateKey(a.date).localeCompare(holidayDateKey(b.date)));
}

/**
 * Continuous holidays, as the web app shows them: a holiday joined to the weekend (Saturday, Sunday) and other
 * holidays next to it, two days or more. [{ start, end, days, names }] by start date. A lone holiday with working
 * days on both sides is not a block.
 */
export function holidayBlocks(holidays = []) {
  const days = new Set();
  const nameOf = new Map();
  holidays.forEach((h) => holidayDateStrings(h).forEach((k) => { days.add(k); if (!nameOf.has(k)) nameOf.set(k, h.title || h.name || 'Holiday'); }));
  const at = (k) => new Date(`${k}T12:00:00`);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);      // kept at noon, so days count whole
  const isOff = (d) => d.getDay() === 0 || d.getDay() === 6 || days.has(toDateKey(d));
  const seen = new Set();
  const blocks = [];
  [...days].sort().forEach((k) => {
    if (seen.has(k)) return;
    let start = at(k);
    let end = at(k);
    for (let n = 0; n < MAX_RANGE_DAYS && isOff(addDays(start, -1)); n++) start = addDays(start, -1);
    for (let n = 0; n < MAX_RANGE_DAYS && isOff(addDays(end, 1)); n++) end = addDays(end, 1);
    const count = Math.round((end - start) / 86400000) + 1;
    const names = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const dk = toDateKey(d);
      seen.add(dk);
      if (nameOf.has(dk) && !names.includes(nameOf.get(dk))) names.push(nameOf.get(dk));
    }
    if (count >= 2) blocks.push({ start: toDateKey(start), end: toDateKey(end), days: count, names });
  });
  return blocks.sort((a, b) => a.start.localeCompare(b.start));
}

/* ---------- CSV ---------- */

export const WD_CSV_COLUMNS = [
  'Title', 'Category', 'Priority', 'Status', 'Pending With', 'Reference', 'Recurrence',
  'Repeat every (min)', 'Due date', 'Due time', 'Deadline date', 'Deadline time', 'Notes', 'DAR', 'Done', 'Id',
];

const p2 = (n) => String(n).padStart(2, '0');
const dateCell = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const timeCell = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };

export function entriesToCsvRows(entries = []) {
  return entries.filter((e) => !e.binned).map((e) => ({
    Title: e.title || '', Category: e.category || '', Priority: e.priority || '', Status: e.status || '',
    'Pending With': e.pendingWith || '', Reference: e.reference || '', Recurrence: e.recurrence || 'none', 'Repeat every (min)': e.recurrence === 'custom' ? (e.recurrenceEveryMin || '') : '',
    'Due date': dateCell(e.dueAt), 'Due time': timeCell(e.dueAt),
    'Deadline date': dateCell(e.deadlineAt), 'Deadline time': timeCell(e.deadlineAt),
    Notes: e.notes || '', DAR: e.dar !== false ? 'Yes' : 'No', Done: e.done ? 'Yes' : 'No', Id: e.id || '',
  }));
}

function combineDateTime(dateStr, timeStr) {
  // The export writes 2026-10-05 and 17:30; the same file saved again by Excel comes back as 05/10/2026
  // and 5:30 PM, and reading only the first form dropped every date (and the PM) on import.
  const k = holidayDateKey(typeof dateStr === 'string' ? dateStr.trim() : dateStr);
  if (!k) return null;
  const [y, m, d] = k.split('-').map(Number);
  const t = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(String(timeStr ?? '').trim());
  let hh = t ? Number(t[1]) : 0;
  const mm = t ? Number(t[2]) : 0;
  if (t && t[3]) { if (/pm/i.test(t[3]) && hh < 12) hh += 12; if (/am/i.test(t[3]) && hh === 12) hh = 0; }
  const dt = new Date(y, m - 1, d, hh, mm);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** Imports rows from entriesToCsvRows()'s own shape; dedupes by Id, else by title+due date. */
export function csvRowsToEntries(rows = [], { existing = [] } = {}) {
  const existingIds = new Set(existing.map((e) => e.id));
  const existingKeys = new Set(existing.map((e) => `${e.title}|${dateCell(e.dueAt)}`));
  const out = [];
  for (const r of rows) {
    const title = String(r.Title || r.title || '').trim();
    if (!title) continue;
    const id = String(r.Id || r.id || '').trim();
    const dueAt = combineDateTime(r['Due date'] || r.due_date, r['Due time'] || r.due_time);
    const key = `${title}|${dateCell(dueAt)}`;
    if (id && existingIds.has(id)) continue;
    if (!id && existingKeys.has(key)) continue;
    existingKeys.add(key);
    out.push({
      ...blankEntry(),
      localEditAt: Date.now(),
      id: id || uid(),
      title,
      category: r.Category || r.category || null,
      priority: r.Priority || r.priority || 'Medium',
      status: r.Status || r.status || 'Pending',
      pendingWith: r['Pending With'] || r.pending_with || null,
      reference: r.Reference || r.reference || '',
      recurrence: RECURRENCES.includes(r.Recurrence) ? r.Recurrence : 'none',
      recurrenceEveryMin: Number(r['Repeat every (min)']) || null,
      dueAt,
      deadlineAt: combineDateTime(r['Deadline date'] || r.deadline_date, r['Deadline time'] || r.deadline_time),
      notes: r.Notes || r.notes || '',
      // In the report unless the file says No (a file with no DAR column is in, like a task added here).
      dar: !/^n/i.test(String(r.DAR ?? '').trim()),
      done: /^y/i.test(String(r.Done || '')),
    });
  }
  return out;
}

/* ---------- Time Slots ---------- */

/**
 * If another open entry is due within `holdMin` minutes of `dueAt`, returns
 * the next free slot (that entry's due time + holdMin); otherwise null,
 * meaning the requested time is free.
 */
export function nextFreeSlot(dueAt, entries = [], holdMin = 10, excludeId = null) {
  if (!dueAt || !holdMin) return null;
  const holdMs = holdMin * 60000;
  const held = entries.filter((e) => e.id !== excludeId && isOpen(e) && e.dueAt).map((e) => new Date(e.dueAt).getTime());
  let want = new Date(dueAt).getTime();
  // The slot just after a clash can clash with the next entry along, so keep moving until one is free.
  for (let moved = 0; moved <= held.length; moved++) {
    const clashes = held.filter((t) => Math.abs(t - want) < holdMs);
    if (!clashes.length) return moved ? new Date(want).toISOString() : null;
    want = Math.max(...clashes) + holdMs;
  }
  return new Date(want).toISOString();
}

/* ---------- Walk/Water reminders ---------- */

/** Every reminder time left today, from `now` to `end`, on the `everyMin` grid starting at `start`. */
export function reminderTimesForToday(reminder, now = new Date(), fromStartOfDay = false) {
  if (!reminder?.enabled) return [];
  const [sh, sm] = String(reminder.start || '00:00').split(':').map(Number);
  const [eh, em] = String(reminder.end || '23:59').split(':').map(Number);
  const every = Math.max(5, Number(reminder.everyMin) || 60);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh || 0, sm || 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh || 0, em || 0);
  const out = [];
  for (let t = new Date(start); t <= end; t = new Date(t.getTime() + every * 60000)) {
    if (t > now || (fromStartOfDay && t >= now)) out.push(new Date(t));
  }
  return out;
}

/** Reminder times for today's remainder plus the next `days - 1` days, so they keep coming even if the app isn't opened tomorrow. */
export function reminderTimesAhead(reminder, now = new Date(), days = 3) {
  const out = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, 0, 0, 0, 0);
    // A later day starts at its midnight inclusive: "after now" left out a 00:00 slot on every later day.
    out.push(...reminderTimesForToday(reminder, d === 0 ? now : day, d > 0));
  }
  return out;
}

/**
 * The follow-up alerts for one entry: at the due time, then again after each
 * gap (minutes) until it is done. Only moments still in the future are kept.
 */
export const ENTRY_NAG_AFTER = [0, 10, 30, 60, 120, 240];
export function entryAlertTimes(entry, now = new Date(), gaps = ENTRY_NAG_AFTER) {
  if (!entry || !entry.dueAt || entry.done || entry.binned) return [];
  const due = new Date(entry.dueAt).getTime();
  if (!due) return [];
  return gaps.map((m) => ({ at: new Date(due + m * 60000), after: m })).filter((x) => x.at.getTime() > now.getTime() + 1000);
}

// fullScreen: the due time and deadline ring as an alarm that keeps going until answered. followUps: keep ringing
// again after the due time (+10 min, 30 min, 1 hr, 2 hr, 4 hr) until the entry is done. warningsRing: the
// warnings before the due time ring as alarms too, not just as notifications.
export const DEFAULT_ALERTS = {
  dueLeadMin: [60, 15], deadline: true, fullScreen: true, followUps: true, warningsRing: false, morning: '09:30', evening: '18:00', phoneWhenWebIdle: true, alarmAsNotification: false, alarmBanner: true, holdUntil: 0,
  // Quiet hours (Config > Alerts): nothing rings between quietFrom and quietTo - what falls in them rings once at
  // quietTo instead - and, with quietOffDays, nothing on Sundays, holidays the office is closed on, or leave days.
  // quietExceptHigh lets High priority tasks ring anyway.
  quietHours: false, quietFrom: '21:00', quietTo: '08:00', quietOffDays: false, quietExceptHigh: true,
  // The APK's "week summary is ready" reminder: weekday (0 = Sunday ... 5 = Friday) and time.
  weeklySummary: true, weeklySummaryDay: 5, weeklySummaryTime: '17:30',
};

/** The next `count` times the week summary reminder is due after `now` (the set weekday and time). */
export function weeklySummaryTimes(cfg = {}, now = new Date(), count = 4) {
  const c = { ...DEFAULT_ALERTS, ...(cfg || {}) };
  const day = Math.min(6, Math.max(0, Number(c.weeklySummaryDay) || 0));
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(c.weeklySummaryTime || '')) || [0, '17', '30'];
  const first = new Date(now);
  first.setHours(Number(m[1]), Number(m[2]), 0, 0);
  first.setDate(first.getDate() + ((day - first.getDay() + 7) % 7));
  if (first <= now) first.setDate(first.getDate() + 7);
  return Array.from({ length: count }, (_, i) => { const d = new Date(first); d.setDate(d.getDate() + 7 * i); return d; });
}

// The holidays and leave days quiet hours keep free of alerts: set by the app from what it holds (setAlertOffDays),
// so every place that books alerts sees them without passing them along.
let offDays = { holidays: [], leaveDays: [] };
export function setAlertOffDays(holidays = [], leaveDays = []) {
  offDays = { holidays: normalizeHolidays(holidays), leaveDays: normalizeLeaveDays(leaveDays) };
}

const clockMin = (hhmm, fallback) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')) || /^(\d{1,2}):(\d{2})$/.exec(fallback);
  return Number(m[1]) * 60 + Number(m[2]);
};

/**
 * Whether `at` falls in quiet hours or (with quietOffDays) on a day off - for alerts with no task behind them, such as
 * the walk / water reminders. `cfg` is the alerts settings.
 */
export function isQuietTime(at, cfg = {}) {
  const c = { ...DEFAULT_ALERTS, ...(cfg || {}) };
  return applyQuietHours([{ at, key: 'x' }], null, { ...c, quietExceptHigh: false }).every((x) => x.at.getTime() !== at.getTime());
}

/**
 * Quiet hours applied to one entry's alerts: an alert inside the quiet window moves to the window's end, one on an
 * off day (when chosen) is dropped - it rings again on the next working day as "still overdue". High priority
 * passes untouched when quietExceptHigh is on.
 */
export function applyQuietHours(items0, entry, cfg) {
  // Meeting mode (holdUntil, ms): every alert before that moment - High priority too - waits for it, and rings once then.
  const hold = Number(cfg.holdUntil) || 0;
  const items = hold ? items0.map((x) => (x.at.getTime() < hold ? { ...x, at: new Date(hold), quietMoved: true } : x)) : items0;
  const hours = !!cfg.quietHours;
  const days = !!cfg.quietOffDays;
  if (!hours && !days) return items;
  if (cfg.quietExceptHigh !== false && String(entry?.priority || '').toLowerCase() === 'high') return items;
  const from = clockMin(cfg.quietFrom, '21:00');
  const to = clockMin(cfg.quietTo, '08:00');
  const quiet = (d) => {
    if (!hours || from === to) return false;
    const m = d.getHours() * 60 + d.getMinutes();
    return from < to ? m >= from && m < to : m >= from || m < to;
  };
  const endOf = (d) => {
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(to / 60), to % 60);
    if (end <= d) end.setDate(end.getDate() + 1);
    return end;
  };
  const out = [];
  for (const x of items) {
    const at = quiet(x.at) ? endOf(x.at) : x.at;
    if (days && isNonWorkingDay(toDateKey(at), offDays.holidays, offDays.leaveDays)) continue;
    out.push(at === x.at ? x : { ...x, at, quietMoved: true });
  }
  return out;
}
export const DATE_ONLY_ALERT = '19:00';      // the one alert of a task due on a date with no time
const DEADLINE_LEAD_MIN = [24 * 60, 120, 30];
// How many days ahead the once-a-day "still overdue" reminder is booked; the app books the next days as they come.
export const DAILY_REMINDER_DAYS = 3;

// The setting is typed by hand: anything but a real HH:MM ("25:00", "9:75", "9" half-typed) uses the default
// instead of rolling over into another hour or day.
const atClock = (day, hhmm, fallback) => {
  const ok = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || '').trim()) || /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(fallback);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(ok[1]), Number(ok[2]), 0, 0);
};
const dayShift = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const leadText = (min) => (min >= 24 * 60 ? `${Math.round(min / 1440)} day${min >= 2880 ? 's' : ''}` : min >= 60 ? `${Math.round(min / 60)} hr` : `${min} min`);
const clock = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Every alert one open entry should give, soonest first, future ones only:
 *  - due with a time: a warning before it (alerts.dueLeadMin, e.g. 1 hr and 15 min), an alarm that keeps
 *    ringing at it (alarm: true), then "still pending" follow-up alarms (ENTRY_NAG_AFTER) until it is done;
 *  - due on a date only: the evening before, the morning of, and the next morning if still open;
 *  - a deadline: 1 day, 2 hours and 30 minutes before, and an alarm at it (date only: the evening
 *    before and the morning of).
 * Each item: { at: Date, key, title, body, alarm }.
 */
/**
 * How a task alerts, chosen for each task when it is added: an Alarm rings full screen until you stop it and
 * again while the task stays pending; a Reminder is an ordinary notification, with no ringing alarm and no
 * repeated "still pending" nags (one note a day while overdue). A task without a choice follows Config's
 * "full-screen alarm" switch, as every task did before.
 */
export const ALERT_MODES = [
  { key: 'alarm', label: '🔔 Alarm', hint: 'Rings until you stop it, and again while it stays pending' },
  { key: 'gentle', label: '🔕 Reminder', hint: 'One notification - no ringing, no repeated nags' },
];
/**
 * A task's alert type. Its own choice (made on the phone) wins. Otherwise Config decides: with "Ring like an
 * alarm" off, every task is a Reminder; with it on, `alarmPriorities` (when set) lists the priorities that ring -
 * tasks entered on the web app arrive with only a priority, so this is how they get sorted on the phone.
 */
export function alertModeOf(entry, alerts = DEFAULT_ALERTS) {
  if (entry?.alertMode === 'alarm' || entry?.alertMode === 'gentle') return entry.alertMode;
  const cfg = { ...DEFAULT_ALERTS, ...(alerts || {}) };
  if (cfg.fullScreen === false) return 'gentle';
  if (Array.isArray(cfg.alarmPriorities)) {
    const p = String(entry?.priority || '').trim().toLowerCase();
    return cfg.alarmPriorities.some((x) => String(x).trim().toLowerCase() === p) ? 'alarm' : 'gentle';
  }
  return 'alarm';
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/**
 * A bank follow-up's last follow-up for its alarm: "Last (5 Oct, Mr. Rao, SBI): Awaiting SWIFT copy"; '' for any other
 * task or none yet. (bankFollowUp.js holds the rest of the follow-up rules; it imports this file, so not used here.)
 */
export function lastFollowUpLine(entry) {
  const log = Array.isArray(entry?.bankFollowUps) ? entry.bankFollowUps.filter((f) => f && f.d) : [];
  const f = log[log.length - 1];
  if (!f) return '';
  const d = new Date(f.at || `${f.d}T12:00:00`);
  const when = Number.isNaN(d.getTime()) ? f.d : `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
  const who = [f.banker, f.bank].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  const said = String(f.remarks || '').replace(/\s+/g, ' ').trim().slice(0, 160) || 'no remarks';
  return `Last (${[when, who].filter(Boolean).join(', ')}): ${said}`;
}

/** A warning before the due time or deadline ("Due in 1 hr", "Due tomorrow", "Deadline in 2 hr"): always a notification only, on the phone and the website. */
export const isWarningKey = (key) => /^(due|dl)-(\d+|eve)$/.test(String(key || ''));

export function entryAlertPlan(entry, now = new Date(), alerts = DEFAULT_ALERTS) {
  if (!entry || entry.done || entry.binned) return [];
  const cfg = { ...DEFAULT_ALERTS, ...(alerts || {}) };
  const name = entry.title || 'A Working Dashboard entry';
  const ring = alertModeOf(entry, cfg) === 'alarm';       // this task's own choice: Alarm or Reminder
  const out = [];
  // What the task is, under every alert: priority, category and person, then the mail chain.
  // A bank follow-up also shows the banker's last word, so the call can start from it.
  const details = [[entry.priority, entry.category, entry.pendingWith].filter(Boolean).join(' · '), lastFollowUpLine(entry), String(entry.reference || '').trim().slice(0, 140)].filter(Boolean).join('\n');
  const add = (at, key, title, body, alarm = false) => { if (at instanceof Date && at.getTime() > now.getTime() + 1000) out.push({ at, key, title, body: details ? `${body}\n${details}` : body, alarm }); };

  const due = entry.dueAt ? new Date(entry.dueAt) : null;
  if (due && !Number.isNaN(due.getTime())) {
    if (isDateOnly(due)) {
      // A date with no time alerts once, at 7 PM on that date, and never again (the website does the same).
      add(atClock(due, DATE_ONLY_ALERT, DATE_ONLY_ALERT), 'due-day', 'Due today', name, ring);
    } else {
      for (const m of [...new Set((cfg.dueLeadMin || []).map(Number).filter((x) => x > 0))].sort((a, b) => b - a)) {
        add(new Date(due.getTime() - m * 60000), `due-${m}`, `Due in ${leadText(m)} · ${clock(due)}`, name);       // a warning: never an alarm
      }
      add(due, 'due', `${entry.priority || 'Task'} priority due now`, name, ring);
      // Still open after the due time: ring again, so it cannot be missed (switched off by followUps: false,
      // and never for a Reminder task - it is not urgent).
      if (cfg.followUps !== false && ring) {
        for (const m of ENTRY_NAG_AFTER.filter((x) => x > 0)) add(new Date(due.getTime() + m * 60000), `nag-${m}`, `Still pending: ${name}`, 'Mark it done, or snooze it.', true);
      }
    }
    // Still open on a later day: it rings again at the same time every day until it is done (a task due
    // yesterday at 15:00 rings today at 15:00, tomorrow at 15:00...). A date-only entry rings at the morning time.
    if (cfg.followUps !== false && !isDateOnly(due)) {
      const wasDue = due.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
      for (let k = 1; k <= DAILY_REMINDER_DAYS; k++) {
        const day = dayShift(due, k);
        const at = isDateOnly(due) ? atClock(day, cfg.morning, '09:30') : new Date(day.getFullYear(), day.getMonth(), day.getDate(), due.getHours(), due.getMinutes());
        add(at, `daily-${k}`, `Still overdue: ${name}`, `Was due ${wasDue}. Mark it done, or move it.`, ring);
      }
    }
  }

  // The next reminder the person set (the website's "Next reminder date & time"): one alert at that moment.
  const nr = entry.nextReminderAt ? new Date(entry.nextReminderAt) : null;
  if (nr && !Number.isNaN(nr.getTime())) add(nr, 'reminder', `Reminder: ${name}`, 'Your next reminder for this task.', ring);

  const dl = cfg.deadline && entry.deadlineAt ? new Date(entry.deadlineAt) : null;
  if (dl && !Number.isNaN(dl.getTime())) {
    if (isDateOnly(dl)) {
      add(atClock(dayShift(dl, -1), cfg.evening, '18:00'), 'dl-eve', 'Deadline tomorrow', name);
      add(atClock(dl, cfg.morning, '09:30'), 'dl-day', 'Deadline today', name, ring);
    } else {
      for (const m of DEADLINE_LEAD_MIN) add(new Date(dl.getTime() - m * 60000), `dl-${m}`, `Deadline in ${leadText(m)} · ${clock(dl)}`, name);
      add(dl, 'dl', 'Deadline now', name, ring);
    }
  }
  // Snoozed or silenced on either device: nothing before the snooze ends, and nothing more today once silenced
  // (a deadline only when it was silenced too). A snooze ends with one alert, as on the web app.
  const snoozeEnd = Number(entry.snoozeUntil) || 0;
  const today = toDateKey(now);
  const sameDay = (d) => toDateKey(d) === today;
  let kept = applyQuietHours(out.filter((x) => {
    if (snoozeEnd && x.at.getTime() < snoozeEnd) return false;
    const isDeadline = x.key.startsWith('dl');
    if (sameDay(x.at) && (isDeadline ? entry.deadlineAckDate === today : entry.lastAckDate === today)) return false;
    return true;
  }), entry, cfg);
  if (snoozeEnd > now.getTime() + 1000 && due && !Number.isNaN(due.getTime()) && due.getTime() <= snoozeEnd
    && !(sameDay(new Date(snoozeEnd)) && entry.lastAckDate === today)) {
    kept.push({ at: new Date(snoozeEnd), key: 'snooze', title: `Snoozed: ${name}`, body: 'Mark it done, or snooze it again.', alarm: ring });
  }
  // Alerts within the same minute (a deadline equal to the due time) ring once - as an alarm if either is one.
  kept.sort((a, b) => a.at - b.at || Number(b.alarm) - Number(a.alarm));
  kept = kept.filter((x, i) => !i || x.at - kept[i - 1].at >= 60000);
  return kept;
}

/**
 * Groups of open entries that look like the same task logged twice - same
 * title + category. Completed ones are left out: every completed occurrence of
 * a repeating entry shares its title and category, and listing that history
 * as duplicates (with "Delete this one" next to each) invited deleting it.
 */
export function findDuplicateEntries(entries = []) {
  const map = new Map();
  for (const e of entries) {
    if (!isOpen(e)) continue;
    const key = `${String(e.title || '').trim().toLowerCase()}|${e.category || ''}`;
    if (!key.replace('|', '')) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return [...map.values()].filter((group) => group.length > 1);
}

/**
 * The New Entry form's one-tap due times: [label, ISO]. "In 1 hour", "Today 5 PM" (until 4:30 PM), the next working
 * day at 10 AM ("Tomorrow 10 AM" when that is tomorrow, else e.g. "Mon 10 AM"), and next Monday at 10 AM.
 */
export function quickDueOptions(now = new Date(), holidays = [], leaveDays = []) {
  const at = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
  const out = [];
  const hour = new Date(now.getTime() + 60 * 60000); hour.setSeconds(0, 0);
  out.push(['In 1 hour', hour.toISOString()]);
  if (now.getHours() * 60 + now.getMinutes() < 16 * 60 + 30) out.push(['Today 5 PM', at(now, 17).toISOString()]);
  const nextKey = nextWorkingDay(toDateKey(now), holidays, leaveDays);
  const next = at(new Date(`${nextKey}T12:00:00`), 10);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const label = toDateKey(tomorrow) === nextKey ? 'Tomorrow 10 AM' : `${next.toLocaleDateString('en-IN', { weekday: 'short' })} 10 AM`;
  out.push([label, next.toISOString()]);
  const monday = new Date(now); monday.setDate(monday.getDate() + (((8 - monday.getDay()) % 7) || 7));
  const mon = at(monday, 10);
  if (toDateKey(mon) !== nextKey) out.push(['Next Monday 10 AM', mon.toISOString()]);
  return out;
}

/**
 * web.app's calendar: the weeks (Monday first) of month `month` (0-11) of `year`, each day with the open tasks due on
 * it - [[{ key, day, inMonth, tasks: [entry] }] x 7] - tasks in due-time order.
 */
export function calendarWeeks(entries = [], year, month) {
  const byDay = {};
  for (const e of entries) {
    if (!e || e.done || e.binned || !e.dueAt) continue;
    const d = new Date(e.dueAt);
    if (Number.isNaN(d.getTime())) continue;
    (byDay[toDateKey(d)] = byDay[toDateKey(d)] || []).push(e);
  }
  Object.values(byDay).forEach((l) => l.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)));
  const first = new Date(year, month, 1, 12);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const weeks = [];
  const cur = new Date(start);
  do {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const key = toDateKey(cur);
      week.push({ key, day: cur.getDate(), inMonth: cur.getMonth() === month, tasks: byDay[key] || [] });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  } while (cur.getMonth() === month);
  return weeks;
}
