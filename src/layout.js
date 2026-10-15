/*
 * One layout for every screen size. The width decides it, so the same screens fit a phone, a tablet and a
 * desktop browser without a second UI:
 *   phone  (< 600)  - two cards a row, the tab bar floating at the foot (as before)
 *   tablet (600+)   - three cards a row, sheets open as centred dialogs, the content stops at a readable width
 *   wide   (900+)   - four cards a row, and the tabs move to a side bar on the left
 */
export const TABLET_MIN = 600;
export const WIDE_MIN = 900;
export const SIDE_BAR_WIDTH = 220;
export const CONTENT_MAX_WIDTH = 1180;
/** The layout for a window `width` points wide. Pure, so the breakpoints are unit tested. */
export function layoutFor(width) {
  const wide = width >= WIDE_MIN;
  const tablet = width >= TABLET_MIN;
  return { width, wide, tablet, columns: wide ? 4 : tablet ? 3 : 2, sideBar: wide ? SIDE_BAR_WIDTH : 0 };
}
