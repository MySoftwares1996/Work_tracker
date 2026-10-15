/**
 * Whether a finished horizontal drag should change tab, and to which.
 *
 * A swipe counts when it travels far enough, or is flicked fast enough, and
 * is clearly horizontal - so scrolling a list up or down never switches tabs.
 * Swiping left moves to the next tab, right to the previous one; at either
 * end nothing happens. Returns the new tab key, or null.
 */
export const SWIPE_DISTANCE = 60;   // px
export const SWIPE_VELOCITY = 0.5;  // px/ms
export const START_DISTANCE = 24;   // px before a drag is treated as a swipe at all

/** Should a drag in progress be claimed as a tab swipe? */
export function isHorizontalDrag(dx, dy) {
  return Math.abs(dx) > START_DISTANCE && Math.abs(dx) > Math.abs(dy) * 2;
}

export function tabAfterSwipe(tabs, current, dx, dy = 0, vx = 0) {
  const i = tabs.indexOf(current);
  if (i < 0) return null;
  if (Math.abs(dy) > Math.abs(dx)) return null;                 // mostly vertical
  const left = dx <= -SWIPE_DISTANCE || (dx < 0 && vx <= -SWIPE_VELOCITY);
  const right = dx >= SWIPE_DISTANCE || (dx > 0 && vx >= SWIPE_VELOCITY);
  if (left && i < tabs.length - 1) return tabs[i + 1];
  if (right && i > 0) return tabs[i - 1];
  return null;
}
