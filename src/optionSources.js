import { withIcon } from './categoryIcons';
/**
 * Every user-editable option list in the app, in one place.
 *
 * Before this, each screen kept its own list its own way. AddTransaction wrote
 * new categories to `spendCategories` / `incomeCategories` while every other
 * screen read `categories`, so a category created while adding a transaction
 * never appeared anywhere else - and once one existed, AddTransaction stopped
 * seeing categories added elsewhere. Investment only saved a new asset name
 * when the transaction was saved, so cancelling lost it. Work Tracker
 * and Settings each had separate managers.
 *
 * Now every picker reads and writes through a source here, and every source
 * points at exactly one place in the database. Create an option anywhere and
 * it exists everywhere, immediately.
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
function listSource({ id, title, path, usage = () => 0, defaults = [], icons = false }) {
  return {
    id,
    title,
    // `icons`: shown with a symbol matched from the name (categoryIcons.js); the stored value is unchanged.
    read: (db) => {
      const list = getIn(db, path);
      return (Array.isArray(list) ? list : defaults).map((v) => ({ value: v, label: icons ? withIcon(v) : v }));
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

/* ---------- usage counters ---------- */

const txns = (db) => db?.expenses?.txns || [];
const invTxns = (db) => db?.investments?.txns || [];

/* ---------- the sources ---------- */


export const SOURCES = {
  mainCategory: listSource({
    id: 'mainCategory', title: 'Main category', path: ['expenses', 'mainCategories'], icons: true,
    usage: (db, v) => txns(db).filter((x) => same(x.main, v)).length,
  }),
  // A combined, read-only-ish view of every category (spend + income) for
  // filters and search, where the transaction type isn't known in advance.
  category: listSource({
    id: 'category', title: 'Category', path: ['expenses', 'categories'], icons: true,
    usage: (db, v) => txns(db).filter((x) => same(x.category, v)).length,
  }),
  // Spend and income each pick from their own list, so a Spend never offers
  // an income-only category (Salary, Interest...) and vice versa.
  spendCategory: listSource({
    id: 'spendCategory', title: 'Category', path: ['expenses', 'spendCategories'], icons: true,
    usage: (db, v) => txns(db).filter((x) => x.type === 'spend' && same(x.category, v)).length,
  }),
  incomeCategory: listSource({
    id: 'incomeCategory', title: 'Category', path: ['expenses', 'incomeCategories'], icons: true,
    usage: (db, v) => txns(db).filter((x) => x.type === 'income' && same(x.category, v)).length,
  }),
  subCategoryList: listSource({
    id: 'subCategory', title: 'Sub-category', path: ['expenses', 'subCategoryList'], icons: true,
    usage: (db, v) => txns(db).filter((x) => same(x.sub, v)).length,
  }),
  tag: listSource({
    id: 'tag', title: 'Tags', path: ['expenses', 'tags'],
    usage: (db, v) => txns(db).filter((x) => (x.tags || []).some((t) => same(t, v))).length,
  }),
  paymentMode: listSource({
    id: 'paymentMode', title: 'Payment mode', path: ['expenses', 'paymentModes'],
    usage: (db, v) => txns(db).filter((x) => same(x.mode, v)).length,
  }),
  assetType: listSource({
    id: 'assetType', title: 'Asset type', path: ['investments', 'assetTypes'],
    usage: (db, v) => invTxns(db).filter((x) => same(x.assetType, v)).length,
  }),
  assetName: listSource({
    id: 'assetName', title: 'Fund or stock', path: ['investments', 'assetNames'],
    usage: (db, v) => invTxns(db).filter((x) => same(x.assetName, v)).length,
  }),
  taskType: listSource({
    id: 'taskType', title: 'Category', path: ['taskTypes'],
    usage: (db, v) => (db?.tasks || []).filter((x) => same(x.type, v)).length,
  }),
  // Work Tracker is removed for now; its own SOURCES entries (wtCategory,
  // wtStatus, wtAssignee) go with it. The underlying workTracker data is left
  // alone in normaliseOptions() below so old data isn't lost from backups.

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
    id: 'wdAssignee', title: 'Pending with', path: ['workingDashboard', 'assignees'], defaults: ['Self'],
    usage: (db, v) => (db?.workingDashboard?.entries || []).filter((x) => same(x.pendingWith, v)).length,
  }),

  /**
   * Accounts are objects: the stored value is the id, the label the name.
   * An account that transactions still point at cannot be deleted, because
   * its balance would silently vanish from every total.
   */
  account: {
    id: 'account',
    title: 'Account',
    read: (db) => (db?.expenses?.accounts || []).map((a) => ({ value: a.id, label: a.name, kind: a.kind })),
    add(db, label, extra = {}) {
      const name = clean(label);
      if (!name) return { db, value: null, error: 'Enter a name.' };
      const accounts = db?.expenses?.accounts || [];
      const existing = accounts.find((a) => same(a.name, name));
      if (existing) return { db, value: existing.id, existed: true };
      // extra.id lets a caller compute the add twice (once to learn the id,
      // once inside a state updater) and get the same account both times.
      const id = extra.id || `acct_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${Date.now().toString(36)}`;
      const account = { id, name, kind: extra.kind || 'bank', opening: Number(extra.opening) || 0 };
      return { db: setIn(db, ['expenses', 'accounts'], [...accounts, account]), value: id };
    },
    remove(db, value) {
      const accounts = db?.expenses?.accounts || [];
      if (accounts.length <= 1) return { db, error: 'Keep at least one account.' };
      const used = txns(db).filter((x) => x.account === value || x.toAccount === value).length;
      if (used) return { db, error: `${used} transaction${used > 1 ? 's use' : ' uses'} this account. Move them first, or its balance would disappear from every total.` };
      return { db: setIn(db, ['expenses', 'accounts'], accounts.filter((a) => a.id !== value)) };
    },
    usage: (db, v) => txns(db).filter((x) => x.account === v || x.toAccount === v).length,

    /** Rename, change kind, or set the opening balance. The id never changes. */
    update(db, id, patch = {}) {
      const accounts = db?.expenses?.accounts || [];
      const current = accounts.find((a) => a.id === id);
      if (!current) return { db, error: 'That account no longer exists.' };
      const name = patch.name != null ? clean(patch.name) : current.name;
      if (!name) return { db, error: 'Enter a name.' };
      if (accounts.some((a) => a.id !== id && same(a.name, name))) return { db, error: `An account called "${name}" already exists.` };
      const opening = patch.opening != null ? Number(patch.opening) : current.opening;
      if (!Number.isFinite(opening)) return { db, error: 'Opening balance must be a number.' };
      const next = { ...current, name, kind: patch.kind || current.kind, opening };
      return { db: setIn(db, ['expenses', 'accounts'], accounts.map((a) => (a.id === id ? next : a))) };
    },
  },
};

/** Fixed lists that use the same picker but cannot be edited. */
export function fixedSource(id, title, values) {
  return {
    id, title, fixed: true,
    read: () => values.map((v) => (typeof v === 'string' ? { value: v, label: v } : v)),
    add: (db) => ({ db, value: null, error: 'This list is fixed.' }),
    remove: (db) => ({ db, error: 'This list is fixed.' }),
    usage: () => 0,
  };
}

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

// Former alias: subCategory used to be a function returning the source.
SOURCES.subCategory = () => SOURCES.subCategoryList;
