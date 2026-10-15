/*
 * Many people, one tool: each Google account has its own data. The device's copy follows the signed-in account
 * (src/account.js), and a new account is set up on its first sign-in (src/firebaseSync.js).
 */
import { accountAction, forAccount, needsWelcome, ACCOUNT_KEYS } from '../../src/account.js';
import { push, __setMetaFormats } from '../../src/firebaseSync.js';
import { __batches, __resetBatches } from '../stubs/firebase.mjs';

export async function run({ ck, section }) {
  section('The data on a device follows the signed-in account');
  const mine = { entries: [{ id: 'a' }], categories: ['Payments'], alerts: { morning: '08:00' }, alarmRingtone: 'bell' };
  ck('data used before signing in becomes the account\'s (merged into it)', accountAction(mine, 'u1') === 'adopt');
  const adopted = forAccount(mine, 'u1', 'me@example.com');
  ck('adopted: kept as it is, now owned by the account', adopted.entries.length === 1 && adopted.accountUid === 'u1' && adopted.accountEmail === 'me@example.com');
  ck('the same account again: nothing to do', accountAction(adopted, 'u1') === 'ready' && forAccount(adopted, 'u1') === adopted);
  ck('another account on the same device: a switch', accountAction(adopted, 'u2') === 'switch');
  const other = forAccount({ ...adopted, cloudSyncUrl: 'https://script.google.com/macros/s/x/exec', deletedIds: ['z'] }, 'u2', 'them@example.com');
  ck('a switch never shows (or sends) the previous account\'s tasks', other.entries.length === 0 && other.accountUid === 'u2' && other.deletedIds.length === 0);
  ck('nor uses the previous account\'s own Apps Script', other.cloudSyncUrl === '');
  ck('lists go back to the defaults', Array.isArray(other.statuses) && other.statuses.includes('Pending') && !other.categories.includes('Payments'));
  ck('how the device rings stays (alert times, sound)', other.alerts.morning === '08:00' && other.alarmRingtone === 'bell');
  ck('tasks and lists are account data', ['entries', 'categories', 'holidays', 'cloudSyncUrl'].every((k) => ACCOUNT_KEYS.includes(k)));
  ck('nobody signed in: nothing to decide', accountAction(mine, null) === 'ready');

  section('The sign-in screen');
  ck('shown when nobody is signed in', needsWelcome({ authKnown: true, user: null }, {}));
  ck('not before Firebase has said who is signed in', !needsWelcome({ authKnown: false, user: null }, {}));
  ck('not once signed in', !needsWelcome({ authKnown: true, user: { uid: 'u1' } }, {}));
  ck('not after "Use without an account"', !needsWelcome({ authKnown: true, user: null }, { localOnly: true }));

  section('A new account is set up on its first sign-in');
  __resetBatches();
  __setMetaFormats({ lists: 'named' }, [[], [], [], []], true);
  await push('new-user', { entries: [], lists: [['Payments'], ['High', 'Low'], ['Pending'], ['Self']], listsUpdatedAt: 0 });
  const ops = __batches().flat();
  const lists = ops.find((o) => o.path === 'users/new-user/meta/lists');
  ck('its lists are written, though nothing was edited', !!lists && JSON.stringify(lists.data.lists.statuses) === '["Pending"]' && lists.data.lists.pendingWith[0] === 'Self');
  ck('with a profile note of who it is', ops.some((o) => o.path === 'users/new-user/meta/profile' && o.data.app === 'Working Dashboard'));
  __resetBatches();
  await push('new-user', { entries: [], lists: [['Payments'], ['High', 'Low'], ['Pending'], ['Self']], listsUpdatedAt: 0 });
  ck('only once: the next push writes nothing', __batches().length === 0);
  __setMetaFormats({ lists: null }, null, false);
}
