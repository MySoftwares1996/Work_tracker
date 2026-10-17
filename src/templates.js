/**
 * Task templates: a task's usual fields saved once ("Month-end reconciliation": category, priority, notes, key points...),
 * then a new task starts from one in a tap. Dates are never part of a template.
 */
import { newId } from './ids';
// subCategory (its field labels, values blank) stays so a payment template keeps the Report format of its Sub Category.
const FIELDS = ['title', 'category', 'subCategory', 'priority', 'status', 'pendingWith', 'recurrence', 'recurrenceEveryMin', 'notes', 'alertMode', 'checklist'];
/** How many templates are kept (newest first). */
export const MAX_TEMPLATES = 30;

const clean = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/** A template from an entry or form draft; `name` defaults to its title. Key points keep their labels, not their values. */
export function templateFrom(entry, name) {
  const fields = {};
  FIELDS.forEach((k) => { if (entry[k] !== undefined && entry[k] !== null && entry[k] !== '') fields[k] = clean(entry[k]); });
  if (Array.isArray(entry.keyPoints)) fields.keyPoints = entry.keyPoints.map((kp) => (kp && typeof kp === 'object' ? { key: kp.key || '', value: '' } : kp)).filter((kp) => (typeof kp === 'string' ? kp.trim() : String(kp.key || '').trim()));
  if (entry.subCategoryFields && typeof entry.subCategoryFields === 'object') {
    fields.subCategoryFields = {};
    Object.keys(entry.subCategoryFields).forEach((k) => { fields.subCategoryFields[k] = ''; });
  }
  if (Array.isArray(fields.checklist)) fields.checklist = fields.checklist.map((c) => ({ ...c, done: false }));
  const label = String(name || entry.title || '').trim();
  return { id: newId('tpl-'), name: label || 'Template', fields };
}

/** The draft with the template's fields on top; the draft's own id, dates and mail chain stay. */
export function applyTemplate(draft, tpl) {
  return { ...draft, ...clean(tpl.fields || {}) };
}

/** Adds or replaces (same name) a template; newest first, at most MAX_TEMPLATES. */
export function saveTemplate(list = [], tpl) {
  const rest = list.filter((x) => String(x.name).toLowerCase() !== String(tpl.name).toLowerCase());
  return [tpl, ...rest].slice(0, MAX_TEMPLATES);
}
