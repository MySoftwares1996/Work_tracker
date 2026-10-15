/**
 * Every task notification stands on its own in the shade - never bundled.
 *
 * Android bundles an app's notifications under one collapsed card ("3" on the
 * icon, one line each, no buttons) once several arrive without a group of
 * their own. expo-notifications never sets a group, so the alerts were
 * bundled. Here its notification builder gives each notification a group of
 * its own (its identifier): Android leaves grouped notifications alone, and a
 * group of one shows as an ordinary notification with its own text and
 * ✓ / 💤 / 🔔 buttons.
 *
 * expo-notifications ships prebuilt; package.json's
 * expo.autolinking.android.buildFromSource makes the build compile it from the
 * source patched here. Applied at prebuild (CI runs it on a fresh install).
 */
const fs = require('fs');
const path = require('path');

const MARKER = '// mpt-separate-notifications';
const BUILDER = 'android/src/main/java/expo/modules/notifications/notifications/presentation/builders/ExpoNotificationBuilder.kt';

function applySeparateNotificationsPatch(src) {
  if (src.includes(MARKER)) return src;             // already applied
  const anchor = 'builder.setStyle(NotificationCompat.BigTextStyle().bigText(content.text))';
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error('withSeparateNotifications: expected the BigTextStyle line in ExpoNotificationBuilder.kt');
  const end = at + anchor.length;
  const insert = `\n    ${MARKER}: a group of its own, so Android never bundles the alerts\n    builder.setGroup("mpt-" + notification.notificationRequest.identifier)`;
  return src.slice(0, end) + insert + src.slice(end);
}

module.exports = function withSeparateNotifications(config) {
  // Required here, not at the top, so applySeparateNotificationsPatch() can be tested without Expo installed.
  const { withDangerousMod } = require('@expo/config-plugins');
  return withDangerousMod(config, ['android', async (cfg) => {
    const file = path.join(path.dirname(require.resolve('expo-notifications/package.json', { paths: [cfg.modRequest.projectRoot] })), BUILDER);
    fs.writeFileSync(file, applySeparateNotificationsPatch(fs.readFileSync(file, 'utf8')));
    return cfg;
  }]);
};
module.exports.applySeparateNotificationsPatch = applySeparateNotificationsPatch;
module.exports.BUILDER = BUILDER;
