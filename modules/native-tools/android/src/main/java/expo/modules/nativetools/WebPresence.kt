package expo.modules.nativetools

import android.content.Context
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import java.util.concurrent.TimeUnit

/**
 * Is the web app open and in use right now? Asked by AlarmReceiver at the moment an alert fires, so the phone
 * stays silent while the web app is in use even when this app has not run for hours (Android stops it in the
 * background, and the "in use" note the app passes on while running - AlarmStore.webInUse - is then stale).
 *
 * Reads the web app's note (users/<uid>/meta/presence: { webActiveAt, lastInputAt } in ms, written about once a
 * minute while it is open) from Firestore through the Firebase SDK the app already ships (React Native Firebase),
 * signed in as the same account. In use = the note is fresh (3 min) AND someone used the web app in the last
 * 15 minutes - the same rule as webActiveUntil in src/firebaseSyncCore.js. Anything unknown (not signed in,
 * offline, slow, an error) counts as not in use, so the phone rings.
 *
 * Firebase is reached by reflection, not compiled against: its libraries are built with a newer Kotlin than this
 * module's compiler reads, and compiling against them failed the APK build.
 */
object WebPresence {
  private const val PREFS = "mpt_full_screen_alarms"
  private const val CHECK = "web_presence_check"
  private const val HEARTBEAT_MS = 3 * 60000L
  private const val IDLE_MS = 15 * 60000L

  /** Config's "Ring on the phone only when the web app is not in use"; on unless switched off. */
  fun setEnabled(ctx: Context, on: Boolean) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(CHECK, on).apply()
  }
  fun enabled(ctx: Context): Boolean = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(CHECK, true)

  /** Until when (ms) the note says the web app is in use; 0 when it is not. */
  fun activeUntil(webActiveAt: Long, lastInputAt: Long, now: Long): Long {
    if (webActiveAt <= 0L || lastInputAt <= 0L) return 0L
    val until = minOf(webActiveAt + HEARTBEAT_MS, lastInputAt + IDLE_MS, now + HEARTBEAT_MS)
    return if (until > now) until else 0L
  }

  /** obj.name(args) by reflection - the public method with that name and that many parameters. */
  private fun call(obj: Any, name: String, vararg args: Any?): Any? {
    // Several overloads share a name and a count (DocumentSnapshot.get(String) and get(FieldPath)): take the one whose
    // parameter types fit these arguments.
    val m = obj.javaClass.methods.first { m ->
      m.name == name && m.parameterTypes.size == args.size &&
        m.parameterTypes.indices.all { i -> args[i] == null || m.parameterTypes[i].isAssignableFrom(args[i]!!.javaClass) }
    }
    return m.invoke(obj, *args)
  }

  private fun static(className: String, name: String): Any? = Class.forName(className).getMethod(name).invoke(null)

  private val ALERT_ID = Regex("^wdn?:(.+):[^:]+$")

  /**
   * Blocking: call off the main thread. True when the web app's copy of the task behind this alert says it no longer
   * applies - done, in the Bin, snoozed, silenced for today or deleted forever - so an alert booked on the phone
   * before that (and not yet refreshed) stays quiet / stops ringing. Unknown (not signed in, offline, no copy, an
   * error) counts as still due.
   */
  fun taskHandled(ctx: Context, taskId: String, timeoutMs: Long = 4000L): Boolean {
    if (!enabled(ctx)) return false
    val entryId = ALERT_ID.find(taskId)?.groupValues?.get(1) ?: return false
    val alertKey = taskId.substringAfterLast(':')
    return try {
      val auth = static("com.google.firebase.auth.FirebaseAuth", "getInstance") ?: return false
      val user = call(auth, "getCurrentUser") ?: return false
      val uid = call(user, "getUid") as? String ?: return false
      val db = static("com.google.firebase.firestore.FirebaseFirestore", "getInstance") ?: return false
      val users = call(db, "collection", "users") ?: return false
      val tasks = call(call(users, "document", uid) ?: return false, "collection", "tasks") ?: return false
      val doc = call(tasks, "document", entryId) ?: return false
      val server = Class.forName("com.google.firebase.firestore.Source").enumConstants?.firstOrNull { (it as Enum<*>).name == "SERVER" } ?: return false
      val task = call(doc, "get", server) as? Task<*> ?: return false
      val snap = Tasks.await(task, timeoutMs, TimeUnit.MILLISECONDS) ?: return false
      if (call(snap, "exists") != true) return false
      val status = (call(snap, "get", "status") as? String).orEmpty().trim().lowercase()
      val deleted = call(snap, "get", "deleted") == true || call(snap, "get", "purged") == true
      val snoozeUntil = (call(snap, "get", "snoozeUntil") as? Number)?.toLong() ?: 0L
      // The day's "silenced" mark is per kind of alert, as in entryAlertPlan: deadline keys (dl...) use deadlineAckDate.
      val ackDate = (call(snap, "get", if (alertKey.startsWith("dl")) "deadlineAckDate" else "lastAckDate") as? String).orEmpty()
      val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
      // Moved to a later date or time on the web app (Move in the due alert, the entry form): the booked alarm is out of date.
      val dueDate = (call(snap, "get", "dueDate") as? String).orEmpty().trim()
      val dueTime = (call(snap, "get", "dueTime") as? String).orEmpty().trim()
      val movedLater = try {
        if (dueDate.isEmpty()) false else {
          val fmt = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US)
          val due = fmt.parse("$dueDate ${if (dueTime.matches(Regex("\\d{1,2}:\\d{2}"))) dueTime else "09:00"}")
          // Only the due moment and its nags follow the due date; a next-reminder or deadline alert is legitimately elsewhere.
          val dueKey = alertKey == "due" || alertKey.startsWith("nag-")
          dueKey && due != null && due.time > System.currentTimeMillis() + 90_000L
        }
      } catch (_: Throwable) { false }
      deleted || status.startsWith("complet") || status == "done" || snoozeUntil > System.currentTimeMillis() || ackDate == today || movedLater
    } catch (_: Throwable) {
      false
    }
  }

  /** Blocking: call off the main thread. True only when the web app's note says it is in use now. */
  fun inUseNow(ctx: Context, timeoutMs: Long = 4000L): Boolean {
    if (!enabled(ctx)) return false
    return try {
      val auth = static("com.google.firebase.auth.FirebaseAuth", "getInstance") ?: return false
      val user = call(auth, "getCurrentUser") ?: return false
      val uid = call(user, "getUid") as? String ?: return false
      val db = static("com.google.firebase.firestore.FirebaseFirestore", "getInstance") ?: return false
      val users = call(db, "collection", "users") ?: return false
      val meta = call(call(users, "document", uid) ?: return false, "collection", "meta") ?: return false
      val presence = call(meta, "document", "presence") ?: return false
      val server = Class.forName("com.google.firebase.firestore.Source").enumConstants?.firstOrNull { (it as Enum<*>).name == "SERVER" } ?: return false
      val task = call(presence, "get", server) as? Task<*> ?: return false
      val snap = Tasks.await(task, timeoutMs, TimeUnit.MILLISECONDS) ?: return false
      val at = (call(snap, "get", "webActiveAt") as? Number)?.toLong() ?: 0L
      val input = (call(snap, "get", "lastInputAt") as? Number)?.toLong() ?: 0L
      val now = System.currentTimeMillis()
      val until = activeUntil(at, input, now)
      if (until > 0L) AlarmStore.setWebActiveUntil(ctx, until)     // later alerts in the same window skip the read
      until > 0L
    } catch (_: Throwable) {
      false
    }
  }
}
