/**
 * App lock decisions, kept pure so they are tested.
 *
 *  'open'   - show the app (nobody named yet: onboarding runs first)
 *  'setup'  - a name is set but no lock yet: create a PIN (and biometric)
 *             before anything else is shown. Also covers a restored backup
 *             that says the lock is on while this phone has no PIN.
 *  'locked' - ask for the PIN / biometric
 *
 * Once someone finishes setup and later turns the lock off in Settings,
 * `setupDone` keeps them from being sent through setup again.
 */
export function lockPhase({ named, enabled, setupDone, hasPin }) {
  if (!named) return 'open';
  if (enabled && hasPin) return 'locked';
  if (enabled && !hasPin) return 'setup';
  return setupDone ? 'open' : 'setup';
}

/** Re-lock after this long in the background - long enough for a file picker or the camera. */
export const RELOCK_AFTER_MS = 30 * 1000;
export const shouldRelock = (leftAt, now = Date.now(), graceMs = RELOCK_AFTER_MS) => !!leftAt && now - leftAt >= graceMs;

export const PIN_MIN = 4;
export const PIN_MAX = 6;
export const isValidPin = (pin) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(String(pin || ''));

/** After 5 wrong PINs in a row, wait 30 s per further miss (up to 5 min). */
export function lockoutMs(wrongInARow) {
  if (wrongInARow < 5) return 0;
  return Math.min(5 * 60 * 1000, (wrongInARow - 4) * 30 * 1000);
}
