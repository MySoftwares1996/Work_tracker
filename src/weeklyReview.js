/**
 * The "This week" review card (phone Home and website Dashboard). Pure logic - no React / React Native imports - so the website
 * (newweb) and the node tests can both import it.
 *
 * Reads either task shape: the phone's entry (`dueAt` ISO text, `completedAt`, `snoozeCount`) and the website's task (`due` Date,
 * `hasTime`, `completedAt` Date, `snoozeCount`). Counting follows workingDashboard.js: a timed task is overdue once its time has
 * passed, a date-only one once its day has passed; "next 7 days" is tomorrow .. 7 days ahead (the Next 7 Days tile).
 */
export const SLIP_SNOOZES = 3;
export const SLIP_OVERDUE_DAYS = 7;
export const DUE_SOON_LIST = 5;

const DAY = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isOpen = (e) => !!e && !e.done && !e.binned && !e.purged;

function dueOf(e) {
  const v = e.dueAt || e.due;
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** A date-only due (no time): the website says so with hasTime=false, the phone stores 00:00. */
const dateOnly = (e, d) => (typeof e.hasTime === 'boolean' && !e.dueAt ? !e.hasTime : d.getHours() === 0 && d.getMinutes() === 0);
const overdueAt = (e, d, now) => (dateOnly(e, d) ? startOfDay(d) < startOfDay(now) : d < now);

function completedMs(e) {
  for (const k of ['completedAt', 'completedOn', 'completedDate', 'doneAt', 'closedAt']) {
    const v = e[k];
    if (!v) continue;
    const ms = typeof v === 'object' && typeof v.seconds === 'number' ? v.seconds * 1000 : new Date(v).getTime();
    if (ms > DAY) return ms; // a 1970 value is a placeholder
  }
  return 0;
}

/** Monday 00:00 of the week `now` falls in. */
export const weekStart = (now) => addDays(startOfDay(now), -((now.getDay() + 6) % 7));

/**
 * { slipping: [{ entry, snoozes, daysOverdue, why }] (worst first), dueSoon: { count, first: [entry x5], offDays: [ids] },
 *   doneThisWeek, overdue, empty }.
 * `holidays` / `leaveDays` (lists of 'YYYY-MM-DD' or { date }) only flag a due-soon task that falls on a day off (`offDays`).
 */
export function weeklyReview(entries, now = new Date(), { holidays = [], leaveDays = [] } = {}) {
  const off = new Set([...(holidays || []), ...(leaveDays || [])].map((x) => String((x && x.date) || x).slice(0, 10)));
  const today = startOfDay(now);
  const in7 = addDays(today, 7);
  const monday = weekStart(now).getTime();
  const slipping = [];
  const soon = [];
  let overdue = 0;
  let doneThisWeek = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e) continue;
    if (e.done && !e.binned && !e.purged) {
      const c = completedMs(e);
      if (c >= monday && c <= now.getTime() + DAY) doneThisWeek += 1;
      continue;
    }
    if (!isOpen(e)) continue;
    const d = dueOf(e);
    const isLate = !!d && overdueAt(e, d, now);
    if (isLate) overdue += 1;
    const snoozes = Number(e.snoozeCount) || 0;
    const daysOverdue = isLate ? Math.round((today - startOfDay(d)) / DAY) : 0;
    if (snoozes >= SLIP_SNOOZES || daysOverdue >= SLIP_OVERDUE_DAYS) {
      slipping.push({ entry: e, snoozes, daysOverdue, why: snoozes >= SLIP_SNOOZES && daysOverdue >= SLIP_OVERDUE_DAYS ? 'both' : snoozes >= SLIP_SNOOZES ? 'snoozed' : 'overdue' });
    }
    if (d) {
      const day = startOfDay(d);
      if (day > today && day <= in7) soon.push({ e, t: d.getTime() });
    }
  }
  slipping.sort((a, b) => b.daysOverdue - a.daysOverdue || b.snoozes - a.snoozes);
  soon.sort((a, b) => a.t - b.t);
  const first = soon.slice(0, DUE_SOON_LIST).map((x) => x.e);
  return {
    slipping,
    dueSoon: { count: soon.length, first, offDays: first.filter((e) => off.has(key(dueOf(e)))).map((e) => e.id) },
    doneThisWeek,
    overdue,
    empty: !slipping.length && !soon.length && !doneThisWeek && !overdue,
  };
}

/** "snoozed 4×", "9 days overdue" - the short reason a task is slipping. */
export function slipReason(s) {
  const parts = [];
  if (s.snoozes >= SLIP_SNOOZES) parts.push(`snoozed ${s.snoozes}×`);
  if (s.daysOverdue >= SLIP_OVERDUE_DAYS) parts.push(`${s.daysOverdue} days overdue`);
  return parts.join(' · ');
}
