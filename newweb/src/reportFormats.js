import { removedFormat } from '../../src/reportFormats.js';
export * from '../../src/reportFormats.js';

const sameName = (a, b) => String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') === String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The saved formats after one Sub Category's format is saved (template text) or removed (empty text). `saved` is the raw saved list, markers
 * included. A removal writes the same marker as the phone (removedFormat), so effectiveFormats keeps that sample out; saving a format replaces
 * the Sub Category's old entry or marker. Every other saved entry, markers too, is kept.
 */
export function formatsAfterEdit(saved, { id = '', subCategory, category = '' }, template = '', now = Date.now()) {
  const list = (Array.isArray(saved) ? saved : []).filter((f) => f && !(sameName(f.subCategory, subCategory) || (id && f.id === id)));
  const text = String(template || '').trim();
  return [...list, text ? { id: id || `rf-${now.toString(36)}`, category, subCategory, template: text } : removedFormat(subCategory, category)];
}

const BACKUP_KIND = 'working-dashboard-report-formats';

/** A restorable backup of the formats (JSON text): every current format with its Sub Category, Category and sentence. */
export function formatsBackupText(formats = [], now = new Date()) {
  const list = (formats || []).filter((f) => f && String(f.template || '').trim())
    .map((f) => ({ id: f.id || '', category: f.category || '', subCategory: f.subCategory || '', template: String(f.template).trim() }));
  return JSON.stringify({ kind: BACKUP_KIND, version: 1, savedAt: now.toISOString(), formats: list }, null, 2);
}

/**
 * Restoring a backup file onto the saved list: each format in the file is saved for its Sub Category (replacing that Sub Category's
 * current one); every other saved format is kept. { saved, count } or { error }.
 */
export function planFormatsRestore(saved, text, now = Date.now()) {
  let data;
  try { data = JSON.parse(String(text || '')); } catch { return { error: 'That file is not a report formats backup.' }; }
  if (!data || data.kind !== BACKUP_KIND || !Array.isArray(data.formats)) return { error: 'That file is not a report formats backup.' };
  const items = data.formats.filter((f) => f && String(f.subCategory || '').trim() && String(f.template || '').trim());
  if (!items.length) return { error: 'The backup holds no report formats.' };
  let next = Array.isArray(saved) ? saved : [];
  items.forEach((f, i) => { next = formatsAfterEdit(next, { id: f.id || '', subCategory: String(f.subCategory).trim(), category: f.category || '' }, f.template, now + i); });
  return { saved: next, count: items.length };
}
