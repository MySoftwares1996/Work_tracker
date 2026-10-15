/**
 * Which Google account the Working Dashboard data on this device belongs to.
 *
 * Every person who signs in gets their own space in Firebase (users/{uid}). The data kept on the device has to
 * follow the same account: signed in as someone else on the same phone or browser, the previous account's tasks
 * must not be shown, and must never be sent into the new account. Pure, so it is unit tested.
 */
import { DEFAULT_DB } from './storeCore';

/*
 * What belongs to an account (its tasks, lists, holidays, sync state and its own Apps Script). Everything else in
 * workingDashboard - alert timings, reminders, the alarm sound, sort order - is how this device behaves, and stays.
 */
export const ACCOUNT_KEYS = [
  'entries', 'categories', 'priorities', 'statuses', 'assignees', 'holidays', 'leaveDays', 'fixedActivities',
  'activityLog', 'cloudSyncUrl', 'paymentIntro', 'subCategories', 'subCategoryCategories', 'narrationTypes',
  'listsUpdatedAt', 'calendarUpdatedAt', 'deletedIds', 'purgedIds', 'lastSheetPullAt', 'reportSamplesLocal',
  'links', 'reportAiNotes', 'reportAiNotesSummary', 'templates', 'narrationHistory', 'undoHistory', 'toolsStamps', 'toolsUpdatedAt',
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
