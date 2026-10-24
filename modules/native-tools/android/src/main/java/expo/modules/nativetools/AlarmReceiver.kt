package expo.modules.nativetools

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Fires from AlarmManager at a task's exact due time, independently of the
 * app's process - this receiver runs even if the app was force-closed.
 *
 * A full-screen-intent notification is the one Android-sanctioned way left to
 * launch an Activity from the background: when the screen is off or locked,
 * the OS promotes it straight to AlarmRingingActivity, full screen. If the
 * user is actively using the phone, Android deliberately downgrades it to a
 * heads-up notification instead - full-screen intents are never allowed to
 * hijack the screen while someone is typing or navigating - which is why
 * this notification also carries its own title, text and a Done action
 * button, not just the full-screen intent: in that case the user has to tap
 * it themselves to reach AlarmRingingActivity.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val taskId = intent.getStringExtra(AlarmRingingActivity.EXTRA_TASK_ID) ?: return
    val title = intent.getStringExtra(AlarmRingingActivity.EXTRA_TITLE) ?: "Task due"
    val body = intent.getStringExtra(AlarmRingingActivity.EXTRA_BODY) ?: ""
    AlarmStore.forget(context, taskId)        // rung: nothing to restore after a reboot

    // A Working Dashboard alert (a task's, or a walk / water reminder) while the web app is in use (used in the last 45
    // minutes): the web app alerts at the desk, so the phone shows nothing - no alarm, no notification (and nothing at
    // all for a task already answered on the web app). Outside that window (or when it cannot tell) it rings full screen.
    val isAlert = taskId.startsWith("wd:") || taskId.startsWith("nudge:")
    if (isAlert && AlarmStore.webInUse(context)) return
    if (isAlert && WebPresence.enabled(context)) {
      // The app may not have run for hours, so what it last passed on is stale: ask Firestore now. Off the main
      // thread, a few seconds at most (goAsync keeps the receiver alive); unknown = ring.
      val pending = goAsync()
      Thread {
        try {
          // Silent while the web app is in use, and for a task already answered on the web app (booked here before).
          if (WebPresence.taskHandled(context, taskId)) { /* answered on the web app: nothing to show */ }
          else if (WebPresence.inUseNow(context)) { /* the web app is in use: it alerts at the desk, the phone shows nothing */ }
          else ring(context, taskId, title, body)
        } catch (_: Throwable) {
          ring(context, taskId, title, body)
        } finally {
          pending.finish()
        }
      }.start()
      return
    }
    ring(context, taskId, title, body)
  }

  // Ring through a foreground service, which keeps going with the phone unlocked and in use. Only if Android
  // refuses to start it does this fall back to the one-shot full-screen notification below.
  private fun ring(context: Context, taskId: String, title: String, body: String) {
    if (AlarmRingService.start(context, taskId, title, body)) return
    postFallback(context, taskId, title, body)
  }

  companion object {
    private const val CHANNEL_ID = "mpt_full_screen_alarms"

    /** The plain full-screen-intent notification: rings via AlarmRingingActivity when locked, a banner otherwise. */
    fun postFallback(context: Context, taskId: String, title: String, body: String) {
      AlarmReceiver().fallback(context, taskId, title, body)
    }
  }

  private fun fallback(context: Context, taskId: String, title: String, body: String) {

    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureChannel(nm)

    val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)

    val fullScreenIntent = Intent(context, AlarmRingingActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(AlarmRingingActivity.EXTRA_TASK_ID, taskId)
      putExtra(AlarmRingingActivity.EXTRA_TITLE, title)
      putExtra(AlarmRingingActivity.EXTRA_BODY, body)
    }
    val fullScreenPendingIntent = PendingIntent.getActivity(context, taskId.hashCode(), fullScreenIntent, piFlags)

    val doneIntent = (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      putExtra(AlarmRingingActivity.EXTRA_TASK_ID, taskId)
      putExtra(AlarmRingingActivity.EXTRA_ACTION, "DONE")
    }
    // A distinct request code from the full-screen one above, or FLAG_UPDATE_CURRENT would overwrite it.
    val donePendingIntent = PendingIntent.getActivity(context, taskId.hashCode() xor 1, doneIntent, piFlags)

    val builder = newNotificationBuilder(context)
      .setContentTitle(title)
      .setContentText(body.ifEmpty { "Task due now" })
      .setSmallIcon(context.applicationInfo.icon)
      .setCategory(Notification.CATEGORY_ALARM)
      .setPriority(Notification.PRIORITY_MAX)
      .setFullScreenIntent(fullScreenPendingIntent, true)
      .setContentIntent(fullScreenPendingIntent)
      .addAction(0, "Done", donePendingIntent)
      .setAutoCancel(true)

    nm.notify(taskId.hashCode(), builder.build())
  }

  private fun ensureChannel(nm: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Task alarms (full screen)", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Task reminders that ring over the lock screen, on the Alarm volume."
        enableVibration(true)
      }
    )
  }

  /** Notification.Builder(Context) is deprecated at API 26; minSdk here is 24. */
  @Suppress("DEPRECATION")
  private fun newNotificationBuilder(ctx: Context): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(ctx, CHANNEL_ID)
    else Notification.Builder(ctx)
}
