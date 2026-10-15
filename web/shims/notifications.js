/**
 * expo-notifications in the browser.
 *
 * The phone hands every alert to Android ahead of time. A browser has no such booking, so this keeps the
 * booked alerts while the tab is open and shows each one as a browser notification when it falls due
 * (with the tab in the background too). A tap on it opens the entry, as on the phone. Closing the tab
 * stops the alerts; the app books them again the next time it opens.
 */
export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';
export const AndroidImportance = { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 };
export const AndroidNotificationPriority = { MIN: 'min', LOW: 'low', DEFAULT: 'default', HIGH: 'high', MAX: 'max' };
export const SchedulableTriggerInputTypes = { DATE: 'date', TIME_INTERVAL: 'timeInterval', DAILY: 'daily', WEEKLY: 'weekly' };

const scheduled = new Map();          // identifier -> { identifier, content, trigger, at }
const receivedListeners = new Set();
const responseListeners = new Set();
let lastResponse = null;
let seq = 0;
let timer = null;

const hasApi = () => typeof window !== 'undefined' && 'Notification' in window;
const permission = () => (hasApi() ? window.Notification.permission : 'denied');
const asStatus = (p) => (p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined');

function permissionResult(p) {
  const status = asStatus(p);
  return { status, granted: status === 'granted', canAskAgain: status === 'undetermined', expires: 'never' };
}

export async function getPermissionsAsync() { return permissionResult(permission()); }

export async function requestPermissionsAsync() {
  if (!hasApi()) return permissionResult('denied');
  if (permission() !== 'default') return permissionResult(permission());
  try { return permissionResult(await window.Notification.requestPermission()); } catch { return permissionResult(permission()); }
}

function dueTime(trigger) {
  if (!trigger) return Date.now();
  if (trigger.date != null) return new Date(trigger.date).getTime();
  if (trigger.seconds != null) return Date.now() + Number(trigger.seconds) * 1000;
  return Date.now();
}

function respond(entry, actionIdentifier = DEFAULT_ACTION_IDENTIFIER) {
  lastResponse = {
    actionIdentifier,
    notification: { date: Date.now(), request: { identifier: entry.identifier, content: entry.content, trigger: entry.trigger } },
  };
  responseListeners.forEach((fn) => { try { fn(lastResponse); } catch (e) { console.warn(e); } });
}

function fire(entry) {
  scheduled.delete(entry.identifier);
  const notification = { date: Date.now(), request: { identifier: entry.identifier, content: entry.content, trigger: entry.trigger } };
  receivedListeners.forEach((fn) => { try { fn(notification); } catch (e) { console.warn(e); } });
  if (permission() !== 'granted') return;
  try {
    const n = new window.Notification(entry.content.title || 'Working Dashboard', {
      body: entry.content.body || '',
      tag: entry.identifier,
      requireInteraction: true,
    });
    n.onclick = () => { try { window.focus(); } catch { /* not allowed */ } n.close(); respond(entry); };
  } catch { /* the browser refused to show it */ }
}

// One clock for every alert: setTimeout cannot wait more than ~24 days, and a laptop that slept skips timers.
function tick() {
  const now = Date.now();
  for (const entry of [...scheduled.values()]) if (entry.at <= now) fire(entry);
  if (!scheduled.size && timer) { clearInterval(timer); timer = null; }
}
function ensureClock() {
  if (!timer) timer = setInterval(tick, 15000);
}

export async function scheduleNotificationAsync({ identifier, content = {}, trigger = null }) {
  const id = identifier || `web-${Date.now()}-${++seq}`;
  const entry = { identifier: id, content, trigger, at: dueTime(trigger) };
  scheduled.set(id, entry);
  ensureClock();
  if (entry.at <= Date.now() + 1000) setTimeout(tick, Math.max(0, entry.at - Date.now()));
  return id;
}

export async function getAllScheduledNotificationsAsync() {
  return [...scheduled.values()].map(({ identifier, content, trigger }) => ({ identifier, content, trigger }));
}
export async function cancelScheduledNotificationAsync(id) { scheduled.delete(id); }
export async function cancelAllScheduledNotificationsAsync() { scheduled.clear(); }
export async function dismissAllNotificationsAsync() {}
export async function dismissNotificationAsync() {}
export async function getPresentedNotificationsAsync() { return []; }

export function addNotificationReceivedListener(fn) {
  receivedListeners.add(fn);
  return { remove: () => receivedListeners.delete(fn) };
}
export function addNotificationResponseReceivedListener(fn) {
  responseListeners.add(fn);
  return { remove: () => responseListeners.delete(fn) };
}
export function removeNotificationSubscription(sub) { sub?.remove?.(); }
export async function getLastNotificationResponseAsync() { return lastResponse; }
export async function clearLastNotificationResponseAsync() { lastResponse = null; }

// Android-only settings: nothing to set up in a browser.
export function setNotificationHandler() {}
export async function setNotificationChannelAsync(id, channel) { return { id, ...channel }; }
export async function getNotificationChannelsAsync() { return []; }
export async function deleteNotificationChannelAsync() {}
export async function setNotificationCategoryAsync(id, actions) { return { identifier: id, actions }; }
export async function registerTaskAsync() {}
export async function unregisterTaskAsync() {}
export async function setBadgeCountAsync() { return false; }
export async function getBadgeCountAsync() { return 0; }
