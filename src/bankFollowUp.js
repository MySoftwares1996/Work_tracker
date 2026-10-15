/**
 * Bank follow-ups: a task in "Bank Follow Up's" or "Urgent Bank Follow Up's" stays open for weeks. Each day it is
 * followed up with the bankers, who give an update and the next date to follow up on. Each follow-up is kept on the
 * entry (`bankFollowUps`, synced with the web app under that name) and the Daily Activity Report writes the day's
 * follow-up and the banker's update from it.
 *
 * Pure (no React, no storage), like workingDashboard.js.
 */
import { noteWork, isUnstartedStatus } from './workingDashboardPayments';
import { editedNow, isNonWorkingDay } from './workingDashboard';

const s = (v) => String(v === undefined || v === null ? '' : v);
const p2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Bank Follow Up's", "Urgent Bank Follow Up's", "Bank Follow-ups"... */
export const isBankFollowUpCategory = (cat) => /bank/i.test(s(cat)) && /follow\s*-?\s*ups?\b/i.test(s(cat));

/** The entry's follow-ups, oldest first: [{ d: 'YYYY-MM-DD', at: ISO, remarks, next: ISO | null }]. */
export const bankFollowUps = (e) => (Array.isArray(e?.bankFollowUps) ? e.bankFollowUps.filter((f) => f && f.d) : []);

/** The follow-ups made on `date` (YYYY-MM-DD). */
export const followUpsOn = (e, date) => bankFollowUps(e).filter((f) => f.d === date);

/** "9 Oct 2026". */
export function fmtFollowDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The next working day at the entry's due time (10:00 when it has none) - where the next follow-up date starts.
 * Sundays, holidays the office is closed on and leave days are skipped: the bank is not called on those.
 */
export function defaultNextFollowUp(e, now = new Date(), { holidays = [], leaveDays = [] } = {}) {
  const due = e?.dueAt ? new Date(e.dueAt) : null;
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  for (let i = 0; i < 60 && isNonWorkingDay(dayKey(next), holidays, leaveDays); i++) next.setDate(next.getDate() + 1);
  if (due && !Number.isNaN(due.getTime())) next.setHours(due.getHours(), due.getMinutes(), 0, 0);
  else next.setHours(10, 0, 0, 0);
  return next.toISOString();
}

/**
 * Records today's follow-up: the banker's remarks and the next follow-up date. The entry stays open, is due (and
 * alerts) again on the next date, moves off "Not Yet Started", and today goes into its work log so the Daily
 * Activity Report lists it.
 */
export function addBankFollowUp(e, { remarks, next, bank, banker } = {}, now = new Date()) {
  const text = s(remarks).replace(/\s+/g, ' ').trim();
  const nextDate = next ? new Date(next) : null;
  const okNext = nextDate && !Number.isNaN(nextDate.getTime());
  const item = { d: dayKey(now), at: now.toISOString(), remarks: text, next: okNext ? nextDate.toISOString() : null };
  // Who was spoken to, when given: the bank and the banker's name (kept only when filled in).
  const bk = s(bank).replace(/\s+/g, ' ').trim();
  const who = s(banker).replace(/\s+/g, ' ').trim();
  if (bk) item.bank = bk;
  if (who) item.banker = who;
  const status = !s(e.status).trim() || isUnstartedStatus(e.status) ? 'In-Progress' : e.status;
  let row = { ...e, status, bankFollowUps: [...bankFollowUps(e), item] };
  if (okNext) row = { ...row, dueAt: nextDate.toISOString(), snoozeUntil: null, lastAckDate: null };
  row = noteWork(row, 'Followed up', now);
  return { ...row, ...editedNow(now) };
}

/**
 * The report line for a bank follow-up on `date`, or '' when it was not followed up that day:
 * "Title: Followed up with the bank. Banker's update: .... Next follow-up: 9 Oct 2026."
 * A task completed that day ends with "Completed." instead of a next date.
 */
export function bankFollowUpReportLine(e, date) {
  const today = followUpsOn(e, date);
  const title = s(e.title).replace(/\s+/g, ' ').trim().replace(/[.:;,\s]+$/, '');
  const escalated = e?.escalation?.escalatedOn === date;
  if (!today.length) return escalated ? `${title}: Escalated to manager (open ${followUpAge(e, new Date(`${date}T12:00:00`)).days} days).` : '';
  const updates = today.map((f) => s(f.remarks).trim().replace(/[.;\s]+$/, '')).filter(Boolean);
  const last = today[today.length - 1];
  // "Followed up with Mr. Rao, SBI." when the day's follow-up named who it was with.
  const withWho = today.map(followUpWho).filter(Boolean).pop() || '';
  let line = withWho ? `${title}: Followed up with ${withWho}.` : `${title}: Followed up with the bank.`;
  if (updates.length) line += ` Banker's update: ${updates.join('; ')}.`;
  if (e.done) line += ' Completed.';
  else if (last.next) line += ` Next follow-up: ${fmtFollowDate(last.next)}.`;
  if (escalated) line += ' Escalated to manager.';
  return line;
}

/**
 * How long a bank follow-up has been open, for its card: { days, count } - whole days since it was created (its
 * first follow-up when that is older) and how many follow-ups it has had.
 */
export function followUpAge(e, now = new Date()) {
  const log = bankFollowUps(e);
  const starts = [e?.createdAt, log[0]?.at || (log[0]?.d ? `${log[0].d}T12:00:00` : null)]
    .map((x) => (x ? new Date(x).getTime() : NaN)).filter((x) => Number.isFinite(x));
  const start = starts.length ? Math.min(...starts) : NaN;
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  const b = Number.isFinite(start) ? new Date(start) : null;
  if (b) b.setHours(0, 0, 0, 0);
  return { days: b ? Math.max(0, Math.round((a - b) / 86400000)) : 0, count: log.length };
}

/** "Open 12 days · 4 follow-ups" (no follow-ups yet: "Open 12 days"). */
export function followUpAgeText(e, now = new Date()) {
  const { days, count } = followUpAge(e, now);
  const open = `Open ${days} day${days === 1 ? '' : 's'}`;
  return count ? `${open} · ${count} follow-up${count === 1 ? '' : 's'}` : open;
}

/**
 * The Dashboard's "Follow-ups today": open bank follow-up tasks due by the end of today (overdue first, then by due
 * time), each with its last follow-up - [{ entry, overdue, last }].
 */
export function followUpsDueToday(entries = [], now = new Date()) {
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  return entries
    .filter((e) => e && !e.done && !e.binned && isBankFollowUpCategory(e.category) && e.dueAt)
    .map((e) => ({ e, at: new Date(e.dueAt) }))
    .filter(({ at }) => !Number.isNaN(at.getTime()) && at <= end)
    // Long pending ones first, then by due time.
    .sort((x, y) => Number(isLongPending(y.e, now)) - Number(isLongPending(x.e, now)) || x.at - y.at)
    .map(({ e, at }) => {
      const log = bankFollowUps(e);
      return { entry: e, overdue: at < now, last: log.length ? log[log.length - 1] : null, long: isLongPending(e, now) };
    });
}

/** A bank follow-up open this many days or more is marked "Long pending" and listed first. */
export const LONG_PENDING_DAYS = 15;
export const isLongPending = (e, now = new Date()) => isBankFollowUpCategory(e?.category) && !e?.done && followUpAge(e, now).days >= LONG_PENDING_DAYS;

/** "Mr. Rao, SBI" - who the follow-up was with, or ''. */
export function followUpWho(f) {
  return [s(f?.banker).trim(), s(f?.bank).trim()].filter(Boolean).join(', ');
}

/** The quick remarks offered on the follow-up form until the list is changed there. */
export const DEFAULT_QUICK_REMARKS = ['Under process', 'Documents pending', 'Awaiting SWIFT copy', 'Escalated to branch head', 'Will revert tomorrow'];

/** A quick remark tapped: it becomes the remarks, or is added after what is already written ("...; Under process"). */
export function withQuickRemark(current, remark) {
  const now = String(current || '').trim().replace(/[;.,\s]+$/, '');
  const add = String(remark || '').trim();
  if (!add) return String(current || '');
  if (!now) return add;
  if (now.toLowerCase().split(/;\s*/).includes(add.toLowerCase())) return now;
  return `${now}; ${add}`;
}

/**
 * Open bank follow-ups grouped by bank (the latest bank named on each; "Bank not named" when none was), the bank with
 * the most open first: [{ bank, open, overdue, oldestDays, longPending, titles }].
 */
export function followUpsByBank(entries = [], now = new Date()) {
  const groups = new Map();
  for (const e of entries) {
    if (!e || e.done || e.binned || !isBankFollowUpCategory(e.category)) continue;
    const named = bankFollowUps(e).map((f) => s(f.bank).trim()).filter(Boolean).pop();
    const bank = named || 'Bank not named';
    const g = groups.get(bank.toLowerCase()) || { bank, open: 0, overdue: 0, oldestDays: 0, longPending: 0, titles: [] };
    const due = e.dueAt ? new Date(e.dueAt) : null;
    g.open += 1;
    if (due && !Number.isNaN(due.getTime()) && due < now) g.overdue += 1;
    g.oldestDays = Math.max(g.oldestDays, followUpAge(e, now).days);
    if (isLongPending(e, now)) g.longPending += 1;
    g.titles.push(s(e.title).trim());
    groups.set(bank.toLowerCase(), g);
  }
  return [...groups.values()].sort((a, b) => (a.bank === 'Bank not named') - (b.bank === 'Bank not named') || b.open - a.open || b.oldestDays - a.oldestDays);
}

/**
 * A follow-up open LONG_PENDING_DAYS or more, not High priority, and not asked about before: the card offers once to
 * raise it to High and escalate it to the manager.
 */
export const needsEscalationPrompt = (e, now = new Date()) => isLongPending(e, now) && s(e.priority).toLowerCase() !== 'high' && !e?.escalation?.asked;

/** "Raise to High": High priority, and "Escalated to manager" goes into today's Daily Activity Report. */
export function escalateFollowUp(e, now = new Date()) {
  const d = dayKey(now);
  return { ...noteWork({ ...e, priority: 'High', escalation: { asked: d, escalatedOn: d } }, 'Escalated', now), ...editedNow(now) };
}

/** "Not now": not asked again for this task. */
export const declineEscalation = (e, now = new Date()) => ({ ...e, escalation: { ...(e.escalation || {}), asked: dayKey(now) }, ...editedNow(now) });
