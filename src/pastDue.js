/**
 * The "Past Due Alert" list and what its buttons do to an entry. Pure, so it is tested; the screen
 * (screens/PastDueAlert.js) saves what these return.
 */
import { isOverdue, isSnoozed, isSilencedToday, entryAlertPlan, isOpen, nextWorkingDay, holidayDateKey, holidayDateStrings, normalizeHolidays, normalizeLeaveDays, editedNow, toDateKey, isOfficeClosed, skipEntryToday } from './workingDashboard';

/** Open entries past their due time, the longest overdue first. */
export function pastDueEntries(entries = [], now = new Date()) {
  // Snoozed or silenced for today - on this phone or on the web app - is answered for now, as on the web app's own list.
  return entries.filter((e) => isOverdue(e, now) && !isSnoozed(e, now) && !isSilencedToday(e, now)).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

/** The holiday or leave day an entry's due date falls on (the office is closed), or null: { name, date }. */
export function closedOn(entry, holidays = [], leaveDays = []) {
  if (!entry?.dueAt) return null;
  const key = toDateKey(new Date(entry.dueAt));
  // Only a holiday the office is closed on (a USD market holiday is a working day here).
  const hol = normalizeHolidays(holidays).find((h) => isOfficeClosed(h) && holidayDateStrings(h).includes(key));
  if (hol) return { name: hol.title, date: key };
  if (normalizeLeaveDays(leaveDays).some((d) => holidayDateKey(d) === key)) return { name: 'a leave day', date: key };
  return null;
}

/**
 * The same time of day on the next working day - counted from today when the entry is already overdue. Counted
 * from its old due date, an entry 10 days late was "moved" to a day that had also passed, and stayed past due.
 */
export function postponeDue(entry, holidays = [], leaveDays = [], now = new Date()) {
  const due = new Date(entry.dueAt);
  const hols = normalizeHolidays(holidays); const leave = normalizeLeaveDays(leaveDays);
  const at = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, due.getHours(), due.getMinutes()); };
  let from = toDateKey(due);
  if (due < now) {
    // Today itself if it is a working day and that time is still ahead; else the next working day after today.
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    from = toDateKey(yesterday);
  }
  let next = at(nextWorkingDay(from, hols, leave));
  if (next <= now) next = at(nextWorkingDay(toDateKey(next), hols, leave));
  return next.toISOString();
}

/** A remark added to the entry's notes, dated: "[5 Oct] text". Empty remark: unchanged. */
export function withRemark(entry, remark, now = new Date()) {
  const text = String(remark || '').trim();
  if (!text) return entry;
  const stamp = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  // Stamped as a phone edit, so the remark reaches the web app through Realtime Sync like any other change.
  return { ...entry, notes: [entry.notes, `[${stamp}] ${text}`].filter(Boolean).join('\n'), ...editedNow(now) };
}

/** Moved to another date and time. */
export const moveEntry = (entry, dueAtIso, now = new Date()) => {
  // A new time starts afresh: an earlier snooze, Silence or Skip must not swallow the alert at the new time.
  const today = toDateKey(now);
  const skippedDates = Array.isArray(entry.skippedDates) ? entry.skippedDates.filter((d) => d !== today) : [];
  return { ...entry, dueAt: dueAtIso, snoozeCount: 0, snoozeUntil: 0, lastAckDate: '', deadlineAckDate: '', skippedDates, ...editedNow(now) };
};

/**
 * After SNOOZE_NUDGE_AFTER snoozes the alert offers what usually helps: the next working day at the morning time, and - when
 * the person list has a bank - handing it over as "Pending with <bank>". Returns [{ key, label, patch? , dueAt? }].
 */
export function snoozeSuggestions(entry, { holidays = [], leaveDays = [], assignees = [], morning = '10:00', now = new Date(), after = 3, bankWord = 'bank' } = {}) {
  if (!entry || (Number(entry.snoozeCount) || 0) < after) return [];
  const out = [];
  const [hh, mm] = String(morning || '10:00').split(':').map(Number);
  const key = toDateKey(now);
  const next = nextWorkingDay(key, normalizeHolidays(holidays), normalizeLeaveDays(leaveDays));
  const [y, m, d] = String(next).split('-').map(Number);
  const when = new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 10, Number.isFinite(mm) ? mm : 0);
  out.push({ key: 'tomorrow', label: `Move to ${next === key ? 'later today' : 'the next working day'} ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, dueAt: when.toISOString() });
  const word = String(bankWord || 'bank').trim().toLowerCase();
  const bank = word ? (assignees || []).find((a) => String(a).toLowerCase().includes(word) && String(a) !== entry.pendingWith) : null;
  if (bank) out.push({ key: 'bank', label: `Pending with ${bank}`, patch: { pendingWith: bank, status: 'Pending' } });
  return out;
}

/**
 * Skip, as on the web app: today's work was not done, and that is not a completion. The entry stays open and
 * overdue, is silenced for today, and is marked skipped today so today's Daily Activity Report never lists it.
 * Works for any entry. Returns { skipped, next: null } (nothing new opens), or null without an entry.
 */
export function skipOccurrence(entry, entries = [], now = new Date()) {
  if (!entry) return null;
  return { skipped: skipEntryToday(entry, now), next: null };
}

/** Minutes from now until tomorrow's morning time ("09:30"): how long "Silence today" stays quiet. */
export function silenceMinutes(now = new Date(), morning = '09:30') {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(morning || '').trim());
  const [h, mi] = m ? [Number(m[1]), Number(m[2])] : [9, 30];
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, mi);
  return Math.max(1, Math.round((at - now) / 60000));
}

/** The id of the entry behind an alarm id "wd:<entry id>:<alert key>", or null. */
export const entryOfAlarm = (alarmId) => {
  const m = /^wd:(.+):[^:]+$/.exec(String(alarmId || ''));
  return m ? m[1] : null;
};

/**
 * The entries whose alarm is going off now - the task that rang, and any other whose alarm falls at the same
 * moment (within `windowMin` minutes) - so the alert shows what rang and nothing else.
 */
export function ringingEntries(entries = [], alarmId, now = new Date(), alerts, windowMin = 3) {
  const focus = entryOfAlarm(alarmId);
  const from = new Date(now.getTime() - windowMin * 60000);
  return entries.filter((e) => isOpen(e) && (
    String(e.id) === focus ||
    entryAlertPlan(e, from, alerts).some((x) => x.alarm && x.at.getTime() <= now.getTime() + 60000)
  ));
}
