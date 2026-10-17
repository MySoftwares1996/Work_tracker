import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { withoutRemoved } from './storeCore';

/**
 * The Working Dashboard's backup: its entries, lists, activity log and config, plus the app settings (theme,
 * text size). The file has the same shape as a My Personal Tracker backup, so either app's file restores in the
 * other - here only the sections below are taken from it.
 */
export const BACKUP_SECTIONS = ['settings', 'workingDashboard'];

export function buildBackup(db, sections = BACKUP_SECTIONS) {
  const payload = { app: 'My_Personal_Tracker', schema: db.schema || 1, exportedAt: new Date().toISOString(), data: {} };
  for (const s of sections) if (db[s] !== undefined) payload.data[s] = db[s];
  // Working copies that only bloat a backup: the saved "Recent Changes" snapshots and the narration history.
  if (payload.data.workingDashboard) { const { undoHistory, narrationHistory, ...rest } = payload.data.workingDashboard; payload.data.workingDashboard = rest; }
  return payload;
}

export function normaliseBackupFile(parsed) {
  if (!parsed?.data) throw new Error('Not a Working Dashboard or Personal Tracker backup file');
  return parsed;
}

/** The Working Dashboard has no attachment files to write back: the backup is used as it is. */
export async function unpackBackup(backup) {
  return backup;
}

/**
 * mode 'replace' overwrites each section outright.
 * mode 'merge' keeps everything you already have and only adds what is missing:
 *   - arrays of records are merged by id (existing row wins)
 *   - date-keyed maps (attendance.days, steps.daily) merge per
 *     key, existing day wins
 *   - plain scalars and config objects are left alone
 *
 * The old version shallow-spread nested objects, which silently replaced
 * steps.daily, attendance.days and investments.txns with whatever was in
 * the file.
 *
 * Data for removed tools (EPFO, Hydration) in an old backup file is ignored
 * in both modes.
 */
const ID_ARRAYS = new Set(['txns', 'snapshots', 'sips', 'goals', 'entries', 'tasks', 'accounts']);
const DATE_MAPS = new Set(['days', 'log', 'daily', 'hourly', 'marketData', 'budgets', 'categoryBudgets', 'subCategories']);

function mergeArrayById(cur = [], add = []) {
  if (!cur.length) return [...add];
  const hasIds = cur.every((x) => x && x.id !== undefined);
  if (hasIds) {
    const seen = new Set(cur.map((x) => x.id));
    return [...cur, ...add.filter((x) => x && !seen.has(x.id))];
  }
  // No id field: a plain string list (categories, tags), or a row with no id
  // of its own (an EPFO ledger entry - the passbook prints none). Dedupe by
  // structural equality instead of by reference/Set, which only happens to
  // work for primitive strings - two equal plain objects from different
  // files are never the same reference, so a reference-based Set would just
  // concatenate them again on every restore.
  const seen = new Set(cur.map((x) => JSON.stringify(x)));
  return [...cur, ...add.filter((x) => !seen.has(JSON.stringify(x)))];
}

function mergeSection(cur, add, keyName = '') {
  if (add === undefined) return cur;
  if (cur === undefined || cur === null) return add;

  if (Array.isArray(cur) && Array.isArray(add)) return mergeArrayById(cur, add);

  if (cur && typeof cur === 'object' && add && typeof add === 'object') {
    const out = { ...cur };
    for (const k of Object.keys(add)) {
      const a = add[k];
      const c = cur[k];
      if (DATE_MAPS.has(k) && c && typeof c === 'object' && !Array.isArray(c)) {
        out[k] = { ...a, ...c };                 // existing day/key wins
      } else if (ID_ARRAYS.has(k) && Array.isArray(c) && Array.isArray(a)) {
        out[k] = mergeArrayById(c, a);
      } else if (Array.isArray(c) && Array.isArray(a)) {
        out[k] = mergeArrayById(c, a);
      } else if (c && typeof c === 'object' && a && typeof a === 'object') {
        out[k] = mergeSection(c, a, k);
      } else if (c === undefined || c === null || c === '') {
        out[k] = a;                              // fill a genuine gap
      }
      // otherwise keep the current value
    }
    return out;
  }
  return cur;
}

export function applyBackup(db, backup, mode = 'merge') {
  const incoming = withoutRemoved(backup?.data || {});
  if (mode === 'replace') return { ...db, ...incoming };

  const next = { ...db };
  for (const key of Object.keys(incoming)) {
    next[key] = mergeSection(db[key], incoming[key], key);
  }
  return next;
}
