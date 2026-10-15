package expo.modules.nativetools

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Brings the tracker back after a reboot or an app update, but only if the
 * user had it switched on. Without this, step counting would silently stop
 * every time the phone restarts.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return

    // Android forgets every booked alarm on a restart: book the due-time and deadline alarms again.
    try { AlarmStore.restoreAll(context) } catch (_: Exception) {}

    val prefs = context.getSharedPreferences(TrackerService.PREFS, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(TrackerService.KEY_RUNNING, false)) return

    val start = Intent(context, TrackerService::class.java).setAction(TrackerService.ACTION_START)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(start)
      else context.startService(start)
    } catch (_: Exception) {}
  }
}
