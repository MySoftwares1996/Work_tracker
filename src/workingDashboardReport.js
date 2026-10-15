/**
 * Daily Activity Report builder - the web app's report engine (collectReportData / reportLine /
 * buildReportModel / buildDailyReportText / mergeAiReport in its app.js), on the phone's entry shape.
 * Built entirely from what is already on the device - no network call is needed for the report itself,
 * only for the optional "Rewrite with AI" step.
 *
 * As on the web app:
 *  - Completed that day and not taken out of the report (dar !== false; the web app's darInclude) is listed.
 *  - Domestic and Urgent payments are left out entirely (counted as skipped).
 *  - Payments (an entry with a Tally narration) read "Vendor: narration" without the mail chain; every one is
 *    its own transaction and never dropped as a duplicate.
 *  - A completed duty payment reads "Made duty payment against BOE No: ... through ICEGATE wallet recharge...";
 *    an Import Payment reads "Initiated an outward remittance transaction in favor of ...". The AI rewrite
 *    keeps those exact words.
 *  - Followed up / in progress: open entries whose work log has a status move on that day.
 *  - Every other line is the task, redesigned with what was written in Notes.
 * Sections, in order: Other work completed, Payments, Followed up / in progress, Routine daily activities,
 * Other activities. A line already used elsewhere is dropped and counted.
 */
import { toDateKey, isOpen, completedTime } from './workingDashboard';
import { isBankFollowUpCategory, bankFollowUpReportLine, bankFollowUps, fmtFollowDate } from './bankFollowUp';
import {
  isDomesticPaymentCategory, isImportPaymentCategory, isUrgentPaymentCategory, workedOn, findNarrationType,
  narrationSubText, buildNarrationText, taskPayee, payeeFromMail, stripPayeeFromMail, paymentLists,
} from './workingDashboardPayments';

export const DEFAULT_PAYMENT_INTRO = [
  'Modified the respective party ledgers in Tally by passing the necessary payment entries to accurately record the payment initiation.',
  'Prepared payment files after verifying beneficiary details (name, account number, IFSC), transaction dates, and payment purposes. Verified party Statements of Account (SOA) prior to payment to avoid reconciliation discrepancies and ensure accurate vendor tracking.',
];

/** Domestic / Urgent payments: left out of the report. */
export const isSkippedPaymentCategory = (category) => isDomesticPaymentCategory(category) || isUrgentPaymentCategory(category);
/** Kept for older callers: any category naming a payment. */
export const isPaymentCategory = (category) => /payment/i.test(String(category || ''));

const clean = (x) => String(x === undefined || x === null ? '' : x).replace(/\s+/g, ' ').trim();
const key = (x) => clean(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const timeOf = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '99');
const byTime = (a, b) => timeOf(a.dueAt).localeCompare(timeOf(b.dueAt)) || String(a.title || '').localeCompare(String(b.title || ''));
const completedOn = (e) => { const ms = completedTime(e); return ms ? toDateKey(new Date(ms)) : ''; };
const inReport = (e) => e.dar !== false;

/** Duty payment (BOE): the category, sub category or narration type says "duty", or the narration mentions it. */
export function isDutyPaymentEntry(e, lists) {
  if (!e) return false;
  const n = e.narration || {};
  const nr = findNarrationType(lists, n) || {};
  return [e.category, e.subCategory, n.typeName, nr.name, nr.phrase, n.text, n.reportText].some((x) => /\bduty\b/i.test(String(x || '')));
}

/** A payment line: not duty, not import, and either narrated or a Domestic / Urgent payment. */
export function isPaymentEntry(e, lists) {
  if (isDutyPaymentEntry(e, lists) || isImportPaymentCategory(e.category)) return false;
  if (e.narration && (e.narration.typeName || e.narration.text)) return true;
  return /domestic\s*payments?|urgent\s*payments?/i.test(e.category || '');
}

/** The BOE No of a duty payment, from a BOE field, the narration's document number, or "BOE No: ..." in the text. */
export function dutyBoeNo(e, lists) {
  const n = e.narration || {};
  const isBoe = (k) => /\bboe\b|bill\s*of\s*entry/i.test(String(k || ''));
  const fromFields = (o) => { const k = Object.keys(o || {}).find((x) => isBoe(x) && String(o[x] || '').trim()); return k ? String(o[k]).trim() : ''; };
  let v = fromFields(e.subCategoryFields) || fromFields(n.fieldsValues);
  if (!v && String(n.docNo || '').trim()) {
    const nr = findNarrationType(lists, n) || {};
    if (isBoe(nr.docLabel) || isBoe(nr.phrase) || !nr.docLabel) v = String(n.docNo).trim();
  }
  if (!v) {
    const m = [n.text, n.reportText, e.notes, e.title].map((x) => String(x || ''))
      .map((x) => x.match(/(?:\bboe\b|bill\s*of\s*entry)\s*(?:no\.?|number|#)?\s*[:-]?\s*([A-Za-z0-9][A-Za-z0-9/,&\- ]*[A-Za-z0-9])/i)).find(Boolean);
    if (m) v = m[1];
  }
  return v.replace(/\s+/g, ' ').replace(/[.,;:\s]+$/, '').trim();
}

export function dutyReportLine(e, lists) {
  const boe = dutyBoeNo(e, lists);
  return `Made duty payment${boe ? ` against BOE No: ${boe}` : ''} through ICEGATE wallet recharge. The duty payment has been verified with the BOE.`;
}

/** "Initiated an outward remittance transaction in favor of X towards the advance 30% payment before dispatch." - or null with no details. */
export function importReportLine(e, lists) {
  const pd = e.paymentDetails || {};
  const type = String(pd.paymentType || '').trim();
  const pct = String(pd.paymentPercent || '').trim();
  const against = String(pd.paymentAgainst || '').trim();
  if (!type && !pct && !against) return null;
  const AGAINST = { 'before production': 'against production of goods', 'before dispatch': 'before dispatch', 'after credit period': 'after credit period completion' };
  const ag = AGAINST[against.toLowerCase()] || against.replace(/^Against\b/, 'against');
  const payee = String(pd.beneficiary || '').trim() || taskPayee(e, lists);
  const what = [type.toLowerCase(), pct ? `${pct.replace(/%$/, '')}%` : ''].filter(Boolean).join(' ');
  return (`Initiated an outward remittance transaction${payee ? ` in favor of ${payee}` : ''} towards the ${what ? `${what} ` : ''}payment${ag ? ` ${ag}` : ''}.`).replace(/\s+/g, ' ');
}

/** Lines with a set wording the AI rewrite must keep. */
export const isFixedReportLine = (e, lists) => (e.done && isDutyPaymentEntry(e, lists)) || (isImportPaymentCategory(e.category) && !!importReportLine(e, lists));

/** Takes the mail chain (as typed, or with the vendor cut out) out of a line. */
function withoutMail(text, e, lists) {
  let out = String(text || '');
  const mail = String((e && e.reference) || '').trim();
  if (!mail) return out;
  [mail, stripPayeeFromMail(mail, payeeFromMail(mail)), stripPayeeFromMail(mail, taskPayee(e, lists))]
    .filter((v) => v && v.length > 3).sort((a, b) => b.length - a.length)
    .forEach((v) => { out = out.split(v).join(' '); });
  return out.replace(/\s+/g, ' ').trim();
}

/** Notes as clean report sentences: no "[1 Oct 2026]" stamps, bullets, repeats, or lines that only repeat the title. */
export function notesForReport(e) {
  const title = key(e.title);
  const seen = new Set();
  const out = [];
  String(e.notes || '').split(/\r?\n+/).forEach((raw) => {
    let l = clean(raw).replace(/^\[[^\]]{3,40}\]\s*/, '').replace(/^(?:[-*•>]+|\d+[.)])\s*/, '').replace(/^(?:notes?|remarks?)\s*[:\-–]\s*/i, '');
    if (e.reference && String(e.reference).trim()) l = clean(l.split(String(e.reference).trim()).join(''));
    const k = key(l);
    if (!k || k === title || seen.has(k)) return;
    seen.add(k);
    l = l.charAt(0).toUpperCase() + l.slice(1);
    if (!/[.!?]$/.test(l)) l += '.';
    out.push(l);
  });
  return out;
}

/**
 * A task's report line is what was done, without the task name in front ("Prepared daily, monthly and annual Cash
 * Inflow & Outflow Statements ..."): the notes written for it. Notes that begin with the task's name lose it. With no
 * notes the line is the task itself, for the AI rewrite to turn into a sentence.
 */
export function reportTaskWithNotes(e) {
  const desc = clean(e.title).replace(/[.:;,\s]+$/, '');
  const notes = notesForReport(e);
  if (!notes.length) return desc;
  let joined = notes.join(' ');
  if (desc && joined.toLowerCase().indexOf(desc.toLowerCase()) === 0) {
    const rest = clean(joined.slice(desc.length).replace(/^[\s.:;,\-–—]+/, ''));
    if (rest) joined = rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return joined;
}

/** `line` followed by the entry's notes, each one not already in it. */
export function withEntryNotes(line, e) {
  const base = clean(line);
  const have = key(base);
  const extra = notesForReport(e).filter((n) => !have.includes(key(n)));
  if (!extra.length) return base;
  return `${/[.!?]$/.test(base) || !base ? base : `${base}.`} ${extra.join(' ')}`.trim();
}

/**
 * One entry's report line. `date`: the report's day - a bank follow-up made that day writes the banker's update.
 * `opts.details` (web.app): every line also carries the entry's notes, and its Tally narration when it has one.
 */
export function reportLineFor(e, lists = paymentLists(), date = '', opts = {}) {
  const line = baseReportLine(e, lists, date);
  if (!opts.details) return line;
  let out = line;
  // A narration on an entry whose line is not written from it (duty, import, bank follow-up, other work).
  const n = e.narration || {};
  const nr = findNarrationType(lists, n);
  const narr = clean(withoutMail(nr ? buildNarrationText(nr, { percent: n.percent, docNo: n.docNo, poNo: n.poNo, purpose: n.purpose, fieldsValues: n.fieldsValues, subCategoryText: narrationSubText(e, lists) }) : (n.reportText || n.text || ''), e, lists));
  // An Import Payment's remittance line and its Imports Payments narration say the same thing: the narration wins.
  if (narr && isImportPaymentCategory(e.category) && /^initiated an outward remittance/i.test(narr)) out = narr;
  else if (narr && !key(out).includes(key(narr))) out = `${/[.!?]$/.test(out) ? out : `${out}.`} ${narr}`;
  return withEntryNotes(out, e);
}

function baseReportLine(e, lists, date) {
  if (date && isBankFollowUpCategory(e.category)) { const l = bankFollowUpReportLine(e, date); if (l) return l; }
  if (e.done && isDutyPaymentEntry(e, lists)) return dutyReportLine(e, lists);
  if (isImportPaymentCategory(e.category)) { const l = importReportLine(e, lists); if (l) return l; }
  if (isPaymentEntry(e, lists)) {
    const n = e.narration || {};
    const nr = findNarrationType(lists, n);
    let body;
    if (nr) body = buildNarrationText(nr, { percent: n.percent, docNo: n.docNo, poNo: n.poNo, purpose: n.purpose, fieldsValues: n.fieldsValues, subCategoryText: narrationSubText(e, lists) });
    else if (n.reportText) body = n.reportText;
    else if (n.text) body = withoutMail(n.text, e, lists);
    else body = e.title;
    const fromNarration = !!(nr || n.reportText || n.text);
    body = clean(withoutMail(body, e, lists));
    const payee = taskPayee(e, lists);
    if (payee) {
      if (body.toLowerCase().indexOf(`${payee.toLowerCase()}:`) === 0) body = clean(body.slice(payee.length + 1));
      if (fromNarration) body = clean(body.replace(new RegExp(`\\s*(?:(?:vendor|payee|party)\\s*(?:name)?\\s*:+)?\\s*${payee.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,;]?`, 'i'), ' '));
    }
    return payee ? `${payee}: ${body}` : body;
  }
  return reportTaskWithNotes(e);
}

/** Which entries go where on `date` - the web app's collectReportData. */
export function collectReportData(entries = [], date, lists) {
  const all = entries.filter((e) => e && !e.binned && !e.purged);
  const live = all.filter((e) => !isSkippedPaymentCategory(e.category));
  const skippedPayments = all.filter((e) => isSkippedPaymentCategory(e.category) && ((e.done && completedOn(e) === date) || (!e.done && workedOn(e, date)))).length;
  const completed = live.filter((e) => e.done && completedOn(e) === date);
  const listed = completed.filter(inReport);
  const isImport = (e) => isImportPaymentCategory(e.category);
  // Import payments set In Progress that day (remittance initiated) go under "Other work completed".
  const importsOpen = live.filter((e) => isOpen(e) && isImport(e) && workedOn(e, date) && inReport(e));
  const payments = listed.filter((e) => isPaymentEntry(e, lists));
  const others = listed.filter((e) => !isPaymentEntry(e, lists)).concat(importsOpen);
  const followed = live.filter((e) => isOpen(e) && !isImport(e) && workedOn(e, date) && inReport(e));
  return { payments: payments.sort(byTime), others: others.sort(byTime), followed: followed.sort(byTime), excluded: completed.length - listed.length, skippedPayments };
}

/**
 * One model drives the on-screen text, the copy and the AI check, so they always match.
 * `lists`: the payment lists (workingDashboardPayments.paymentLists).
 * `details` (web.app): each line also carries the entry's notes and its Tally narration.
 */
export function buildReportModel({ entries = [], fixedActivities = [], activityLog = [], date, paymentIntro, leaveDays = [], holidays = [], lists = paymentLists(), details = false } = {}) {
  const intro = (paymentIntro && paymentIntro.length ? paymentIntro : DEFAULT_PAYMENT_INTRO).map(clean).filter(Boolean);
  // Routine activities are done on working days: a leave day or a holiday reported them as done anyway.
  const dayOff = (leaveDays || []).includes(date) || (holidays || []).some((h) => h && h.date && date >= h.date && date <= (h.endDate || h.date));
  const d = collectReportData(entries, date, lists);

  const seen = new Map();
  const dupeList = [];
  const keep = (line, section) => {
    const k = key(line);
    if (!k) return false;
    if (seen.has(k)) { dupeList.push({ line: clean(line), section, keptIn: seen.get(k) }); return false; }
    seen.set(k, section);
    return true;
  };

  const payRows = [];
  d.payments.forEach((e) => {
    const line = reportLineFor(e, lists, date, { details });
    const k = key(line);
    if (!k) return;
    if (!seen.has(k)) seen.set(k, 'Payments');
    payRows.push({ line, entry: e, vendor: taskPayee(e, lists) });
  });
  const descRows = (list, section) => list
    .map((e) => ({ line: reportLineFor(e, lists, date, { details }), entry: e, fixed: isFixedReportLine(e, lists) }))
    .filter((r) => keep(r.line, section));
  const otherRows = descRows(d.others, 'Other work completed');
  const followRows = descRows(d.followed, 'Followed up / in progress');
  const fixedRows = (dayOff ? [] : fixedActivities || [])
    .filter((f) => f.active)
    .map((f) => ({ line: clean(f.text) }))
    .filter((r) => keep(r.line, 'Routine daily activities'));
  const generalRows = (activityLog || [])
    .filter((l) => l.auto === false && l.at && toDateKey(new Date(l.at)) === date)
    .map((l) => ({ line: clean(l.title) + (l.details ? ` — ${clean(l.details)}` : '') }))
    .filter((r) => keep(r.line, 'Other activities'));

  const sections = [
    { key: 'oth', title: 'Other work completed', rows: otherRows },
    { key: 'pay', title: 'Payments', intro: payRows.length ? intro : [], rows: payRows },
    { key: 'fol', title: 'Followed up / in progress', rows: followRows },
    { key: 'fix', title: 'Routine daily activities', rows: fixedRows },
    { key: 'gen', title: 'Other activities', rows: generalRows },
  ];
  const bullets = sections.reduce((n, sec) => n + sec.rows.length + (sec.intro ? sec.intro.length : 0), 0);
  return {
    date,
    dupes: dupeList.length,
    dupeList,
    data: { payments: payRows.length, others: otherRows.length, followed: followRows.length, excluded: d.excluded, skippedPayments: d.skippedPayments, bullets },
    sections,
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatReportDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${WEEKDAYS[dt.getDay()]}, ${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** One section as text: heading, the payment intro lines, then the bullets (a blank line between, payments tight). */
export function reportSectionLines(sec, headings = false) {
  const out = headings ? [sec.title + (sec.key === 'pay' ? ` (${sec.rows.length})` : '')] : [];
  if (sec.intro && sec.intro.length) {
    sec.intro.forEach((l, i) => { if (i) out.push(''); out.push(`* ${l}`); });
    out.push('');
  }
  sec.rows.forEach((r, i) => { if (i && sec.key !== 'pay') out.push(''); out.push(`* ${r.line}`); });
  return out;
}

/** Plain text: "* " bullets (no section headings unless asked for), other work first, then payments with the two standard lines. */
export function reportModelToText(model, { headings = false } = {}) {
  const out = [`Daily Activity Report — ${formatReportDate(model.date)}`];
  let any = false;
  model.sections.forEach((sec) => {
    if (!sec.rows.length) return;
    any = true;
    out.push('');
    out.push(...reportSectionLines(sec, headings));
  });
  if (!any) { out.push(''); out.push('No completed or updated entries for this date.'); }
  return out.join('\n');
}

/**
 * Merges an AI rewrite into the standard report section by section, as the web app does: Payments always
 * stay exactly as generated; a section the AI shortened (fewer bullets) or left out keeps the standard
 * wording; duty / import payment lines are put back word for word; mail chains it copied in are taken out.
 * Returns { text, ai, kept } - ai = sections in the AI's words - or null when the reply has no section headings.
 */
export function mergeAiReport(model, aiText, mails = [], { headings = false } = {}) {
  const titles = model.sections.map((sec) => sec.title.toLowerCase());
  const got = {};
  let cur = null;
  let found = 0;
  const raw = String(aiText || '').replace(/^\s*\d+[.)]\s+/gm, '* ').replace(/^\s*[-•*]\s+/gm, '* ').replace(/\*\*/g, '').trim();
  raw.split('\n').forEach((line) => {
    const tr = line.trim();
    const h = tr.replace(/^[#*\s]+/, '').replace(/[*:]+$/, '').trim().toLowerCase();
    const i = tr.indexOf('* ') === 0 ? -1 : titles.findIndex((x) => h.indexOf(x) === 0);
    if (i >= 0) { cur = model.sections[i].key; got[cur] = got[cur] || []; found++; return; }
    if (cur) got[cur].push(line);
  });
  if (!found) return null;
  const strip = (l) => {
    let x = l;
    mails.forEach((mc) => { const k = x.toLowerCase().indexOf(mc.toLowerCase()); if (k >= 0) x = x.slice(0, k) + x.slice(k + mc.length); });
    return x.replace(/\s+$/, '');
  };
  const out = [`Daily Activity Report — ${formatReportDate(model.date)}`];
  let kept = 0;
  let ai = 0;
  model.sections.forEach((sec) => {
    if (!sec.rows.length) return;
    out.push('');
    let body = (got[sec.key] || []).map(strip);
    while (body.length && !body[0].trim()) body.shift();
    while (body.length && !body[body.length - 1].trim()) body.pop();
    if (sec.rows.some((r) => r.fixed)) {
      const items = [];
      body.forEach((l) => {
        const tr = l.trim();
        if (!tr) return;
        if (/^\* /.test(tr) || !items.length) items.push(tr.replace(/^\* /, '')); else items[items.length - 1] += ` ${tr}`;
      });
      const ai2 = items.filter((x) => !/\bduty\b|icegate|\bboe\b|bill\s*of\s*entry|remittance/i.test(x));
      const need = sec.rows.filter((r) => !r.fixed).length;
      if (ai2.length >= need) {
        const rebuilt = [];
        let j = 0;
        sec.rows.forEach((r) => rebuilt.push(r.fixed ? r.line : ai2[j++]));
        ai2.slice(j).forEach((x) => rebuilt.push(x));
        body = [];
        rebuilt.forEach((x, i) => { if (i) body.push(''); body.push(`* ${x}`); });
      } else body = [];
    }
    const bullets = body.filter((l) => /^\s*\* /.test(l)).length;
    if (sec.key === 'pay' || bullets < sec.rows.length) {
      out.push(...reportSectionLines(sec, headings));
      if (sec.key !== 'pay') kept++;
    } else {
      if (headings) out.push(sec.title);
      out.push(...body.map((l) => l.trim()));
      ai++;
    }
  });
  return { text: out.join('\n'), ai, kept };
}

/**
 * After an AI rewrite comes back, verify nothing was dropped or a payment line changed - reject the
 * rewrite rather than risk a wrong report.
 */
export function verifyAiRewrite(model, aiText) {
  const payLines = (model.sections.find((sec) => sec.key === 'pay') || { rows: [] }).rows.map((r) => r.line);
  const normalizedAi = key(aiText);
  const missingPayments = payLines.filter((l) => !normalizedAi.includes(key(l)));
  const bulletCount = (String(aiText).match(/^\* /gm) || []).length;
  if (missingPayments.length) return { ok: false, reason: `changed ${missingPayments.length} payment line(s)` };
  if (bulletCount < model.data.bullets) return { ok: false, reason: 'dropped items' };
  return { ok: true };
}

/* ---------- weekly / monthly summary ---------- */

/**
 * An entry's amount in rupees from its Key Points ("Amount: ₹50,000", "Value - Rs. 4,35,000.50", "Amt 12000"), or 0.
 * A key point named like an amount wins; else the first value written in ₹ / Rs / INR.
 */
export function entryAmount(e) {
  const kps = Array.isArray(e?.keyPoints) ? e.keyPoints : [];
  const rows = kps.map((k) => (k && typeof k === 'object' ? [String(k.key ?? ''), String(k.value ?? '')] : ['', String(k ?? '')]));
  const toNum = (digits) => { const n = Number(String(digits).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
  for (const [k, v] of rows) {
    if (!/\b(amount|amt|value)\b/i.test(k)) continue;
    const m = /([0-9][0-9,]*(?:\.[0-9]+)?)/.exec(v);
    if (m && toNum(m[1])) return toNum(m[1]);
  }
  for (const [k, v] of rows) {
    const m = /(?:₹|\brs\.?|\binr)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i.exec(`${k} ${v}`);
    if (m && toNum(m[1])) return toNum(m[1]);
  }
  return 0;
}

/** "₹4,35,000" (Indian grouping; paise only when there are some). */
export const fmtRupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** The period a summary covers, ending on `date` (YYYY-MM-DD): 'week' from that week's Monday, 'month' from the 1st. */
export function summaryPeriod(kind, date) {
  const end = new Date(`${date}T12:00:00`);
  const start = new Date(end);
  if (kind === 'month') start.setDate(1);
  else start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return { from: toDateKey(start), to: toDateKey(end) };
}

/**
 * A week's or month's work in totals, for the Report tab: completed (payments and other work), by category, bank
 * follow-ups made, tasks added, and what is open now. Domestic and Urgent payments are left out, as in the daily
 * report. Returns { kind, from, to, completed, payments, others, byCategory: [[cat, n]], followUps, followUpTasks,
 * added, open, overdue, text }.
 */
export function buildPeriodSummary({ entries = [], kind = 'week', date, lists = paymentLists(), now = new Date() } = {}) {
  const { from, to } = summaryPeriod(kind, date || toDateKey(now));
  const inRange = (k) => !!k && k >= from && k <= to;
  const live = entries.filter((e) => e && !e.binned && !e.purged && !isSkippedPaymentCategory(e.category));
  const completed = live.filter((e) => e.done && inRange(completedOn(e)));
  const payments = completed.filter((e) => isPaymentEntry(e, lists) || isPaymentCategory(e.category)).length;
  const cats = {};
  completed.forEach((e) => { const c = e.category || 'Uncategorised'; cats[c] = (cats[c] || 0) + 1; });
  const byCategory = Object.entries(cats).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  let followUps = 0; let followUpTasks = 0;
  live.forEach((e) => { const n = bankFollowUps(e).filter((f) => inRange(f.d)).length; followUps += n; if (n) followUpTasks += 1; });
  const added = live.filter((e) => { const d = e.createdAt ? new Date(e.createdAt) : null; return d && !Number.isNaN(d.getTime()) && inRange(toDateKey(d)); }).length;
  const openNow = live.filter((e) => isOpen(e));
  const overdue = openNow.filter((e) => { const d = e.dueAt ? new Date(e.dueAt) : null; return d && !Number.isNaN(d.getTime()) && d < now; }).length;
  const label = kind === 'month' ? 'Monthly summary' : 'Weekly summary';
  const lines = [
    `${label}: ${fmtFollowDate(`${from}T12:00:00`)} - ${fmtFollowDate(`${to}T12:00:00`)}`,
    '',
    `Completed: ${completed.length} (payments ${payments}, other work ${completed.length - payments})`,
  ];
  // The amounts written on the payments (Key Points), added up.
  const paid = completed.filter((e) => isPaymentEntry(e, lists) || isPaymentCategory(e.category)).map(entryAmount);
  const paymentTotal = paid.reduce((a, n) => a + n, 0);
  const withAmount = paid.filter((n) => n > 0).length;
  if (paymentTotal > 0) lines.push(`Payments total: ${fmtRupees(paymentTotal)}${withAmount < payments ? ` (${withAmount} of ${payments} payments had an amount)` : ''}`);
  if (byCategory.length) lines.push(`By category: ${byCategory.map(([c, n]) => `${c} ${n}`).join(', ')}`);
  // Each day's count, so a busy or a quiet day shows: "Mon 5 Oct: 3".
  const perDay = {};
  completed.forEach((e) => { const k = completedOn(e); perDay[k] = (perDay[k] || 0) + 1; });
  const days = Object.keys(perDay).sort();
  if (days.length) {
    lines.push('', 'Completed each day:');
    days.forEach((k) => lines.push(`  ${new Date(`${k}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })} ${fmtFollowDate(`${k}T12:00:00`)}: ${perDay[k]}`));
  }
  lines.push(`Bank follow-ups: ${followUps} follow-up${followUps === 1 ? '' : 's'} on ${followUpTasks} task${followUpTasks === 1 ? '' : 's'}`);
  lines.push(`New tasks: ${added}`);
  lines.push(`Open now: ${openNow.length} (${overdue} overdue)`);
  // The overdue tasks by name, the longest overdue first (the first 15).
  const late = openNow
    .map((e) => ({ e, d: e.dueAt ? new Date(e.dueAt) : null }))
    .filter(({ d }) => d && !Number.isNaN(d.getTime()) && d < now)
    .sort((a, b) => a.d - b.d);
  if (late.length) {
    lines.push('', 'Overdue:');
    late.slice(0, 15).forEach(({ e, d }) => lines.push(`  - ${String(e.title || '').trim()} (due ${fmtFollowDate(d.toISOString())}${e.pendingWith ? `, with ${e.pendingWith}` : ''})`));
    if (late.length > 15) lines.push(`  ...and ${late.length - 15} more`);
  }
  return {
    kind, from, to, completed: completed.length, payments, others: completed.length - payments, byCategory,
    followUps, followUpTasks, added, open: openNow.length, overdue, perDay, paymentTotal, overdueTitles: late.map(({ e }) => e.title), text: lines.join('\n'),
  };
}

/** A mailto: link that opens a new mail with the report as its text, addressed to `to` when given. */
export function reportMailUrl(subject, body, to = '') {
  // Mail apps cut very long links: the report is kept to what they reliably take.
  const text = String(body || '').slice(0, 6000);
  const addr = String(to || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).map(encodeURIComponent).join(',');
  return `mailto:${addr}?subject=${encodeURIComponent(String(subject || ''))}&body=${encodeURIComponent(text)}`;
}

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The report as a printable page (for the PDF): its title, then each line as written, in a plain readable font. */
export function reportHtml(title, text) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;line-height:1.5;margin:32px;color:black}h1{font-size:16pt;margin:0 0 16px}pre{white-space:pre-wrap;font-family:inherit;margin:0}</style>
</head><body><h1>${esc(title)}</h1><pre>${esc(text)}</pre></body></html>`;
}

/**
 * The report as spreadsheet rows (for Excel): a daily report gives Section / Entry (the standard lines, no headings in
 * the text); a weekly or monthly summary gives one row per line.
 */
export function reportCsvRows(model, text) {
  if (model && Array.isArray(model.sections)) {
    const rows = [];
    model.sections.forEach((sec) => sec.rows.forEach((r) => rows.push({ Section: sec.title, Entry: r.line })));
    return { rows, columns: ['Section', 'Entry'] };
  }
  return { rows: String(text || '').split('\n').filter((l) => l.trim()).map((l) => ({ Line: l.replace(/^\*\s+/, '') })), columns: ['Line'] };
}

/**
 * Payments of one month by vendor (the amounts written in Key Points), biggest first - the Dashboard's "Payments by vendor".
 * `monthKey` is "YYYY-MM"; Domestic / Urgent payments are left out, as in the report. Returns
 * { total, count, withAmount, rows: [{ vendor, total, count }] }.
 */
export function paymentsByVendor(entries = [], lists = paymentLists(), monthKey) {
  const key = monthKey || toDateKey(new Date()).slice(0, 7);
  const acc = new Map();
  let total = 0; let count = 0; let withAmount = 0;
  (entries || []).forEach((e) => {
    if (!e || !e.done || e.binned || e.purged || isSkippedPaymentCategory(e.category)) return;
    if (!(isPaymentEntry(e, lists) || isPaymentCategory(e.category))) return;
    const day = completedOn(e);
    if (!day || day.slice(0, 7) !== key) return;
    count += 1;
    const amt = entryAmount(e);
    if (amt > 0) withAmount += 1;
    const vendor = String(taskPayee(e, lists) || '').trim() || 'Vendor not named';
    const cur = acc.get(vendor) || { vendor, total: 0, count: 0 };
    cur.total += amt; cur.count += 1;
    acc.set(vendor, cur);
    total += amt;
  });
  return { total, count, withAmount, rows: [...acc.values()].sort((a, b) => b.total - a.total || b.count - a.count || a.vendor.localeCompare(b.vendor)) };
}
