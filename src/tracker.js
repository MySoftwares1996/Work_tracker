import { Platform } from 'react-native';
import NativeTools from '../modules/native-tools';

/**
 * Controls the Android foreground service that keeps step counting and SMS
 * capture alive when the app is closed, swiped away, or the phone reboots.
 *
 * Everything here degrades quietly when the native module is absent (Expo Go,
 * or an older build), so callers never need to branch.
 */
export const trackerAvailable = () => !!NativeTools;

export async function isTracking() {
  if (!NativeTools) return false;
  try { return await NativeTools.isTracking(); } catch { return false; }
}

/**
 * True when Android is still applying battery optimisation to this app, which
 * is the usual reason a foreground service stops on its own.
 */
export async function isBatteryOptimised() {
  if (!NativeTools) return false;
  try { return await NativeTools.isBatteryOptimised(); } catch { return false; }
}

/** Opens the system exemption prompt. Returns false if no screen could open. */
export async function requestBatteryExemption() {
  if (!NativeTools) return false;
  try { return await NativeTools.requestIgnoreBatteryOptimisations(); } catch { return false; }
}

export async function openAppSettings() {
  if (!NativeTools) return false;
  try { return await NativeTools.openAppSettings(); } catch { return false; }
}

/**
 * Hides the app from the recent-apps preview (Android 13+) while the app lock
 * is on - the lock hid nothing there. Screenshots still work.
 */
export async function setRecentsHidden(hidden) {
  if (!NativeTools?.setRecentsHidden || Platform.OS !== 'android') return false;
  try { return await NativeTools.setRecentsHidden(!!hidden); } catch { return false; }
}

/**
 * False here is the real reason scheduled alerts arrive late: Android 12+
 * silently downgrades every notification this app schedules from an exact
 * alarm to an inexact one once this is off, and Doze mode is then free to batch and delay them
 * by minutes or more. Defaults to true when the native module is missing
 * (Expo Go) or on pre-Android-12 devices, where this isn't a gate at all.
 */
export async function isExactAlarmAllowed() {
  if (!NativeTools) return true;
  try { return await NativeTools.isExactAlarmAllowed(); } catch { return true; }
}

/** Opens the system screen to grant it directly - one tap, no nested settings menus. */
export async function requestExactAlarmPermission() {
  if (!NativeTools) return false;
  try { return await NativeTools.requestExactAlarmPermission(); } catch { return false; }
}

/**
 * "Warn once per app session" gate for the exact-alarm nudge App.js shows at
 * launch, so a missing permission only ever shows the popup once.
 */
let warnedExactAlarmThisSession = false;
export function shouldWarnExactAlarmOnce() {
  if (warnedExactAlarmThisSession) return false;
  warnedExactAlarmThisSession = true;
  return true;
}

/* ---------- full-screen task alarms ---------- */

/**
 * Schedules the genuine native alarm for one task - the one that wakes and
 * unlocks the screen and rings on the Alarm volume even with the app closed,
 * alongside (not instead of) the expo-notifications chain in src/notify.js.
 * `at` is a Date or an ISO string; native wants milliseconds.
 */
export async function scheduleFullScreenAlarm(taskId, at, title, body) {
  if (!NativeTools || Platform.OS !== 'android') return false;
  const atMs = new Date(at).getTime();
  if (!atMs) return false;
  try { return await NativeTools.scheduleFullScreenAlarm(taskId, atMs, String(title || ''), String(body || '')); } catch { return false; }
}

/**
 * Silences the alarm that is ringing right now, if it is for a task whose alarm id starts with `prefix`
 * (empty: whichever is ringing). The ringing is a native service, so completing the entry in the app has to
 * tell it to stop - cancelling the booked alarms does not reach an alarm that has already gone off.
 */
/** Tells the ringing alarm which ringtone the app chose. */
export async function setAlarmSound(id = 'default') {
  if (!NativeTools?.setAlarmSound || Platform.OS !== 'android') return false;
  try { return await NativeTools.setAlarmSound(id); } catch { return false; }
}

/** The full-screen alarm's look, 1-7 (Config > Alerts > Alarm style). */
/** Alarms in the notification centre only (true) or full screen, the default (false). */
export async function setAlarmBanner(on = true) {
  if (!NativeTools?.setAlarmBanner || Platform.OS !== 'android') return false;
  try { return await NativeTools.setAlarmBanner(!!on); } catch { return false; }
}
export async function setAlarmDelivery(notificationOnly = false) {
  if (!NativeTools?.setAlarmDelivery || Platform.OS !== 'android') return false;
  try { return await NativeTools.setAlarmDelivery(!!notificationOnly); } catch { return false; }
}

/** "Open over other apps": lets the alarm open full screen while the phone is in use. True where it is not needed. */
export async function canDrawOverlays() {
  if (!NativeTools?.canDrawOverlays || Platform.OS !== 'android') return true;
  try { return await NativeTools.canDrawOverlays(); } catch { return true; }
}
export async function requestOverlayPermission() {
  if (!NativeTools?.requestOverlayPermission || Platform.OS !== 'android') return false;
  try { return await NativeTools.requestOverlayPermission(); } catch { return false; }
}

export async function setAlarmStyle(n = 1) {
  if (!NativeTools?.setAlarmStyle || Platform.OS !== 'android') return false;
  try { return await NativeTools.setAlarmStyle(n); } catch { return false; }
}

/**
 * Until when (ms) the web app counts as in use - 0 when it does not. While that is in the future, a Working
 * Dashboard alarm shows a quiet notification instead of ringing (AlarmReceiver.kt).
 */
export async function setWebActiveUntil(ms = 0) {
  if (!NativeTools?.setWebActiveUntil || Platform.OS !== 'android') return false;
  try { return await NativeTools.setWebActiveUntil(Math.max(0, Number(ms) || 0)); } catch { return false; }
}

/**
 * Config's "Ring on the phone only when the web app is not in use". On: when an alert fires, the alarm reads the
 * web app's "in use" note from Firestore itself and stays silent while it is in use (WebPresence.kt) - even with
 * this app closed for hours.
 */
export async function setWebPresenceCheck(on = true) {
  if (!NativeTools?.setWebPresenceCheck || Platform.OS !== 'android') return false;
  try { return await NativeTools.setWebPresenceCheck(!!on); } catch { return false; }
}

/** The id of the task alarm ringing right now ("" when none). */
export async function getRingingTask() {
  if (!NativeTools?.ringingTask || Platform.OS !== 'android') return '';
  try { return await NativeTools.ringingTask(); } catch { return ''; }
}

export async function stopAlarmRinging(prefix = '') {
  if (!NativeTools?.stopAlarmRinging || Platform.OS !== 'android') return false;
  try { return await NativeTools.stopAlarmRinging(prefix); } catch { return false; }
}

/** Ids of the full-screen alarms still booked (the native side remembers them across reboots). */
export async function listFullScreenAlarms() {
  if (!NativeTools?.listFullScreenAlarms || Platform.OS !== 'android') return [];
  try { return (await NativeTools.listFullScreenAlarms()) || []; } catch { return []; }
}

export async function cancelFullScreenAlarm(taskId) {
  if (!NativeTools || Platform.OS !== 'android') return false;
  try { return await NativeTools.cancelFullScreenAlarm(taskId); } catch { return false; }
}

/**
 * Android 14+ only: separate from the exact-alarm permission above, this is
 * what lets a fired alarm's notification actually promote itself to
 * full-screen instead of only ever showing as a heads-up banner. Defaults to
 * true when the native module is missing or on pre-14 devices, where this
 * isn't a gate at all.
 */
export async function isFullScreenIntentAllowed() {
  if (!NativeTools) return true;
  try { return await NativeTools.isFullScreenIntentAllowed(); } catch { return true; }
}

/** Opens the system screen to grant it directly. */
export async function requestFullScreenIntentPermission() {
  if (!NativeTools) return false;
  try { return await NativeTools.requestFullScreenIntentPermission(); } catch { return false; }
}

/**
 * What launched the app this time, if it was a tap on the native alarm
 * screen or its notification's Done action - { taskId, action } or null.
 * Consumed once by the native side, so calling this repeatedly (e.g. on
 * every app-foreground) is always safe and returns null once already read.
 */
/** Text shared into the app from another app (Gmail > Share), once; null when there is none. */
export async function consumeSharedText() {
  if (!NativeTools?.consumeSharedText || Platform.OS !== 'android') return null;
  try { return await NativeTools.consumeSharedText(); } catch { return null; }
}
export async function consumeInitialAlarmAction() {
  if (!NativeTools) return null;
  try { return await NativeTools.consumeInitialAlarmAction(); } catch { return null; }
}

/** Mirrors shouldWarnExactAlarmOnce() above, for the separate full-screen-intent nudge. */
let warnedFullScreenIntentThisSession = false;

export async function startTracking(pollSeconds = 15) {
  if (!NativeTools) return false;
  // The native side takes a whole number of seconds; "7.5" typed in Settings must not fail the start.
  const secs = Math.round(Number(pollSeconds)) || 15;
  try { return await NativeTools.startTracking(secs); } catch { return false; }
}

export async function stopTracking() {
  if (!NativeTools) return false;
  try { return await NativeTools.stopTracking(); } catch { return false; }
}

/**
 * Ongoing entry in the Android notification shade. Survives the app closing,
 * which an expo-notifications banner does not.
 */
export async function showOngoing(title, body) {
  if (!NativeTools) return false;
  try { return await NativeTools.showOngoing(String(title), String(body)); } catch { return false; }
}

export async function clearOngoing() {
  if (!NativeTools) return false;
  try { return await NativeTools.clearOngoing(); } catch { return false; }
}

/* ---------- office presence ---------- */

export async function drainPresence() {
  if (!NativeTools?.drainPresence) return [];
  try { return (await NativeTools.drainPresence()) || []; } catch { return []; }
}

/** { state, dist, acc, fixAt, running } - the last reading, for Setup. */
export async function getPresence() {
  if (!NativeTools?.getPresence) return null;
  try { return await NativeTools.getPresence(); } catch { return null; }
}

