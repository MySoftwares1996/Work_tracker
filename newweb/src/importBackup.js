import { DEFAULT_LISTS, RECURRENCES, fromDoc, normalizeSubCategories, toDoc } from './data.js';

/**
 * Turns a backup file from the phone app or the old website (Config > Data Backup: { app, data: { workingDashboard: { entries, categories,
 * subCategories... } } }) into what to write to this project's Firebase: the tasks (in the task document's shape, with the fields this
 * site does not edit carried over as they are), the lists with their Sub Categories, narration types and report intro lines, and the
 * holidays and leave days. Nothing here touches Firebase, so it is unit tested.
 */
const REC = { none: RECURRENCES[0], hourly: 'Hourly', custom: 'Custom', daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };
// The fields on a phone entry that this site does not edit; they are copied to the document unchanged.
const CARRIED = ['paymentDetails', 'narration', 'workLog', 'bankFollowUps', 'escalation', 'audit', 'emailId', 'seriesId'];

const asDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

/** The backup's main section, wherever the file keeps it. */
export function backupSection(parsed) {
  const data = parsed && parsed.data;
  if (!data || typeof data !== 'object') throw new Error('This is not a Working Dashboard or Personal Tracker backup file.');
  const wd = data.workingDashboard || data;
  if (!wd || typeof wd !== 'object') throw new Error('The backup has no Working Dashboard section.');
  return wd;
}

/** One backup row -> { id, doc } for Firestore, or null when it is not a task. */
export function rowToDoc(row, now = new Date()) {
  if (!row || typeof row !== 'object' || !row.id) return null;
  if (row.purged === true) return null;
  const id = String(row.id);
  // A row already in the website's own document shape is written as it is.
  if ('description' in row || 'dueDate' in row || 'mailChain' in row) return { id, doc: JSON.parse(JSON.stringify({ ...row, id, purged: false })) };
  const due = asDate(row.dueAt);
  // Date-only when the source says so (hasTime false, a bare date, or local midnight with no time given); a time the source states, even 00:00, is kept.
  const sourceTime = typeof row.hasTime === 'boolean' ? row.hasTime : (String(row.dueTime || '').trim() ? true : null);
  const midnight = !!due && due.getHours() === 0 && due.getMinutes() === 0;
  const bareDate = typeof row.dueAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.dueAt.trim());
  const hasTime = !!due && !bareDate && (sourceTime !== null ? sourceTime : !midnight);
  const t = {
    ...fromDoc(id, {}),
    id,
    title: String(row.title || ''), category: row.category || '', priority: row.priority || '', status: row.status || '', pendingWith: row.pendingWith || '',
    due, hasTime, reference: row.reference || '', notes: row.notes || '', recurrence: REC[String(row.recurrence || 'none').toLowerCase()] || RECURRENCES[0],
    recurrenceEveryMin: Number(row.recurrenceEveryMin) || null,
    done: !!row.done, completedAt: asDate(row.completedAt), binned: !!row.binned, binnedAt: asDate(row.binnedAt), createdAt: asDate(row.createdAt) || now,
    dar: row.dar !== false, keyPoints: Array.isArray(row.keyPoints) ? row.keyPoints : [], checklist: Array.isArray(row.checklist) ? row.checklist : [],
    attachments: Array.isArray(row.attachments) ? row.attachments : [], subCategory: row.subCategory || '',
    subCategoryFields: row.subCategoryFields && typeof row.subCategoryFields === 'object' ? row.subCategoryFields : {},
    alertMode: row.alertMode === 'alarm' || row.alertMode === 'gentle' ? row.alertMode : '', snoozeUntil: Number(row.snoozeUntil) || 0,
    lastAckDate: row.lastAckDate || '', skippedDates: Array.isArray(row.skippedDates) ? row.skippedDates : [], seriesId: row.seriesId ? String(row.seriesId) : '',
    has: { checklist: 'checklist' in row, attachments: 'attachments' in row, keyPoints: 'keyPoints' in row, subCategory: 'subCategory' in row },
  };
  const doc = toDoc(t, now);
  if (Number(row.updatedAt)) doc.updatedAt = Number(row.updatedAt);
  CARRIED.forEach((k) => { if (row[k] !== undefined && row[k] !== null && row[k] !== '' && !(Array.isArray(row[k]) && !row[k].length)) doc[k] = row[k]; });
  return { id, doc: JSON.parse(JSON.stringify(doc)) };
}

const union = (a = [], b = []) => { const seen = new Set(a.map((x) => String(x).toLowerCase())); return [...a, ...b.map(String).filter((x) => x.trim() && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))]; };

/**
 * The plan for one backup. `existing` is { ids: Set of task ids already there, lists } and `overwrite` replaces tasks that exist.
 * Sub Categories with no category of their own go under the category the backup names as carrying them, when it names exactly one.
 */
export function planImport(parsed, { ids = new Set(), lists = DEFAULT_LISTS, overwrite = false } = {}, now = new Date()) {
  const wd = backupSection(parsed);
  const rows = [wd.entries, wd.tasks, parsed.data && parsed.data.tasks, parsed.data && parsed.data.entries].find((x) => Array.isArray(x)) || [];
  const tasks = [];
  let skippedExisting = 0;
  let notTasks = 0;
  rows.forEach((r) => {
    const d = rowToDoc(r, now);
    if (!d) { notTasks += 1; return; }
    if (ids.has(d.id) && !overwrite) { skippedExisting += 1; return; }
    tasks.push(d);
  });
  const list = (k) => (Array.isArray(wd[k]) ? wd[k].map(String) : []);
  const carrying = Array.isArray(wd.subCategoryCategories) ? wd.subCategoryCategories.map(String) : [];
  const subs = normalizeSubCategories(wd.subCategories).map((sc) => ({ ...sc, category: sc.category || (carrying.length === 1 ? carrying[0] : '') }));
  const have = new Set((lists.subCategories || []).map((x) => x.name.toLowerCase()));
  const newSubs = subs.filter((x) => !have.has(x.name.toLowerCase()));
  const nextLists = {
    categories: union(lists.categories, list('categories')),
    priorities: union(lists.priorities, list('priorities')),
    statuses: union(lists.statuses, list('statuses')),
    pendingWith: union(lists.pendingWith, [...list('pendingWith'), ...list('assignees')]),
    subCategories: [...(lists.subCategories || []), ...newSubs],
    subCategoryCategories: union(lists.subCategoryCategories || [], carrying),
  };
  if (Array.isArray(wd.narrationTypes)) nextLists.narrationTypes = wd.narrationTypes;
  if (Array.isArray(wd.darPaymentIntro)) nextLists.darPaymentIntro = wd.darPaymentIntro;
  const calendar = {};
  if (Array.isArray(wd.holidays) && wd.holidays.length) calendar.holidays = wd.holidays;
  if (Array.isArray(wd.leaveDays) && wd.leaveDays.length) calendar.leaveDays = wd.leaveDays;
  return {
    tasks, lists: nextLists, calendar,
    summary: { tasks: tasks.length, skippedExisting, notTasks, categories: list('categories').length, subCategories: newSubs.length, narrationTypes: nextLists.narrationTypes ? nextLists.narrationTypes.length : 0, holidays: (calendar.holidays || []).length, leaveDays: (calendar.leaveDays || []).length, exportedAt: parsed.exportedAt || '' },
  };
}
