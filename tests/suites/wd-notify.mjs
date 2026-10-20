import { syncEntryAlerts, scheduleEntryAlert, armTodaysReminders, MAX_NUDGES_PER_KIND, cancelEntryAlert, snoozeEntryAlert, wdAlarmId, entryIdOfAlarm, planAll } from '../../src/workingDashboardNotify.js';
import { entryAlertPlan, reminderTimesAhead, isWarningKey } from '../../src/workingDashboard.js';
import { __scheduledAlarms, __alarmDelivery } from '../stubs/native-tools.mjs';
import { __live, cancelAllScheduledNotificationsAsync } from 'expo-notifications';

// A due time `ms` from now. One landing on exactly 00:00 would mean "date only" (as on the web app), so it moves 7 minutes on.
const timedIn = (ms) => { const d = new Date(Date.now() + ms); if (d.getHours() === 0 && d.getMinutes() === 0) d.setMinutes(7); return d.toISOString(); };

export async function run({ ck, section }) {
  section('Working Dashboard alerts: overlapping re-books never double up');
  await cancelAllScheduledNotificationsAsync();
  const due = timedIn(3 * 3600000);
  const entries = [{ id: 'e1', title: 'Pay vendor', dueAt: due }, { id: 'e2', title: 'Send SOA', dueAt: due }];
  const wd = () => __live().filter((n) => n.content.data?.kind === 'wd-entry');
  // The launch sync, a screen edit and a second sync, all in flight together.
  await Promise.all([syncEntryAlerts(entries), scheduleEntryAlert(entries[0]), syncEntryAlerts(entries)]);
  const perEntry = entryAlertPlan(entries[0]).length;
  // The due moment and follow-ups open the full-screen alarm; the warnings before the due time are a notification only (never both).
  const planKeys = entryAlertPlan(entries[0]).map((x) => x.key);
  const warnCount = planKeys.filter(isWarningKey).length;
  ck('the warnings are notifications only: "Due in 1 hr" never opens the alarm screen', warnCount > 0 && wd().length === 2 * warnCount && wd().every((n) => isWarningKey(n.content.data.key)), `got ${wd().length} notifications, ${warnCount} warnings each`);
  ck('a warning notification is not an alarm (the web app rings only those)', wd().every((n) => n.content.data.alarm === false));
  const detailed = entryAlertPlan({ id: 'd1', title: 'Pay vendor', dueAt: due, priority: 'High', category: 'Urgent Payments', pendingWith: 'Self', reference: 'Re: invoice 42' });
  ck('every alert says what the task is: priority, category, person and the mail chain', detailed.length > 0 && detailed.every((x) => x.body.includes('High · Urgent Payments · Self') && x.body.includes('Re: invoice 42')));
  const alarms = () => Object.keys(__scheduledAlarms()).filter((id) => id.startsWith('wd:'));
  const perAlarms = perEntry - warnCount;
  ck('each entry has exactly one set of alarms - the due moment and follow-ups, not the warnings', alarms().length === 2 * perAlarms && alarms().includes(wdAlarmId('e1', 'due')) && !alarms().includes(wdAlarmId('e1', 'due-15')) && !alarms().includes(wdAlarmId('e1', 'due-60')), `got ${alarms().length}, want ${2 * perAlarms}`);
  ck('an alarm id leads back to its entry', entryIdOfAlarm(wdAlarmId('e:1', 'due')) === 'e:1' && entryIdOfAlarm('task-9') === null);
  await cancelEntryAlert('e1');
  ck('cancelling an entry stops its notifications and its alarm', !wd().some((n) => n.content.data.entryId === 'e1') && !alarms().some((id) => entryIdOfAlarm(id) === 'e1') && alarms().length === perAlarms);
  await snoozeEntryAlert(entries[1], 'chime', 15);
  ck('snooze leaves one alarm, 15 minutes on', alarms().length === 1 && Math.abs(__scheduledAlarms()[wdAlarmId('e2', 'snooze')].atMs - (Date.now() + 15 * 60000)) < 5000 && !wd().some((n) => n.content.data.entryId === 'e2'));
  await syncEntryAlerts(entries);
  ck('a later re-book keeps the snooze, and nothing for that entry before it', !!__scheduledAlarms()[wdAlarmId('e2', 'snooze')]
    && !wd().some((n) => n.content.data.entryId === 'e2' && new Date(n.trigger.date).getTime() < Date.now() + 15 * 60000 + 30000));
  await cancelEntryAlert('e2');
  await syncEntryAlerts(entries);
  ck('done (or cancelled) clears the snooze', !__scheduledAlarms()[wdAlarmId('e2', 'snooze')] && !!__scheduledAlarms()[wdAlarmId('e2', 'due')]);
  await syncEntryAlerts([]);
  ck('a sync with nothing open clears every alert and alarm', !wd().length && !alarms().length);
  await syncEntryAlerts([entries[0]], 'chime', { warningsRing: true });
  ck('warnings stay notifications for every task, even with the old "warnings ring too" setting on', !alarms().includes(wdAlarmId('e1', 'due-60')) && !alarms().includes(wdAlarmId('e1', 'due-15')) && wd().some((n) => n.content.data.key === 'due-60') && alarms().includes(wdAlarmId('e1', 'due')));
  await syncEntryAlerts([]);
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, title: 'x', dueAt: timedIn((i + 1) * 3600000) }));
  ck('alerts are capped, soonest first', planAll(many).length === 100 && planAll(many)[0].e.id === 'm0');
  // A half-typed or impossible morning time falls back to the default rather than rolling over.
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 2); tomorrow.setHours(0, 0, 0, 0);
  const dated = { id: 'dd', title: 'Date only', dueAt: tomorrow.toISOString(), done: false, binned: false };
  const dayItem = (morning) => entryAlertPlan(dated, new Date(), { morning }).find((x) => x.key === 'due-day');
  ck('a date-only task rings once at 7 PM on its due date, whatever the morning time is', ['08:15', '25:00', '9'].every((m) => { const at = dayItem(m).at; return at.getDate() === tomorrow.getDate() && at.getHours() === 19 && at.getMinutes() === 0; }));
  ck('a date-only task has no other alert', entryAlertPlan(dated, new Date(), {}).length === 1);
  // Snoozed from its last alert: nothing of its own is left to ring, but the snooze must still be booked.
  const spent = { id: 'sp', title: 'Old task', dueAt: timedIn(-6 * 3600000), done: false, binned: false };
  const snoozeAt = Date.now() + 15 * 60000;
  const kept = planAll([spent], new Date(), undefined, 100, { sp: snoozeAt });
  ck('a snooze on an entry with no alerts left still rings', kept[0].item.key === 'snooze' && kept[0].item.at.getTime() === snoozeAt);
  const reminderByConfig = planAll([spent], new Date(), { fullScreen: false }, 100, { sp: snoozeAt });
  ck('a snoozed task that Config makes a Reminder comes back as a notification, not an alarm', reminderByConfig[0].item.key === 'snooze' && reminderByConfig[0].item.alarm === false);
  ck('...but not once the entry is done', planAll([{ ...spent, done: true }], new Date(), undefined, 100, { sp: snoozeAt }).length === 0);
  await Promise.all([armTodaysReminders({ walk: { enabled: true, everyMin: 60, from: '00:00', to: '23:59' } }), armTodaysReminders({ walk: { enabled: true, everyMin: 60, from: '00:00', to: '23:59' } })]);
  // Full-screen alarms now, like every other alert ("nudge:walk:<ms>"); none is also a notification.
  const walk = Object.keys(__scheduledAlarms()).filter((id) => id.startsWith('nudge:walk:'));
  ck('walk reminders are full-screen alarms, booked once each', walk.length > 0 && walk.length === new Set(walk).size && !__live().some((n) => n.content.data?.kind === 'wd-walk'), `${walk.length} booked`);

  // Every 5 minutes for three days was ~350 alarms per kind: past Android's 500, nothing else could book.
  await armTodaysReminders({ walk: { enabled: true, everyMin: 5, start: '00:00', end: '23:59' }, water: { enabled: true, everyMin: 5, start: '00:00', end: '23:59' } });
  const nudges = (k) => Object.entries(__scheduledAlarms()).filter(([id]) => id.startsWith(`nudge:${k}:`)).map(([, a]) => a);
  ck('a 5-minute walk/water nudge stays inside its share of the alarm budget', nudges('walk').length === MAX_NUDGES_PER_KIND && nudges('water').length === MAX_NUDGES_PER_KIND, `${nudges('walk').length} + ${nudges('water').length}`);
  const lateNight = new Date(2027, 1, 28, 23, 59, 30);
  ck('a reminder starting at midnight keeps its midnight slot on the next days', reminderTimesAhead({ enabled: true, everyMin: 5, start: '00:00', end: '23:59' }, lateNight, 2)[0].getTime() === new Date(2027, 2, 1, 0, 0).getTime());
  ck('...and books the soonest ones', Math.min(...nudges('walk').map((a) => a.atMs)) - Date.now() <= 5 * 60000 + 1000);
  await cancelAllScheduledNotificationsAsync();
}

export async function runExtra({ ck, section }) {
  const { handleWdAction, setLiveWdUpdater, refreshWdAlerts } = await import('../../src/workingDashboardActions.js');
  const { writeStored, loadAll, assemble, KEY } = await import('../../src/storeCore.js');
  const { __live, cancelAllScheduledNotificationsAsync } = await import('expo-notifications');
  const { __scheduledAlarms } = await import('../stubs/native-tools.mjs');
  const stored = async () => assemble((await loadAll()).core, (await loadAll()).slices).workingDashboard.entries;
  const due = timedIn(3 * 3600000);

  section('Working Dashboard alerts: full screen unless the notification centre is chosen');
  await syncEntryAlerts([{ id: 'dlv', title: 'Delivery check', dueAt: due }]);
  ck('by default an alarm is delivered full screen', __alarmDelivery() === false);
  await syncEntryAlerts([{ id: 'dlv', title: 'Delivery check', dueAt: due }], 'chime', { alarmAsNotification: true });
  ck('"Show alarms in the notification centre instead" is passed to the phone when alerts are booked', __alarmDelivery() === true);
  await syncEntryAlerts([{ id: 'dlv', title: 'Delivery check', dueAt: due }], 'chime', { alarmAsNotification: false });
  ck('...and switching it off puts alarms back to full screen', __alarmDelivery() === false);

  section('Working Dashboard alerts: Done and Snooze work with the app closed');
  await cancelAllScheduledNotificationsAsync();
  await writeStored([[KEY, JSON.stringify({ profile: { displayName: 'A' } })], ['MPT_WD_ENTRIES_V1', JSON.stringify([
    { id: 'a', title: 'Pay vendor', dueAt: due, status: 'Pending', recurrence: 'none', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', title: 'Monthly BRS', dueAt: due, status: 'Pending', recurrence: 'monthly', updatedAt: '2026-01-01T00:00:00.000Z' },
  ])]]);
  await refreshWdAlerts({ pull: false, force: true });
  ck('the background refresh books alerts from what is stored', Object.keys(__scheduledAlarms()).includes('wd:a:due') && !Object.keys(__scheduledAlarms()).includes('wd:a:due-60'));
  await handleWdAction('WD_DONE', 'a', 'k1');
  let list = await stored();
  const a = list.find((e) => e.id === 'a');
  ck('Done completes the stored entry, marked as a phone edit so it syncs', a.done && a.status === 'Completed' && a.localEditAt > 0);
  ck('...and stops its alerts and alarm', !__live().some((n) => n.content.data?.entryId === 'a') && !Object.keys(__scheduledAlarms()).some((id) => id.startsWith('wd:a:')));
  await handleWdAction('WD_DONE', 'b', 'k2');
  list = await stored();
  ck('Done on a repeating entry rolls it on to its next date', list.filter((e) => e.title === 'Monthly BRS').length === 2 && list.some((e) => e.title === 'Monthly BRS' && !e.done));
  ck('the same press delivered twice is applied once', (await handleWdAction('WD_DONE', 'b', 'k2')) && (await stored()).filter((e) => e.title === 'Monthly BRS').length === 2);
  const next = list.find((e) => e.title === 'Monthly BRS' && !e.done);
  await handleWdAction('SNOOZE', next.id);
  ck('Snooze from the alarm screen books one alarm 15 minutes on', Math.abs((__scheduledAlarms()[`wd:${next.id}:snooze`]?.atMs || 0) - (Date.now() + 15 * 60000)) < 5000);

  section('Working Dashboard alerts: switch a task between Alarm and Reminder from its alert');
  await writeStored([['MPT_WD_ENTRIES_V1', JSON.stringify([
    { id: 'r', title: 'Collect bank statements', dueAt: timedIn(-30 * 60000), status: 'Pending', recurrence: 'none', updatedAt: '2026-01-01T00:00:00.000Z' },
  ])]]);
  await refreshWdAlerts({ pull: false, force: true });
  const rAlarms = () => Object.keys(__scheduledAlarms()).filter((id) => id.startsWith('wd:r:'));
  const rNotes = () => __live().filter((n) => n.content.data?.entryId === 'r');
  ck('an Alarm task still pending has ringing follow-ups', rAlarms().some((id) => id.includes(':nag-')));
  ck('...and its notifications offer "Reminder only"', rNotes().every((n) => n.content.categoryIdentifier === 'PT_WD_ALERT'));
  await handleWdAction('REMIND', 'r');
  let r = (await stored()).find((e) => e.id === 'r');
  ck('"Reminder only" on the ringing alarm makes it a Reminder, as a phone edit', r.alertMode === 'gentle' && r.localEditAt > 0);
  // A Reminder task's due moment is full screen too (its warnings are notifications, like every task's).
  ck('...and its due alerts still open the full-screen alarm (Reminder tasks too)', rAlarms().length > 0 && !rAlarms().some((id) => id.includes(':nag-')));
  await handleWdAction('WD_RING', 'r', 'k-ring');
  r = (await stored()).find((e) => e.id === 'r');
  ck('"Ring as alarm" turns it back into an Alarm that rings again', r.alertMode === 'alarm' && rAlarms().length > 0);

  section('Working Dashboard alerts: DAR on the ringing alarm');
  await writeStored([['MPT_WD_ENTRIES_V1', JSON.stringify([
    { id: 'd', title: 'Post TDS entries', dueAt: timedIn(-20 * 60000), status: 'Pending', recurrence: 'none', dar: false, updatedAt: '2026-01-01T00:00:00.000Z' },
  ])]]);
  await refreshWdAlerts({ pull: false, force: true });
  await handleWdAction('DAR', 'd');
  const d = (await stored()).find((e) => e.id === 'd');
  ck('DAR completes the task and ticks it for the Daily Activity Report', d.done && d.dar === true && d.localEditAt > 0);
  ck('...and stops its alarms', !Object.keys(__scheduledAlarms()).some((id) => id.startsWith('wd:d:')));

  section('Working Dashboard alerts: with the app open, Done goes through the live store');
  let liveWd = { entries: [{ id: 'c', title: 'Call bank', dueAt: due, status: 'Pending' }] };
  setLiveWdUpdater((fn) => { liveWd = fn(liveWd); });
  await handleWdAction('WD_DONE', 'c', 'k3');
  ck('the live copy is completed, storage is left to the app', liveWd.entries[0].done && !(await stored()).some((e) => e.id === 'c'));
  setLiveWdUpdater(null);
  await cancelAllScheduledNotificationsAsync();
}
