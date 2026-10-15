package expo.modules.nativetools

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.widget.RemoteViews

/**
 * Rings a task alarm for as long as it takes to answer it - looping alarm sound on the Alarm audio stream,
 * vibration, and an ongoing notification with Snooze / Done (and DAR / Reminder only) - whatever the phone is doing.
 *
 * The ringing used to live only in AlarmRingingActivity, which Android opens by itself only when the screen is
 * locked or off. With the phone unlocked and in use, Android shows a plain heads-up notification instead, so
 * the alarm sounded once and stopped. A foreground service has no such condition: AlarmReceiver starts it at the
 * alarm time (an exact alarm is allowed to), and it keeps ringing until Snooze / Done / Open is pressed, the
 * entry is completed in the app, or ten minutes pass (then it leaves a "Missed" notification).
 */
class AlarmRingService : Service() {
  companion object {
    const val CHANNEL_ID = "mpt_alarm_ringing"
    const val QUIET_CHANNEL_ID = "mpt_alarm_ringing_quiet"      // no pop-up: the full-screen alert is the alert, this is only the service's required notice
    const val NOTIF_ID = 7701
    const val MAX_RING_MS = 10 * 60 * 1000L
    const val WEB_CHECK_MS = 20 * 1000L
    private val VIBRATE_PATTERN = longArrayOf(0, 600, 400, 600, 400, 900)

    /** The task currently ringing, or null. AlarmRingingActivity checks it so the two never both play. */
    @Volatile var ringingTaskId: String? = null
    @Volatile private var running = false

    /**
     * Alarms that came due while another one was already ringing: each keeps a notification of its own (with its own
     * buttons) instead of taking over the one that is ringing. The sound carries on for the first.
     */
    private val queued = java.util.concurrent.ConcurrentHashMap<String, Boolean>()

    /** `taskId` was answered (a button, the alarm screen): its own notification goes; the ringing stops only if it was the ringing one. */
    fun answered(ctx: Context, taskId: String?) {
      if (taskId != null && queued.remove(taskId) != null) {
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(taskId.hashCode()) } catch (_: Exception) {}
        return
      }
      stop(ctx)
    }

    /** True if the service was asked to start (not that it has); false sends the caller to the plain notification. */
    fun start(ctx: Context, taskId: String, title: String, body: String): Boolean {
      return try {
        val i = Intent(ctx, AlarmRingService::class.java)
          .putExtra(AlarmRingingActivity.EXTRA_TASK_ID, taskId)
          .putExtra(AlarmRingingActivity.EXTRA_TITLE, title)
          .putExtra(AlarmRingingActivity.EXTRA_BODY, body)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i) else ctx.startService(i)
        true
      } catch (e: Exception) { false }
    }

    fun stop(ctx: Context) {
      try { ctx.stopService(Intent(ctx, AlarmRingService::class.java)) } catch (_: Exception) {}
    }

    /** Stops the ringing if it is for a task whose id starts with `prefix` (empty: whichever is ringing). */
    fun stopMatching(ctx: Context, prefix: String) {
      queued.keys.filter { prefix.isEmpty() || it.startsWith(prefix) }.forEach { k ->
        queued.remove(k)
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(k.hashCode()) } catch (_: Exception) {}
      }
      val id = ringingTaskId ?: return
      if (prefix.isEmpty() || id.startsWith(prefix)) stop(ctx)
    }
  }

  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private val handler = Handler(Looper.getMainLooper())
  private var title = ""
  private var body = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val taskId = intent?.getStringExtra(AlarmRingingActivity.EXTRA_TASK_ID)
    if (taskId == null) { stopSelf(); return START_NOT_STICKY }
    val newTitle = intent.getStringExtra(AlarmRingingActivity.EXTRA_TITLE) ?: "Task due"
    val newBody = intent.getStringExtra(AlarmRingingActivity.EXTRA_BODY) ?: ""

    // A second alarm while one is ringing: its own notification, the first keeps ringing (and keeps its notification).
    val primary = ringingTaskId
    if (running && primary != null && primary != taskId) {
      ensureChannel()
      val keepTitle = title
      val keepBody = body
      try {
        title = newTitle
        body = newBody
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(taskId.hashCode(), buildNotification(taskId, ongoing = false))
        queued[taskId] = true
        openFullScreen(taskId, newTitle, newBody)      // a second alarm opens full screen too, not only a notification
      } catch (_: Exception) {
      } finally {
        title = keepTitle
        body = keepBody
      }
      try {
        val again = buildNotification(primary)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIF_ID, again, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) else startForeground(NOTIF_ID, again)
      } catch (_: Exception) {}
      return START_NOT_STICKY
    }

    title = newTitle
    body = newBody
    ringingTaskId = taskId
    running = true

    ensureChannel()
    try {
      val n = buildNotification(taskId)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIF_ID, n)
      }
    } catch (e: Exception) {
      // Android would not let this run as a foreground service: fall back to the plain full-screen notification.
      ringingTaskId = null
      running = false
      AlarmReceiver.postFallback(this, taskId, title, body)
      stopSelf()
      return START_NOT_STICKY
    }

    startRinging()
    openFullScreen(taskId)
    handler.removeCallbacksAndMessages(null)
    handler.postDelayed({ giveUp(taskId) }, MAX_RING_MS)
    if (taskId.startsWith("wd:")) handler.postDelayed({ checkWeb(taskId) }, WEB_CHECK_MS)
    return START_NOT_STICKY
  }

  /**
   * The alarm opens its full screen straight away - with the phone unlocked and in use too, where Android would
   * otherwise show only a banner. Needs "Open over other apps" (Config > Alerts); without it, the notification's
   * full-screen intent still opens it on the lock screen. Not in "notification centre" mode.
   */
  private fun openFullScreen(taskId: String, withTitle: String = title, withBody: String = body) {
    if (AlarmStore.notificationOnly(this)) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !android.provider.Settings.canDrawOverlays(this)) return
    try {
      startActivity(
        Intent(this, AlarmRingingActivity::class.java).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          putExtra(AlarmRingingActivity.EXTRA_TASK_ID, taskId)
          putExtra(AlarmRingingActivity.EXTRA_TITLE, withTitle)
          putExtra(AlarmRingingActivity.EXTRA_BODY, withBody)
        }
      )
    } catch (_: Exception) {}
  }

  /**
   * With "Open over other apps" allowed the alarm opens its own full screen by itself, so its notification need not
   * pop up (no heads-up banner, no full-screen-intent): a small silent line in the shade that Android requires
   * for a running service. Without that permission it stays the loud notification that opens the screen.
   */
  private fun quietNotice(): Boolean =
    !AlarmStore.notificationOnly(this) && !AlarmStore.banner(this) && (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || android.provider.Settings.canDrawOverlays(this))

  private fun piFlags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)

  private fun actionPendingIntent(taskId: String, action: String?, salt: Int): PendingIntent {
    val i = Intent(this, AlarmActionActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      putExtra(AlarmRingingActivity.EXTRA_TASK_ID, taskId)
      if (action != null) putExtra(AlarmRingingActivity.EXTRA_ACTION, action)
    }
    return PendingIntent.getActivity(this, taskId.hashCode() xor salt, i, piFlags())
  }

  private fun buildNotification(taskId: String, ongoing: Boolean = true): Notification {
    val ringing = Intent(this, AlarmRingingActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(AlarmRingingActivity.EXTRA_TASK_ID, taskId)
      putExtra(AlarmRingingActivity.EXTRA_TITLE, title)
      putExtra(AlarmRingingActivity.EXTRA_BODY, body)
    }
    val fullScreen = PendingIntent.getActivity(this, taskId.hashCode(), ringing, piFlags())
    @Suppress("DEPRECATION")
    val quiet = quietNotice()
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, if (quiet) QUIET_CHANNEL_ID else CHANNEL_ID) else Notification.Builder(this)
    builder
      .setContentTitle(title)
      .setContentText(body.ifEmpty { "Task due now" })
      .setSmallIcon(applicationInfo.icon)
      .setCategory(Notification.CATEGORY_ALARM)
      .setPriority(if (quiet) Notification.PRIORITY_LOW else Notification.PRIORITY_MAX)
      .setOngoing(ongoing)
      .setContentIntent(fullScreen)
    // Android 12+: a foreground service's notice is held back a few seconds - no banner over the full-screen alert.
    if (quiet && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_DEFERRED)
    // Full screen by default, over the lock screen too; "notification centre" mode leaves it as a notification only.
    if (!AlarmStore.notificationOnly(this) && !quiet) builder.setFullScreenIntent(fullScreen, true)
    // A Working Dashboard task also gets DAR (done, and in the Daily Activity Report); it and a to-do can be turned
    // into a plain reminder (Reminder only): the ringing stops and it reminds by notification from then on.
    val isWd = taskId.startsWith("wd:")
    val canRemind = isWd || taskId.startsWith("todo:")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      // Android's own action row stops at three buttons, so the buttons are drawn in a layout of their own.
      val small = RemoteViews(packageName, R.layout.alarm_notification_small)
      small.setTextViewText(R.id.alarm_title, title)
      small.setTextViewText(R.id.alarm_body, body.ifEmpty { "Task due now" })
      val withButtons = { compact: Boolean ->
        val v = RemoteViews(packageName, R.layout.alarm_notification_big)
        v.setTextViewText(R.id.alarm_title, title)
        v.setTextViewText(R.id.alarm_body, body.ifEmpty { "Task due now" })
        // The heads-up banner is short: one line of title and the buttons.
        if (compact) { v.setInt(R.id.alarm_title, "setMaxLines", 1); v.setViewVisibility(R.id.alarm_body, View.GONE) }
        v.setOnClickPendingIntent(R.id.alarm_btn_snooze, actionPendingIntent(taskId, "SNOOZE", 13))
        v.setOnClickPendingIntent(R.id.alarm_btn_done, actionPendingIntent(taskId, "DONE", 17))
        if (isWd) v.setOnClickPendingIntent(R.id.alarm_btn_dar, actionPendingIntent(taskId, "DAR", 23))
        else v.setViewVisibility(R.id.alarm_btn_dar, View.GONE)
        if (canRemind) v.setOnClickPendingIntent(R.id.alarm_btn_remind, actionPendingIntent(taskId, "REMIND", 19))
        else v.setViewVisibility(R.id.alarm_btn_remind, View.GONE)
        v
      }
      builder
        .setStyle(Notification.DecoratedCustomViewStyle())
        .setCustomContentView(small)
        .setCustomBigContentView(withButtons(false))
        .setCustomHeadsUpContentView(withButtons(true))
    } else {
      builder
        // Symbols, so each button stays on one line.
        .addAction(0, "💤 15m", actionPendingIntent(taskId, "SNOOZE", 13))
        .addAction(0, "✓", actionPendingIntent(taskId, "DONE", 17))
      if (isWd) builder.addAction(0, "✓ DAR", actionPendingIntent(taskId, "DAR", 23))
      else if (canRemind) builder.addAction(0, "🔔", actionPendingIntent(taskId, "REMIND", 19))
    }
    return builder.build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(QUIET_CHANNEL_ID) == null) {
      nm.createNotificationChannel(
        NotificationChannel(QUIET_CHANNEL_ID, "Alarm running (no pop-up)", NotificationManager.IMPORTANCE_LOW).apply {
          description = "A small silent line while an alarm is open full screen."
          setSound(null, null)
          enableVibration(false)
          setShowBadge(false)
        }
      )
    }
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Ringing task alarms", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Shown while a task alarm is ringing. The sound itself is played by the alarm, not this channel."
        setSound(null, null)
        enableVibration(false)
      }
    )
  }

  private fun startRinging() {
    val sound = AlarmStore.sound(this)
    if (player == null && sound != "silent") {
      var created: MediaPlayer? = null
      try {
        val mp = MediaPlayer()
        created = mp
        // The ringtone chosen in the app (a sound bundled in res/raw); the phone's alarm sound when it is "default".
        val rawId = if (sound == "default") 0 else resources.getIdentifier(sound, "raw", packageName)
        if (rawId != 0) {
          resources.openRawResourceFd(rawId).use { fd -> mp.setDataSource(fd.fileDescriptor, fd.startOffset, fd.length) }
        } else {
          val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
          mp.setDataSource(this, uri)
        }
        mp.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM) // Sounds through silent / vibrate, like an alarm clock.
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        mp.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
        mp.isLooping = true
        mp.prepare()
        mp.start()
        player = mp
      } catch (e: Exception) {
        try { created?.release() } catch (_: Exception) {}
        player = null    // no readable sound: the vibration still runs
      }
    }
    if (vibrator == null) {
      vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.vibrate(VibrationEffect.createWaveform(VIBRATE_PATTERN, 0))
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(VIBRATE_PATTERN, 0)
      }
    }
  }

  /**
   * While a task alert rings: every 20 seconds, ask whether the web app is in use or has already answered this task
   * (done, snoozed, silenced, binned). If so the ringing stops quietly - the phone is only the back-up for when the
   * web app is not in use. Unknown = keep ringing.
   */
  private fun checkWeb(taskId: String) {
    if (ringingTaskId != taskId || !WebPresence.enabled(this)) return
    Thread {
      val silent = try { WebPresence.inUseNow(this) || WebPresence.taskHandled(this, taskId) } catch (_: Throwable) { false }
      handler.post {
        if (ringingTaskId != taskId) return@post
        if (silent) silenceQuietly(taskId) else handler.postDelayed({ checkWeb(taskId) }, WEB_CHECK_MS)
      }
    }.start()
  }

  private fun silenceQuietly(taskId: String) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(Service.STOP_FOREGROUND_REMOVE)
      else @Suppress("DEPRECATION") stopForeground(true)
    } catch (_: Exception) {}
    try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(taskId.hashCode()) } catch (_: Exception) {}
    stopSelf()
  }

  /** Ten minutes unanswered: stop the noise and leave an ordinary "Missed" notification to tap. */
  private fun giveUp(taskId: String) {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val label = title
    val text = body
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(Service.STOP_FOREGROUND_REMOVE)
      else @Suppress("DEPRECATION") stopForeground(true)
    } catch (_: Exception) {}
    try {
      val open = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        putExtra(AlarmRingingActivity.EXTRA_TASK_ID, taskId)
      }
      val pi = PendingIntent.getActivity(this, taskId.hashCode() xor 19, open, piFlags())
      // It opens full screen too (on the lock screen, or over other apps) - not only a line in the notification centre.
      val missedScreen = PendingIntent.getActivity(this, taskId.hashCode() xor 29, Intent(this, AlarmRingingActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        putExtra(AlarmRingingActivity.EXTRA_TASK_ID, taskId)
        putExtra(AlarmRingingActivity.EXTRA_TITLE, "Missed: $label")
        putExtra(AlarmRingingActivity.EXTRA_BODY, text)
      }, piFlags())
      @Suppress("DEPRECATION")
      val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
      nm.notify(
        taskId.hashCode(),
        b.setContentTitle("Missed: $label").setContentText(text.ifEmpty { "Not answered" })
          .setSmallIcon(applicationInfo.icon).setAutoCancel(true).setContentIntent(pi)
          .apply { if (!AlarmStore.notificationOnly(this@AlarmRingService)) setFullScreenIntent(missedScreen, true) }.build()
      )
    } catch (_: Exception) {}
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    player?.let {
      try { if (it.isPlaying) it.stop() } catch (_: Exception) {}
      it.release()
    }
    player = null
    vibrator?.cancel()
    vibrator = null
    ringingTaskId = null
    running = false
    queued.clear()      // their notifications stay, as ordinary ones, until answered
    super.onDestroy()
  }
}
