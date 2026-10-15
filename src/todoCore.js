/**
 * To-Do & reminders: the pure logic, ported from the standalone Todo
 * Reminder app (quick-add parser, repeat dates, progress stats). No React or
 * Expo here, so all of it runs under the node tests.
 *
 * A to-do: { id, title, notes, remindAt (ISO), repeat, priority, category,
 * subtasks: [{ id, text, done }], preReminders: [minutes before; 0 = on
 * time], nag, alert, monthDay, done, notificationIds, createdAt, updatedAt }.
 */
export const REPEATS = ['none', 'hourly', 'custom', 'daily', 'weekdays', 'weekly', 'monthly'];
export const CUSTOM_PRESETS = [5, 10, 15, 30, 45, 90, 120, 180];
const isMinuteRepeat = (r) => r === 'hourly' || r === 'custom';

/** Minutes between occurrences of an hourly / custom-minutes to-do (0 for any other repeat). */
export function repeatStepMin(todo) {
  if (!todo) return 0;
  if (todo.repeat === 'hourly') return 60;
  if (todo.repeat === 'custom') return Math.max(1, Math.round(Number(todo.repeatEveryMin) || 0)) || 0;
  return 0;
}

/** "Every hour", "Every 15 min", "Every 2 h" - or the plain repeat word for the rest. */
export function repeatLabel(todo) {
  const m = repeatStepMin(todo);
  if (!m) return todo?.repeat === 'none' || !todo?.repeat ? 'Once' : todo.repeat;
  if (m === 60) return 'Every hour';
  return m % 60 === 0 ? `Every ${m / 60} h` : `Every ${m} min`;
}
export const PRIORITIES = ['low', 'medium', 'high'];
export const TODO_CATEGORIES = ['personal', 'work', 'health', 'finance', 'shopping'];
export const PRE_OPTIONS = [[10, '10 min before'], [60, '1 hour before'], [1440, '1 day before']];
// Minutes after the due time: every 2 min for the first 20, every 10 min to the hour, then every
// 30 min out to 12 hours. Booked up front with the OS, and cancelled the moment a Done / Snooze
// option or the reminder itself is tapped. Android caps an app at 500 pending alarms in all, so
// the chain is kept to 36 rather than one every 10 minutes (80), which let a handful of nagging
// to-dos crowd out every other reminder in the app.
export const NAG_AFTER = [
  ...Array.from({ length: 10 }, (_, i) => (i + 1) * 2),      // 2, 4 ... 20
  30, 40, 50, 60,
  ...Array.from({ length: 22 }, (_, i) => 90 + i * 30),      // 90, 120 ... 720
];

/*
 * How a to-do rings at its time, chosen per to-do when it is added:
 *  - 'alarm': urgent - a real alarm (full screen, Alarm volume) that keeps ringing until Done or Snooze;
 *  - 'notify': not urgent - an ordinary notification that rings once.
 * To-dos saved before this choice existed have no `alert` and are 'notify'.
 */
export const ALERT_TYPES = ['alarm', 'notify'];
export const alertTypeOf = (todo) => (todo?.alert === 'alarm' ? 'alarm' : 'notify');
// An urgent one-off still open after its alarm rings again this many minutes after the due time,
// until Done, Snooze or opening it. Each ring lasts up to 10 minutes on its own.
export const ALARM_AGAIN_AFTER = [15, 30, 60, 120];
// A repeating urgent to-do books its next few occurrences as alarms; topped up whenever the app opens.
export const ALARM_OCCURRENCES = 6;

/**
 * The alarm moments for an urgent to-do, future ones only, soonest first: { at: Date, key }.
 * A one-off rings at its time and again after ALARM_AGAIN_AFTER (left out once the alarm for this
 * time was answered - nagAck); a repeating one at each of its next ALARM_OCCURRENCES times.
 */
export function todoAlarmTimes(todo, now = new Date()) {
  if (!todo || todo.done || alertTypeOf(todo) !== 'alarm') return [];
  const due = new Date(todo.remindAt);
  if (Number.isNaN(due.getTime())) return [];
  const nowMs = now.getTime() + 1000;
  const out = [];
  if (!todo.repeat || todo.repeat === 'none') {
    out.push({ at: due, key: 'due' });
    if (todo.nagAck !== todo.remindAt) for (const m of ALARM_AGAIN_AFTER) out.push({ at: new Date(due.getTime() + m * 60000), key: `again-${m}` });
    return out.filter((x) => x.at.getTime() > nowMs);
  }
  const anchor = todo.repeat === 'monthly' ? monthDayFor(todo) : todo.monthDay;
  let at = due.getTime() > nowMs ? due : nextOccurrence(todo.remindAt, todo.repeat, anchor, nowMs, todo.repeatEveryMin);
  for (let i = 0; i < ALARM_OCCURRENCES && at.getTime(); i++) {
    out.push({ at, key: `at-${at.getTime()}` });
    at = nextOccurrence(at.toISOString(), todo.repeat, anchor, at.getTime(), todo.repeatEveryMin);
  }
  return out;
}

export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const endOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

/** "Today, 6:00 pm", "Tomorrow, 9:30 am", "Fri 3 Oct, 4:00 pm". */
export function fmtWhen(iso, now = new Date()) {
  const d = new Date(iso);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff === 0) return `Today, ${t}`;
  if (diff === 1) return `Tomorrow, ${t}`;
  if (diff === -1) return `Yesterday, ${t}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${t}`;
}

/** A 'weekdays' to-do can't start on a weekend: move it to Monday. */
export function alignToRepeat(d, repeat) {
  const x = new Date(d);
  if (repeat === 'weekdays') {
    if (x.getDay() === 6) x.setDate(x.getDate() + 2);
    else if (x.getDay() === 0) x.setDate(x.getDate() + 1);
  }
  return x;
}

/** Next occurrence of a repeating to-do, strictly after `now`. Monthly keeps its day (31 -> 30/28 -> 31). */
export function nextOccurrence(iso, repeat, anchorDay, now = Date.now(), everyMin = 0) {
  const d = new Date(iso);
  if (isMinuteRepeat(repeat)) {
    const stepMs = (repeat === 'hourly' ? 60 : Math.max(1, everyMin || 1)) * 60000;
    // Jump straight past `now` rather than stepping minute by minute.
    const behind = Math.max(0, now - d.getTime());
    return new Date(d.getTime() + (Math.floor(behind / stepMs) + 1) * stepMs);
  }
  const anchor = anchorDay ?? d.getDate();
  const step = () => {
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'monthly') {
      d.setDate(1); d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(anchor, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    } else if (repeat === 'weekdays') {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    } else d.setDate(d.getDate() + 1);
  };
  do { step(); } while (d.getTime() <= now);
  return d;
}

/** The next `count` monthly fire times on `day` (clamped to short months), each `offsetMin` early. */
export function monthlyDates(iso, day, count, offsetMin, now = Date.now()) {
  const start = new Date(iso);
  const out = [];
  for (let i = 0; out.length < count && i < 36; i++) {
    const d = new Date(start);
    d.setDate(1); d.setMonth(start.getMonth() + i);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    const fire = new Date(d.getTime() - offsetMin * 60000);
    if (fire.getTime() > now) out.push(fire);
  }
  return out;
}

const DAY_IDX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const SHORT_DAYS = ['mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun'];

/**
 * "Pay rent tomorrow 6pm !high #finance monthly" -> { title, remindAt,
 * repeat, priority, category, preReminders }. Understands today / tonight /
 * tomorrow, weekday names, "in 2 hours", 6pm / 18:30, !high / !low,
 * #category and daily / weekdays / weekly / monthly.
 */
export function parseQuickAdd(input, defaultPre = 10, nowMs = Date.now()) {
  let s = ` ${String(input || '').trim()} `;
  const st = { priority: 'medium', category: 'none', repeat: 'none', rel: null, dayOffset: null, h: null, m: 0 };
  const now = new Date(nowMs);

  s = s.replace(/\s!(high|h|medium|med|m|low|l)\b/i, (_, p) => {
    const c = p[0].toLowerCase(); st.priority = c === 'h' ? 'high' : c === 'l' ? 'low' : 'medium'; return ' ';
  });
  s = s.replace(/\s#(\w+)/, (match, c) => {
    const k = c.toLowerCase();
    if (TODO_CATEGORIES.includes(k)) { st.category = k; return ' '; }
    return match;
  });
  s = s.replace(/\severy\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/i, (_, n, u) => {
    const unit = u[0].toLowerCase();
    const count = Number(n);
    const mins = count * (unit === 'h' ? 60 : unit === 'd' ? 1440 : 1);
    if (!(mins > 0)) return ' ';
    if (unit === 'd' && count === 1) st.repeat = 'daily';
    else if (unit === 'd' && count === 7) st.repeat = 'weekly';
    else if (mins === 60) st.repeat = 'hourly';
    else { st.repeat = 'custom'; st.everyMin = mins; }
    if (st.repeat === 'hourly') st.everyMin = 60;
    return ' ';
  });
  s = s.replace(/\s(hourly|every hour)\b/i, () => { st.repeat = 'hourly'; st.everyMin = 60; return ' '; });
  s = s.replace(/\s(every day|daily|weekdays|weekly|monthly)\b/i, (_, r) => {
    const k = r.toLowerCase(); st.repeat = k === 'every day' ? 'daily' : k; return ' ';
  });
  s = s.replace(/\sin\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/i, (_, n, u) => {
    const k = u[0].toLowerCase();
    st.rel = new Date(nowMs + Number(n) * (k === 'm' ? 60000 : k === 'h' ? 3600000 : 86400000)); return ' ';
  });
  s = s.replace(/\s(?:(on|next|this)\s+)?(today|tonight|tomorrow|tmrw|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)\b/i,
    (m, pre, w, offset, whole) => {
      const k = w.toLowerCase();
      // "Sun cream" stays a title unless clearly a day: prefixed, or followed by a time / the end.
      if (SHORT_DAYS.includes(k) && !pre && !/^\s*(?:$|\d|at\b|@)/.test(whole.slice(offset + m.length))) return m;
      if (k === 'today') st.dayOffset = 0;
      else if (k === 'tonight') { st.dayOffset = 0; st.h = 20; st.tonight = true; }
      else if (k === 'tomorrow' || k === 'tmrw') st.dayOffset = 1;
      else { const diff = (DAY_IDX[k.slice(0, 3)] - now.getDay() + 7) % 7; st.dayOffset = diff === 0 ? 7 : diff; }
      return ' ';
    });
  s = s.replace(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, (_, h, m, ap) => {
    let hh = Number(h) % 12; if (ap.toLowerCase() === 'pm') hh += 12;
    st.h = hh; st.m = m ? Number(m) : 0; return ' ';
  });
  if (st.h === null || st.h === 20) {
    s = s.replace(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/, (_, h, m) => { st.h = Number(h); st.m = Number(m); return ' '; });
  }

  let when;
  if (st.rel) when = st.rel;
  else if (st.dayOffset !== null || st.h !== null) {
    when = new Date(nowMs); when.setDate(when.getDate() + (st.dayOffset ?? 0));
    when.setHours(st.h ?? 9, st.h !== null ? st.m : 0, 0, 0);
    if (st.dayOffset === null && when.getTime() <= nowMs) when.setDate(when.getDate() + 1);
    // "tonight" with no time means 8 pm; typed after 8 pm it would already be past, so ring in an hour instead.
    if (st.tonight && st.h === 20 && st.m === 0 && when.getTime() <= nowMs) when = new Date(nowMs + 3600000);
  } else when = new Date(nowMs + 3600000);
  when = alignToRepeat(when, st.repeat);

  let title = s.replace(/\s+/g, ' ').trim() || String(input || '').trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return {
    title, remindAt: when.toISOString(), repeat: st.repeat, repeatEveryMin: st.repeat === 'custom' ? st.everyMin : undefined,
    priority: st.priority, category: st.category,
    preReminders: defaultPre > 0 ? [0, defaultPre] : [0],
  };
}

/**
 * Ticking a to-do done. A repeating one rolls forward to its next
 * occurrence (checklist reset) instead of closing; a one-off is marked done.
 */
/**
 * The day a monthly to-do repeats on. The remembered day only counts while it still matches the due date
 * (one on the 31st shows the 30th in a 30-day month); once the date is changed by hand, the new day is the
 * one it repeats on - the old day kept being booked, so it rang on the 31st after being moved to the 15th.
 */
export function monthDayFor(todo) {
  const d = new Date(todo.remindAt);
  if (Number.isNaN(d.getTime())) return todo.monthDay;
  const inMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return todo.monthDay && Math.min(todo.monthDay, inMonth) === d.getDate() ? todo.monthDay : d.getDate();
}

export function completeTodo(todo, now = Date.now()) {
  if (todo.repeat && todo.repeat !== 'none') {
    return {
      ...todo, done: false, updatedAt: now,
      remindAt: nextOccurrence(todo.remindAt, todo.repeat, todo.repeat === 'monthly' ? monthDayFor(todo) : todo.monthDay, now, todo.repeatEveryMin).toISOString(),
      subtasks: (todo.subtasks || []).map((x) => ({ ...x, done: false })),
    };
  }
  return { ...todo, done: true, updatedAt: now };
}

/** Which list a to-do shows under: overdue and due-today in Today, later in Upcoming. */
export function todoBucket(todo, now = new Date()) {
  if (todo.done) return 'done';
  return new Date(todo.remindAt).getTime() <= endOfDay(now).getTime() ? 'today' : 'upcoming';
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Progress from the completion log (ISO times): today, last 7 days, all time, day streak. */
export function computeTodoStats(log = [], now = new Date()) {
  const counts = {};
  for (const iso of log) { const k = dayKey(new Date(iso)); counts[k] = (counts[k] || 0) + 1; }
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i));
    return { label: d.toLocaleDateString([], { weekday: 'short' }).slice(0, 2), count: counts[dayKey(d)] || 0 };
  });
  const d = new Date(now);
  if (!counts[dayKey(d)]) d.setDate(d.getDate() - 1);   // a streak survives until today ends
  let streak = 0;
  while (counts[dayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return {
    today: counts[dayKey(now)] || 0,
    week: last7.reduce((a, b) => a + b.count, 0),
    total: log.length,
    streak,
    last7,
  };
}

/** Does this to-do fall on calendar day `day` (repeats included)? */
export function occursOn(todo, day) {
  if (todo.done) return false;
  const due = new Date(todo.remindAt);
  const d0 = startOfDay(day).getTime();
  const start = startOfDay(due).getTime();
  if (todo.repeat === 'none' || !todo.repeat) return start === d0;
  if (d0 < start) return false;                       // repeats begin on their first date
  const dow = new Date(d0).getDay();
  if (todo.repeat === 'daily' || isMinuteRepeat(todo.repeat)) return true;
  if (todo.repeat === 'weekdays') return dow !== 0 && dow !== 6;
  if (todo.repeat === 'weekly') return dow === due.getDay();
  if (todo.repeat === 'monthly') {
    const d = new Date(d0);
    const want = monthDayFor(todo) ?? due.getDate();
    return d.getDate() === Math.min(want, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  }
  return false;
}

/**
 * The morning digest text for `day`: what is due that day (earliest first)
 * and how many one-off to-dos are already overdue going into it.
 */
export function digestFor(items = [], day) {
  const d0 = startOfDay(day).getTime();
  const due = items.filter((x) => occursOn(x, day))
    .sort((a, b) => (new Date(a.remindAt).getHours() * 60 + new Date(a.remindAt).getMinutes()) - (new Date(b.remindAt).getHours() * 60 + new Date(b.remindAt).getMinutes()));
  const overdue = items.filter((x) => !x.done && (x.repeat === 'none' || !x.repeat) && new Date(x.remindAt).getTime() < d0).length;
  const names = due.slice(0, 3).map((x) => x.title);
  const more = due.length > 3 ? ` +${due.length - 3} more` : '';
  let body = due.length
    ? `${due.length} to-do${due.length === 1 ? '' : 's'} today: ${names.join(', ')}${more}`
    : 'Nothing scheduled today.';
  if (overdue) body += ` · ${overdue} overdue`;
  return { count: due.length, overdue, title: 'Good morning ☀️', body };
}
