/**
 * Task templates: a task's usual fields saved once ("Month-end reconciliation": category, priority, notes, key points...),
 * then a new task starts from one in a tap. Dates are never part of a template.
 */
const FIELDS = ['title', 'category', 'priority', 'status', 'pendingWith', 'recurrence', 'recurrenceEveryMin', 'notes', 'alertMode', 'checklist'];

const clean = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/** A template from an entry or form draft; `name` defaults to its title. Key points keep their labels, not their values. */
export function templateFrom(entry, name) {
  const fields = {};
  FIELDS.forEach((k) => { if (entry[k] !== undefined && entry[k] !== null && entry[k] !== '') fields[k] = clean(entry[k]); });
  if (Array.isArray(entry.keyPoints)) fields.keyPoints = entry.keyPoints.map((kp) => (kp && typeof kp === 'object' ? { key: kp.key || '', value: '' } : kp)).filter((kp) => (typeof kp === 'string' ? kp.trim() : String(kp.key || '').trim()));
  if (Array.isArray(fields.checklist)) fields.checklist = fields.checklist.map((c) => ({ ...c, done: false }));
  const label = String(name || entry.title || '').trim();
  return { id: `tpl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`, name: label || 'Template', fields };
}

/** The draft with the template's fields on top; the draft's own id, dates and mail chain stay. */
export function applyTemplate(draft, tpl) {
  return { ...draft, ...clean(tpl.fields || {}) };
}

/** Adds or replaces (same name) a template; newest first, at most 30. */
export function saveTemplate(list = [], tpl) {
  const rest = list.filter((x) => String(x.name).toLowerCase() !== String(tpl.name).toLowerCase());
  return [tpl, ...rest].slice(0, 30);
}
