/**
 * What each home-screen widget shows, worked out from the saved data. Pure,
 * so it is tested; src/widgets.js only turns these into widget layouts.
 *
 * When the app lock is on, widgets show no figures unless "Show details on
 * widgets" is turned on in Settings - otherwise the lock could be read
 * straight off the home screen.
 */
import { isOpen, isOverdue, isDueToday, isDateOnly } from './workingDashboard';

export const WIDGET_NAMES = ['WorkSummaryWidget', 'WorkTodayWidget', 'WorkNextWidget'];

export function widgetsHidden(db) {
  const lock = db?.settings?.appLock || {};
  return !!lock.enabled && !db?.settings?.widgets?.showWhenLocked;
}

const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const wdEntries = (db) => (db?.workingDashboard?.entries || []).filter((e) => e && isOpen(e));
const dueMs = (e) => (e.dueAt ? new Date(e.dueAt).getTime() : Infinity);
const shortDay = (d) => d.toLocaleDateString([], { day: 'numeric', month: 'short' });
/** "3:00 PM" for a timed due, "Today" for a date-only one. */
const dueClock = (e) => { const d = new Date(e.dueAt); return isDateOnly(d) ? 'Today' : hhmm(e.dueAt); };

/** Overdue, due today and open counts, and the next thing due. */
export function workSummaryWidgetData(db, now = new Date()) {
  const open = wdEntries(db);
  const overdue = open.filter((e) => isOverdue(e, now)).length;
  const today = open.filter((e) => isDueToday(e, now)).length;
  const next = open.filter((e) => e.dueAt && dueMs(e) >= now.getTime()).sort((a, b) => dueMs(a) - dueMs(b))[0];
  return {
    overdue, today, open: open.length,
    headline: overdue ? `${overdue} overdue` : today ? `${today} due today` : open.length ? 'On track' : 'All clear 🎉',
    nextLine: next ? `Next: ${next.title || 'Entry'} · ${isDueToday(next, now) ? dueClock(next) : shortDay(new Date(next.dueAt))}` : 'Nothing else scheduled',
  };
}

/** Overdue first (oldest first), then today's by time: what to work on now. */
export function workTodayWidgetData(db, now = new Date(), max = 5) {
  const open = wdEntries(db);
  const overdue = open.filter((e) => isOverdue(e, now)).sort((a, b) => dueMs(a) - dueMs(b))
    .map((e) => ({ id: e.id, title: e.title || 'Entry', when: `Overdue · ${shortDay(new Date(e.dueAt))}`, late: true, high: e.priority === 'High' }));
  const today = open.filter((e) => isDueToday(e, now)).sort((a, b) => dueMs(a) - dueMs(b))
    .map((e) => ({ id: e.id, title: e.title || 'Entry', when: dueClock(e), late: false, high: e.priority === 'High' }));
  const rows = [...overdue, ...today];
  return {
    headline: rows.length ? `${today.length} today${overdue.length ? ` · ${overdue.length} overdue` : ''}` : 'All clear 🎉',
    rows: rows.slice(0, max),
    more: Math.max(0, rows.length - max),
  };
}

const untilText = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 60) return `in ${Math.max(1, m)} min`;
  if (m < 24 * 60) return `in ${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`;
  const d = Math.round(m / 1440);
  return d === 1 ? 'tomorrow' : `in ${d} days`;
};

/** The next timed due (or today's first date-only one), and the nearest deadline. */
export function workNextWidgetData(db, now = new Date()) {
  const open = wdEntries(db);
  const ahead = open.filter((e) => e.dueAt && (dueMs(e) >= now.getTime() || isDueToday(e, now)) && !isOverdue(e, now))
    .sort((a, b) => dueMs(a) - dueMs(b));
  const next = ahead.find((e) => !isDateOnly(new Date(e.dueAt)) && dueMs(e) >= now.getTime()) || ahead[0] || null;
  const dl = open.filter((e) => e.deadlineAt && new Date(e.deadlineAt).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.deadlineAt) - new Date(b.deadlineAt))[0];
  return {
    has: !!next,
    title: next ? (next.title || 'Entry') : 'Nothing due next',
    when: next ? (isDateOnly(new Date(next.dueAt)) ? (isDueToday(next, now) ? 'Today' : shortDay(new Date(next.dueAt))) : `${isDueToday(next, now) ? 'Today' : shortDay(new Date(next.dueAt))} ${hhmm(next.dueAt)} · ${untilText(dueMs(next) - now.getTime())}`) : 'Enjoy the quiet',
    priority: next?.priority || '',
    high: next?.priority === 'High',
    deadline: dl ? `⏳ ${dl.title || 'Entry'} · ${shortDay(new Date(dl.deadlineAt))}` : '',
  };
}
