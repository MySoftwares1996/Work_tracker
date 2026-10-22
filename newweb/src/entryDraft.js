// The New entry form keeps what was typed on this device, so a refresh, a closed tab or a closed form does not lose it.
// Only "Reset" in the form (or a saved entry) clears it.
const KEY = 'wd-entry-draft';

const strip = ({ id, due, nextReminder, ...rest }) => rest;

/** The saved draft as { t, date, time, remDate, remTime }, or null. */
export function loadDraft() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && d.t && typeof d.t === 'object' ? d : null; } catch { return null; }
}

/** Keep the form as it is now; a form equal to the blank one removes the draft. */
export function saveDraft(blank, t, parts) {
  try {
    const same = JSON.stringify(strip(t)) === JSON.stringify(strip(blank)) && !Object.values(parts).some(Boolean);
    if (same) localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify({ t: strip(t), ...parts }));
  } catch { /* the draft just is not kept */ }
}

export function clearDraft() { try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ } }

/** A blank task with the draft's fields put back (a new id and no dates: those come from the date / time boxes). */
export const withDraft = (initial, d) => (d ? { ...initial, ...d.t, id: initial.id, due: initial.due, nextReminder: null } : initial);
