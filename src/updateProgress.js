/** Pure helpers for the phone's "updating" bar (PhoneUpdate.native.js): the clock and the estimated time left. */

/** 0:07, 1:05 ... from milliseconds. */
export const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Milliseconds left, from how far the download is (0..1) and how long it has run. Null while it is too early to say
 * (under 5% or the first 1.5 s) - the bar then just shows the elapsed time.
 */
export const estimateRemainingMs = (progress, elapsedMs) => {
  const p = Number(progress);
  if (!(p >= 0.05) || !(elapsedMs >= 1500)) return null;
  if (p >= 1) return 0;
  return Math.round((elapsedMs * (1 - p)) / p);
};

/** "about 8 s left", "about 1 min left", "almost done". */
export const fmtLeft = (ms) => {
  if (ms == null) return '';
  if (ms < 2000) return 'almost done';
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `about ${s} s left` : `about ${Math.ceil(s / 60)} min left`;
};
