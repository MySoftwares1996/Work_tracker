/**
 * The Back rule inside a tool, kept apart from React so it is tested (useStepBack.js uses it).
 *
 * Back used to replay every tab visited (up to 30), so after looking around a tool it took many presses to get
 * out. Now it is at most two: from any other tab Back goes to the tool's first tab, and from the first tab it
 * leaves the tool for Home.
 */
export function backTab(current, first) {
  return current !== first ? first : null;
}
