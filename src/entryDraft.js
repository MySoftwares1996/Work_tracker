/**
 * The phone's New entry form keeps what was typed, so a closed form or a killed app does not lose it. The next New entry opens with it
 * again; only Reset (or saving the entry) clears it. The website does the same in newweb/src/entryDraft.js.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'MPT_WD_ENTRY_DRAFT';
// Typed or picked by the person; ids, stamps and the form's helper state are not kept.
const FIELDS = ['title', 'category', 'subCategory', 'subCategoryFields', 'priority', 'status', 'pendingWith', 'reference', 'recurrence', 'recurrenceEveryMin', 'dueAt', 'deadlineAt', 'nextReminderAt', 'notes', 'alertMode', 'checklist', 'filesNotRequired', 'dar'];

/** The part of a form worth keeping. */
export const draftOf = (entry) => {
  const d = {};
  FIELDS.forEach((k) => { if (entry && entry[k] !== undefined) d[k] = entry[k]; });
  return d;
};

/** True when the form still equals the blank one (nothing typed), so there is no draft to keep. */
export const sameAsBlank = (entry, blank) => JSON.stringify(draftOf(entry)) === JSON.stringify(draftOf(blank));

/** A blank entry with the draft's fields put back (keeps the blank's new id and stamps). */
export const applyDraft = (blank, draft) => (draft && typeof draft === 'object' ? { ...blank, ...draftOf(draft) } : blank);

export async function loadEntryDraft() {
  try { const d = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null'); return d && typeof d === 'object' ? d : null; } catch { return null; }
}
export async function saveEntryDraft(entry, blank) {
  try { if (sameAsBlank(entry, blank)) await AsyncStorage.removeItem(KEY); else await AsyncStorage.setItem(KEY, JSON.stringify(draftOf(entry))); } catch { /* the draft just is not kept */ }
}
export async function clearEntryDraft() { try { await AsyncStorage.removeItem(KEY); } catch { /* nothing to clear */ } }
