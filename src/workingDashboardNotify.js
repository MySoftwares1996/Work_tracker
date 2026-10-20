/**
 * Working Dashboard's alerts. Each open entry gets the alerts entryAlertPlan()
 * lists (workingDashboard.js): warnings before its due time and deadline, a
 * full-screen alarm at them, and "still pending" follow-ups. Everything is
 * handed to Android ahead of time, so it rings with the app closed or swiped
 * from Recents:
 *  - notifications through expo-notifications, which Android keeps across a
 *    restart, each with Done / Snooze buttons that work without opening the app;
 *  - the full-screen alarm through the native module, booked as an alarm clock
 *    (never delayed for battery saving) and re-booked by it after a restart.
 * Walk/Water interval reminders live here too.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleAt } from './notify';
import { makeSerial } from './serialQueue';
import { logAlert } from './alertLog';
import { reminderTimesAhead, entryAlertPlan, alertModeOf, isQuietTime, weeklySummaryTimes, isWarningKey, DEFAULT_ALERTS } from './workingDashboard';
import { scheduleFullScreenAlarm, cancelFullScreenAlarm, listFullScreenAlarms, stopAlarmRinging, setAlarmSound, setAlarmStyle, setAlarmDelivery, setAlarmBanner, trackerAvailable } from './tracker';
import { warnQuiet } from './quietCatch';

export const WD_CATEGORY = 'PT_WD_ALERT';
export const WD_DONE = 'WD_DONE';
export const WD_DAR = 'WD_DAR';        // done, and in the Daily Activity Report
export const WD_SNOOZE = 'WD_SNOOZE15';
export const WD_SNOOZE_MIN = 15;
/*
 * A task's alerts carry a third button that switches it between Alarm and Reminder (ALERT_MODES): an Alarm
 * task's say "Reminder only", a Reminder task's "Ring as alarm". Android fixes the buttons per category,
 * hence a second category for Reminder tasks. WD_REMIND is also what the ringing alarm's own button sends.
 */
export const WD_GENTLE_CATEGORY = 'PT_WD_ALERT_GENTLE';
export const WD_REMIND = 'WD_REMIND';
export const WD_RING = 'WD_RING';

/** The native alarm id for one alert of one entry: "wd:<entry id>:<alert key>". */
export const wdAlarmId = (entryId, key) => `wd:${entryId}:${key}`;
export const entryIdOfAlarm = (alarmId) => {
  const m = /^wd:(.+):[^:]+$/.exec(String(alarmId || ''));
  return m ? m[1] : null;
};

async function cancelByKind(kind, entryId) {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const mine = all.filter((n) => n.content?.data?.kind === kind && (entryId == null || String(n.content?.data?.entryId) === String(entryId)));
  await Promise.all(mine.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(warnQuiet('workingDashboardNotify'))));
}

async function cancelAlarms(entryId) {
  const ids = await listFullScreenAlarms();
  const mine = ids.filter((id) => id.startsWith('wd:') && !id.startsWith('wd:preview:') && (entryId == null || entryIdOfAlarm(id) === String(entryId)));
  for (const id of mine) await cancelFullScreenAlarm(id);
}

// Android allows an app 500 pending alarms in all, shared with To-Do, walk/water and attendance.
const MAX_ENTRY_ALERTS = 100;
// Per walk/water reminder: three days of an every-5-minutes nudge was ~350 alarms each, and past the
// 500 limit every other alert in the app failed to book. The rest is booked at the next launch / return.
export const MAX_NUDGES_PER_KIND = 60;

/**
 * Every job here cancels and then re-books, with many awaits in between. Two
 * running at once (the launch sync and a screen edit, or two syncs a couple
 * of seconds apart) both cancel before either books, and each then books a
 * full set - so every alert rang twice. They run one at a time instead.
 */
const rawSerial = makeSerial(60000, 'alert update');
// A failed or timed-out alert job is also written to the alerts log (Config > Alerts), then thrown to the caller as before.
const serial = (fn) => rawSerial((ctx) => fn(ctx)).catch((err) => { logAlert('job', (err && err.message) || String(err)); throw err; });

const notifyFor = (entry, item, ringtone, alerts) => ({
  title: item.title,
  body: item.body,
  group: 'tasks',
  ringtone,
  category: alertModeOf(entry, alerts) === 'alarm' ? WD_CATEGORY : WD_GENTLE_CATEGORY,
  data: { kind: 'wd-entry', entryId: entry.id, key: item.key, alarm: !!item.alarm },
});

/** Stops a job that was given up on (serialQueue timeout) before it books or cancels anything over its successor's work. */
function stillWanted(ctx) { if (ctx && ctx.cancelled) throw new Error('alert job was abandoned after a timeout'); }

/**
 * Books a list of { e, item } soonest first. The due moment, deadline, overdue and follow-up alerts open the full-screen
 * alarm (Alarm and Reminder tasks alike); the warnings before them ("Due in 1 hr") are always a notification only.
 * A notification also stands in without the native module, or if Android refuses the alarm. The batch is already capped (MAX_ENTRY_ALERTS); later alerts are booked as these pass.
 */
async function book(jobs, ringtone, alerts, ctx = null) {
  const native = trackerAvailable();
  if (native) await setAlarmSound(ringtone).catch(warnQuiet('workingDashboardNotify'));      // the ringing alarm plays the ringtone chosen in Config
  if (native) await setAlarmStyle((alerts && alerts.phoneAlarmStyle) || 1).catch(warnQuiet('workingDashboardNotify'));      // ...and looks as chosen there
  if (native) await setAlarmBanner(!(alerts && alerts.alarmBanner === false)).catch(warnQuiet('workingDashboardNotify'));      // the banner notification stays unless switched off
  if (native) await setAlarmDelivery(!!(alerts && alerts.alarmAsNotification)).catch(warnQuiet('workingDashboardNotify'));      // full screen unless set to the notification centre
  for (const { e, item } of jobs) {
    stillWanted(ctx);
    // The full-screen alarm rings by itself and carries its own Done / Snooze; a notification at the
    // same moment would only ring twice. Without the native module (or past the cap) it is the notification.
    // A warning before the due time ("Due in 1 hr") is a notification only, for every task; the due moment, deadline
    // and follow-ups are the alarm.
    const noteOnly = isWarningKey(item.key);
    if (native && !noteOnly) {
      const ok = await scheduleFullScreenAlarm(wdAlarmId(e.id, item.key), item.at, item.title, item.body).catch(() => false);
      if (ok) continue;
      logAlert('booking', `Android refused the full-screen alarm for "${item.title}" - a notification was booked instead.`);
    }
    await scheduleAt(item.at, notifyFor(e, item, ringtone, alerts)).catch((err) => { logAlert('booking', `Could not book "${item.title}": ${(err && err.message) || err}`); });
  }
}

/** Re-arms (cancel then reschedule) every alert for one entry. */
export const scheduleEntryAlert = (entry, ringtone = 'chime', alerts) => serial(async (ctx) => {
  stillWanted(ctx);
  await cancelByKind('wd-entry', entry.id);
  stillWanted(ctx);
  await cancelAlarms(entry.id);
  stillWanted(ctx);
  // Edited (new due time, reopened...): an old snooze no longer applies.
  const snoozes = await readSnoozes();
  if (snoozes[String(entry.id)]) { delete snoozes[String(entry.id)]; await writeSnoozes(snoozes); }
  await book(entryAlertPlan(entry, new Date(), alerts).map((item) => ({ e: entry, item })), ringtone, alerts, ctx);
});

/**
 * Snoozes, remembered on the phone ({ entryId: ms }) so a later re-book (launch, return to the app, the
 * background refresh) keeps the snooze instead of booking the entry's old alerts again.
 */
const SNOOZE_KEY = 'MPT_WD_SNOOZES';
export async function readSnoozes(now = Date.now()) {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(SNOOZE_KEY)) || '{}') || {};
    return Object.fromEntries(Object.entries(all).filter(([, at]) => Number(at) > now));
  } catch { return {}; }
}
async function writeSnoozes(map) { try { await AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify(map)); } catch { /* best effort */ } }

// A snoozed Reminder task comes back as a notification, not a ringing alarm - its own choice, or Config's when it has none.
const snoozeItem = (entry, at, alerts) => ({ at: new Date(at), key: 'snooze', title: `Snoozed: ${entry.title || 'Working Dashboard entry'}`, body: 'Mark it done, or snooze it again.', alarm: alertModeOf(entry, alerts) === 'alarm' });

/**
 * Every alert for these entries, soonest first, capped - what syncEntryAlerts books. Pure, for tests.
 * A snoozed entry rings again at its snooze time, and none of its alerts before that.
 */
export function planAll(entries = [], now = new Date(), alerts, cap = MAX_ENTRY_ALERTS, snoozes = {}) {
  const jobs = [];
  for (const e of entries) {
    const until = Number(snoozes[String(e?.id)]) || 0;
    const plan = entryAlertPlan(e, now, alerts);
    // Kept while the entry is open, even once its own alerts have all rung: a snooze tapped on the last one
    // (the 4-hour follow-up, "overdue since yesterday", the deadline alarm) used to vanish at the next sync.
    if (until > now.getTime() && e && !e.done && !e.binned) {
      jobs.push({ e, item: snoozeItem(e, until, alerts) });
      for (const item of plan) if (item.at.getTime() > until + 60000) jobs.push({ e, item });
      continue;
    }
    for (const item of plan) jobs.push({ e, item });
  }
  jobs.sort((a, b) => a.item.at - b.item.at);
  return jobs.slice(0, cap);
}

/**
 * Books alerts for every open entry - including ones that arrived from the
 * sheet or Firebase, which scheduleEntryAlert never saw. Soonest first,
 * capped at MAX_ENTRY_ALERTS; the rest are booked by a later sync (app
 * launch, return to the app, or the background refresh).
 */
export const syncEntryAlerts = (entries = [], ringtone = 'chime', alerts, now = new Date()) => serial(async (ctx) => {
  stillWanted(ctx);
  await cancelByKind('wd-entry');
  stillWanted(ctx);
  await cancelAlarms();
  stillWanted(ctx);
  const batch = planAll(entries, now, alerts, MAX_ENTRY_ALERTS, await readSnoozes(now.getTime()));
  await book(batch, ringtone, alerts, ctx);
  return batch.length;
});

export const cancelEntryAlert = (entryId) => serial(async () => {
  await cancelByKind('wd-entry', entryId);
  await cancelAlarms(entryId);
  await stopAlarmRinging(`wd:${entryId}:`);          // done / binned while it is ringing: silence it
  const snoozes = await readSnoozes();
  if (snoozes[String(entryId)]) { delete snoozes[String(entryId)]; await writeSnoozes(snoozes); }
});

/** Snooze: this entry's alerts stop, and one alert (and alarm) rings again in WD_SNOOZE_MIN minutes. */
export const snoozeEntryAlert = (entry, ringtone = 'chime', minutes = WD_SNOOZE_MIN, alerts) => serial(async (ctx) => {
  stillWanted(ctx);
  await cancelByKind('wd-entry', entry.id);
  stillWanted(ctx);
  await cancelAlarms(entry.id);
  await stopAlarmRinging(`wd:${entry.id}:`);
  stillWanted(ctx);
  const at = Date.now() + minutes * 60000;
  await writeSnoozes({ ...(await readSnoozes()), [String(entry.id)]: at });
  await book([{ e: entry, item: snoozeItem(entry, at, alerts) }], ringtone, alerts, ctx);
});

/** Schedules the walk/water nudges for the rest of today and the next two days; call again whenever settings change or the app opens. */
/** A walk / water reminder's full-screen alarm id: "nudge:walk:<ms>". */
export const nudgeAlarmId = (kind, at) => `nudge:${kind}:${new Date(at).getTime()}`;

const NUDGE_TEXT = {
  walk: { title: 'Time to walk', body: 'Leave the desk for a few minutes.' },
  water: { title: 'Time to drink water', body: 'Stay hydrated.' },
};

/**
 * Snooze pressed on a walk / water alarm (`alarmId` "nudge:walk:<ms>"): it rings again in `minutes`. Booked as
 * "nudge:walk-snooze:<ms>", which re-booking the day's reminders (they clear "nudge:walk:...") leaves alone.
 * False when `alarmId` is not a walk / water alarm.
 */
export const snoozeNudge = (alarmId, minutes = WD_SNOOZE_MIN) => serial(async () => {
  const m = /^nudge:(walk|water)(?:-snooze)?:/.exec(String(alarmId || ''));
  if (!m || !trackerAvailable()) return false;
  const kind = m[1];
  const at = new Date(Date.now() + minutes * 60000);
  const { title, body } = NUDGE_TEXT[kind];
  return scheduleFullScreenAlarm(`nudge:${kind}-snooze:${at.getTime()}`, at, title, body).catch(() => false);
});

export const armTodaysReminders = (reminders = {}, ringtone = 'chime', alerts = null) => serial(async () => {
  const native = trackerAvailable();
  const booked = native ? await listFullScreenAlarms() : [];
  for (const kind of ['walk', 'water']) {
    const tag = `wd-${kind}`;
    await cancelByKind(tag);
    for (const id of booked.filter((x) => x.startsWith(`nudge:${kind}:`))) await cancelFullScreenAlarm(id);
    // Slots under a second away are dropped before the cap, not after: scheduleAt() skips them, and taking
    // the first 60 first left one fewer booked whenever this ran just before a slot.
    // The APK keeps quiet hours and days off for these too (Config > Alerts > Quiet hours): those slots are left out.
    const quiet = (t) => Platform.OS !== 'web' && !!alerts && isQuietTime(t, alerts);
    const times = reminderTimesAhead(reminders[kind], new Date(), 3).filter((t) => t.getTime() > Date.now() + 1000 && !quiet(t)).slice(0, MAX_NUDGES_PER_KIND);
    for (const t of times) {
      // Full screen like every other alert (silent while the web app is in use); a notification only without the native module.
      const { title, body } = NUDGE_TEXT[kind];
      if (native && await scheduleFullScreenAlarm(nudgeAlarmId(kind, t), t, title, body).catch(() => false)) continue;
      await scheduleAt(t, {
        title,
        body,
        group: 'attendance',
        ringtone,
        data: { kind: tag },
      });
    }
  }
});

/**
 * APK: "Your week summary is ready" on the chosen weekday and time (Config > Alerts), the next four weeks booked ahead;
 * tapping it opens the Report tab with the week's summary. Booked again whenever the settings change or the app opens.
 */
export const armWeeklySummary = (alerts) => serial(async () => {
  await cancelByKind('wd-summary');
  const native = trackerAvailable();
  if (native) { for (const id of (await listFullScreenAlarms()).filter((x) => x.startsWith('summary:'))) await cancelFullScreenAlarm(id); }
  const cfg = { ...DEFAULT_ALERTS, ...(alerts || {}) };
  if (Platform.OS === 'web' || !cfg.weeklySummary) return 0;
  let n = 0;
  for (const at of weeklySummaryTimes(cfg, new Date(), 4)) {
    // A full-screen alert like every task alert; a notification only without the native module or if Android refuses it.
    if (native && await scheduleFullScreenAlarm(`summary:${new Date(at).getTime()}`, at, 'Your week summary is ready', 'Open it - Email or PDF it in one tap.').catch(() => false)) { n += 1; continue; }
    if (await scheduleAt(at, { title: 'Your week summary is ready', body: 'Tap to open it - Email or PDF it in one tap.', group: 'attendance', data: { kind: 'wd-summary' } }).catch(() => null)) n += 1;
  }
  return n;
});
