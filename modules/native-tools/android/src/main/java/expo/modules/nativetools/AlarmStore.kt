package expo.modules.nativetools

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import org.json.JSONObject

/**
 * Books the full-screen alarms and remembers them. Android drops every alarm
 * an app booked when the phone restarts; BootReceiver calls restoreAll() so a
 * Working Dashboard due time or deadline still rings after a reboot, with the
 * app never opened.
 *
 * With exact alarms allowed it books an alarm clock (setAlarmClock): the one
 * kind Android never delays for Doze or battery saving, and the one most
 * phone makers leave alone after the app is swiped from Recents.
 */
object AlarmStore {
  private const val PREFS = "mpt_full_screen_alarms"

  private fun prefs(ctx: Context): SharedPreferences = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /*
   * Until when the web app counts as in use (ms since epoch; 0 = not in use). The app writes it as the web
   * app's "in use" note arrives (src/RealtimeSync.js). While it is in the future, a Working Dashboard alarm
   * posts a quiet notification instead of ringing - the web app is ringing at the desk. Anything unknown
   * (never written, or the note stopped arriving) leaves it in the past, so the phone rings.
   */
  private const val WEB_ACTIVE_UNTIL = "web_active_until"
  fun setWebActiveUntil(ctx: Context, ms: Long) { prefs(ctx).edit().putLong(WEB_ACTIVE_UNTIL, ms).apply() }
  fun webInUse(ctx: Context): Boolean = System.currentTimeMillis() < prefs(ctx).getLong(WEB_ACTIVE_UNTIL, 0L)

  private fun flags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)

  fun firePendingIntent(ctx: Context, taskId: String, title: String, body: String): PendingIntent {
    val intent = Intent(ctx, AlarmReceiver::class.java).apply {
      putExtra(AlarmRingingActivity.EXTRA_TASK_ID, taskId)
      putExtra(AlarmRingingActivity.EXTRA_TITLE, title)
      putExtra(AlarmRingingActivity.EXTRA_BODY, body)
    }
    return PendingIntent.getBroadcast(ctx, taskId.hashCode(), intent, flags())
  }

  private fun book(ctx: Context, taskId: String, at: Long, title: String, body: String) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = firePendingIntent(ctx, taskId, title, body)
    val exactOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    if (!exactOk) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      return
    }
    // Tapping the alarm icon in the status bar opens the app.
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent()
    val show = PendingIntent.getActivity(ctx, taskId.hashCode() xor 7, launch, flags())
    try {
      am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), pi)
    } catch (_: Exception) {
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }
  }

  fun schedule(ctx: Context, taskId: String, at: Long, title: String, body: String) {
    book(ctx, taskId, at, title, body)
    prefs(ctx).edit().putString(taskId, JSONObject().put("at", at).put("title", title).put("body", body).toString()).apply()
  }

  fun cancel(ctx: Context, taskId: String) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(firePendingIntent(ctx, taskId, "", ""))
    forget(ctx, taskId)
  }

  fun forget(ctx: Context, taskId: String) {
    prefs(ctx).edit().remove(taskId).apply()
  }

  /** Re-books every remembered alarm still ahead; ones whose time passed while the phone was off are dropped - after one "Missed" notice. */
  fun restoreAll(ctx: Context) {
    val now = System.currentTimeMillis()
    val p = prefs(ctx)
    val edit = p.edit()
    val missed = ArrayList<String>()
    for ((id, raw) in p.all) {
      // Settings live in the same prefs file (__sound, __style, __notif_only, __banner, web_*): never alarms, never removed.
      if (id.startsWith("__") || id.startsWith("web_") || raw !is String) continue
      try {
        val o = JSONObject(raw)
        val at = o.getLong("at")
        if (at <= now) {
          // A task alert that came due in the last 12 hours while the phone was off is listed in the "Missed" notice below.
          if (id.startsWith("wd:") && now - at <= MISSED_WINDOW_MS) o.optString("title").takeIf { it.isNotBlank() }?.let { missed.add(it) }
          edit.remove(id); continue
        }
        book(ctx, id, at, o.optString("title"), o.optString("body"))
      } catch (_: Exception) { edit.remove(id) }
    }
    edit.apply()
    if (missed.isNotEmpty()) notifyMissed(ctx, missed)
  }

  private const val MISSED_WINDOW_MS = 12L * 60 * 60 * 1000
  private const val MISSED_CHANNEL_ID = "mpt_wd_missed"

  /** One quiet notification naming the alerts that came due while the phone was off (up to three, then "and N more"). */
  private fun notifyMissed(ctx: Context, titles: List<String>) {
    try {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(MISSED_CHANNEL_ID) == null) {
        nm.createNotificationChannel(NotificationChannel(MISSED_CHANNEL_ID, "Missed while the phone was off", NotificationManager.IMPORTANCE_DEFAULT))
      }
      val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
      val pi = if (open != null) PendingIntent.getActivity(ctx, 7702, open, flags) else null
      val shown = titles.take(3).joinToString("\n") { "• $it" } + if (titles.size > 3) "\nand ${titles.size - 3} more" else ""
      @Suppress("DEPRECATION")
      val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(ctx, MISSED_CHANNEL_ID) else Notification.Builder(ctx)
      b.setContentTitle(if (titles.size == 1) "Missed while the phone was off" else "${titles.size} alerts missed while the phone was off")
        .setContentText(titles.first())
        .setStyle(Notification.BigTextStyle().bigText(shown))
        .setSmallIcon(ctx.applicationInfo.icon)
        .setAutoCancel(true)
      if (pi != null) b.setContentIntent(pi)
      nm.notify(7702, b.build())
    } catch (_: Exception) { /* a notice that cannot be shown must never break the restore */ }
  }

  /** The ringtone the app chose for alarms ("default", "chime", "bell", "ping", "drop", "alarm" or "silent"). */
  fun setSound(ctx: Context, id: String) { prefs(ctx).edit().putString("__sound", id).apply() }
  fun sound(ctx: Context): String = prefs(ctx).getString("__sound", "default") ?: "default"
  /** The full-screen alarm's look, 1-7 (Config > Alerts > Alarm style; AlarmStyles.kt). */
  fun setStyle(ctx: Context, n: Int) { prefs(ctx).edit().putInt("__style", n.coerceIn(1, AlarmStyles.COUNT)).apply() }
  fun style(ctx: Context): Int = prefs(ctx).getInt("__style", 1)

  /** Config > Alerts > "Show alarms in the notification centre": off (the default) = the alarm opens full screen. */
  fun setNotificationOnly(ctx: Context, on: Boolean) { prefs(ctx).edit().putBoolean("__notif_only", on).apply() }
  fun notificationOnly(ctx: Context): Boolean = prefs(ctx).getBoolean("__notif_only", false)

  /** Config > Alerts > "Also show a banner notification": on (the default) = the ringing alarm also shows a loud notification, the safe fallback. */
  fun setBanner(ctx: Context, on: Boolean) { prefs(ctx).edit().putBoolean("__banner", on).apply() }
  fun banner(ctx: Context): Boolean = prefs(ctx).getBoolean("__banner", true)

  /** Ids of every alarm still booked, so the app can cancel ones it no longer wants. */
  fun ids(ctx: Context): List<String> = prefs(ctx).all.keys.filter { !it.startsWith("__") }
}
