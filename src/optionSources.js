/**
 * Every user-editable option list the Working Dashboard has, in one place: each source points at exactly one place in the
 * database, so an option created in one picker exists in every picker at once.
 *
 * Pure functions only - no React - so this is tested directly.
 */

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

/** Order-preserving, case-insensitive union. First spelling wins. */
export function union(...lists) {
  const out = [];
  for (const list of lists) {
    // A list stored as a string (an older Realtime Sync read one that way) must not be split into characters.
    for (const v of Array.isArray(list) ? list : []) {
      const c = clean(v);
      if (c && !out.some((x) => same(x, c))) out.push(c);
    }
  }
  return out;
}

/* ---------- path helpers ---------- */

const getIn = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);

function setIn(obj, path, value) {
  if (!path.length) return value;
  const [k, ...rest] = path;
  return { ...(obj || {}), [k]: setIn((obj || {})[k], rest, value) };
}

/* ---------- source factories ---------- */

/**
 * A plain list of strings at `path`.
 * `usage(db, value)` counts records that use the value, for delete warnings.
 */
function listSource({ id, title, path, usage = () => 0, defaults = [] }) {
  return {
    id,
    title,
    read: (db) => {
      const list = getIn(db, path);
      return (Array.isArray(list) ? list : defaults).map((v) => ({ value: v, label: v }));
    },
    add(db, label) {
      const name = clean(label);
      if (!name) return { db, value: null, error: 'Enter a name.' };
      const list = getIn(db, path) || defaults;
      const existing = list.find((x) => same(x, name));
      if (existing) return { db, value: existing, existed: true };
      return { db: setIn(db, path, [...list, name]), value: name };
    },
    remove(db, value) {
      const list = getIn(db, path) || defaults;
      return { db: setIn(db, path, list.filter((x) => !same(x, value))) };
    },
    usage,
  };
}

/* ---------- the sources ---------- */

export const SOURCES = {
  wdCategory: listSource({
    id: 'wdCategory', title: 'Category', path: ['workingDashboard', 'categories'],
    usage: (db, v) => (db?.workingDashboard?.entries || []).filter((x) => same(x.category, v)).length,
  }),
  wdPriority: listSource({
    id: 'wdPriority', title: 'Priority', path: ['workingDashboard', 'priorities'], defaults: ['High', 'Medium', 'Low'],
    usage: (db, v) => (db?.workingDashboard?.entries || []).filter((x) => same(x.priority, v)).length,
  }),
  wdStatus: listSource({
    id: 'wdStatus', title: 'Status', path: ['workingDashboard', 'statuses'], defaults: ['Not Yet Started', 'In-Progress', 'Pending'],
    usage: (db, v) => (db?.workingDashboard?.entries || []).filter((x) => same(x.status, v)).length,
  }),
  wdAssignee: listSource({
    id: 'wdAssignee', title: 'Pending with', path: ['workingDashboard', 'assignees'], defaults: [],
    usage: (db, v) => (db?.workingDashboard?.entries || []).filter((x) => same(x.pendingWith, v)).length,
  }),
};

/* ---------- one-time repair of existing data ---------- */

/**
 * Brings older databases onto the single-list model without losing anything.
 *
 *  - folds spend and income categories into one independent list
 *  - flattens per-category sub-categories into one independent list
 *  - adds back any value that a record still uses but that has dropped out of
 *    its list, so every existing record can still be selected and filtered
 *  - removes case-insensitive duplicates
 *
 * Idempotent: running it twice changes nothing the second time.
 */
export function normaliseOptions(db) {
  if (!db || typeof db !== 'object') return db;
  const ex = db.expenses || {};
  const all = ex.txns || [];
  const spends = all.filter((x) => x.type === 'spend');
  const incomes = all.filter((x) => x.type === 'income');

  // Spend and income keep their own category lists. Every value a record
  // still uses is kept selectable in its own list; `categories` stays as the
  // combined view for filters/search that don't know the transaction type.
  const spendCategories = union(
    ex.spendCategories,
    spends.map((x) => x.category).filter((c) => c && c !== 'Transfer'),
  );
  const incomeCategories = union(
    ex.incomeCategories,
    incomes.map((x) => x.category).filter(Boolean),
  );
  const categories = union(
    ex.categories, spendCategories, incomeCategories,
    all.map((x) => x.category).filter((c) => c && c !== 'Transfer'),
  );
  const subCategoryList = union(
    ex.subCategoryList,
    ...Object.values(ex.subCategories || {}),
    all.map((x) => x.sub),
  );

  const expenses = {
    ...ex,
    categories,
    spendCategories,
    incomeCategories,
    subCategoryList,
    mainCategories: union(ex.mainCategories, all.map((x) => x.main)),
    paymentModes: union(ex.paymentModes, all.map((x) => x.mode)),
    tags: union(ex.tags, all.flatMap((x) => x.tags || [])),
  };
  delete expenses.subCategories;

  const inv = db.investments || {};
  const investments = {
    ...inv,
    assetTypes: union(inv.assetTypes, (inv.txns || []).map((x) => x.assetType)),
    assetNames: union(inv.assetNames, (inv.txns || []).map((x) => x.assetName)),
  };

  const wt = db.workTracker || {};
  const workTracker = {
    ...wt,
    categories: union(wt.categories, (wt.tasks || []).map((x) => x.category)),
    statuses: union(wt.statuses, (wt.tasks || []).map((x) => x.status)),
    assignees: union(wt.assignees, (wt.tasks || []).map((x) => x.assignee)),
  };

  // Working Dashboard lists are filled from the entries only while a list is still empty (older data). A value
  // the user deleted must stay deleted even though entries still use it - they keep it, it is just not offered.
  const wd = db.workingDashboard || {};
  const wdList = (list, values) => (Array.isArray(list) && list.length ? union(list) : union(list, values));
  const workingDashboard = {
    ...wd,
    categories: wdList(wd.categories, (wd.entries || []).map((x) => x.category)),
    priorities: wdList(wd.priorities, (wd.entries || []).map((x) => x.priority)),
    statuses: wdList(wd.statuses, (wd.entries || []).map((x) => x.status)),
    assignees: wdList(wd.assignees, (wd.entries || []).map((x) => x.pendingWith)),
  };

  return {
    ...db,
    expenses,
    investments,
    workTracker,
    workingDashboard,
    taskTypes: union(db.taskTypes, (db.tasks || []).map((x) => x.type)),
  };
}
