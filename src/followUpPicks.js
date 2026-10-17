/** Quick picks for the next bank follow-up date. Pure, no imports (the website imports it directly; re-exported by bankFollowUp.js). */
const s = (v) => String(v === undefined || v === null ? '' : v);
const p2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/**
 * Quick picks for the next follow-up date: Tomorrow, In 2 days, In 3 days, Next week. `isOff(YYYY-MM-DD)` says whether a day is
 * closed (Sunday / holiday / leave day); a pick that lands on one moves forward to the next working day.
 * Returns [{ label, key: 'YYYY-MM-DD' }].
 */
export function followUpPicks(now = new Date(), isOff = (k) => new Date(`${k}T12:00:00`).getDay() === 0) {
  const make = (label, days) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12);
    for (let i = 0; i < 60 && isOff(dayKey(d)); i++) d.setDate(d.getDate() + 1);
    return { label, key: dayKey(d) };
  };
  return [make('Tomorrow', 1), make('In 2 days', 2), make('In 3 days', 3), make('Next week', 7)];
}

/** The ISO date for a pick `key` (YYYY-MM-DD), keeping the time of the `current` next-follow-up (10:00 when none). */
export function applyFollowUpPick(current, key) {
  const cur = current ? new Date(current) : null;
  const ok = cur && !Number.isNaN(cur.getTime());
  const [y, m, d] = s(key).split('-').map(Number);
  return new Date(y, m - 1, d, ok ? cur.getHours() : 10, ok ? cur.getMinutes() : 0, 0, 0).toISOString();
}
