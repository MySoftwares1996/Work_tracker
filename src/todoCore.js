
const isMinuteRepeat = (r) => r === 'hourly' || r === 'custom';


export const TODO_CATEGORIES = ['personal', 'work', 'health', 'finance', 'shopping'];

// Minutes after the due time: every 2 min for the first 20, every 10 min to the hour, then every
// 30 min out to 12 hours. Booked up front with the OS, and cancelled the moment a Done / Snooze
// option or the reminder itself is tapped. Android caps an app at 500 pending alarms in all, so

// An urgent one-off still open after its alarm rings again this many minutes after the due time,

export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

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

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;



