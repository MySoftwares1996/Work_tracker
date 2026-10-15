package expo.modules.nativetools

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * What the Snooze / Done / DAR / Reminder only buttons on the ringing notification open. It has no screen: it silences the ringing
 * service, then hands the chosen action to MainActivity (where the JS side applies it to the entry) and
 * finishes. A button has to start an Activity directly - Android 12+ does not let a notification button start
 * one through a broadcast or service - which is why this exists.
 */
class AlarmActionActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val taskId = intent.getStringExtra(AlarmRingingActivity.EXTRA_TASK_ID)
    AlarmRingService.answered(this, taskId)
    val action = intent.getStringExtra(AlarmRingingActivity.EXTRA_ACTION)
    val open = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(AlarmRingingActivity.EXTRA_TASK_ID, taskId)
      if (action != null) putExtra(AlarmRingingActivity.EXTRA_ACTION, action)
    }
    try { startActivity(open) } catch (_: Exception) {}
    finish()
  }
}
