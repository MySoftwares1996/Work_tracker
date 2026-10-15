/**
 * Narrations copied for Tally: the last 30 are kept, and any can be starred to stay. Recorded wherever a narration is
 * copied (a card, the form, the Narration tab) through one sink the dashboard registers.
 */
let sink = null;
export const setNarrationSink = (fn) => { sink = fn; };
export const recordNarration = (text, typeName = '') => { if (sink && String(text || '').trim()) sink(String(text), typeName); };

const MAX = 30;
/** Newest first; the same text moves to the top (keeping its star) instead of repeating. Stars are never pushed out. */
export function addHistory(list = [], text, typeName = '', now = Date.now()) {
  const t = String(text || '').trim();
  if (!t) return list;
  const same = list.find((x) => x.text === t);
  const entry = { id: same ? same.id : `nh-${now.toString(36)}`, text: t, typeName: typeName || (same && same.typeName) || '', at: now, fav: !!(same && same.fav) };
  const rest = list.filter((x) => x.text !== t);
  const all = [entry, ...rest];
  const keep = all.filter((x, i) => x.fav || i < MAX);
  return keep;
}
export const toggleFav = (list = [], id) => list.map((x) => (x.id === id ? { ...x, fav: !x.fav } : x));
export const removeHistory = (list = [], id) => list.filter((x) => x.id !== id);
