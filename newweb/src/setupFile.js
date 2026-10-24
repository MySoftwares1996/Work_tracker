import { addOption, normalizeSubCategories, saveTemplate } from './data.js';
import { formatsAfterEdit } from './reportFormats.js';
import { normalizeReportPoints } from '../../src/reportPoints.js';

/**
 * A "setup file": the lists a person built (Categories, Priorities, Statuses, Pending with, Sub Categories with their fields, Report points,
 * Next reminder categories), their report formats and templates - no tasks. Download it from one account and load it into another (a new
 * account starts empty). Loading only ADDS what is missing; nothing the account already has is replaced or removed.
 */
const KIND = 'working-dashboard-setup';
const LIST_KEYS = ['categories', 'priorities', 'statuses', 'pendingWith'];
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export function setupText({ lists = {}, savedFormats = [], templates = [] } = {}, now = new Date()) {
  const out = { kind: KIND, version: 1, savedAt: now.toISOString(), lists: {}, reportFormats: [], templates: [] };
  LIST_KEYS.forEach((k) => { out.lists[k] = (lists[k] || []).map(String); });
  out.lists.subCategories = normalizeSubCategories(lists.subCategories || []);
  out.lists.subCategoryCategories = Array.isArray(lists.subCategoryCategories) ? lists.subCategoryCategories.map(String) : undefined;
  out.lists.reminderCategories = Array.isArray(lists.reminderCategories) ? lists.reminderCategories.map(String) : undefined;
  out.lists.darPaymentIntro = normalizeReportPoints(lists.darPaymentIntro);
  out.reportFormats = (savedFormats || []).filter((f) => f && String(f.template || '').trim()).map((f) => ({ id: f.id || '', category: f.category || '', subCategory: f.subCategory || '', template: String(f.template).trim() }));
  out.templates = (templates || []).filter((x) => x && x.name && x.fields);
  return JSON.stringify(out, null, 2);
}

/** What loading `text` onto the account would add: { lists, formats, templates, counts } or { error }. Nothing is replaced. */
export function planSetupLoad({ lists = {}, savedFormats = [], templates = [] } = {}, text, now = Date.now()) {
  let data;
  try { data = JSON.parse(String(text || '')); } catch { return { error: 'That file is not a setup file.' }; }
  if (!data || data.kind !== KIND || !data.lists || typeof data.lists !== 'object') return { error: 'That file is not a setup file.' };
  const counts = { options: 0, subCategories: 0, points: 0, formats: 0, templates: 0 };
  const next = { ...lists };
  LIST_KEYS.forEach((k) => {
    let cur = Array.isArray(next[k]) ? next[k] : [];
    (Array.isArray(data.lists[k]) ? data.lists[k] : []).forEach((v) => { const n = addOption(cur, v); if (n !== cur) { cur = n; counts.options++; } });
    next[k] = cur;
  });
  const haveSubs = normalizeSubCategories(next.subCategories || []);
  const add = normalizeSubCategories(data.lists.subCategories || []).filter((sc) => !haveSubs.some((x) => sameName(x.name, sc.name)));
  next.subCategories = [...haveSubs, ...add];
  counts.subCategories = add.length;
  const union = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : []).map(String)])];
  if (Array.isArray(data.lists.subCategoryCategories)) next.subCategoryCategories = union(next.subCategoryCategories, data.lists.subCategoryCategories);
  if (Array.isArray(data.lists.reminderCategories)) next.reminderCategories = union(next.reminderCategories, data.lists.reminderCategories);
  const havePts = normalizeReportPoints(next.darPaymentIntro);
  const newPts = normalizeReportPoints(data.lists.darPaymentIntro).filter((p) => p.category && !havePts.some((x) => x.category === p.category && x.text === p.text));
  next.darPaymentIntro = [...havePts, ...newPts];
  counts.points = newPts.length;
  let formats = Array.isArray(savedFormats) ? savedFormats : [];
  (Array.isArray(data.reportFormats) ? data.reportFormats : []).forEach((f, i) => {
    if (!f || !String(f.subCategory || '').trim() || !String(f.template || '').trim()) return;
    if (formats.some((x) => sameName(x.subCategory, f.subCategory))) return;       // the account already has (or removed) one: it stays
    formats = formatsAfterEdit(formats, { id: f.id || '', subCategory: String(f.subCategory).trim(), category: f.category || '' }, f.template, now + i);
    counts.formats++;
  });
  let tpls = Array.isArray(templates) ? templates : [];
  (Array.isArray(data.templates) ? data.templates : []).forEach((tp) => {
    if (!tp || !tp.name || !tp.fields || tpls.some((x) => sameName(x.name, tp.name))) return;
    tpls = saveTemplate(tpls, tp); counts.templates++;
  });
  return { lists: next, formats, templates: tpls, counts };
}
