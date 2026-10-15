/**
 * The task data, in the shape the phone app and the old website already share (users/<uid>/tasks, the "web app's task
 * document"): description, dueDate + dueTime, mailChain, status "Completed", deleted... Nothing here touches Firebase, so
 * it is unit tested (tests/data.test.js). Writes use merge, so fields this app does not know are left as they are.
 */
export const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

export const DONE_STATUS = /^(completed|complete|done|closed|resolved|finished)$/i;
export const DEFAULT_LISTS = {
  categories: ['Payments', 'Bank', 'Audit', 'Meeting', 'Follow-up', 'Other'],
  priorities: ['High', 'Medium', 'Low'],
  statuses: ['Not Yet Started', 'Pending', 'In Progress', 'Waiting', 'Completed'],
  pendingWith: [],
};
export const RECURRENCES = ["Doesn't repeat", 'Hourly', 'Custom', 'Daily', 'Weekdays', 'Weekly', 'Monthly'];
export const LIST_KEYS = ['categories', 'priorities', 'statuses', 'pendingWith'];

/** A due date as the document keeps it ("2026-10-15", plus "17:30" when it has a time) -> a Date, or null. */
export function parseDue(dueDate, dueTime) {
  const v = String(dueDate || '').trim();
  if (!v) return null;
  let d = null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  else {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) d = new Date(t);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  const tm = /^(\d{1,2}):(\d{2})/.exec(String(dueTime || '').trim());
  if (tm) d.setHours(Number(tm[1]), Number(tm[2]), 0, 0);
  return d;
}

const asDate = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** A Firestore task document -> what the screens show. */
export function fromDoc(id, d = {}) {
  const status = String(d.status || '');
  const done = DONE_STATUS.test(status) || d.done === true;
  const keyPoints = Array.isArray(d.keyPoints) ? d.keyPoints.filter((k) => k && (k.key || k.value)) : [];
  return {
    id: String(d.id || id),
    title: String(d.description || d.title || ''),
    category: String(d.category || ''),
    priority: String(d.priority || ''),
    status,
    pendingWith: String(d.pendingWith || ''),
    due: parseDue(d.dueDate, d.dueTime),
    hasTime: !!String(d.dueTime || '').trim(),
    reference: String(d.mailChain || ''),
    notes: String(d.notes || ''),
    recurrence: String(d.recurrence || RECURRENCES[0]),
    done,
    completedAt: done ? asDate(d.completedAt) || asDate(d.completedDate) : null,
    binned: d.deleted === true,
    binnedAt: asDate(d.dateDeleted),
    purged: d.purged === true,
    dar: d.darInclude !== false && d.dar !== false,
    keyPoints,
    seriesId: d.seriesId ? String(d.seriesId) : '',
    checklist: (Array.isArray(d.checklist) ? d.checklist : []).filter((c) => c && String(c.text || '').trim()).map((c) => ({ id: String(c.id || newId()), text: String(c.text), done: !!c.done })),
    attachments: (Array.isArray(d.attachments) ? d.attachments : []).filter((a) => a && /^https?:\/\//i.test(String(a.url || ''))).map((a) => ({ id: String(a.id || newId()), title: String(a.title || a.url), url: String(a.url) })),
    recurrenceEveryMin: Number(d.recurrenceEveryMin) || null,
    alertMode: d.alertMode === 'alarm' || d.alertMode === 'gentle' ? d.alertMode : '',
    // Which of these the document already had, so an empty list is written back only when it was there (or is being used).
    has: { checklist: 'checklist' in d, attachments: 'attachments' in d, keyPoints: 'keyPoints' in d },
    createdAt: asDate(d.dateLogged),
    updatedAt: Number(d.updatedAt) || 0,
  };
}

/** The fields to write (setDoc with merge): only what this app edits, in the document's own names. */
export function toDoc(t, now = new Date()) {
  const due = t.due instanceof Date && !Number.isNaN(t.due.getTime()) ? t.due : null;
  const done = !!t.done;
  const doc = {
    id: String(t.id),
    description: t.title || '',
    category: t.category || '',
    priority: t.priority || '',
    status: done ? 'Completed' : (DONE_STATUS.test(t.status || '') ? 'Pending' : (t.status || '')),
    pendingWith: t.pendingWith || '',
    dueDate: due ? dayKey(due) : '',
    dueTime: due && t.hasTime ? `${pad(due.getHours())}:${pad(due.getMinutes())}` : '',
    mailChain: t.reference || '',
    notes: t.notes || '',
    recurrence: t.recurrence || RECURRENCES[0],
    deleted: !!t.binned,
    dateDeleted: t.binned ? (t.binnedAt ? t.binnedAt.toISOString() : now.toISOString()) : null,
    completedDate: done ? dayKey(t.completedAt || now) : '',
    completedAt: done ? (t.completedAt || now).toISOString() : null,
    dateLogged: dayKey(t.createdAt || now),
    updatedAt: now.getTime(),
    purged: !!t.purged,
    darInclude: t.dar !== false,
    dar: t.dar !== false,
  };
  if (t.seriesId) doc.seriesId = t.seriesId;
  // Written once the task has them (or had them), so a task made elsewhere is never cleared by a copy that never saw them.
  const has = t.has || {};
  const keyPoints = (t.keyPoints || []).map((k) => ({ key: String(k.key || '').trim(), value: String(k.value || '').trim() })).filter((k) => k.key || k.value);
  if (keyPoints.length || has.keyPoints) doc.keyPoints = keyPoints;
  const checklist = (t.checklist || []).filter((c) => String(c.text || '').trim()).map((c) => ({ id: c.id, text: String(c.text).trim(), done: !!c.done }));
  if (checklist.length || has.checklist) doc.checklist = checklist;
  const attachments = (t.attachments || []).filter((a) => /^https?:\/\//i.test(a.url || '')).map((a) => ({ id: a.id, title: a.title || a.url, url: a.url }));
  if (attachments.length || has.attachments) doc.attachments = attachments;
  if (t.recurrence === 'Custom') doc.recurrenceEveryMin = Number(t.recurrenceEveryMin) || null;
  if (t.alertMode === 'alarm' || t.alertMode === 'gentle') doc.alertMode = t.alertMode;
  return doc;
}

let seq = 0;
export const newId = () => `web-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function blankTask() {
  return { checklist: [], attachments: [], recurrenceEveryMin: null, alertMode: '', has: {}, id: newId(), title: '', category: '', priority: 'Medium', status: 'Not Yet Started', pendingWith: '', due: null, hasTime: false, reference: '', notes: '', recurrence: RECURRENCES[0], done: false, completedAt: null, binned: false, binnedAt: null, purged: false, dar: true, keyPoints: [], seriesId: '', createdAt: new Date() };
}

export const isOpen = (t) => !t.done && !t.binned && !t.purged;

// Counted by calendar day, as the phone app counts: overdue once the due DAY has passed.
export const isOverdue = (t, now = new Date()) => isOpen(t) && !!t.due && startOfDay(t.due) < startOfDay(now);
export const isDueToday = (t, now = new Date()) => isOpen(t) && !!t.due && dayKey(t.due) === dayKey(now);
export const isDueSoon = (t, now = new Date(), days = 7) => isOpen(t) && !!t.due && startOfDay(t.due) > startOfDay(now) && startOfDay(t.due) <= addDays(startOfDay(now), days);

export function stats(tasks, now = new Date()) {
  const open = tasks.filter(isOpen);
  const today = dayKey(now);
  return {
    open: open.length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    dueToday: open.filter((t) => isDueToday(t, now)).length,
    dueSoon: open.filter((t) => isDueSoon(t, now)).length,
    high: open.filter((t) => /^high$/i.test(t.priority)).length,
    doneToday: tasks.filter((t) => t.done && !t.binned && !t.purged && t.completedAt && dayKey(t.completedAt) === today).length,
  };
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const priorityRank = (p) => PRIORITY_RANK[String(p || '').toLowerCase()] ?? 3;
export const SORTS = { due: 'Due date', priority: 'Priority', newest: 'Newest' };

export function sortTasks(list, by = 'due') {
  const out = [...list];
  const dueKey = (t) => (t.due ? t.due.getTime() : Infinity);
  if (by === 'priority') out.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || dueKey(a) - dueKey(b));
  else if (by === 'newest') out.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0) || b.updatedAt - a.updatedAt);
  else out.sort((a, b) => dueKey(a) - dueKey(b) || priorityRank(a.priority) - priorityRank(b.priority));
  return out;
}

export function filterTasks(list, { q = '', priority = '', category = '', pendingWith = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return list.filter((t) => {
    if (priority && t.priority !== priority) return false;
    if (category && t.category !== category) return false;
    if (pendingWith && t.pendingWith !== pendingWith) return false;
    if (!needle) return true;
    return `${t.title} ${t.reference} ${t.notes} ${t.category} ${t.pendingWith}`.toLowerCase().includes(needle);
  });
}

/** "Today 5:30 PM", "Tomorrow", "Overdue 3 d" ... for a card. */
export function dueLabel(t, now = new Date()) {
  if (!t.due) return 'No due date';
  const days = Math.round((startOfDay(t.due) - startOfDay(now)) / 86400000);
  const time = t.hasTime ? ` ${t.due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
  if (days === 0) return `Today${time}`;
  if (days === 1) return `Tomorrow${time}`;
  if (days === -1) return `Yesterday${time}`;
  if (days < 0) return `Overdue ${-days} d`;
  if (days < 7) return `${t.due.toLocaleDateString([], { weekday: 'short' })}${time}`;
  return `${t.due.toLocaleDateString([], { day: 'numeric', month: 'short' })}${time}`;
}

/** The next occurrence of a repeating task, or null (hourly / custom repeats are not made by this app). */
export function nextOccurrence(t, existing = [], now = new Date()) {
  const rec = t.recurrence;
  if (!t.due || !['Daily', 'Weekdays', 'Weekly', 'Monthly'].includes(rec)) return null;
  let d = new Date(t.due);
  const step = () => {
    if (rec === 'Daily') d = addDays(d, 1);
    else if (rec === 'Weekly') d = addDays(d, 7);
    else if (rec === 'Weekdays') { do { d = addDays(d, 1); } while (d.getDay() === 0 || d.getDay() === 6); }
    else { const day = t.due.getDate(); d = new Date(d.getFullYear(), d.getMonth() + 1, 1, d.getHours(), d.getMinutes()); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  };
  step();
  for (let i = 0; i < 400 && startOfDay(d) < startOfDay(now); i++) step();     // never in the past
  const dupe = existing.some((x) => isOpen(x) && x.id !== t.id && x.title === t.title && x.recurrence === rec && x.due && dayKey(x.due) === dayKey(d));
  if (dupe) return null;
  return { ...t, id: newId(), status: 'Not Yet Started', due: d, done: false, completedAt: null, binned: false, binnedAt: null, purged: false, dar: true, keyPoints: [], seriesId: t.seriesId || t.id, createdAt: now };
}

/** The Daily Activity Report text for one day: what was completed (with DAR on), then what is still open and due. */
export function reportText(tasks, date = new Date()) {
  const day = dayKey(date);
  const done = tasks.filter((t) => t.done && !t.binned && !t.purged && t.dar && t.completedAt && dayKey(t.completedAt) === day);
  const heading = date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [`Daily Activity Report - ${heading}`, ''];
  if (!done.length) lines.push('No completed activities recorded.');
  done.forEach((t, i) => {
    const bits = [t.category, t.pendingWith && `with ${t.pendingWith}`].filter(Boolean).join(', ');
    lines.push(`${i + 1}. ${t.title}${bits ? ` (${bits})` : ''}`);
    if (t.notes) lines.push(`   ${t.notes.replace(/\n+/g, ' ')}`);
  });
  const pending = tasks.filter((t) => isOpen(t) && t.due && dayKey(t.due) <= day);
  if (pending.length) {
    lines.push('', 'Pending:');
    sortTasks(pending, 'priority').forEach((t, i) => lines.push(`${i + 1}. ${t.title}${t.priority ? ` [${t.priority}]` : ''}`));
  }
  return lines.join('\n');
}

/** meta/lists holds { lists: {categories, priorities, statuses, pendingWith} } as an object or a JSON string. */
export function readLists(v) {
  let obj = v;
  if (typeof v === 'string') { try { obj = JSON.parse(v); } catch { obj = null; } }
  const out = { ...DEFAULT_LISTS };
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const named = { ...obj, pendingWith: Array.isArray(obj.pendingWith) ? obj.pendingWith : obj.assignees };
    Object.keys(DEFAULT_LISTS).forEach((k) => { if (Array.isArray(named[k])) out[k] = named[k].map(String); });
  } else if (Array.isArray(obj)) {
    ['categories', 'priorities', 'statuses', 'pendingWith'].forEach((k, i) => { if (Array.isArray(obj[i]) && obj[i].length) out[k] = obj[i].map(String); });
  }
  return out;
}

/** meta/calendar: { holidays, leaveDays } - entries are "2026-01-26" strings or { date, name } objects. */
export function readCalendar(d = {}) {
  const src = d.calendar && typeof d.calendar === 'object' && !Array.isArray(d.calendar) ? d.calendar : d;
  const norm = (list) => (Array.isArray(list) ? list : []).map((x) => (typeof x === 'string' ? { date: x, name: '' } : { date: String(x?.date || x?.day || ''), name: String(x?.name || x?.title || x?.label || '') })).filter((x) => x.date);
  return { holidays: norm(src.holidays), leaveDays: norm(src.leaveDays) };
}

export function readLinks(d = {}) {
  return (Array.isArray(d.links) ? d.links : []).map((x) => ({ id: String(x.id || x.url), title: String(x.title || x.url || ''), url: String(x.url || ''), folder: String(x.folder || '') })).filter((x) => /^https?:\/\//i.test(x.url));
}

/**
 * The lists to write back to meta/lists, in the form the document already holds (a JSON string, { "0": [...] }, or named keys),
 * keeping everything else in it (the payment lists the phone and the old website keep in the same field).
 */
export function writeListsValue(raw, lists) {
  let obj = raw;
  let asString = false;
  if (typeof raw === 'string') { try { obj = JSON.parse(raw); asString = true; } catch { obj = null; } }
  let out;
  const keys = obj && typeof obj === 'object' && !Array.isArray(obj) ? Object.keys(obj) : [];
  if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
    out = { ...obj };
    LIST_KEYS.forEach((k, i) => { out[String(i)] = lists[k] || []; });
  } else {
    out = { ...(obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}) };
    LIST_KEYS.forEach((k) => { out[k] = lists[k] || []; });
    if ('assignees' in out) out.assignees = lists.pendingWith || [];
  }
  return asString ? JSON.stringify(out) : out;
}

/** An option list after adding / removing a value (trimmed, no case-insensitive duplicates). */
export const addOption = (list, value) => {
  const v = String(value || '').trim();
  return v && !list.some((x) => x.toLowerCase() === v.toLowerCase()) ? [...list, v] : list;
};
export const removeOption = (list, value) => list.filter((x) => x !== value);
