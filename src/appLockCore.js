/**
 * App lock decisions, kept pure so they are tested.
 *
 *  'open'   - show the app (the lock is off)
 *  'setup'  - the lock was switched on but this phone has no PIN yet (also a
 *             restored backup that says the lock is on): create a PIN (and
 *             biometric) before anything else is shown.
 *  'locked' - ask for the PIN / biometric
 *
 */
export function lockPhase({ enabled, hasPin }) {
  // The lock is opt-in (More > App lock): nobody is sent through setup just for opening the app.
  if (enabled && hasPin) return 'locked';
  if (enabled && !hasPin) return 'setup';
  return 'open';
}

/** Re-lock after this long in the background - long enough for a file picker or the camera. */
export const RELOCK_AFTER_MS = 30 * 1000;
export const shouldRelock = (leftAt, now = Date.now(), graceMs = RELOCK_AFTER_MS) => !!leftAt && now - leftAt >= graceMs;

export const PIN_MIN = 4;
export const PIN_MAX = 6;

/** After 5 wrong PINs in a row, wait 30 s per further miss (up to 5 min). */
export function lockoutMs(wrongInARow) {
  if (wrongInARow < 5) return 0;
  return Math.min(5 * 60 * 1000, (wrongInARow - 4) * 30 * 1000);
}
