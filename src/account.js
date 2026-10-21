/**
 * Which Google account the Working Dashboard data on this device belongs to.
 *
 * Every person who signs in gets their own space in Firebase (users/{uid}). The data kept on the device has to
 * follow the same account: signed in as someone else on the same phone or browser, the previous account's tasks
 * must not be shown, and must never be sent into the new account. Pure, so it is unit tested.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_DB } from './storeCore';
import { dirtyEntries, ackKey, raceTimeout } from './firebaseSyncCore';

/*
 * What belongs to an account (its tasks, lists, holidays and sync state). Everything else in
 * workingDashboard - alert timings, reminders, the alarm sound, sort order - is how this device behaves, and stays.
 */
export const ACCOUNT_KEYS = [
  'entries', 'categories', 'priorities', 'statuses', 'assignees', 'holidays', 'leaveDays', 'fixedActivities',
  'activityLog', 'paymentIntro', 'subCategories', 'subCategoryCategories', 'narrationTypes', 'reminderCategories',
  'listsUpdatedAt', 'paymentListsAt', 'paymentListsSentAt', 'calendarUpdatedAt', 'deletedIds', 'purgedIds',
  'links', 'reportAiNotes', 'reportAiNotesSummary', 'templates', 'reportFormats', 'formatSetupAt', 'narrationHistory', 'undoHistory', 'toolsStamps', 'toolsUpdatedAt',
];

/**
 * What to do with the device's data when `uid` signs in:
 *   'ready'  - the data is already this account's
 *   'adopt'  - the data belongs to no account yet (used without signing in, or from before this check):
 *              it becomes this account's and is merged into it
 *   'switch' - it is another account's: start from this account's own data instead
 */
export function accountAction(wd = {}, uid) {
  if (!uid) return 'ready';
  if (!wd.accountUid) return 'adopt';
  return wd.accountUid === uid ? 'ready' : 'switch';
}

/** The Working Dashboard set up for `uid`: adopted as it is, or emptied of the previous account's data. */
export function forAccount(wd = {}, uid, email = '') {
  const action = accountAction(wd, uid);
  if (action === 'ready') return wd;
  const next = { ...wd, accountUid: uid, accountEmail: email || '' };
  if (action === 'switch') {
    const defaults = DEFAULT_DB.workingDashboard;
    ACCOUNT_KEYS.forEach((k) => {
      if (k in defaults) next[k] = JSON.parse(JSON.stringify(defaults[k]));
      else delete next[k];
    });
  }
  return next;
}

/** Signed in, or chose to use this device without an account: the welcome screen is not needed. */
export const needsWelcome = ({ authKnown, user }, wd = {}) => !!authKnown && !user && !wd.localOnly;

/* ---------- unsynced edits of the account that is being switched away from ---------- */

export const unsyncedKey = (uid) => `MPT_UNSYNCED_${uid}`;

/**
 * What of this account's data was not yet sent (`ack` is the push bookkeeping), or null when everything was:
 * the entries changed here, the deletions waiting to go, and the lists with their time. Pure.
 */
export function unsyncedSnapshot(wd = {}, ack = {}, now = Date.now()) {
  const entries = dirtyEntries(wd.entries || [], ack || {});
  const deletedIds = (wd.deletedIds || []).map(String);
  const listsPending = (Number(wd.listsUpdatedAt) || 0) > (Number((ack || {}).__lists) || 0);
  if (!entries.length && !deletedIds.length) return null;
  return {
    v: 1, uid: wd.accountUid, email: wd.accountEmail || '', savedAt: now, entries, deletedIds,
    ...(listsPending ? { listsUpdatedAt: wd.listsUpdatedAt, lists: [wd.categories, wd.priorities, wd.statuses, wd.assignees] } : null),
  };
}

/**
 * Account A's unsent edits are about to be wiped because B signs in. The push is gated to the signed-in account, so it
 * cannot reach A's space as B; a flush is tried anyway (it works only if A is still the signed-in user), briefly, and
 * whatever is still unsent is kept under MPT_UNSYNCED_<A> instead of being destroyed. Resolves true when something was kept.
 */
export async function saveUnsyncedBackup(wd = {}, { storage = AsyncStorage, flush = true, timeoutMs = 4000 } = {}) {
  if (!wd.accountUid) return false;
  if (flush) {
    try {
      const fb = await import('./firebaseSync');
      await raceTimeout(fb.pushIfSignedIn(wd.entries || [], wd.accountUid), timeoutMs, 'flush timed out');
    } catch { /* not signed in as that account, or offline: the data is kept below */ }
  }
  let ack = {};
  try { ack = JSON.parse(await storage.getItem(ackKey(wd.accountUid))) || {}; } catch { ack = {}; }
  const snap = unsyncedSnapshot(wd, ack);
  if (!snap) return false;
  try {
    // An older backup of the same account is kept too: its entries are joined with the newer ones (newest copy of each wins).
    const old = JSON.parse(await storage.getItem(unsyncedKey(wd.accountUid)));
    const merged = old && Array.isArray(old.entries) ? mergeUnsynced({ entries: snap.entries, deletedIds: snap.deletedIds }, old) : null;
    await storage.setItem(unsyncedKey(wd.accountUid), JSON.stringify(merged ? { ...snap, entries: merged.entries, deletedIds: merged.deletedIds } : snap));
    return true;
  } catch { return false; }
}

/** The kept data for `uid`, removed from storage (null when there is none). */
export async function takeUnsyncedBackup(uid, { storage = AsyncStorage } = {}) {
  if (!uid) return null;
  try {
    const raw = await storage.getItem(unsyncedKey(uid));
    if (!raw) return null;
    const back = JSON.parse(raw);
    await storage.removeItem(unsyncedKey(uid));
    return back && Array.isArray(back.entries) ? back : null;
  } catch { return null; }
}

/** `wd` with a kept backup joined in: an entry it does not have, or has older, is taken; deletions are queued again. Pure. */
export function mergeUnsynced(wd = {}, back = null) {
  if (!back) return wd;
  const stampOf = (e) => Number(e && e.updatedAt && new Date(e.updatedAt).getTime()) || 0;
  const have = new Map((wd.entries || []).map((e) => [String(e.id), e]));
  let changed = false;
  (back.entries || []).forEach((e) => {
    if (!e || e.id === undefined) return;
    const cur = have.get(String(e.id));
    if (!cur || stampOf(e) > stampOf(cur)) { have.set(String(e.id), e); changed = true; }
  });
  const gone = new Set([...(wd.deletedIds || []), ...(back.deletedIds || [])].map(String));
  const deletedIds = [...gone];
  if ((back.deletedIds || []).length) { deletedIds.forEach((id) => have.delete(id)); changed = true; }
  if (!changed) return wd;
  return { ...wd, entries: [...have.values()], deletedIds };
}

