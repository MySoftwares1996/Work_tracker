let counter = 0, bootAt = 1000, available = true, days = {}, inbox = [], smsPermission = true;
let scheduledAlarms = {}, fullScreenAllowed = true, initialAlarmAction = null, alarmDelivery = false;
export const __setInbox = (msgs) => { inbox = msgs; };
export const __setSmsPermission = (v) => { smsPermission = v; };
export const __set = (c, b, a = true) => { counter = c; bootAt = b; available = a; };
export const __setDays = (d) => { days = d; };
export const __setFullScreenIntentAllowed = (v) => { fullScreenAllowed = v; };
export const __setInitialAlarmAction = (v) => { initialAlarmAction = v; };
export const __scheduledAlarms = () => scheduledAlarms;
export const __alarmDelivery = () => alarmDelivery;      // true = notification centre only
export default {
  getStepCounter: async () => ({ available, steps: counter, bootAt }),
  hasStepCounter: async () => available,
  drainStepDays: async () => { const d = days; days = {}; return d; },
  getRecentSms: async () => (smsPermission ? inbox : []),
  drainSmsQueue: async () => [],
  hasSmsPermission: async () => smsPermission,
  isTracking: async () => false,

  scheduleFullScreenAlarm: async (taskId, atMs, title, body) => { scheduledAlarms[taskId] = { atMs, title, body }; return true; },
  cancelFullScreenAlarm: async (taskId) => { delete scheduledAlarms[taskId]; return true; },
  stopAlarmRinging: async () => true,
  setAlarmSound: async () => true,
  setAlarmDelivery: async (v) => { alarmDelivery = !!v; return true; },
  setAlarmBanner: async () => true,
  canDrawOverlays: async () => true,
  requestOverlayPermission: async () => true,
  listFullScreenAlarms: async () => Object.keys(scheduledAlarms),
  isFullScreenIntentAllowed: async () => fullScreenAllowed,
  requestFullScreenIntentPermission: async () => true,
  consumeSharedText: async () => null,
  consumeInitialAlarmAction: async () => {
    const v = initialAlarmAction;
    initialAlarmAction = null;
    return v;
  },
};
