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
    nextReminder: asDate(d.nextReminderAt),
    subCategory: d.subCategory ? String(d.subCategory) : '',
    subCategoryFields: d.subCategoryFields && typeof d.subCategoryFields === 'object' && !Array.isArray(d.subCategoryFields) ? { ...d.subCategoryFields } : {},
    recurrenceEveryMin: Number(d.recurrenceEveryMin) || null,
    alertMode: d.alertMode === 'alarm' || d.alertMode === 'gentle' ? d.alertMode : '',
    // Which of these the document already had, so an empty list is written back only when it was there (or is being used).
    has: { checklist: 'checklist' in d, attachments: 'attachments' in d, keyPoints: 'keyPoints' in d, subCategory: 'subCategory' in d, nextReminder: 'nextReminderAt' in d },
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
  if ((t.nextReminder instanceof Date && !Number.isNaN(t.nextReminder.getTime())) || has.nextReminder) {
    doc.nextReminderAt = t.nextReminder instanceof Date && !Number.isNaN(t.nextReminder.getTime()) ? t.nextReminder.toISOString() : null;
  }
  if (t.subCategory || has.subCategory) {
    doc.subCategory = t.subCategory || null;
    doc.subCategoryFields = t.subCategory ? { ...(t.subCategoryFields || {}) } : null;
  }
  if (t.recurrence === 'Custom') doc.recurrenceEveryMin = Number(t.recurrenceEveryMin) || null;
  if (t.alertMode === 'alarm' || t.alertMode === 'gentle') doc.alertMode = t.alertMode;
  return doc;
}

let seq = 0;
export const newId = () => `web-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function blankTask() {
  return { nextReminder: null, subCategory: '', subCategoryFields: {}, checklist: [], attachments: [], recurrenceEveryMin: null, alertMode: '', has: {}, id: newId(), title: '', category: '', priority: 'Medium', status: 'Not Yet Started', pendingWith: '', due: null, hasTime: false, reference: '', notes: '', recurrence: RECURRENCES[0], done: false, completedAt: null, binned: false, binnedAt: null, purged: false, dar: true, keyPoints: [], seriesId: '', createdAt: new Date() };
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

/** Sub Categories as the lists document keeps them: [{ id, name, fields: [{ label, options? }] }]; plain names are accepted too. */
export function normalizeSubCategories(list) {
  return (Array.isArray(list) ? list : [])
    .map((sc, i) => (typeof sc === 'string' ? { id: `sc-${i}-${sc}`, name: sc, fields: [] } : sc))
    .filter((sc) => sc && String(sc.name || '').trim())
    .map((sc) => ({
      ...sc, id: String(sc.id || `sc-${sc.name}`), name: String(sc.name), category: String(sc.category || ''),
      fields: (Array.isArray(sc.fields) ? sc.fields : []).filter((f) => f && String(f.label || '').trim()).map((f) => ({ ...f, label: String(f.label), options: Array.isArray(f.options) ? f.options.map(String) : undefined })),
    }));
}
// Without a list of its own, the phone app carries a Sub Category on duty, demand draft and the domestic / urgent / import payment categories.
const defaultCarries = (c) => /duty/i.test(c) || /demand\s*draft/i.test(c) || (/payment/i.test(c) && /(domestic|urgent|import)/i.test(c));
/** The Sub Categories offered under a category: its own, plus any with no category of their own (made before they were grouped). */
export const subCategoriesFor = (lists, cat) => (lists.subCategories || []).filter((x) => !x.category || x.category === cat);
/** A category carries a Sub Category when it has some of its own, or the lists name it (or, with no such list, the phone's default). */
export const categoryCarriesSubCategory = (lists, cat) => !!cat && subCategoriesFor(lists, cat).length > 0 && ((lists.subCategories || []).some((x) => x.category === cat) || (Array.isArray(lists.subCategoryCategories) ? lists.subCategoryCategories.includes(cat) : defaultCarries(String(cat))));
export const findSubCategory = (lists, name) => (lists.subCategories || []).find((x) => x.name === name) || null;
/** The message to show before a task is marked Completed without its Sub Category, or ''. */
export function subCategoryMissing(t, lists) {
  if (!categoryCarriesSubCategory(lists, t.category)) return '';
  if (!t.subCategory) return 'Select a Sub Category before marking this Completed.';
  const sc = findSubCategory(lists, t.subCategory);
  const missing = sc ? sc.fields.filter((f) => !String((t.subCategoryFields || {})[f.label] || '').trim()) : [];
  return missing.length ? `Fill in ${missing.map((f) => f.label).join(', ')} before marking this Completed.` : '';
}
/** Adds one Sub Category under a category. A name is kept once across all categories, because a task stores only the name. */
export function addSubCategory(list, name, labels = [], category = '') {
  const n = String(name || '').trim();
  if (!n || list.some((x) => x.name.toLowerCase() === n.toLowerCase())) return list;
  const fields = labels.map((l) => String(l).trim()).filter(Boolean).map((label) => ({ label }));
  return [...list, { id: `sc-${Date.now().toString(36)}-${list.length}`, name: n, category: String(category || ''), fields }];
}
/** Pasted lines -> [{ name, labels }]. A line is "Name" or "Name: Field A, Field B". */
export function parseSubCategoryLines(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const at = line.indexOf(':');
    return at < 0 ? { name: line, labels: [] } : { name: line.slice(0, at).trim(), labels: line.slice(at + 1).split(',') };
  }).filter((x) => x.name);
}
/** Adds many at once; returns the new list and how many were new. */
export function addSubCategories(list, items, category = '') {
  let out = list;
  items.forEach((it) => { out = addSubCategory(out, it.name, it.labels, category); });
  return { list: out, added: out.length - list.length };
}
/** The list of categories the lists name as carrying a Sub Category, with this one added. */
export const withCarrying = (lists, cat) => {
  const now = Array.isArray(lists.subCategoryCategories) ? lists.subCategoryCategories : (lists.categories || []).filter((c) => defaultCarries(String(c)));
  return now.includes(cat) ? now : [...now, cat];
};
export const removeSubCategory = (list, id) => list.filter((x) => x.id !== id);

/** meta/lists holds { lists: {categories, priorities, statuses, pendingWith} } as an object or a JSON string. */
export function readLists(v) {
  let obj = v;
  if (typeof v === 'string') { try { obj = JSON.parse(v); } catch { obj = null; } }
  const out = { ...DEFAULT_LISTS };
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const named = { ...obj, pendingWith: Array.isArray(obj.pendingWith) ? obj.pendingWith : obj.assignees };
    Object.keys(DEFAULT_LISTS).forEach((k) => { if (Array.isArray(named[k])) out[k] = named[k].map(String); });
    if (Array.isArray(named.subCategories)) out.subCategories = normalizeSubCategories(named.subCategories);
    if (Array.isArray(named.subCategoryCategories)) out.subCategoryCategories = named.subCategoryCategories.map(String);
    if (Array.isArray(named.reminderCategories)) out.reminderCategories = named.reminderCategories.map(String);
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
    if (Array.isArray(lists.subCategories)) out.subCategories = lists.subCategories.map((sc) => ({ id: sc.id, name: sc.name, ...(sc.category ? { category: sc.category } : {}), fields: (sc.fields || []).map((f) => (f.options ? { label: f.label, options: f.options } : { label: f.label })) }));
    if (Array.isArray(lists.subCategoryCategories)) out.subCategoryCategories = lists.subCategoryCategories;
    if (Array.isArray(lists.reminderCategories)) out.reminderCategories = lists.reminderCategories;
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

/* ---- the round clock (Android style) time picker: pure helpers ---- */
/** 24-hour "17:30" -> { h12: 5, minute: 30, pm: true }; "" -> null. */
export function splitTime(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return null;
  return { h12: h % 12 || 12, minute: Number(m[2]), pm: h >= 12 };
}
/** (5, 30, true) -> "17:30". */
export const joinTime = (h12, minute, pm) => `${pad((Number(h12) % 12) + (pm ? 12 : 0))}:${pad(minute)}`;
/** "17:30" -> "5:30 PM"; "" -> "". */
export function timeLabel(v) {
  const t = splitTime(v);
  return t ? `${t.h12}:${pad(t.minute)} ${t.pm ? 'PM' : 'AM'}` : '';
}
/** A point on the dial (dx right, dy down from the centre) -> degrees clockwise from 12 o'clock, 0 to 360. */
export const dialAngle = (dx, dy) => (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
export const angleToHour = (deg) => Math.round(deg / 30) % 12 || 12;
export const angleToMinute = (deg) => Math.round(deg / 6) % 60;

/* ---- next reminder date & time, asked only under the categories that need it ---- */
export const categoryAsksReminder = (lists, cat) => !!cat && Array.isArray(lists.reminderCategories) && lists.reminderCategories.includes(cat);
/** The lists with one category switched on or off for the next reminder. */
export function toggleReminderCategory(lists, cat) {
  const now = Array.isArray(lists.reminderCategories) ? lists.reminderCategories : [];
  return { ...lists, reminderCategories: now.includes(cat) ? now.filter((c) => c !== cat) : [...now, cat] };
}
/** A date "2026-10-20" and a time "17:30" (blank = 9:00 AM) -> a Date, or null. */
export function reminderFrom(date, time) {
  if (!date) return null;
  const d = parseDue(date, time || '09:00');
  return d;
}
export const isReminderDue = (t, now = new Date()) => isOpen(t) && !!t.nextReminder && t.nextReminder.getTime() <= now.getTime();
/** "Today 5:00 PM", "Tomorrow 9:00 AM", "12 Oct, 9:00 AM" */
export function reminderLabel(t, now = new Date()) {
  if (!t.nextReminder) return '';
  const days = Math.round((startOfDay(t.nextReminder) - startOfDay(now)) / 86400000);
  const time = t.nextReminder.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  return `${t.nextReminder.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
