/**
 * A singleTask activity reused instead of recreated does not update
 * getIntent() on its own - Android calls onNewIntent() but leaves the old
 * intent in place unless the activity calls setIntent() itself, and neither
 * React Native's ReactActivity nor its delegate do this for you.
 *
 * The full-screen alarm flow (modules/native-tools' AlarmRingingActivity and
 * AlarmReceiver) hands off to MainActivity with a taskId/alarmAction extra on
 * its intent; without this, a warm re-launch (the app already running in the
 * background) would leave getIntent() on whatever launched the app first,
 * and src/tracker.js's consumeInitialAlarmAction() would never see the extra.
 */
const MARKER = '// mpt-alarm-main-activity';

function applyMainActivityPatch(src) {
  if (src.includes(MARKER)) return src;             // already applied

  const importAt = src.indexOf('import android.os.Bundle');
  if (importAt < 0) throw new Error('withAlarmMainActivity: expected "import android.os.Bundle" in MainActivity.kt');
  let out = src.slice(0, importAt) + 'import android.content.Intent\n' + src.slice(importAt);

  // Inserted before getMainComponentName()'s own doc comment, not between
  // them, so that comment still reads directly above the method it describes.
  const docAnchor = out.indexOf('/**', out.indexOf('class MainActivity'));
  const at = docAnchor >= 0 && out.slice(docAnchor, docAnchor + 400).includes('getMainComponentName')
    ? docAnchor
    : out.indexOf('override fun getMainComponentName()');
  if (at < 0) throw new Error('withAlarmMainActivity: expected getMainComponentName() in MainActivity.kt');
  // Over the lock screen only for two minutes after an alarm opened the app (the Past Due Alert), never for an
  // ordinary launch - the app's own lock screen still asks for the PIN on top.
  const insert = `${MARKER}
  private var alarmOpenedAt = 0L

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    alarmOpenedAt = if (intent.hasExtra("taskId")) System.currentTimeMillis() else 0L
  }

  override fun onResume() {
    super.onResume()
    if (alarmOpenedAt == 0L && intent?.hasExtra("taskId") == true) alarmOpenedAt = System.currentTimeMillis()
    val fromAlarm = alarmOpenedAt > 0L && System.currentTimeMillis() - alarmOpenedAt < 120000L
    if (android.os.Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(fromAlarm)
      setTurnScreenOn(fromAlarm)
    }
  }

  `;
  out = out.slice(0, at) + insert + out.slice(at);
  return out;
}

module.exports = function withAlarmMainActivity(config) {
  // Required here, not at the top, so applyMainActivityPatch() can be tested
  // without Expo installed.
  const { withMainActivity } = require('@expo/config-plugins');
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('withAlarmMainActivity: expected a Kotlin MainActivity');
    }
    cfg.modResults.contents = applyMainActivityPatch(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.applyMainActivityPatch = applyMainActivityPatch;
