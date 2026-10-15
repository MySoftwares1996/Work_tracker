export const setNotificationHandler = () => {};
export const AndroidImportance = { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2 };
export const AndroidNotificationPriority = { MAX: 'max' };
export const SchedulableTriggerInputTypes = { DATE: 'date', TIME_INTERVAL: 'timeInterval', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' };
export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';
// Records what was booked / cancelled so tests can check it; ids are unique.
const live = new Map();
let seq = 0;
export const __live = () => [...live.values()];
export const scheduleNotificationAsync = async (req) => { const id = `n${++seq}`; live.set(id, { id, ...req }); return id; };
export const setNotificationChannelAsync = async () => {};
export const setNotificationCategoryAsync = async () => {};
export const getPermissionsAsync = async () => ({ status: 'granted' });
export const requestPermissionsAsync = async () => ({ status: 'granted' });
export const cancelScheduledNotificationAsync = async (id) => { live.delete(id); };
export const cancelAllScheduledNotificationsAsync = async () => { live.clear(); };
export const getAllScheduledNotificationsAsync = async () => [...live.values()].map((x) => ({ identifier: x.id, content: x.content, trigger: x.trigger }));
export const registerTaskAsync = async () => {};
export const addNotificationResponseReceivedListener = () => ({ remove: () => {} });
export const addNotificationReceivedListener = () => ({ remove: () => {} });
// Notifications showing in the shade (presented), for the button-tap tests.
const shown = new Map();
export const __present = (identifier, data) => { shown.set(identifier, { request: { identifier, content: { data } } }); };
export const __shown = () => [...shown.keys()];
export const getPresentedNotificationsAsync = async () => [...shown.values()];
export const dismissNotificationAsync = async (id) => { shown.delete(id); };
