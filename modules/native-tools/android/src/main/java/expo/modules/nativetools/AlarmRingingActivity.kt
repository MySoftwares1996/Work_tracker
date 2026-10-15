package expo.modules.nativetools

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Rings a task alarm over the lock screen, on the system Alarm audio stream,
 * independently of whether the React Native JS layer has started yet - a
 * cold JS start can take a couple of seconds, too slow for the first instant
 * of an alarm. AlarmReceiver launches this through a full-screen-intent
 * notification, which is the one Android-sanctioned way to bring an Activity
 * to the foreground from the background: the OS promotes it straight to
 * here, full screen, when the device is locked or asleep.
 *
 * Every button below only stops the native ringing and hands off to
 * MainActivity with the chosen action as an intent extra - the real
 * Done/Ack/Snooze/recurrence logic stays in one place, the existing JS task
 * store (src/notify.js, src/TaskAlarmOverlay.js), instead of being
 * duplicated here in Kotlin. A plain "Open" tap does the same with no action,
 * which src/TaskAlarmOverlay.js treats as "show the ringing sheet".
 */
class AlarmRingingActivity : Activity() {
  private var mediaPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null

  companion object {
    const val EXTRA_TASK_ID = "taskId"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_ACTION = "alarmAction"
    /** An information alert (attendance: logged in, break, logged out): full screen, but no ringing. */
    const val EXTRA_QUIET = "quiet"
    private val VIBRATE_PATTERN = longArrayOf(0, 600, 400, 600, 400, 900)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    // A Working Dashboard task alert opens the app's own Past Due Alert, full screen: remarks, Mark done, Done + DAR,
    // Silence today, Skip, Snooze (any minutes), Move, status and repeat - everything the web alarm window offers.
    // The ringing service keeps sounding until an answer is given there. Other alarms (walk / water, to-dos) keep this
    // simple screen.
    if (intent.getStringExtra(EXTRA_TASK_ID)?.startsWith("wd:") == true && AlarmRingService.ringingTaskId != null) {
      val open = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        putExtra(EXTRA_TASK_ID, intent.getStringExtra(EXTRA_TASK_ID))
      }
      try { startActivity(open) } catch (_: Exception) {}
      finish()
      return
    }

    setContentView(buildLayout())
    // The ringing service plays the sound; this screen only plays it itself if the service could not start.
    if (AlarmRingService.ringingTaskId == null && !intent.getBooleanExtra(EXTRA_QUIET, false)) startAlarmAudioAndVibration()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }

  /** The look chosen in Config > Alerts > Alarm style (AlarmStyles.kt); every look has the same buttons. */
  private fun buildLayout(): android.view.View {
    val title = intent.getStringExtra(EXTRA_TITLE) ?: "Task due"
    val body = intent.getStringExtra(EXTRA_BODY) ?: ""
    val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: ""
    val act: (String?) -> Unit = { action -> finishWithAction(action) }
    return AlarmStyles.fill(AlarmStyles.build(this, AlarmStore.style(this), title, body, taskId, act), act)
  }

  private fun startAlarmAudioAndVibration() {
    val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

    try {
      mediaPlayer = MediaPlayer().apply {
        setDataSource(this@AlarmRingingActivity, alarmUri)
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM) // Overrides silent/DND the way a real alarm clock does.
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        isLooping = true
        prepare()
        start()
      }
    } catch (e: Exception) {
      // A missing/unreadable default alarm sound should never crash this
      // screen - the vibration is still there, and the JS side (src/alarm.js)
      // takes over ringing within a second or two of the app opening.
    }

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

  private fun stopAlarmAudioAndVibration() {
    mediaPlayer?.apply {
      try { if (isPlaying) stop() } catch (_: Exception) {}
      release()
    }
    mediaPlayer = null
    vibrator?.cancel()
  }

  /**
   * Stops native ringing, then hands off to MainActivity with the chosen
   * action (or none, for a plain "open"). Resolved by package name, like the
   * rest of this module's own notifications (TrackerService, NativeToolsModule),
   * rather than a compile-time reference to a class in the app's own package.
   */
  private fun finishWithAction(action: String?) {
    stopAlarmAudioAndVibration()
    val taskId = intent.getStringExtra(EXTRA_TASK_ID)
    AlarmRingService.answered(this, taskId)
    val open = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_TASK_ID, taskId)
      if (action != null) putExtra(EXTRA_ACTION, action)
    }
    try { startActivity(open) } catch (_: Exception) {}
    finish()
  }

  override fun onDestroy() {
    super.onDestroy()
    stopAlarmAudioAndVibration()
  }
}
