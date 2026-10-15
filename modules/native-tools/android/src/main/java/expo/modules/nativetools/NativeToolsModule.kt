package expo.modules.nativetools

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.content.SharedPreferences
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.os.Build
import android.provider.Telephony
import android.graphics.BitmapFactory
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Two small pieces of Android that Expo does not expose.
 *
 *  getRecentSms(seconds)  - reads the SMS inbox so bank messages can be
 *                           turned into expense rows.
 *  getStepCounter()       - reads TYPE_STEP_COUNTER, the hardware counter that
 *                           keeps running with the app closed and even killed.
 *                           The value is cumulative since the last reboot, so
 *                           JS stores a baseline and banks the difference.
 */
class NativeToolsModule : Module() {

  companion object {
    private const val STATUS_CHANNEL = "mpt_office_status"
    private const val STATUS_ID = 4712
  }

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No app context")

  private fun has(permission: String): Boolean =
    context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  private val prefs: SharedPreferences
    get() = context.getSharedPreferences(TrackerService.PREFS, Context.MODE_PRIVATE)

  /** Notification.Builder(Context) is deprecated at API 26; minSdk here is 24. */
  @Suppress("DEPRECATION")
  private fun newNotificationBuilder(ctx: Context, channelId: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(ctx, channelId)
    else Notification.Builder(ctx)

  override fun definition() = ModuleDefinition {
    Name("NativeTools")

    /* ---------- SMS ---------- */

    /**
     * Reads the text in an image (a screenshot from the user's photo picker),
     * entirely on the phone. Returns JSON: { width, height, lines: [{ t, l, tp, r, b }] },
     * one entry per recognised line with its bounding box, so JS can rebuild
     * table rows from where each piece of text sits.
     */
    AsyncFunction("recognizeText") { uri: String, promise: Promise ->
      try {
        val bitmap = context.contentResolver.openInputStream(Uri.parse(uri))?.use { BitmapFactory.decodeStream(it) }
        if (bitmap == null) {
          promise.reject("E_OCR", "That image could not be opened", null)
          return@AsyncFunction
        }
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(InputImage.fromBitmap(bitmap, 0))
          .addOnSuccessListener { result ->
            val lines = JSONArray()
            for (block in result.textBlocks) {
              for (line in block.lines) {
                val b = line.boundingBox ?: continue
                lines.put(
                  JSONObject()
                    .put("t", line.text)
                    .put("l", b.left).put("tp", b.top).put("r", b.right).put("b", b.bottom)
                )
              }
            }
            promise.resolve(JSONObject().put("width", bitmap.width).put("height", bitmap.height).put("lines", lines).toString())
            recognizer.close()
          }
          .addOnFailureListener { e ->
            recognizer.close()
            promise.reject("E_OCR", e.message ?: "Text recognition failed", e)
          }
      } catch (e: Exception) {
        promise.reject("E_OCR", e.message ?: "Text recognition failed", e)
      }
    }

    AsyncFunction("hasSmsPermission") {
      has(Manifest.permission.READ_SMS)
    }

    /**
     * Returns inbox messages newer than `seconds` ago, newest first:
     * [{ id, body, sender, receivedAt }]
     */
    AsyncFunction("getRecentSms") { seconds: Int, promise: Promise ->
      if (!has(Manifest.permission.READ_SMS)) {
        promise.resolve("[]")
        return@AsyncFunction
      }
      try {
        val since = System.currentTimeMillis() - seconds.toLong() * 1000L
        val out = JSONArray()
        val projection = arrayOf(
          Telephony.Sms._ID,
          Telephony.Sms.ADDRESS,
          Telephony.Sms.BODY,
          Telephony.Sms.DATE
        )
        context.contentResolver.query(
          Telephony.Sms.Inbox.CONTENT_URI,
          projection,
          "${Telephony.Sms.DATE} > ?",
          arrayOf(since.toString()),
          "${Telephony.Sms.DATE} DESC"
        )?.use { c ->
          val idIdx = c.getColumnIndexOrThrow(Telephony.Sms._ID)
          val addrIdx = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
          val bodyIdx = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
          val dateIdx = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
          var n = 0
          // Filter BEFORE counting. The cap used to count OTPs and adverts, so
          // a busy week's inbox pushed genuine transactions out of the scan.
          while (c.moveToNext() && n < 500) {
            if (!SmsFilter.isTransactional(c.getString(bodyIdx))) continue
            out.put(
              JSONObject()
                .put("id", c.getString(idIdx))
                .put("sender", c.getString(addrIdx) ?: "")
                .put("body", c.getString(bodyIdx) ?: "")
                .put("receivedAt", c.getLong(dateIdx))
            )
            n++
          }
        }
        promise.resolve(out.toString())
      } catch (e: Exception) {
        promise.reject("ERR_SMS_READ", e.message ?: "SMS read failed", e)
      }
    }

    /* ---------- foreground service ---------- */

    /**
     * Starts the always-on tracker. pollSeconds controls the SMS fallback
     * poll; the ContentObserver usually fires sooner.
     */
    AsyncFunction("startTracking") { pollSeconds: Int ->
      TrackerService.pollSeconds = if (pollSeconds in 5..600) pollSeconds else 15
      val intent = Intent(context, TrackerService::class.java).setAction(TrackerService.ACTION_START)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
      true
    }

    AsyncFunction("stopTracking") {
      val intent = Intent(context, TrackerService::class.java).setAction(TrackerService.ACTION_STOP)
      try { context.startService(intent) } catch (_: Exception) {}
      prefs.edit().putBoolean(TrackerService.KEY_RUNNING, false).apply()
      true
    }

    /* ---------- presence ---------- */

    /**
     * Hands the service your office, radius and shift. Takes effect at once:
     * a running service restarts its location updates with the new values.
     * (The old geofence kept its first radius until the office was set again.)
     */
    AsyncFunction("setOffice") { json: String ->
      prefs.edit().putString(TrackerService.KEY_OFFICE, json).apply()
      if (prefs.getBoolean(TrackerService.KEY_RUNNING, false)) {
        try {
          context.startService(Intent(context, TrackerService::class.java).setAction(TrackerService.ACTION_REFRESH))
        } catch (_: Exception) {
        }
      }
      true
    }

    /**
     * The app's own record of today, so the service computes from the same
     * record instead of keeping a separate one that disagreed with the app.
     */
    AsyncFunction("setDay") { json: String ->
      synchronized(TrackerService.LOCK) { prefs.edit().putString(TrackerService.KEY_PRESENCE_DAY, json).apply() }
      if (prefs.getBoolean(TrackerService.KEY_RUNNING, false)) {
        try {
          context.startService(Intent(context, TrackerService::class.java).setAction(TrackerService.ACTION_REDRAW))
        } catch (_: Exception) {
        }
      }
      true
    }

    /** Crossings recorded by the service since the last call; clears them. */
    AsyncFunction("drainPresence") {
      // Under the service's lock: see TrackerService.LOCK.
      synchronized(TrackerService.LOCK) {
        val raw = prefs.getString(TrackerService.KEY_PRESENCE_EVENTS, "[]") ?: "[]"
        prefs.edit().putString(TrackerService.KEY_PRESENCE_EVENTS, "[]").apply()
        raw
      }
    }

    /** Latest reading, for the live distance shown in Setup. */
    AsyncFunction("getPresence") {
      JSONObject()
        .put("state", prefs.getString(TrackerService.KEY_PRESENCE_STATE, "") ?: "")
        .put("dist", prefs.getFloat(TrackerService.KEY_LAST_DIST, -1f).toDouble())
        .put("acc", prefs.getFloat(TrackerService.KEY_LAST_ACC, -1f).toDouble())
        .put("fixAt", prefs.getLong(TrackerService.KEY_LAST_FIX, 0L))
        .put("running", prefs.getBoolean(TrackerService.KEY_RUNNING, false))
        .toString()
    }

    AsyncFunction("isTracking") {
      prefs.getBoolean(TrackerService.KEY_RUNNING, false)
    }

    /** Hands over everything the service has collected and clears the queue. */
    AsyncFunction("drainSmsQueue") { promise: Promise ->
      try {
        val raw = synchronized(TrackerService.LOCK) {
          val r = prefs.getString(TrackerService.KEY_SMS_QUEUE, "[]") ?: "[]"
          prefs.edit().putString(TrackerService.KEY_SMS_QUEUE, "[]").apply()
          r
        }
        JSONArray(raw)                       // parse only to validate
        promise.resolve(raw)
      } catch (e: Exception) {
        promise.reject("ERR_SMS_QUEUE", e.message ?: "queue read failed", e)
      }
    }

    /* ---------- battery optimisation ---------- */

    /**
     * Aggressive OEM battery management is the main reason a foreground
     * service dies on Xiaomi, Oppo, Vivo, OnePlus and Samsung. Being on the
     * exemption list is what stops the OS reclaiming it.
     */
    AsyncFunction("isBatteryOptimised") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@AsyncFunction false
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      // Assigned first: a line starting with "!" right after "as PowerManager"
      // is parsed as a continuation of the cast and does not compile.
      val exempt = pm.isIgnoringBatteryOptimizations(context.packageName)
      !exempt
    }

    /**
     * Opens the system prompt asking to exempt this app. Falls back to the
     * full battery-optimisation list if the direct request is unavailable,
     * which some OEM builds do.
     */
    AsyncFunction("requestIgnoreBatteryOptimisations") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@AsyncFunction false
      val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:" + context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        context.startActivity(direct)
        true
      } catch (e: ActivityNotFoundException) {
        try {
          context.startActivity(
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
          true
        } catch (_: Exception) { false }
      } catch (_: Exception) { false }
    }

    /** Last resort: this app's own settings page. */
    AsyncFunction("openAppSettings") {
      try {
        context.startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
      } catch (_: Exception) { false }
    }

    /**
     * Keeps the app's screen out of the recent-apps preview while the app
     * lock is on (Android 13+). Unlike FLAG_SECURE it still allows
     * screenshots. False on older Android, where there is no such switch.
     */
    AsyncFunction("setRecentsHidden") { hidden: Boolean ->
      val activity = appContext.currentActivity
      if (activity == null || Build.VERSION.SDK_INT < 33) return@AsyncFunction false
      activity.runOnUiThread {
        try { activity.setRecentsScreenshotEnabled(!hidden) } catch (_: Exception) { }
      }
      true
    }

    /* ---------- exact alarm scheduling ---------- */

    /**
     * The real reason a task/timer alarm - and every notification after the
     * first one in a repeating chain - can arrive late or not at all.
     * Without this, Android 12+ silently downgrades every notification this
     * app schedules from an exact alarm (AlarmManager.setExactAndAllowWhileIdle)
     * to an inexact one (setAndAllowWhileIdle), which Doze mode is then free
     * to batch and delay by minutes or longer. expo-notifications does not
     * expose this check to JS at all, so it lives here.
     */
    AsyncFunction("isExactAlarmAllowed") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction true
      val am = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
      am.canScheduleExactAlarms()
    }

    /** Opens the system screen to grant it directly - no permission needed to launch this intent. */
    AsyncFunction("requestExactAlarmPermission") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction true
      try {
        context.startActivity(
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
            .setData(Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
      } catch (_: Exception) { false }
    }

    /* ---------- full-screen task alarms (AlarmRingingActivity) ---------- */

    /**
     * Schedules a single native alarm for one task, independent of the
     * expo-notifications chain in src/notify.js: AlarmReceiver fires at
     * `atMs` and posts a full-screen-intent notification, which the OS
     * promotes straight to AlarmRingingActivity when the device is locked or
     * asleep. One firing is enough here (unlike the notification chain,
     * which repeats because a plain notification's sound only plays once) -
     * AlarmRingingActivity itself rings continuously until dismissed.
     */
    AsyncFunction("scheduleFullScreenAlarm") { taskId: String, atMs: Double, title: String, body: String, promise: Promise ->
      try {
        AlarmStore.schedule(context, taskId, atMs.toLong(), title, body)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERR_ALARM_SCHEDULE", e.message ?: "schedule failed", e)
      }
    }

    /** Until when (ms) the web app counts as in use; 0 = not in use. See AlarmStore.setWebActiveUntil. */
    AsyncFunction("setWebActiveUntil") { ms: Double ->
      AlarmStore.setWebActiveUntil(context, ms.toLong())
      true
    }

    /** Config's "Ring on the phone only when the web app is not in use": the alarm asks Firestore when it fires. See WebPresence. */
    AsyncFunction("setWebPresenceCheck") { on: Boolean ->
      WebPresence.setEnabled(context, on)
      true
    }

    /** Silences the ringing alarm if it is for a task whose id starts with `prefix` ("" = whichever is ringing). */
    /** Remembers the ringtone chosen in the app, which the ringing alarm plays. */
    AsyncFunction("setAlarmSound") { id: String ->
      AlarmStore.setSound(context, id)
      true
    }

    /** Remembers the full-screen alarm's look (1-7) chosen in Config > Alerts > Alarm style. */
    AsyncFunction("setAlarmStyle") { n: Int ->
      AlarmStore.setStyle(context, n)
      true
    }

    /** true = alarms show in the notification centre only; false (default) = they open full screen, on the lock screen too. */
    AsyncFunction("setAlarmDelivery") { notificationOnly: Boolean ->
      AlarmStore.setNotificationOnly(context, notificationOnly)
      true
    }

    /** true (default) = the ringing alarm also shows a banner notification; false = only a small silent line (needs "Open over other apps"). */
    AsyncFunction("setAlarmBanner") { on: Boolean ->
      AlarmStore.setBanner(context, on)
      true
    }

    /** "Open over other apps": needed to open the alarm screen directly while the phone is unlocked and in use. */
    AsyncFunction("canDrawOverlays") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@AsyncFunction true
      Settings.canDrawOverlays(context)
    }

    AsyncFunction("requestOverlayPermission") {
      try {
        context.startActivity(
          Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
            .setData(Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
      } catch (_: Exception) { false }
    }

    /** The id of the task alarm ringing now, or "" - lets the app show its alert screen when it is already open. */
    AsyncFunction("ringingTask") {
      AlarmRingService.ringingTaskId ?: ""
    }

    AsyncFunction("stopAlarmRinging") { prefix: String ->
      AlarmRingService.stopMatching(context, prefix)
      true
    }

    /** Ids of the full-screen alarms still booked (JSON array), for cancelling ones no longer wanted. */
    AsyncFunction("listFullScreenAlarms") {
      JSONArray(AlarmStore.ids(context)).toString()
    }

    AsyncFunction("cancelFullScreenAlarm") { taskId: String, promise: Promise ->
      try {
        AlarmStore.cancel(context, taskId)
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(taskId.hashCode())
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERR_ALARM_CANCEL", e.message ?: "cancel failed", e)
      }
    }

    /**
     * Android 14+ only: whether this app is allowed to promote its
     * notifications to a full-screen launch at all (Settings > Special app
     * access > Alarms & reminders style gate, separate from exact alarms).
     * Always true below API 34, where it is a normal, automatically granted
     * permission.
     */
    AsyncFunction("isFullScreenIntentAllowed") {
      if (Build.VERSION.SDK_INT < 34) return@AsyncFunction true
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.canUseFullScreenIntent()
    }

    /** Opens the system screen to grant it directly. */
    AsyncFunction("requestFullScreenIntentPermission") {
      if (Build.VERSION.SDK_INT < 34) return@AsyncFunction true
      try {
        context.startActivity(
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
            .setData(Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
      } catch (_: Exception) { false }
    }

    /**
     * What launched MainActivity this time, if it was a tapped alarm
     * (AlarmRingingActivity's buttons, or the notification's own Done
     * action) - consumed once, so the same action is never replayed on a
     * later launch or app-foreground. Returns null when this launch was not
     * from the alarm flow.
     */
    AsyncFunction("consumeInitialAlarmAction") { promise: Promise ->
      val activity = appContext.currentActivity
      val i = activity?.intent
      val taskId = i?.getStringExtra("taskId")
      if (taskId == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val action = i.getStringExtra("alarmAction")
      i.removeExtra("taskId")
      i.removeExtra("alarmAction")
      promise.resolve(JSONObject().put("taskId", taskId).put("action", action ?: JSONObject.NULL).toString())
    }

    /**
     * Text shared INTO the app from another app (Gmail's Share > Working Dashboard): "subject\ntext", or null. Cleared once
     * read, so it is taken once. The app turns it into a pre-filled New Entry.
     */
    AsyncFunction("consumeSharedText") { promise: Promise ->
      val i = appContext.currentActivity?.intent
      if (i == null || i.action != android.content.Intent.ACTION_SEND) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val text = i.getStringExtra(android.content.Intent.EXTRA_TEXT) ?: ""
      val subject = i.getStringExtra(android.content.Intent.EXTRA_SUBJECT) ?: ""
      i.action = null
      i.removeExtra(android.content.Intent.EXTRA_TEXT)
      i.removeExtra(android.content.Intent.EXTRA_SUBJECT)
      val joined = listOf(subject, text).filter { it.isNotBlank() }.joinToString("\n")
      promise.resolve(if (joined.isBlank()) null else joined)
    }

    /* ---------- persistent status notification ---------- */

    /**
     * An ongoing entry in the system notification shade - used to show that
     * the office timer is running and how much is left. This is a real OS
     * notification, visible with the app closed, not an in-app banner.
     */
    AsyncFunction("showOngoing") { title: String, body: String ->
      // With the service running, its notification is the status - update it
      // rather than posting a second, competing one.
      if (prefs.getBoolean(TrackerService.KEY_RUNNING, false)) {
        prefs.edit()
          .putString(TrackerService.KEY_STATUS_TITLE, title)
          .putString(TrackerService.KEY_STATUS_BODY, body)
          .putLong(TrackerService.KEY_STATUS_AT, System.currentTimeMillis())
          .apply()
        try {
          // Text only: redraw. REFRESH restarted location every minute.
          context.startService(Intent(context, TrackerService::class.java).setAction(TrackerService.ACTION_REDRAW))
        } catch (_: Exception) {
        }
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(STATUS_ID)
        return@AsyncFunction true
      }
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        nm.getNotificationChannel(STATUS_CHANNEL) == null
      ) {
        nm.createNotificationChannel(
          NotificationChannel(STATUS_CHANNEL, "Office status", NotificationManager.IMPORTANCE_LOW)
            .apply {
              description = "Shows the running office timer."
              setShowBadge(false)
            }
        )
      }

      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
      val pending = PendingIntent.getActivity(context, 1, launch, flags)

      val builder = newNotificationBuilder(context, STATUS_CHANNEL)

      nm.notify(
        STATUS_ID,
        builder
          .setContentTitle(title)
          .setContentText(body)
          .setStyle(Notification.BigTextStyle().bigText(body))
          .setSmallIcon(context.applicationInfo.icon)
          .setContentIntent(pending)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .build()
      )
      true
    }

    AsyncFunction("clearOngoing") {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.cancel(STATUS_ID)
      true
    }

    /**
     * Steps the service credited per calendar day, then clears them.
     * Returns { "yyyy-MM-dd": steps }.
     */
    AsyncFunction("drainStepDays") { promise: Promise ->
      try {
        val raw = synchronized(TrackerService.LOCK) {
          val r = prefs.getString(TrackerService.KEY_STEP_DAYS, "{}") ?: "{}"
          prefs.edit().putString(TrackerService.KEY_STEP_DAYS, "{}").apply()
          r
        }
        JSONObject(raw)                      // parse only to validate
        promise.resolve(raw)
      } catch (e: Exception) {
        promise.reject("ERR_STEP_DAYS", e.message ?: "step read failed", e)
      }
    }

    /* ---------- steps ---------- */

    AsyncFunction("hasStepCounter") {
      val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
    }

    /**
     * Resolves { steps, bootAt, available }.
     * `steps` counts since boot; `bootAt` identifies the boot session so JS can
     * tell a reboot (counter reset to 0) from a genuine decrease.
     */
    AsyncFunction("getStepCounter") { promise: Promise ->
      val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
      val bootAt = System.currentTimeMillis() - SystemClock.elapsedRealtime()

      if (sensor == null) {
        promise.resolve(JSONObject().put("available", false).put("steps", 0.0).put("bootAt", bootAt).toString())
        return@AsyncFunction
      }
      if (android.os.Build.VERSION.SDK_INT >= 29 && !has(Manifest.permission.ACTIVITY_RECOGNITION)) {
        promise.resolve(JSONObject().put("available", false).put("steps", 0.0).put("bootAt", bootAt).put("reason", "permission").toString())
        return@AsyncFunction
      }

      // The service holds a permanent listener, so its stored value is both
      // fresher and cheaper than spinning up a one-shot listener here.
      if (prefs.getBoolean(TrackerService.KEY_RUNNING, false)) {
        val cached = prefs.getFloat(TrackerService.KEY_STEP_COUNTER, -1f)
        if (cached >= 0f) {
          promise.resolve(
            JSONObject()
              .put("available", true)
              .put("steps", cached.toDouble())
              .put("bootAt", prefs.getLong(TrackerService.KEY_STEP_BOOT, bootAt))
              .put("source", "service")
              .toString()
          )
          return@AsyncFunction
        }
      }

      var settled = false
      val handler = Handler(Looper.getMainLooper())

      val listener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
          if (settled) return
          settled = true
          sm.unregisterListener(this)
          promise.resolve(
            JSONObject()
              .put("available", true)
              .put("steps", event.values.firstOrNull()?.toDouble() ?: 0.0)
              .put("bootAt", bootAt)
              .toString()
          )
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
      }

      sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_FASTEST)

      // The counter only emits on change, so a stationary phone can stay quiet.
      handler.postDelayed({
        if (settled) return@postDelayed
        settled = true
        sm.unregisterListener(listener)
        promise.resolve(JSONObject().put("available", true).put("steps", -1.0).put("bootAt", bootAt).put("reason", "timeout").toString())
      }, 4000)
    }
  }
}
