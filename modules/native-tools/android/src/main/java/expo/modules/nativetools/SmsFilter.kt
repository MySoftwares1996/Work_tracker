package expo.modules.nativetools

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager

/**
 * Coarse pre-filter run in the background service, so OTP floods and adverts
 * never reach the queue.
 *
 * It is deliberately LOOSER than the JavaScript parser. A message wrongly let
 * through here is dropped a moment later by the tested JS parser; a message
 * wrongly rejected here is lost for good. So this only removes what is
 * unambiguously not a transaction.
 */
object SmsFilter {

  fun canRead(context: Context): Boolean =
    context.checkSelfPermission(Manifest.permission.READ_SMS) ==
      PackageManager.PERMISSION_GRANTED

  /**
   * A message that carries a one-time code. Matching the bare word "otp" was
   * wrong: banks append "Never share your OTP, PIN or CVV" to real credit and
   * debit alerts, and those were being discarded.
   */
  private val OTP_MESSAGE = Regex(
    """\b\d{4,8}\b\s+is\s+(?:your|the)\s+(?:otp|one[\s-]?time[\s-]?password|verification\s+code)""" +
      """|\b(?:otp|one[\s-]?time[\s-]?password|verification\s+code)\s*(?:is|:|-)\s*\d{4,8}\b""",
    RegexOption.IGNORE_CASE
  )

  /** Whole words, so "Sent Rs.500" (Bank A's UPI template) qualifies. */
  private val TRANSACTIONAL = Regex(
    """\b(?:debited|credited|spent|paid|sent|received|withdrawn|deposited|transferred|purchase|txn|debit|credit)\b""" +
      """|\busing (?:your|the) [a-z ]{0,30}card\b""",
    RegexOption.IGNORE_CASE
  )

  private val PROMOTIONAL = listOf(
    "pre-approved", "pre approved", "preapproved", "loan approved", "loan offer",
    "personal loan", "instant loan", "eligible for", "apply now", "offer expires",
    "credit card limit", "limit upgrade", "increase your limit", "cashback offer",
    "lowest interest", "interest rate starting", "emi starting", "click here",
    "t&c apply", "terms and conditions apply", "unsubscribe", "sale is live",
    "book now", "congratulations you", "you have won", "claim your",
    "download the app", "refer and earn", "win upto", "flat off",
    // Bills and dues quote an amount and may say "paid", but nothing has moved.
    "is overdue", "please pay", "kindly pay", "ignore if already paid", "if already paid",
    "will be discontinued", "will be disconnected", "will be suspended", "minimum amount due",
    "min amt due", "total amount due", "payment due", "pay now"
  )

  /**
   * No currency gate: Bank C's UPI template is "debited by 250.0" with no Rs, INR
   * or ₹ anywhere, and requiring one silently dropped every such message.
   * A digit is enough at this stage.
   */
  private val HAS_NUMBER = Regex("""\d""")

  fun isTransactional(bodyRaw: String?): Boolean {
    if (bodyRaw.isNullOrBlank()) return false
    val body = bodyRaw.lowercase()
    if (OTP_MESSAGE.containsMatchIn(body)) return false
    if (PROMOTIONAL.any { body.contains(it) }) return false
    if (!TRANSACTIONAL.containsMatchIn(body)) return false
    return HAS_NUMBER.containsMatchIn(body)
  }
}
