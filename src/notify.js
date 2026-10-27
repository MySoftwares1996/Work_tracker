import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { ensureChannel, ensureSelectedChannels } from './ringtones';
import { cancelFullScreenAlarm } from './tracker';
import { WD_CATEGORY, WD_GENTLE_CATEGORY, WD_DONE, WD_DAR, WD_SNOOZE, WD_SNOOZE_MIN, WD_REMIND, WD_RING } from './workingDashboardNotify';
import { handleWdAction } from './workingDashboardActions';
import { warnQuiet } from './quietCatch';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Action buttons that sit right on the notification, so Done / Ack / Snooze
 * work straight from the lock screen without the app ever coming to the
 * foreground. `opensAppToForeground: false` is what keeps the app closed
 * when one of these is tapped.
 */
export const TASK_CATEGORY = 'PT_TASK_ALARM';

async function ensureCategories() {
  await Notifications.setNotificationCategoryAsync(TASK_CATEGORY, [
    { identifier: 'DONE', buttonTitle: 'Done', options: { opensAppToForeground: false } },
    { identifier: 'SNOOZE', buttonTitle: 'Snooze 20m', options: { opensAppToForeground: false } },
    { identifier: 'ACK', buttonTitle: 'Ack', options: { opensAppToForeground: false } },
  ]).catch(warnQuiet('notify'));
  // Working Dashboard alerts: act on the entry straight from the notification (Android shows the first three buttons), app closed or not. The buttons are
  // symbols (✓ Done, 💤 Snooze, 🔕 Reminder only, 🔔 Ring as alarm) so they sit on one line in the notification centre.
  await Notifications.setNotificationCategoryAsync(WD_CATEGORY, [
    { identifier: WD_DONE, buttonTitle: '✓', options: { opensAppToForeground: false } },
    { identifier: WD_DAR, buttonTitle: '✓ DAR', options: { opensAppToForeground: false } },
    { identifier: WD_SNOOZE, buttonTitle: `💤 ${WD_SNOOZE_MIN}m`, options: { opensAppToForeground: false } },
    { identifier: WD_REMIND, buttonTitle: '🔕', options: { opensAppToForeground: false } },
  ]).catch(warnQuiet('notify'));
  // A Reminder task's alerts: the same, with a button to make it ring as an alarm instead.
  await Notifications.setNotificationCategoryAsync(WD_GENTLE_CATEGORY, [
    { identifier: WD_DONE, buttonTitle: '✓', options: { opensAppToForeground: false } },
    { identifier: WD_DAR, buttonTitle: '✓ DAR', options: { opensAppToForeground: false } },
    { identifier: WD_SNOOZE, buttonTitle: `💤 ${WD_SNOOZE_MIN}m`, options: { opensAppToForeground: false } },
    { identifier: WD_RING, buttonTitle: '🔔', options: { opensAppToForeground: false } },
  ]).catch(warnQuiet('notify'));
}

/**
 * Channels are created per (group, ringtone) pair by ./ringtones, because
 * Android will not let a channel change its sound once it exists.
 */
export async function initNotifications(settings) {
  const { status } = await Notifications.getPermissionsAsync();
  let granted = status === 'granted';
  if (!granted) granted = (await Notifications.requestPermissionsAsync()).status === 'granted';
  if (Platform.OS === 'android') await ensureSelectedChannels(settings);
  await ensureCategories();
  await registerBackgroundNotificationTask();
  return granted;
}

/**
 * Schedule a one-shot alert at an absolute time.
 * Pass group ('tasks' | 'attendance') and the chosen ringtone id;
 * the matching channel is created on demand.
 */
export async function scheduleAt(date, { title, body, data, group = 'attendance', ringtone = 'default', category } = {}) {
  const when = new Date(date);
  if (!when.getTime() || when.getTime() <= Date.now() + 1000) return null;
  const channelId = await ensureChannel(group, ringtone);
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      categoryIdentifier: category,
      sound: ringtone === 'silent' ? null : 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId },
  });
}

/** Cancel every scheduled notification (in the chain or otherwise) for one task. */
export async function cancelForTask(taskId) {
  if (!taskId) return;
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const mine = all.filter((n) => n.content?.data?.taskId === taskId);
  await Promise.all(mine.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(warnQuiet('notify'))));
  await cancelFullScreenAlarm(taskId);
}

export const addResponseListener = (fn) => Notifications.addNotificationResponseReceivedListener(fn);

/**
 * A button tapped on a task notification: that notification, and any other still showing for the same task
 * (an earlier warning), leave the shade. Android leaves a notification in place after its button is tapped,
 * so a tapped ✓ / 💤 used to look as if nothing had happened.
 */
export async function dismissEntryNotifications(entryId, identifier) {
  if (identifier) await Notifications.dismissNotificationAsync(identifier).catch(warnQuiet('notify'));
  if (entryId === undefined || entryId === null) return;
  const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  const mine = shown.filter((n) => n.request?.content?.data?.kind === 'wd-entry' && String(n.request.content.data.entryId) === String(entryId));
  await Promise.all(mine.map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(warnQuiet('notify'))));
}
export const addReceivedListener = (fn) => Notifications.addNotificationReceivedListener(fn);

/* ------------------------------------------------------------------ */
/* Background handling: runs even with the app removed from Recents.  */
/* ------------------------------------------------------------------ */

const BACKGROUND_NOTIFICATION_TASK = 'PT_BACKGROUND_NOTIFICATION_TASK';

/**
 * Tasks & reminders were removed from the app. A reminder already showing
 * from an older build can still have its Done / Ack / Snooze tapped; any of
 * them just silences that task's chain - nothing is re-armed.
 */
async function handleTaskAction(_actionIdentifier, taskId) {
  await cancelForTask(taskId);
}

// TaskManager.defineTask must run at module load, not inside a component.
if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    try {
      // Instant sync: the server's silent "tasks changed" message - read the changes and re-book the alarms now.
      const pushed = data.data || data.notification?.request?.content?.data || data;
      if (pushed && (pushed.kind === 'wd-tasks-changed' || String(pushed.dataString || '').includes('wd-tasks-changed'))) {
        const { refreshWdAlerts } = await import('./workingDashboardActions');
        await refreshWdAlerts().catch(warnQuiet('notify'));
        return;
      }
      const actionIdentifier = data.actionIdentifier;
      // Plain taps (no action button) just open the app - nothing to do headlessly.
      if (!actionIdentifier || actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const content = data.notification?.request?.content;
      const payload = content?.data || {};
      if (payload.kind === 'wd-entry') {
        await dismissEntryNotifications(payload.entryId, data.notification?.request?.identifier);
        await handleWdAction(actionIdentifier, payload.entryId, (data.notification?.request?.identifier || '') + actionIdentifier);
      } else if (payload.taskId) await handleTaskAction(actionIdentifier, payload.taskId);
    } catch (e) {
      console.warn('Background notification task failed', e?.message);
    }
  });
}

export async function registerBackgroundNotificationTask() {
  try {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch (e) {
    console.warn('registerTaskAsync failed', e?.message);
  }
}
