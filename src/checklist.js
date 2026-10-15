/** A task's checklist: small steps ({ id, text, done }) ticked off before the task is done. */
const nid = () => `ck-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e5).toString(36)}`;

export const checklistOf = (e) => (Array.isArray(e && e.checklist) ? e.checklist.filter((c) => c && String(c.text || '').trim()) : []);
export const checklistProgress = (e) => { const l = checklistOf(e); return l.length ? { done: l.filter((c) => c.done).length, total: l.length } : null; };
/** "3/5", or '' when the task has no checklist. */
export const checklistText = (e) => { const p = checklistProgress(e); return p ? `${p.done}/${p.total}` : ''; };
/** The steps still open - what Done should warn about. */
export const checklistOpen = (e) => checklistOf(e).filter((c) => !c.done);

export const addStep = (list = [], text) => (String(text || '').trim() ? [...list, { id: nid(), text: String(text).trim(), done: false }] : list);
export const toggleStep = (list = [], id) => list.map((c) => (c.id === id ? { ...c, done: !c.done } : c));
export const removeStep = (list = [], id) => list.filter((c) => c.id !== id);
