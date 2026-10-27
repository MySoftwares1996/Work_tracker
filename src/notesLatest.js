// Notes written day by day ("[24-10-2026] ...", "[25-10-2026] ...") count for the report by their last day only.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A "[24-10-2026]" / "[24/10/26]" / "[24 Oct 2026]" stamp at the start of a line as a day number, or null. */
export function noteStampDay(line) {
  const m = String(line || '').match(/^\s*\[\s*(\d{1,2})[\s./-]+(\d{1,2}|[A-Za-z]{3,9})[\s./,-]+(\d{2}|\d{4})\b[^\]]*\]/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return null;
  return y * 10000 + mo * 100 + d;
}

/**
 * The notes of the last dated day only. A line with a stamp starts a day, lines after it belong to it. Notes with no
 * stamp are returned as they are; an older undated beginning is dropped once a dated day exists.
 */
export function latestDayNotes(notes) {
  const text = String(notes || '');
  const lines = text.split(/\r?\n/);
  const days = lines.map(noteStampDay);
  const latest = Math.max(-1, ...days.filter((d) => d !== null));
  if (latest < 0) return text;
  const keep = [];
  let on = false;
  lines.forEach((l, i) => {
    if (days[i] !== null) on = days[i] === latest;
    if (on) keep.push(l);
  });
  return keep.join('\n');
}
