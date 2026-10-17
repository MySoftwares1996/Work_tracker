/**
 * Working Dashboard work that has to happen with the app closed: Done and
 * Snooze pressed on an alert (a notification button, or the full-screen alarm
 * screen), and a background refresh that keeps the alerts booked - including
 * for entries added on the web app since the app was last opened.
 *
 * While the app is running, changes go through the live store (setLiveWdUpdater),
 * so the screens update and nothing is overwritten by the copy in memory. With
 * the app closed they are written to storage directly, and the app reads them
 * at its next launch; Realtime Sync then sends them on (they carry localEditAt).
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadAll, assemble, writeStored, SLICES } from './storeCore';
import { completeEntry, withCompletedAt, nextRecurringEntry, isOpen, blankEntry, snoozeEntry, editedNow, normalizeHolidays, normalizeLeaveDays, setAlertOffDays } from './workingDashboard';
import { cancelEntryAlert, snoozeEntryAlert, scheduleEntryAlert, syncEntryAlerts, planAll, readSnoozes, WD_DONE, WD_DAR, WD_SNOOZE, WD_SNOOZE_MIN, WD_REMIND, WD_RING } from './workingDashboardNotify';
import { stopAlarmRinging } from './tracker';
import { pullSheetEntries, mergeSheetPull, isValidScriptUrl, fromWebDocOver } from './cloudSync';
import { mergeRemoteEntries, applyRemovedIds } from './firebaseSyncCore';
import { warnQuiet } from './quietCatch';

const WD_SLICE = SLICES.find((s) => s.read({ workingDashboard: { entries: 'x' } }) === 'x');

let live = null;
/** App.js registers the store's updater here while it is mounted: fn((wd) => nextWd). */
export const setLiveWdUpdater = (fn) => { live = fn; };

async function readWd() {
  const { core, slices } = await loadAll();
  return assemble(core, slices).workingDashboard || {};
}

/** Applies `change(entries) -> entries | null` to the stored entries, live when the app runs. */
async function changeEntries(change) {
  if (live) {
    live((wd) => {
      const next = change(wd.entries || []);
      return next ? { ...wd, entries: next } : wd;
    });
    return;
  }
  const wd = await readWd();
  const next = change(wd.entries || []);
  if (next && WD_SLICE) {
    await writeStored([[WD_SLICE.key, JSON.stringify(next)]]);
    // With the app closed, send the change to the web app now - it used to wait for the app to be opened,
    // so the web app kept alarming for a task already done or snoozed on the phone.
    import('./firebaseSync').then((m) => m.pushIfSignedIn && m.pushIfSignedIn(next, wd.accountUid)).catch(warnQuiet('pushIfSignedIn'));
  }
}

/**
 * Done on an alert: the entry is completed (a repeating one rolls on to its next date) and its alerts stop.
 * `dar`: DAR on the ringing alarm - completed and ticked for the Daily Activity Report in one press;
 * ✓ (Done) completes it and keeps it out of the report.
 */
export async function completeWdEntry(entryId, { dar = false } = {}) {
  const id = String(entryId);
  const wd = await readWd();
  const ringtone = wd.alarmRingtone || 'chime';
  // Worked out here from the entries already read (the updater below runs later, inside React, and must stay pure).
  const now = new Date();
  const opts = { holidays: normalizeHolidays(wd.holidays), leaveDays: normalizeLeaveDays(wd.leaveDays) };
  const before = (wd.entries || []).find((x) => String(x.id) === id);
  const rolled = before && isOpen(before) ? nextRecurringEntry(before, wd.entries || [], now, opts) : null;
  await changeEntries((entries) => {
    const e = entries.find((x) => String(x.id) === id);
    if (!e || !isOpen(e)) return null;
    const next = nextRecurringEntry(e, entries, now, opts);
    return [...(next ? [next] : []), ...entries.map((x) => (String(x.id) === id ? completeEntry({ ...x, dar }) : x))];
  });
  await cancelEntryAlert(id).catch(warnQuiet('workingDashboardActions'));
  if (rolled) await scheduleEntryAlert(rolled, ringtone, wd.alerts).catch(warnQuiet('scheduleEntryAlert'));
  redrawWidgets();
}

/** Home-screen widgets show the entries too. Loaded on demand: widgets.js imports this file. */
function redrawWidgets() {
  import('./widgets').then((m) => m.refreshWidgets()).catch(warnQuiet('workingDashboardActions'));
}

/** Snooze on an alert: quiet now, one alarm again in `minutes` (15 unless a length was picked on the alarm). */
export async function snoozeWdEntry(entryId, minutes = WD_SNOOZE_MIN) {
  const wd = await readWd();
  const e = (wd.entries || []).find((x) => String(x.id) === String(entryId));
  if (!e || !isOpen(e)) { await cancelEntryAlert(String(entryId)).catch(warnQuiet('workingDashboardActions')); return; }
  // Kept on the entry too (the web app's snoozeUntil), so the web app is quiet for the same time.
  const until = Date.now() + minutes * 60000;
  await changeEntries((entries) => entries.map((x) => (String(x.id) === String(entryId) ? snoozeEntry(x, until) : x)));
  await snoozeEntryAlert(e, wd.alarmRingtone || 'chime', minutes, wd.alerts);
}

/**
 * "Reminder only" / "Ring as alarm" on an alert: the task switches between Alarm and Reminder (as 🔔 / 🔕 on
 * its card does) and its alerts are booked again to match. A ringing alarm stops; a Reminder task gets no more
 * ringing "still pending" alarms - only a notification each day while it stays overdue.
 */
export async function setWdAlertMode(entryId, mode) {
  const id = String(entryId);
  await stopAlarmRinging(`wd:${id}:`).catch(() => false);
  const wd = await readWd();
  const e = (wd.entries || []).find((x) => String(x.id) === id);
  if (!e || !isOpen(e)) { await cancelEntryAlert(id).catch(warnQuiet('workingDashboardActions')); return; }
  const next = { ...e, alertMode: mode, ...editedNow() };
  await changeEntries((entries) => entries.map((x) => (String(x.id) === id ? { ...x, alertMode: mode, ...editedNow() } : x)));
  await scheduleEntryAlert(next, wd.alarmRingtone || 'chime', wd.alerts).catch(warnQuiet('scheduleEntryAlert'));
}

/**
 * Minutes a snooze press asks for, or 0 when `action` is not a snooze: the notification's 💤 and the alarm's
 * "SNOOZE" are 15 minutes; the alarm's snooze strip sends "SNOOZE:5", "SNOOZE:30", "SNOOZE:60".
 */
export function snoozeMinutesOf(action) {
  if (action === WD_SNOOZE || action === 'SNOOZE') return WD_SNOOZE_MIN;
  const m = /^SNOOZE:(\d{1,4})$/.exec(String(action || ''));
  return m && Number(m[1]) > 0 ? Number(m[1]) : 0;
}

const handled = new Set();
const HANDLED_MAX = 200;
/**
 * A button pressed on a Working Dashboard alert. `action` is the notification
 * action (WD_DONE / WD_SNOOZE / WD_REMIND / WD_RING) or the alarm's ("DONE" / "SNOOZE" / "DAR" / "REMIND").
 * `key` makes a second delivery of the same press a no-op.
 */
export async function handleWdAction(action, entryId, key) {
  if (!entryId) return false;
  if (key) {
    if (handled.has(key)) return true;
    handled.add(key);
    if (handled.size > HANDLED_MAX) handled.delete(handled.values().next().value);      // oldest first: the set stays bounded
    try { return await runWdAction(action, entryId); } catch (err) { handled.delete(key); throw err; }      // a failed press may be retried
  }
  return runWdAction(action, entryId);
}

async function runWdAction(action, entryId) {
  if (action === WD_DONE || action === 'DONE') { await completeWdEntry(entryId); return true; }
  if (action === 'DAR' || action === WD_DAR) { await completeWdEntry(entryId, { dar: true }); return true; }
  const snoozeMin = snoozeMinutesOf(action);
  if (snoozeMin) { await snoozeWdEntry(entryId, snoozeMin); return true; }
  if (action === WD_REMIND || action === 'REMIND') { await setWdAlertMode(entryId, 'gentle'); return true; }
  if (action === WD_RING) { await setWdAlertMode(entryId, 'alarm'); return true; }
  return false;
}

/* ---------- background refresh ---------- */

export const WD_REFRESH_TASK = 'PT_WD_ALERT_REFRESH';
const SIG_KEY = 'MPT_WD_ALERT_SIG';

/**
 * Books the alerts again from what is stored, after first adding any entry the
 * web app created since the app last ran (read from the Google Sheet; only new
 * entries are added, nothing the phone has is replaced). Skipped when the
 * alerts would come out the same as last time.
 */
export async function refreshWdAlerts({ pull = true, force = false, wd: given = null } = {}) {
  let wd = given || await readWd();      // the app passes what it holds; reading every stored collection costs more
  if (!given) setAlertOffDays(wd.holidays, wd.leaveDays);     // with the app closed: quiet hours' off days
  if (pull && isValidScriptUrl(wd.cloudSyncUrl || '')) {
    try {
      const res = await pullSheetEntries(wd.cloudSyncUrl, blankEntry());
      if (res.ok && res.tasks.length) {
        const pull = (entries) => mergeSheetPull(entries, res.tasks, wd.lastSheetPullAt || 0, wd.purgedIds || [], { addOnly: true });
        const added = pull(wd.entries || []).added;      // counted from what was read; the updater below stays pure
        await changeEntries((entries) => { const merged = pull(entries); return merged.added ? merged.entries : null; });
        if (added) wd = live ? wd : await readWd();
      }
    } catch { /* offline: book from what is stored */ }
  }
  // Signed in to Realtime Sync: the web app's edits since the app last ran (a task done, moved or changed there) are
  // read now, so the alerts booked below are the current ones and not the old ones that would ring for nothing.
  if (pull && wd.accountUid) {
    try {
      const fb = await import('./firebaseSync');
      const res = await fb.pullTasksIfSignedIn(wd.accountUid, wd.entries || [], wd.deletedIds || []);
      if (res && (res.incoming.length || res.removedIds.length)) {
        await changeEntries((entries) => {
          const blank = blankEntry();
          const have = new Map(entries.map((e) => [String(e.id), e]));
          const incoming = res.incoming.map((d) => fromWebDocOver(have.get(String(d.id)), d, blank)).filter(Boolean).map(withCompletedAt);
          const kept = applyRemovedIds(entries, res.removedIds).entries;
          const merged = mergeRemoteEntries(kept, incoming, wd.deletedIds || []);
          return merged.added || merged.updated || kept.length !== entries.length ? merged.entries : null;
        });
        wd = live ? wd : await readWd();
      }
    } catch { /* offline or signed out: book from what is stored */ }
  }
  const entries = wd.entries || [];
  const plan = planAll(entries, new Date(), wd.alerts, undefined, await readSnoozes());
  const sig = JSON.stringify([wd.alarmRingtone, wd.alerts, plan.map((j) => [j.e.id, j.item.key, j.item.at.getTime()])]);
  if (!given) redrawWidgets();          // background run: overdue / due-today counts move with the clock
  if (!force && sig === (await AsyncStorage.getItem(SIG_KEY).catch(() => null))) return 0;
  const n = await syncEntryAlerts(entries, wd.alarmRingtone || 'chime', wd.alerts);
  await AsyncStorage.setItem(SIG_KEY, sig).catch(warnQuiet('workingDashboardActions'));
  return n;
}

if (!TaskManager.isTaskDefined(WD_REFRESH_TASK)) {
  TaskManager.defineTask(WD_REFRESH_TASK, async () => {
    try {
      const n = await refreshWdAlerts();
      return n ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

/** Runs refreshWdAlerts about every 15 minutes, with the app closed and after a restart. */
export async function registerWdRefresh() {
  const registered = await TaskManager.isTaskRegisteredAsync(WD_REFRESH_TASK).catch(() => false);
  if (registered) return true;
  await BackgroundFetch.registerTaskAsync(WD_REFRESH_TASK, { minimumInterval: 15 * 60, stopOnTerminate: false, startOnBoot: true });
  return true;
}
