/** Report points (see workingDashboardReport.js): { category, text } items; an older plain text has no category. Pure, no imports. */
export const normalizeReportPoints = (list) => (Array.isArray(list) ? list : [])
  .map((x) => (typeof x === 'string' ? { category: '', text: x } : { category: String((x && x.category) || '').trim(), text: String((x && x.text) || '') }))
  .map((x) => ({ category: x.category, text: x.text.replace(/\s+/g, ' ').trim() }))
  .filter((x) => x.text);
