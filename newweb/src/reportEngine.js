/**
 * The Daily Report for the website: the phone app's / old website's report engine (../../src/workingDashboardReport.js), fed with this
 * site's tasks. Sections, in order: Other work completed, Payments (Tally narration lines), Followed up / in progress, Routine daily
 * activities, Other activities. Domestic and Urgent payments are left out, as there.
 */
import { buildReportModel, reportModelToText, mergeAiReport, verifyAiRewrite, reportCsvRows, reportHtml } from '../../src/workingDashboardReport.js';
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
export function buildReport(tasks, lists, calendar, date, { headings = true, subFields = true } = {}) {
  const entries = (tasks || []).map(toEntry);
  const model = buildReportModel({
    entries, date, lists: reportLists(lists), details: true, paymentIntro: lists && lists.darPaymentIntro,
    holidays: (calendar && calendar.holidays) || [], leaveDays: dateKeys(calendar && calendar.leaveDays),
  });
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
