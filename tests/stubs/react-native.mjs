export const Platform = { OS: 'android', Version: 33, select: (o) => o.android };
export const NativeModules = {};
export const PermissionsAndroid = {
  PERMISSIONS: { READ_SMS: 'READ_SMS', ACTIVITY_RECOGNITION: 'AR', POST_NOTIFICATIONS: 'PN' },
  RESULTS: { GRANTED: 'granted' },
  request: async () => 'granted',
};
export const Vibration = { vibrate() {}, cancel() {} };
