import { requireOptionalNativeModule } from 'expo-modules-core';
import { parseNative as parse } from '../../src/nativeJson';

/**
 * Null in Expo Go or any build made before this module existed, so every
 * caller must handle absence rather than assume the methods are there.
 *
 * The native side returns JSON strings rather than maps and lists. Expo's
 * automatic type conversion does not cover every shape, and a converter
 * failure surfaces as an opaque runtime error on the device; a string always
 * crosses the bridge intact. This wrapper parses, so callers still get objects.
 */
const Native = requireOptionalNativeModule('NativeTools');


export default Native
  ? {
      recognizeText: async (uri) => parse(await Native.recognizeText(uri), { lines: [] }),
      hasSmsPermission: () => Native.hasSmsPermission(),
      getRecentSms: async (seconds) => parse(await Native.getRecentSms(seconds), []),
      drainSmsQueue: async () => parse(await Native.drainSmsQueue(), []),

      hasStepCounter: () => Native.hasStepCounter(),
      getStepCounter: async () => parse(await Native.getStepCounter(), { available: false, steps: 0, bootAt: 0 }),
      drainStepDays: async () => parse(await Native.drainStepDays(), {}),

      startTracking: (pollSeconds) => Native.startTracking(pollSeconds),
      stopTracking: () => Native.stopTracking(),
      isTracking: () => Native.isTracking(),

      setOffice: (office) => Native.setOffice(JSON.stringify(office || {})),
      drainPresence: async () => parse(await Native.drainPresence(), []),
      setDay: (day) => Native.setDay(JSON.stringify(day || {})),
      getPresence: async () => parse(await Native.getPresence(), null),

      isBatteryOptimised: () => Native.isBatteryOptimised(),
      requestIgnoreBatteryOptimisations: () => Native.requestIgnoreBatteryOptimisations(),
      openAppSettings: () => Native.openAppSettings(),
      setRecentsHidden: (hidden) => (Native.setRecentsHidden ? Native.setRecentsHidden(!!hidden) : Promise.resolve(false)),

      isExactAlarmAllowed: () => Native.isExactAlarmAllowed(),
      requestExactAlarmPermission: () => Native.requestExactAlarmPermission(),

      showOngoing: (title, body) => Native.showOngoing(title, body),
      clearOngoing: () => Native.clearOngoing(),

      scheduleFullScreenAlarm: (taskId, atMs, title, body) => Native.scheduleFullScreenAlarm(taskId, atMs, title, body),
      cancelFullScreenAlarm: (taskId) => Native.cancelFullScreenAlarm(taskId),
      isFullScreenIntentAllowed: () => Native.isFullScreenIntentAllowed(),
      requestFullScreenIntentPermission: () => Native.requestFullScreenIntentPermission(),
      consumeSharedText: async () => (Native.consumeSharedText ? (await Native.consumeSharedText()) || null : null),
      consumeInitialAlarmAction: async () => parse(await Native.consumeInitialAlarmAction(), null),
      setAlarmSound: (id) => (Native.setAlarmSound ? Native.setAlarmSound(String(id || 'default')) : Promise.resolve(false)),
      setAlarmDelivery: (notificationOnly) => (Native.setAlarmDelivery ? Native.setAlarmDelivery(!!notificationOnly) : Promise.resolve(false)),
      setAlarmBanner: (on) => (Native.setAlarmBanner ? Native.setAlarmBanner(!!on) : Promise.resolve(false)),
      canDrawOverlays: async () => (Native.canDrawOverlays ? !!(await Native.canDrawOverlays()) : true),
      requestOverlayPermission: () => (Native.requestOverlayPermission ? Native.requestOverlayPermission() : Promise.resolve(false)),
      setAlarmStyle: (n) => (Native.setAlarmStyle ? Native.setAlarmStyle(Math.min(7, Math.max(1, Math.round(Number(n) || 1)))) : Promise.resolve(false)),
      ringingTask: async () => (Native.ringingTask ? String((await Native.ringingTask()) || '') : ''),
      stopAlarmRinging: (prefix) => (Native.stopAlarmRinging ? Native.stopAlarmRinging(String(prefix || '')) : Promise.resolve(false)),
      listFullScreenAlarms: async () => (Native.listFullScreenAlarms ? parse(await Native.listFullScreenAlarms(), []) : []),
      // An older build without it simply keeps ringing (the safe side).
      setWebActiveUntil: (ms) => (Native.setWebActiveUntil ? Native.setWebActiveUntil(Math.max(0, Number(ms) || 0)) : Promise.resolve(false)),
      // The alerts the phone skipped (the website was in use / already answered there): [{ at, title, why }]. An older build has none.
      skippedAlerts: async () => (Native.skippedAlerts ? parse(await Native.skippedAlerts(), []) : []),
      clearSkippedAlerts: () => (Native.clearSkippedAlerts ? Native.clearSkippedAlerts() : Promise.resolve(false)),
      // Config's "Ring on the phone only when the web app is not in use": the alarm checks Firestore when it fires.
      setWebPresenceCheck: (on) => (Native.setWebPresenceCheck ? Native.setWebPresenceCheck(!!on) : Promise.resolve(false)),
    }
  : null;
