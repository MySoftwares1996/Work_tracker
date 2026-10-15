package expo.modules.nativetools

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The seven looks of the full-screen alarm, chosen in Config > Alerts > Alarm style (AlarmStore.style):
 * 1 Classic dark, 2 Red alert, 3 Light & clean, 4 Alarm clock, 5 Task card, 6 Big bottom buttons,
 * 7 Priority colour band. Every one offers the same buttons - Snooze 15m, Done, Done + DAR (a Working Dashboard
 * task only) and Open app - and each button calls `act` with what was pressed (null = just open the app).
 * fill() adds a strip of other snooze lengths (5m / 30m / 1h) under whichever style is chosen.
 *
 * Built in code like the rest of AlarmRingingActivity, so no layout resources are needed.
 */
object AlarmStyles {
  const val COUNT = 7

  private class Ctx(val a: Activity, val title: String, val name: String, val details: String, val isWd: Boolean, val act: (String?) -> Unit) {
    val d = a.resources.displayMetrics.density
    fun dp(v: Int) = (v * d).toInt()
    /** The task's priority colour, read from the alert title ("High priority due now"). */
    val priorityColor: Int = when {
      title.contains("High", true) -> Color.parseColor("#EF4444")
      title.contains("Medium", true) -> Color.parseColor("#F59E0B")
      title.contains("Low", true) -> Color.parseColor("#16A34A")
      else -> Color.parseColor("#EF4444")
    }
    val clock: String = SimpleDateFormat("h:mm", Locale.getDefault()).format(Date())
    val clockFull: String = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date())
  }

  fun build(a: Activity, style: Int, title: String, body: String, taskId: String, act: (String?) -> Unit): View {
    val lines = body.split("\n").map { it.trim() }.filter { it.isNotEmpty() }
    val c = Ctx(a, title, lines.firstOrNull() ?: "", lines.drop(1).joinToString("\n"), taskId.startsWith("wd:"), act)
    return when (style) {
      2 -> redAlert(c)
      3 -> lightClean(c)
      4 -> alarmClock(c)
      5 -> taskCard(c)
      6 -> bigBottom(c)
      7 -> priorityBand(c)
      else -> classic(c)
    }
  }

  /* ---------- building blocks ---------- */

  private fun bg(color: Int, radius: Float = 0f, stroke: Int? = null, c: Ctx? = null) = GradientDrawable().apply {
    setColor(color); cornerRadius = radius
    if (stroke != null && c != null) setStroke(c.dp(1), stroke)
  }

  private fun text(c: Ctx, s: String, size: Float, color: Int, bold: Boolean = false, center: Boolean = true, top: Int = 0) =
    TextView(c.a).apply {
      text = s; textSize = size; setTextColor(color)
      if (bold) typeface = Typeface.DEFAULT_BOLD
      gravity = if (center) Gravity.CENTER_HORIZONTAL else Gravity.START
      setPadding(0, c.dp(top), 0, 0)
    }

  private fun button(c: Ctx, label: String, action: String?, fill: Int, fg: Int, radius: Int = 10) = Button(c.a).apply {
    text = label; isAllCaps = false; textSize = 17f; setTextColor(fg)
    background = bg(fill, c.dp(radius).toFloat())
    minHeight = c.dp(52); stateListAnimator = null
    setOnClickListener { c.act(action) }
  }

  private fun lp(c: Ctx, w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.WRAP_CONTENT, top: Int = 0, weight: Float = 0f) =
    LinearLayout.LayoutParams(w, h, weight).apply { topMargin = c.dp(top) }

  private fun row(c: Ctx, vararg views: View, gap: Int = 10, top: Int = 10): LinearLayout = LinearLayout(c.a).apply {
    orientation = LinearLayout.HORIZONTAL
    layoutParams = lp(c, top = top)
    views.forEachIndexed { i, v -> addView(v, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { if (i > 0) leftMargin = c.dp(gap) }) }
  }

  private fun column(c: Ctx, color: Int, padH: Int = 28, gravity: Int = Gravity.CENTER) = LinearLayout(c.a).apply {
    orientation = LinearLayout.VERTICAL
    setBackgroundColor(color)
    this.gravity = gravity
    setPadding(c.dp(padH), c.dp(32), c.dp(padH), c.dp(32))
  }

  /** Done, Done + DAR (a task), Snooze 15m and Open app as a 2 x 2 grid (Done and Snooze side by side without DAR). */
  private fun grid(c: Ctx, done: Button, dar: Button, snooze: Button, open: Button, gap: Int = 10): LinearLayout = LinearLayout(c.a).apply {
    orientation = LinearLayout.VERTICAL
    if (c.isWd) {
      addView(row(c, done, dar, gap = gap, top = 0))
      addView(row(c, snooze, open, gap = gap, top = gap))
    } else {
      addView(row(c, done, snooze, gap = gap, top = 0))
      addView(open, lp(c, top = gap))
    }
  }

  /* ---------- the seven styles ---------- */

  /** 1 · Classic dark: the plain alarm-clock screen. */
  private fun classic(c: Ctx): View = column(c, Color.parseColor("#0B1220")).apply {
    addView(text(c, "🚨 ${c.title}", 26f, Color.WHITE))
    addView(text(c, c.name, 18f, Color.LTGRAY, top = 12))
    if (c.details.isNotEmpty()) addView(text(c, c.details, 13f, Color.parseColor("#9AA1AB"), top = 4))
    val grey = Color.parseColor("#5C5D60"); val fg = Color.parseColor("#ECEFF1")
    addView(row(c, button(c, "Snooze 15m", "SNOOZE", grey, fg), button(c, "Done", "DONE", grey, fg), top = 36))
    if (c.isWd) addView(button(c, "Done + DAR", "DAR", grey, fg), lp(c, top = 12))
    addView(button(c, "Open app", null, grey, fg), lp(c, top = 12))
  }

  /** 2 · Red alert: red gradient, big siren, a white Done that stands out. */
  private fun redAlert(c: Ctx): View = column(c, Color.TRANSPARENT).apply {
    background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.parseColor("#DC2626"), Color.parseColor("#7F1D1D")))
    addView(text(c, "🚨", 56f, Color.WHITE))
    addView(text(c, c.title.uppercase(Locale.getDefault()), 13f, Color.parseColor("#FEE2E2"), bold = true, top = 6))
    addView(text(c, c.name, 23f, Color.WHITE, bold = true, top = 10))
    if (c.details.isNotEmpty()) addView(text(c, c.details, 13f, Color.parseColor("#FECACA"), top = 6))
    val glass = Color.parseColor("#33FFFFFF")
    addView(button(c, "✓ Done", "DONE", Color.WHITE, Color.parseColor("#B91C1C")), lp(c, top = 32))
    if (c.isWd) addView(button(c, "✓ Done + DAR", "DAR", glass, Color.WHITE), lp(c, top = 10))
    addView(row(c, button(c, "💤 15m", "SNOOZE", glass, Color.WHITE), button(c, "Open", null, glass, Color.WHITE)))
  }

  /** 3 · Light & clean: white screen, a soft clock badge, green Done. */
  private fun lightClean(c: Ctx): View = column(c, Color.parseColor("#F8FAFC")).apply {
    addView(TextView(c.a).apply {
      text = "⏰"; textSize = 30f; gravity = Gravity.CENTER
      background = bg(Color.parseColor("#FEE2E2"), c.dp(36).toFloat())
    }, LinearLayout.LayoutParams(c.dp(72), c.dp(72)).apply { gravity = Gravity.CENTER_HORIZONTAL })
    addView(text(c, "${c.title.uppercase(Locale.getDefault())} · ${c.clockFull}", 12f, Color.parseColor("#DC2626"), bold = true, top = 14))
    addView(text(c, c.name, 22f, Color.parseColor("#0F172A"), bold = true, top = 8))
    if (c.details.isNotEmpty()) addView(text(c, c.details, 13f, Color.parseColor("#64748B"), top = 6))
    val green = Color.parseColor("#16A34A"); val pale = Color.parseColor("#DCFCE7"); val grey = Color.parseColor("#E2E8F0"); val ink = Color.parseColor("#0F172A")
    addView(button(c, "Done", "DONE", green, Color.WHITE), lp(c, top = 30))
    if (c.isWd) addView(button(c, "Done + DAR", "DAR", pale, Color.parseColor("#166534")), lp(c, top = 10))
    addView(row(c, button(c, "Snooze 15m", "SNOOZE", grey, ink), button(c, "Open app", null, grey, ink)))
  }

  /** 4 · Alarm clock: the time large, round buttons at the bottom. */
  private fun alarmClock(c: Ctx): View = LinearLayout(c.a).apply {
    orientation = LinearLayout.VERTICAL
    setBackgroundColor(Color.parseColor("#111827"))
    setPadding(c.dp(24), c.dp(64), c.dp(24), c.dp(40))
    addView(text(c, c.clock, 72f, Color.WHITE).apply { typeface = Typeface.create("sans-serif-thin", Typeface.NORMAL) })
    addView(text(c, c.title.uppercase(Locale.getDefault()), 13f, Color.parseColor("#F87171"), bold = true, top = 4))
    addView(text(c, c.name, 19f, Color.parseColor("#E5E7EB"), top = 12))
    if (c.details.isNotEmpty()) addView(text(c, c.details, 13f, Color.parseColor("#9CA3AF"), top = 4))
    addView(View(c.a), LinearLayout.LayoutParams(1, 0, 1f))       // pushes the buttons to the bottom
    val round = { label: String, caption: String, action: String?, color: Int ->
      LinearLayout(c.a).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
        addView(Button(c.a).apply {
          text = label; isAllCaps = false; textSize = if (label.length > 2) 16f else 26f; setTextColor(Color.WHITE)
          background = bg(color, c.dp(44).toFloat()); stateListAnimator = null
          setOnClickListener { c.act(action) }
        }, LinearLayout.LayoutParams(c.dp(84), c.dp(84)))
        addView(text(c, caption, 13f, Color.parseColor("#D1D5DB"), top = 6))
      }
    }
    val buttons = mutableListOf(round("💤", "Snooze 15m", "SNOOZE", Color.parseColor("#374151")), round("✓", "Done", "DONE", Color.parseColor("#16A34A")))
    if (c.isWd) buttons.add(round("DAR", "Done + DAR", "DAR", Color.parseColor("#2563EB")))
    addView(row(c, *buttons.toTypedArray(), gap = 4, top = 0))
    addView(text(c, "Open app ›", 15f, Color.parseColor("#9CA3AF"), top = 18).apply { setOnClickListener { c.act(null) } })
  }

  /** 5 · Task card: a white card with the task and its buttons on a dark screen. */
  private fun taskCard(c: Ctx): View = column(c, Color.parseColor("#0F172A"), padH = 18).apply {
    addView(text(c, "🚨 ALARM · ${c.clockFull}", 14f, Color.parseColor("#FCA5A5"), bold = true))
    val card = LinearLayout(c.a).apply {
      orientation = LinearLayout.HORIZONTAL
      background = bg(Color.WHITE, c.dp(18).toFloat())
      clipToOutline = true
    }
    card.addView(View(c.a).apply { setBackgroundColor(c.priorityColor) }, LinearLayout.LayoutParams(c.dp(6), ViewGroup.LayoutParams.MATCH_PARENT))
    val inner = LinearLayout(c.a).apply { orientation = LinearLayout.VERTICAL; setPadding(c.dp(18), c.dp(18), c.dp(18), c.dp(18)) }
    inner.addView(text(c, c.title, 13f, c.priorityColor, bold = true, center = false))
    inner.addView(text(c, c.name, 20f, Color.parseColor("#0F172A"), bold = true, center = false, top = 6))
    if (c.details.isNotEmpty()) inner.addView(text(c, c.details, 13f, Color.parseColor("#64748B"), center = false, top = 4))
    val green = Color.parseColor("#16A34A"); val pale = Color.parseColor("#DCFCE7"); val grey = Color.parseColor("#E2E8F0"); val ink = Color.parseColor("#0F172A")
    inner.addView(grid(c, button(c, "Done", "DONE", green, Color.WHITE), button(c, "+ DAR", "DAR", pale, Color.parseColor("#166534")),
      button(c, "Snooze 15m", "SNOOZE", grey, ink), button(c, "Open", null, grey, ink)), lp(c, top = 16))
    card.addView(inner, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    addView(card, lp(c, top = 14))
  }

  /** 6 · Big bottom buttons: the task large at the top, four big buttons filling the bottom. */
  private fun bigBottom(c: Ctx): View = LinearLayout(c.a).apply {
    orientation = LinearLayout.VERTICAL
    setBackgroundColor(Color.parseColor("#1E1B4B"))
    val top = LinearLayout(c.a).apply { orientation = LinearLayout.VERTICAL; setPadding(c.dp(26), c.dp(90), c.dp(26), 0) }
    top.addView(text(c, "⚠ ${c.title.uppercase(Locale.getDefault())}", 13f, Color.parseColor("#FBBF24"), bold = true, center = false))
    top.addView(text(c, c.name, 28f, Color.WHITE, bold = true, center = false, top = 10))
    top.addView(text(c, listOf(c.clockFull, c.details).filter { it.isNotEmpty() }.joinToString("\n"), 14f, Color.parseColor("#C7D2FE"), center = false, top = 10))
    addView(top, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    val tall = { label: String, action: String?, color: Int -> button(c, label, action, color, Color.WHITE, radius = 0).apply { minHeight = c.dp(96) } }
    addView(grid(c, tall("✓ Done", "DONE", Color.parseColor("#16A34A")), tall("✓ Done + DAR", "DAR", Color.parseColor("#2563EB")),
      tall("💤 Snooze 15m", "SNOOZE", Color.parseColor("#3730A3")), tall("↗ Open app", null, Color.parseColor("#3730A3")), gap = 1))
  }

  /** 7 · Priority colour band: a band in the task's priority colour, the task and buttons on white below. */
  private fun priorityBand(c: Ctx): View = LinearLayout(c.a).apply {
    orientation = LinearLayout.VERTICAL
    setBackgroundColor(Color.WHITE)
    val band = LinearLayout(c.a).apply {
      orientation = LinearLayout.VERTICAL; setBackgroundColor(c.priorityColor)
      setPadding(c.dp(24), c.dp(56), c.dp(24), c.dp(26))
    }
    band.addView(text(c, "🚨 ${c.title.substringBefore(" due").uppercase(Locale.getDefault())}", 13f, Color.WHITE, bold = true, center = false))
    band.addView(text(c, c.title.substringAfter("priority ", c.title).replaceFirstChar { it.uppercase() }, 32f, Color.WHITE, center = false, top = 2).apply { typeface = Typeface.create("sans-serif-light", Typeface.NORMAL) })
    addView(band)
    val body = LinearLayout(c.a).apply { orientation = LinearLayout.VERTICAL; setPadding(c.dp(24), c.dp(24), c.dp(24), c.dp(24)) }
    body.addView(text(c, c.name, 22f, Color.parseColor("#111827"), bold = true, center = false))
    if (c.details.isNotEmpty()) body.addView(text(c, c.details, 13f, Color.parseColor("#6B7280"), center = false, top = 6))
    val green = Color.parseColor("#16A34A"); val pale = Color.parseColor("#DCFCE7"); val grey = Color.parseColor("#F3F4F6"); val ink = Color.parseColor("#111827")
    body.addView(grid(c, button(c, "Done", "DONE", green, Color.WHITE), button(c, "Done + DAR", "DAR", pale, Color.parseColor("#166534")),
      button(c, "Snooze 15m", "SNOOZE", grey, ink), button(c, "Open app", null, grey, ink)), lp(c, top = 24))
    addView(body)
  }

  /** Snooze lengths offered under every style besides its own Snooze 15m button: action "SNOOZE:<minutes>". */
  val SNOOZE_CHOICES = intArrayOf(5, 30, 60)

  fun snoozeLabel(min: Int): String = if (min % 60 == 0) "${min / 60}h" else "${min}m"

  /**
   * Wraps a style so it fills the screen (used by AlarmRingingActivity), with a strip along the bottom for the
   * other snooze lengths: "Snooze for  5m · 30m · 1h".
   */
  fun fill(view: View, act: (String?) -> Unit): View {
    val a = view.context
    val d = a.resources.displayMetrics.density
    fun dp(v: Int) = (v * d).toInt()
    val strip = LinearLayout(a).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setBackgroundColor(Color.parseColor("#111827"))
      setPadding(dp(14), dp(10), dp(14), dp(14))
      addView(TextView(a).apply { text = "Snooze for"; textSize = 14f; setTextColor(Color.parseColor("#9CA3AF")) },
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(6) })
      for (min in SNOOZE_CHOICES) {
        addView(Button(a).apply {
          text = "💤 " + snoozeLabel(min); isAllCaps = false; textSize = 15f; setTextColor(Color.WHITE)
          background = GradientDrawable().apply { setColor(Color.parseColor("#374151")); cornerRadius = dp(10).toFloat() }
          minHeight = dp(44); stateListAnimator = null
          setOnClickListener { act("SNOOZE:$min") }
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = dp(8) })
      }
    }
    return LinearLayout(a).apply {
      orientation = LinearLayout.VERTICAL
      addView(view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
      addView(strip, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
  }
}
