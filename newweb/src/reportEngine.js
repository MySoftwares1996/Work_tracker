/**
 * The Daily Report for the website: the phone app's / old website's report engine (../../src/workingDashboardReport.js), fed with this
 * site's tasks. Sections, in order: Other work completed, Payments (Tally narration lines), Followed up / in progress, Routine daily
 * activities, Other activities. Domestic and Urgent payments are left out, as there.
 */
import { findFormat, renderTemplate } from './reportFormats.js';
import { buildReportModel, reportLineFor, reportModelToText, mergeAiReport, verifyAiRewrite, reportCsvRows, reportHtml, paymentsByVendor, fmtRupees, DEFAULT_PAYMENT_INTRO } from '../../src/workingDashboardReport.js';
import { buildStylePrompt } from '../../src/reportStyle.js';
import { paymentLists, withWebNarrationTypes } from '../../src/workingDashboardPayments.js';
import { dayKey } from './data.js';

const iso = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

/** A website task -> the entry shape the report engine reads. */
export function toEntry(t) {
  return {
    id: t.id, title: t.title, category: t.category, subCategory: t.subCategory, subCategoryFields: t.subCategoryFields || {},
    notes: t.notes, reference: t.reference, status: t.status, priority: t.priority, pendingWith: t.pendingWith,
    done: !!t.done, binned: !!t.binned, purged: !!t.purged, dar: t.dar !== false,
    dueAt: iso(t.due), completedAt: iso(t.completedAt), keyPoints: t.keyPoints || [],
    narration: t.narration || undefined, paymentDetails: t.paymentDetails || undefined,
    workLog: t.workLog || [], bankFollowUps: t.bankFollowUps || [], escalation: t.escalation || undefined,
  };
}

/** The payment lists (Sub Categories, Tally narration types) the engine needs, from the website's lists. */
export const reportLists = (lists = {}) => withWebNarrationTypes(paymentLists({
  subCategories: lists.subCategories, narrationTypes: lists.narrationTypes, subCategoryCategories: lists.subCategoryCategories,
}, lists.categories));

const dateKeys = (list) => (Array.isArray(list) ? list.map((x) => (typeof x === 'string' ? x : x && x.date)).filter(Boolean) : []);

/**
 * { model, text, plain }: `text` has the section headings when `headings` is set. `subFields` adds each task's Sub Category fields
 * ("Banker's Reply's: ...") to its line (payment and fixed-wording lines stay word for word).
 */
export function buildReport(tasks, lists, calendar, date, { headings = true, subFields = true, formats = [], moves = {} } = {}) {
  const entries = (tasks || []).map(toEntry);
  const model = buildReportModel({
    entries, date, lists: reportLists(lists), details: true, paymentIntro: lists && lists.darPaymentIntro,
    holidays: (calendar && calendar.holidays) || [], leaveDays: dateKeys(calendar && calendar.leaveDays),
  });
  applyFormats(model, formats, lists);
  applyMoves(model, moves, { lists, formats, date, details: true });
  if (subFields) {
    model.sections.forEach((sec) => {
      if (sec.key === 'pay') return;
      sec.rows.forEach((r) => {
        if (r.fixed || !r.entry) return;
        const fields = Object.entries(r.entry.subCategoryFields || {}).filter(([, v]) => String(v || '').trim())
          .map(([k, v]) => `${String(k).replace(/[\s:]+$/, '')}: ${String(v).trim().replace(/\s+/g, ' ')}`);
        if (fields.length && !fields.every((f) => r.line.includes(f))) r.line = `${r.line.replace(/[.\s]+$/, '')}. ${fields.join('; ')}.`;
      });
    });
  }
  return { model, text: reportModelToText(model, { headings }) };
}

/**
 * A task whose Sub Category has a format (Config > Report formats) is written from it, and goes under "Payments" with the other payment
 * lines. `model.missing` lists the lines that still have a [mark] with no value.
 */
export function applyFormats(model, formats, lists = {}) {
  model.missing = [];
  if (!formats || !formats.length) return model;
  const pay = model.sections.find((s) => s.key === 'pay');
  const moved = [];
  model.sections.forEach((sec) => {
    if (sec.key === 'fix' || sec.key === 'gen') return;
    sec.rows.forEach((row) => {
      const f = row.entry && row.entry.subCategory ? findFormat(formats, row.entry.subCategory) : null;
      if (!f) return;
      const out = renderTemplate(f.template, row.entry);
      row.line = out.text;
      row.fixed = false;
      row.formatted = true;
      if (out.missing.length) model.missing.push({ title: row.entry.title, marks: out.missing });
      if (sec.key !== 'pay') moved.push({ sec, row });
    });
  });
  moved.forEach(({ sec, row }) => { sec.rows.splice(sec.rows.indexOf(row), 1); pay.rows.push(row); });
  if (pay.rows.length && !(pay.intro && pay.intro.length)) pay.intro = (lists.darPaymentIntro && lists.darPaymentIntro.length ? lists.darPaymentIntro : DEFAULT_PAYMENT_INTRO).map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  model.data.payments = pay.rows.length;
  model.data.others = model.sections.find((s) => s.key === 'oth').rows.length;
  model.data.followed = model.sections.find((s) => s.key === 'fol').rows.length;
  model.data.bullets = model.sections.reduce((n, s) => n + s.rows.length + (s.intro ? s.intro.length : 0), 0);
  return model;
}

/** The groups a line can be in (the Report chips). */
export const REPORT_GROUPS = [
  { key: 'oth', label: 'Other work' },
  { key: 'pay', label: 'Payments' },
  { key: 'fol', label: 'Followed up' },
  { key: 'out', label: 'Left out (Done, not DAR)' },
];

/**
 * The person's moves ({ taskId: 'oth' | 'pay' | 'fol' | 'out' }) for one day: each task is taken out of the group it was in (the
 * report's sections, the left-out tasks or the merged duplicates) and put into the chosen one; the counts follow.
 * Adds `model.groups` = { oth, pay, fol, out, dup }: [{ id, title, line, entry, moved }] for the chip popups.
 */
export function applyMoves(model, moves = {}, { lists = {}, formats = [], date = '', details = true } = {}) {
  const sec = (k) => model.sections.find((s) => s.key === k);
  const dupes = model.dupeList || [];
  const out = (model.data.excludedList || []).slice();
  const dupLeft = [];
  const placed = { oth: [], pay: [], fol: [] };
  const put = (target, entry, line, row) => {
    const f = target === 'pay' && formats && formats.length && entry.subCategory ? findFormat(formats, entry.subCategory) : null;
    const text = f ? renderTemplate(f.template, entry).text : line || reportLineFor(entry, reportLists(lists), date, { details });
    placed[target].push(row ? Object.assign(row, { line: text }) : { line: text, entry, moved: true });
  };
  ['oth', 'pay', 'fol'].forEach((k) => {
    const s = sec(k);
    s.rows = s.rows.filter((r) => {
      const to = r.entry && moves[r.entry.id];
      if (!to || to === k) return true;
      if (to === 'out') out.push(r.entry); else put(to, r.entry, null);
      return false;
    });
  });
  dupes.forEach((d) => {
    const to = d.entry && moves[d.entry.id];
    if (!to || to === 'out') { if (to === 'out') out.push(d.entry); else dupLeft.push(d); return; }
    put(to, d.entry, d.line);
  });
  const left = out.filter((e) => { const to = moves[e.id]; if (!to || to === 'out') return true; put(to, e, null); return false; });
  ['oth', 'pay', 'fol'].forEach((k) => { sec(k).rows.push(...placed[k]); });
  const pay = sec('pay');
  if (pay.rows.length && !(pay.intro && pay.intro.length)) pay.intro = (lists.darPaymentIntro && lists.darPaymentIntro.length ? lists.darPaymentIntro : DEFAULT_PAYMENT_INTRO).map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!pay.rows.length) pay.intro = [];
  const titles = new Set(model.sections.flatMap((x) => x.rows.map((r) => r.entry && r.entry.title)));
  model.missing = (model.missing || []).filter((m) => titles.has(m.title));
  model.dupes = dupLeft.length;
  model.dupeList = dupLeft;
  Object.assign(model.data, {
    others: sec('oth').rows.length, payments: pay.rows.length, followed: sec('fol').rows.length, excluded: left.length, excludedList: left,
    bullets: model.sections.reduce((n, x) => n + x.rows.length + (x.intro ? x.intro.length : 0), 0),
  });
  const items = (rows) => rows.filter((r) => r.entry).map((r) => ({ id: r.entry.id, title: r.entry.title, line: r.line, entry: r.entry, moved: !!moves[r.entry.id] }));
  model.groups = {
    oth: items(sec('oth').rows), pay: items(pay.rows), fol: items(sec('fol').rows),
    out: left.map((e) => ({ id: e.id, title: e.title, line: e.title, entry: e, moved: !!moves[e.id] })),
    dup: dupLeft.filter((d) => d.entry).map((d) => ({ id: d.entry.id, title: d.entry.title, line: d.line, entry: d.entry, keptIn: d.keptIn, moved: false })),
  };
  return model;
}

/** The mail subjects of the report's tasks (the AI must not copy them in). */
export const reportMails = (model) => model.sections.flatMap((s) => s.rows.map((r) => (r.entry && r.entry.reference) || '')).filter(Boolean);

/** The instruction sent to Gemini: the engine's own prompt (keep every item and fact, one bullet per item), plus the person's instructions. */
export const reportPrompt = (model, draft, extra = '') => buildStylePrompt(model, draft, null, extra);

/** Gemini's reply, merged section by section so nothing is dropped and payment lines stay as they are. { text, note } or { error }. */
export function mergeAi(model, aiText, { headings = true } = {}) {
  const merged = mergeAiReport(model, aiText, reportMails(model), { headings });
  if (merged) return { text: merged.text, note: merged.ai ? `Gemini wrote ${merged.ai} section(s)${merged.kept ? `; ${merged.kept} kept the standard wording` : ''}.` : 'Gemini did not improve any section, so the standard wording is kept.' };
  const check = verifyAiRewrite(model, aiText);
  if (!check.ok) return { error: `Gemini's text was not used (${check.reason}). The standard report is shown.` };
  return { text: String(aiText).trim(), note: 'Gemini wrote the report.' };
}

export { reportCsvRows, reportHtml, dayKey };

/** This month's payments by vendor, from the amounts written in each payment task's Key Points: { total, count, withAmount, rows: [{ vendor, total, count }] }. */
export const vendorTotals = (tasks, lists, monthKey) => paymentsByVendor((tasks || []).map(toEntry), reportLists(lists), monthKey);
export { fmtRupees };
