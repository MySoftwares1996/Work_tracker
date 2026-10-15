package expo.modules.nativetools

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.Manifest
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.SystemClock
import android.provider.Telephony
import org.json.JSONArray
import org.json.JSONObject

/**
 * One long-lived service doing the two jobs that must survive the app being
 * closed or swiped away:
 *
 *   1. Holds a listener on TYPE_STEP_COUNTER for the whole time it runs, so
 *      steps are recorded continuously instead of only while a screen is open.
 *   2. Polls the SMS inbox on a short interval and, in parallel, watches it
 *      through a ContentObserver so a bank message is usually picked up the
 *      moment it lands.
 *
 * Everything is written to SharedPreferences. JS reads and drains it. The
 * service never touches the React context, so it works with no UI alive.
 */
class TrackerService : Service() {

  companion object {
    const val PREFS = "mpt_tracker"
    const val CHANNEL_ID = "mpt_tracking"
    const val NOTIF_ID = 4711

    const val KEY_STEP_COUNTER = "step_counter"      // latest raw sensor value
    const val KEY_STEP_BOOT = "step_boot"            // boot session identifier
    const val KEY_STEP_DAYS = "step_days"            // { "yyyy-MM-dd": steps }
    const val KEY_STEP_LAST = "step_last"            // counter at the previous event
    const val KEY_SMS_QUEUE = "sms_queue"            // JSON array of messages
    const val KEY_SMS_LAST = "sms_last_ts"           // newest message already seen
    const val KEY_RUNNING = "running"

    // Presence (office radius)
    const val KEY_OFFICE = "office"                    // {lat,lng,radius,label,shiftStart,shiftEnd,breakMinutes}
    const val KEY_PRESENCE_EVENTS = "presence_events"  // [{type:'enter'|'exit', at, dist}] drained by JS
    const val KEY_PRESENCE_STATE = "presence_state"    // "in" | "out" | ""
    const val KEY_PRESENCE_DAY = "presence_day"        // the service's own view of today, for the notification
    const val KEY_LAST_DIST = "last_dist"
    const val KEY_LAST_ACC = "last_acc"
    const val KEY_LAST_FIX = "last_fix"
    // Text the app pushes while it is running; newer than the service's own.
    const val KEY_STATUS_TITLE = "status_title"
    const val KEY_STATUS_BODY = "status_body"
    const val KEY_STATUS_AT = "status_at"

    const val ALERT_CHANNEL = "mpt_presence_alerts"
    const val ALERT_ID = 4713

    const val ACTION_START = "mpt.START"
    const val ACTION_STOP = "mpt.STOP"
    const val ACTION_REFRESH = "mpt.REFRESH"   // office/radius/permissions changed: restart location
    const val ACTION_REDRAW = "mpt.REDRAW"     // text or day changed: redraw the notification only

    var pollSeconds: Int = 15

    /*
     * Guards every read-add-write of the queues the app drains from another thread (step_days, sms_queue,
     * presence_events). Without it a drain landing between the read and the write was written straight
     * back: the steps or messages it took were handed over twice, and a stale "left the office" applied
     * again recorded the same break twice.
     */
    val LOCK = Any()
  }

  private lateinit var prefs: SharedPreferences
  private var sensorManager: SensorManager? = null
  private var stepSensor: Sensor? = null
  private var worker: HandlerThread? = null
  private var handler: Handler? = null
  private var observer: android.database.ContentObserver? = null
  private var locationManager: LocationManager? = null
  private var pendingSide: String? = null
  private var pendingCount = 0

  private val locationListener = object : LocationListener {
    override fun onLocationChanged(location: Location) { onFix(location, false) }
    // Abstract before API 30; implemented so older phones do not crash.
    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}
  }

  private val stepListener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent) {
      val value = event.values.firstOrNull() ?: return
      val bootAt = System.currentTimeMillis() - SystemClock.elapsedRealtime()
      synchronized(LOCK) {
        val editor = prefs.edit()
          .putFloat(KEY_STEP_COUNTER, value)
          .putLong(KEY_STEP_BOOT, bootAt)

        /*
         * Because the service is alive when the step happens, it knows which day
         * to credit. Accumulating here is what makes a walk that crosses
         * midnight split correctly instead of landing wholly on whichever day
         * the app is next opened.
         */
        val last = prefs.getFloat(KEY_STEP_LAST, -1f)
        if (last >= 0f && value >= last) {
          val delta = (value - last).toInt()
          if (delta in 1..10000) {
            val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
              .format(java.util.Date())
            val days = try { JSONObject(prefs.getString(KEY_STEP_DAYS, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
            days.put(today, days.optInt(today, 0) + delta)
            editor.putString(KEY_STEP_DAYS, days.toString())
          }
        }
        editor.putFloat(KEY_STEP_LAST, value)
        editor.apply()
      }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopTracking()
      stopSelf()
      return START_NOT_STICKY
    }

    if (intent?.action == ACTION_REDRAW && worker != null) {
      refreshNotification()
      return START_STICKY
    }

    if (intent?.action == ACTION_REFRESH && worker != null) {
      // Re-declare the foreground types: location permission may have been
      // granted after the service started without it, and Android 14 gives a
      // service no background location unless its type includes location.
      startForegroundCompat()
      startLocation()                   // office or radius changed
      refreshNotification()
      return START_STICKY
    }

    if (!startForegroundCompat()) {
      stopSelf()
      return START_NOT_STICKY
    }
    prefs.edit().putBoolean(KEY_RUNNING, true).apply()
    startTracking()

    // START_STICKY asks Android to bring the service back if it is killed.
    return START_STICKY
  }

  override fun onDestroy() {
    stopTracking()
    prefs.edit().putBoolean(KEY_RUNNING, false).apply()
    super.onDestroy()
  }

  /** If the user swipes the app away, come straight back. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    val restart = Intent(applicationContext, TrackerService::class.java).setAction(ACTION_START)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(restart)
      else startService(restart)
    } catch (_: Exception) {}
    super.onTaskRemoved(rootIntent)
  }

  /* ---------- tracking ---------- */

  private fun startTracking() {
    if (worker != null) return

    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    stepSensor?.let {
      // SENSOR_DELAY_NORMAL is plenty; the counter is cumulative, not sampled.
      sensorManager?.registerListener(stepListener, it, SensorManager.SENSOR_DELAY_NORMAL)
    }

    worker = HandlerThread("mpt-tracker").apply { start() }
    handler = Handler(worker!!.looper)

    // Real-time: fire as soon as the inbox changes.
    observer = object : android.database.ContentObserver(handler) {
      override fun onChange(selfChange: Boolean) {
        handler?.post { collectSms() }
      }
    }
    try {
      contentResolver.registerContentObserver(Telephony.Sms.CONTENT_URI, true, observer!!)
    } catch (_: Exception) {}

    // Safety net: poll on a short interval in case the observer misses one.
    handler?.post(pollRunnable)

    startLocation()
    handler?.post(statusRunnable)
  }

  private val pollRunnable = object : Runnable {
    override fun run() {
      collectSms()
      handler?.postDelayed(this, pollSeconds.toLong() * 1000L)
    }
  }

  private fun stopTracking() {
    stopLocation()
    try { sensorManager?.unregisterListener(stepListener) } catch (_: Exception) {}
    observer?.let { try { contentResolver.unregisterContentObserver(it) } catch (_: Exception) {} }
    observer = null
    handler?.removeCallbacksAndMessages(null)
    worker?.quitSafely()
    worker = null
    handler = null
  }

  /* ---------- SMS ---------- */

  private fun collectSms() {
    if (!SmsFilter.canRead(this)) return
    val last = prefs.getLong(KEY_SMS_LAST, 0L)
    // On the very first run only look back an hour, so we do not import history.
    val since = if (last > 0L) last else System.currentTimeMillis() - 60 * 60 * 1000L
    var newest = last

    val fresh = JSONArray()

    try {
      contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
        "${Telephony.Sms.DATE} > ?",
        arrayOf(since.toString()),
        "${Telephony.Sms.DATE} DESC"
      )?.use { c ->
        val idIdx = c.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addrIdx = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIdx = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIdx = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (c.moveToNext()) {
          val body = c.getString(bodyIdx) ?: continue
          val date = c.getLong(dateIdx)
          if (date > newest) newest = date
          // Drop loan offers and marketing before they ever reach the queue.
          if (!SmsFilter.isTransactional(body)) continue
          fresh.put(
            JSONObject()
              .put("id", c.getString(idIdx))
              .put("sender", c.getString(addrIdx) ?: "")
              .put("body", body)
              .put("receivedAt", date)
          )
        }
      }
    } catch (_: Exception) {
      return
    }

    // The queue is read and written back under the lock, after the inbox query: the app may have drained
    // it meanwhile. Kept bounded; JS drains it on every foreground.
    synchronized(LOCK) {
      val existing = try { JSONArray(prefs.getString(KEY_SMS_QUEUE, "[]")) } catch (_: Exception) { JSONArray() }
      for (i in 0 until fresh.length()) existing.put(fresh.get(i))
      val trimmed = if (existing.length() > 300) {
        JSONArray().also { out -> for (i in existing.length() - 300 until existing.length()) out.put(existing.get(i)) }
      } else existing

      prefs.edit()
        .putString(KEY_SMS_QUEUE, trimmed.toString())
        .putLong(KEY_SMS_LAST, newest)
        .apply()
    }
  }


  /* ---------- foreground start ---------- */

  private fun hasPerm(p: String) = checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED
  private fun hasLocation() =
    hasPerm(Manifest.permission.ACCESS_FINE_LOCATION) || hasPerm(Manifest.permission.ACCESS_COARSE_LOCATION)

  /**
   * Starts in the foreground with only the types whose permissions are
   * granted. Android 14 throws if a declared type lacks its permission, and
   * Android 15 stops a dataSync service after 6 hours a day - which is why
   * this service no longer uses dataSync at all.
   */
  private fun startForegroundCompat(): Boolean {
    val n = buildNotification()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, n)
      return true
    }
    var types = 0
    if (hasLocation()) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
    if (Build.VERSION.SDK_INT >= 34 && hasPerm(Manifest.permission.ACTIVITY_RECOGNITION)) {
      types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
    }
    return try {
      if (types == 0 && Build.VERSION.SDK_INT < 34) startForeground(NOTIF_ID, n) else startForeground(NOTIF_ID, n, types)
      true
    } catch (e: Exception) {
      // Restarted from the background without "allow all the time" location:
      // keep steps and SMS running without the location type.
      val fallback = types and ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION.inv()
      try {
        if (fallback == 0 && Build.VERSION.SDK_INT >= 34) false
        else { startForeground(NOTIF_ID, n, fallback); true }
      } catch (_: Exception) { false }
    }
  }

  /* ---------- presence: the office radius ---------- */

  private fun office(): JSONObject? = try {
    val o = JSONObject(prefs.getString(KEY_OFFICE, "") ?: "")
    if (!o.isNull("lat") && !o.isNull("lng") && o.has("lat") && o.has("lng")) o else null
  } catch (_: Exception) { null }

  private fun minsOf(hm: String): Int {
    val p = hm.split(":")
    return (p.getOrNull(0)?.trim()?.toIntOrNull() ?: 0) * 60 + (p.getOrNull(1)?.trim()?.toIntOrNull() ?: 0)
  }
  private fun shiftMins(o: JSONObject) = minsOf(o.optString("shiftEnd", "19:00")) - minsOf(o.optString("shiftStart", "09:30"))
  private fun standardBreak(o: JSONObject) = o.optInt("breakMinutes", 60)
  private fun targetMins(o: JSONObject) = (shiftMins(o) - standardBreak(o)).coerceAtLeast(0)

  private fun startLocation() {
    stopLocation()
    office() ?: return
    if (!hasLocation()) return
    val looper = worker?.looper ?: return
    val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    locationManager = lm
    // A fix a minute, or sooner after moving 10 m. GPS outdoors, network
    // (Wi-Fi/cell) indoors - whichever answers.
    for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
      try {
        if (lm.isProviderEnabled(provider)) {
          lm.requestLocationUpdates(provider, 60_000L, 10f, locationListener, looper)
        }
      } catch (_: SecurityException) {
      } catch (_: IllegalArgumentException) {
      }
    }
    // Seed with a recent last-known fix so the notification is right at once.
    try {
      var best: Location? = null
      for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
        val l = try { lm.getLastKnownLocation(provider) } catch (_: SecurityException) { null }
        if (l != null && (best == null || l.time > best.time)) best = l
      }
      val b = best
      if (b != null && System.currentTimeMillis() - b.time < 5 * 60_000L) onFix(b, true)
    } catch (_: Exception) {
    }
  }

  private fun stopLocation() {
    try { locationManager?.removeUpdates(locationListener) } catch (_: Exception) {}
    locationManager = null
  }

  /**
   * Inside: at or under your radius. Outside: beyond it by a margin that
   * grows with GPS inaccuracy. Between the two nothing changes, and a switch
   * needs two agreeing fixes - one bad GPS jump cannot log you out.
   */
  private fun onFix(loc: Location, seed: Boolean) {
    val o = office() ?: return
    val result = FloatArray(1)
    Location.distanceBetween(loc.latitude, loc.longitude, o.getDouble("lat"), o.getDouble("lng"), result)
    val dist = result[0].toDouble()
    val radius = o.optDouble("radius", 150.0).coerceAtLeast(10.0)
    val acc = if (loc.hasAccuracy()) loc.accuracy.toDouble() else 50.0
    prefs.edit()
      .putFloat(KEY_LAST_DIST, dist.toFloat())
      .putFloat(KEY_LAST_ACC, acc.toFloat())
      .putLong(KEY_LAST_FIX, System.currentTimeMillis())
      .apply()

    if (acc > 250.0) { refreshNotification(); return }   // too vague to decide anything

    val margin = (acc * 0.5).coerceIn(15.0, 60.0)
    val side = when {
      dist <= radius -> "in"
      dist > radius + margin -> "out"
      else -> null
    }
    val current = prefs.getString(KEY_PRESENCE_STATE, "") ?: ""
    // The last-known location read at start-up may be old. It may set the
    // very first state, but never counts toward switching an existing one:
    // repeated restarts re-read the same stale fix, which used to add up to
    // "two agreeing fixes" and flip you in or out wrongly.
    if (seed && current.isNotEmpty()) {
      refreshNotification()
      return
    }
    if (side == null || side == current) {
      pendingSide = null; pendingCount = 0
      refreshNotification()
      return
    }
    if (pendingSide == side) pendingCount++ else { pendingSide = side; pendingCount = 1 }
    val needed = if (current.isEmpty()) 1 else 2
    if (pendingCount >= needed) {
      pendingSide = null; pendingCount = 0
      val at = if (seed || loc.time <= 0L) System.currentTimeMillis() else loc.time
      transition(if (side == "in") "enter" else "exit", at, dist)
    }
    refreshNotification()
  }

  private fun transition(type: String, at: Long, dist: Double) {
    // The day record is read and rewritten under the lock as well: the app replaces it (setDay) from
    // another thread.
    val kind: String?
    synchronized(LOCK) {
      kind = applyToDay(type, at)
      val events = try { JSONArray(prefs.getString(KEY_PRESENCE_EVENTS, "[]")) } catch (_: Exception) { JSONArray() }
      events.put(JSONObject().put("type", type).put("at", at).put("dist", dist))
      prefs.edit()
        .putString(KEY_PRESENCE_EVENTS, events.toString())
        .putString(KEY_PRESENCE_STATE, if (type == "enter") "in" else "out")
        .apply()
    }
    if (kind != null) alert(kind, at)
  }

  private fun dayKey(ms: Long) =
    java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date(ms))

  private fun loadDay(now: Long): JSONObject {
    val d = try { JSONObject(prefs.getString(KEY_PRESENCE_DAY, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    return if (d.optString("key") == dayKey(now)) d else JSONObject().put("key", dayKey(now))
  }

  /**
   * The same rule as applyPresenceEvent() in attendanceCore.js, which the app
   * uses for the stored record: stepping out mid-shift is a break, leaving
   * after shift end or once the target is met is a logout.
   * Returns what happened, for the alert.
   */
  private fun applyToDay(type: String, at: Long): String? {
    val d = loadDay(at)
    val o = office() ?: return null
    val inAt = d.optLong("in", 0L)
    val outAt = d.optLong("out", 0L)
    val brk = d.optLong("breakStart", 0L)
    var result: String? = null
    if (type == "enter") {
      when {
        inAt == 0L -> { d.put("in", at); result = "login" }
        brk > 0L -> { addBreak(d, brk, at); d.put("breakStart", 0L); result = "back" }
        outAt > 0L -> { addBreak(d, outAt, at); d.put("out", 0L); result = "back" }
      }
    } else if (inAt > 0L && outAt == 0L && brk == 0L && at > inAt) {
      val cal = java.util.Calendar.getInstance().apply { timeInMillis = at }
      val nowMin = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE)
      val worked = workedMins(d, o, at)
      if (nowMin >= minsOf(o.optString("shiftEnd", "19:00")) || worked >= targetMins(o)) {
        d.put("out", at); result = "logout"
      } else {
        d.put("breakStart", at); result = "break"
      }
    }
    prefs.edit().putString(KEY_PRESENCE_DAY, d.toString()).apply()
    return result
  }


  private fun addBreak(d: JSONObject, start: Long, end: Long) {
    if (end <= start) return
    d.put("breakMs", d.optLong("breakMs", 0L) + (end - start))
    val arr = d.optJSONArray("breaks") ?: JSONArray()
    arr.put(JSONArray().put(start).put(end))
    d.put("breaks", arr)
  }

  /** Real breaks as [start, end], an open one running to `end`. */
  private fun breakIntervals(d: JSONObject, end: Long): List<Pair<Long, Long>> {
    val out = ArrayList<Pair<Long, Long>>()
    val arr = d.optJSONArray("breaks")
    if (arr != null) {
      for (i in 0 until arr.length()) {
        val p = arr.optJSONArray(i) ?: continue
        out.add(p.optLong(0) to p.optLong(1))
      }
    }
    val open = d.optLong("breakStart", 0L)
    if (open > 0L) out.add(open to end)
    return out
  }

  /** The lunch hour: the configured start, or centred in the shift. */
  private fun lunchSlot(o: JSONObject, inAt: Long): Pair<Long, Long> {
    val std = standardBreak(o)
    val startMin = if (o.optString("lunchStart", "").isNotBlank()) minsOf(o.optString("lunchStart"))
      else Math.round((minsOf(o.optString("shiftStart", "09:30")) + minsOf(o.optString("shiftEnd", "19:00"))) / 2.0 - std / 2.0).toInt()
    val cal = java.util.Calendar.getInstance().apply {
      timeInMillis = inAt
      set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0)
      set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
    }
    val start = cal.timeInMillis + startMin * 60_000L
    return start to start + std * 60_000L
  }

  /**
   * Same rule as computeDay() in attendanceCore.js: the work sessions, minus
   * whatever part of the standard lunch was not taken as a real break, charged
   * only for time you were working during the lunch hour. Eating inside the
   * radius still costs the standard 60 minutes, and the clock pauses through
   * lunch rather than dropping at checkout.
   */
  private fun workedMins(d: JSONObject, o: JSONObject, now: Long): Double {
    val inAt = d.optLong("in", 0L)
    if (inAt == 0L) return 0.0
    val end = if (d.optLong("out", 0L) > 0L) d.optLong("out") else now
    val breaks = breakIntervals(d, end)
    val taken = breaks.sumOf { (s, e) -> (minOf(e, end) - s).coerceAtLeast(0L) } / 60_000.0
    val (ls, le) = lunchSlot(o, inAt)
    fun clip(a: Long, b: Long) = (minOf(b, le) - maxOf(a, ls)).coerceAtLeast(0L) / 60_000.0
    val workingInSlot = (clip(inAt, end) - breaks.sumOf { (s, e) -> clip(s, e) }).coerceAtLeast(0.0)
    val implicit = minOf((standardBreak(o) - taken).coerceAtLeast(0.0), workingInSlot)
    return ((end - inAt) / 60_000.0 - taken - implicit).coerceAtLeast(0.0)
  }

  private fun takenBreakMins(d: JSONObject, now: Long): Double {
    val end = if (d.optLong("out", 0L) > 0L) d.optLong("out") else now
    return breakIntervals(d, end).sumOf { (s, e) -> (minOf(e, end) - s).coerceAtLeast(0L) } / 60_000.0
  }

  /* ---------- notification text ---------- */

  private fun clock(ms: Long) = java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault()).format(java.util.Date(ms))

  private fun hm(mins: Long): String {
    val m = mins.coerceAtLeast(0L)
    return "${m / 60}h ${(m % 60).toString().padStart(2, '0')}m"
  }

  private fun km(meters: Double): String = when {
    meters < 1000 -> "${(Math.round(meters / 10.0) * 10)} m"
    meters < 100_000 -> String.format(java.util.Locale.US, "%.1f km", meters / 1000.0)
    else -> "${Math.round(meters / 1000.0)} km"
  }

  private fun distanceLine(label: String): String {
    val fixAt = prefs.getLong(KEY_LAST_FIX, 0L)
    if (fixAt == 0L) return "Waiting for a location fix"
    val d = prefs.getFloat(KEY_LAST_DIST, -1f)
    if (d < 0f) return "Waiting for a location fix"
    return "${km(d.toDouble())} from $label · ${clock(fixAt)}"
  }

  private fun statusText(now: Long): Pair<String, String> {
    // While the app is open it pushes exact figures; those win for 90 s.
    if (now - prefs.getLong(KEY_STATUS_AT, 0L) < 90_000L) {
      val t = prefs.getString(KEY_STATUS_TITLE, null)
      val b = prefs.getString(KEY_STATUS_BODY, null)
      if (t != null && b != null) return t to b
    }
    val o = office() ?: return "Personal Tracker is running" to "Counting steps and watching for bank messages"
    val label = o.optString("label", "").ifBlank { "the office" }
    val d = loadDay(now)
    val inAt = d.optLong("in", 0L)
    val outAt = d.optLong("out", 0L)
    val brk = d.optLong("breakStart", 0L)
    val breakMs = d.optLong("breakMs", 0L)

    if (inAt > 0L && outAt == 0L && brk == 0L) {
      val worked = workedMins(d, o, now).toLong()
      val excess = (takenBreakMins(d, now) - standardBreak(o)).coerceAtLeast(0.0).toLong()
      val requiredOut = inAt + (shiftMins(o) + excess) * 60_000L
      val left = (requiredOut - now) / 60_000L
      return "At the office" to if (left > 0)
        "Worked ${hm(worked)} · ${hm(left)} still required · checkout ${clock(requiredOut)}"
      else "Worked ${hm(worked)} · target met, you can leave"
    }
    if (inAt > 0L && brk > 0L) {
      return "Stepped out · on a break" to
        "Since ${clock(brk)} (${hm((now - brk) / 60_000L)}) · ${distanceLine(label)}"
    }
    val after = if (outAt > 0L) " · left at ${clock(outAt)}" else ""
    return "Out of office" to distanceLine(label) + after
  }

  private fun refreshNotification() {
    try {
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, buildNotification())
    } catch (_: Exception) {
    }
  }

  /** Keeps worked / remaining ticking in the shade even with the app closed. */
  private val statusRunnable = object : Runnable {
    override fun run() {
      refreshNotification()
      handler?.postDelayed(this, 60_000L)
    }
  }

  /** Login / break / back / logout, as a normal heads-up alert. */
  private fun alert(kind: String, at: Long) {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(ALERT_CHANNEL) == null) {
      nm.createNotificationChannel(
        NotificationChannel(ALERT_CHANNEL, "Attendance alerts", NotificationManager.IMPORTANCE_HIGH)
          .apply { description = "Login, break and logout, detected from your office radius." }
      )
    }
    val (title, body) = when (kind) {
      "login" -> "Logged in" to "Arrived at the office at ${clock(at)}. The timer is running."
      "break" -> "Stepped out" to "Break started at ${clock(at)} - counted automatically."
      "back" -> "Back at work" to "Break ended at ${clock(at)}. The timer is running again."
      "logout" -> "Logged out" to "Left the office at ${clock(at)}."
      else -> return
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
    // Like every other alert it opens full screen (no ringing: it is only news), on the lock screen and, with "Open over
    // other apps" allowed, while the phone is in use too - not just a line in the notification centre.
    val screen = Intent(this, AlarmRingingActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(AlarmRingingActivity.EXTRA_TASK_ID, "attendance:$kind")
      putExtra(AlarmRingingActivity.EXTRA_TITLE, title)
      putExtra(AlarmRingingActivity.EXTRA_BODY, body)
      putExtra(AlarmRingingActivity.EXTRA_QUIET, true)
    }
    val fullScreen = !AlarmStore.notificationOnly(this)
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, ALERT_CHANNEL)
      else newBuilder()
    try {
      builder.setContentTitle(title).setContentText(body)
        .setSmallIcon(applicationInfo.icon)
        .setContentIntent(PendingIntent.getActivity(this, 2, launch, flags))
        .setAutoCancel(true)
      if (fullScreen) builder.setFullScreenIntent(PendingIntent.getActivity(this, 3, screen, flags), true)
      nm.notify(ALERT_ID, builder.build())
      if (fullScreen && (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || android.provider.Settings.canDrawOverlays(this))) startActivity(screen)
    } catch (_: Exception) {
    }
  }

  /* ---------- notification ---------- */

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Background tracking",
      NotificationManager.IMPORTANCE_LOW      // silent, but always visible
    ).apply {
      description = "Keeps step counting and SMS capture running."
      setShowBadge(false)
    }
    nm.createNotificationChannel(channel)
  }

  /** Notification.Builder(Context) is deprecated at API 26; minSdk here is 24. */
  @Suppress("DEPRECATION")
  private fun newBuilder(): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
    else Notification.Builder(this)

  private fun buildNotification(): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
    val pending = PendingIntent.getActivity(this, 0, launch, flags)

    // The permanent notification IS the office status: at the office with
    // worked and remaining, on a break, or out of office with the distance.
    val (title, body) = statusText(System.currentTimeMillis())

    return newBuilder()
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setSmallIcon(applicationInfo.icon)
      .setContentIntent(pending)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
  }
}
