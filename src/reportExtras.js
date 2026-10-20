/**
 * Report formats and the person's moves applied to a report model (shared by the phone app and the website). Pure.
 */
import { findFormat, renderTemplate, isPaymentCategory } from './reportFormats.js';
import { reportLineFor, withEntryNotes, DEFAULT_PAYMENT_INTRO } from './workingDashboardReport.js';

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
      row.line = withEntryNotes(out.text, row.entry);   // the task's remarks (Notes) follow the format line
      row.fixed = false;
      row.formatted = true;
      if (out.missing.length) model.missing.push({ title: row.entry.title, marks: out.missing });
      // Only a Payments category goes under "Payments"; other formatted tasks keep their section (a Demand Draft is other work).
      if (sec.key !== 'pay' && isPaymentCategory(f.category || row.entry.category)) moved.push({ sec, row });
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
export function applyMoves(model, moves = {}, { lists = {}, payLists = {}, formats = [], date = '', details = true } = {}) {
  const sec = (k) => model.sections.find((s) => s.key === k);
  const dupes = model.dupeList || [];
  const out = (model.data.excludedList || []).slice();
  const dupLeft = [];
  const placed = { oth: [], pay: [], fol: [] };
  const put = (target, entry, line, row) => {
    const f = target === 'pay' && formats && formats.length && entry.subCategory ? findFormat(formats, entry.subCategory) : null;
    const text = f ? withEntryNotes(renderTemplate(f.template, entry).text, entry) : line || reportLineFor(entry, payLists, date, { details });
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


/** Adds each task's Sub Category fields ("Banker's Reply's: ...") to its line (payment and fixed-wording lines stay word for word). */
export function addSubFields(model) {
  model.sections.forEach((sec) => {
    if (sec.key === 'pay') return;
    sec.rows.forEach((r) => {
      if (r.fixed || !r.entry) return;
      const fields = Object.entries(r.entry.subCategoryFields || {}).filter(([, v]) => String(v || '').trim())
        .map(([k, v]) => `${String(k).replace(/[\s:]+$/, '')}: ${String(v).trim().replace(/\s+/g, ' ')}`);
      if (fields.length && !fields.every((f) => r.line.includes(f))) r.line = `${r.line.replace(/[.\s]+$/, '')}. ${fields.join('; ')}.`;
    });
  });
  return model;
}
