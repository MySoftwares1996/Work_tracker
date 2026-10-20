/**
 * Month-end due dates: "Month end -1" is the last working day of the month, "-2" the working day before it, and so on
 * (Sundays, holidays and leave days are not working days). Shared by the phone app and the website. Pure.
 */
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The last `count` working days of the month `month` (0-11) of `year`: [{ n: 1, key: 'YYYY-MM-DD' }, ...], latest first. `isOff(key)` says a day is not a working day. */
export function lastWorkingDays(year, month, isOff, count = 2) {
  const out = [];
  for (let day = new Date(year, month + 1, 0, 12); out.length < count && day.getMonth() === month; day = new Date(year, month, day.getDate() - 1, 12)) {
    const key = keyOf(day);
    if (day.getDay() !== 0 && !isOff(key)) out.push({ n: out.length + 1, key });
  }
  return out;
}

/**
 * The quick picks for the due date: this month's last working days; once they have all passed, next month's.
 * [{ n, key, label }] with label "Month end -1 · Fri 30 Oct".
 */
export function monthEndOptions(now = new Date(), isOff = () => false, count = 2) {
  const today = keyOf(now);
  let list = lastWorkingDays(now.getFullYear(), now.getMonth(), isOff, count);
  if (!list.length || list.every((x) => x.key < today)) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12);
    list = lastWorkingDays(next.getFullYear(), next.getMonth(), isOff, count);
  }
  return list.map((x) => ({ ...x, label: `Month end -${x.n} · ${new Date(`${x.key}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}` }));
}
