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
