/**
 * Report formats: for a Sub Category, the exact line the Daily report writes for a task in it, with the task's own values filled in.
 * A template is plain text with {Field name} marks, e.g. "Being amount paid against Invoice No. {Invoice No}, amounting to ₹{Amount}.".
 * Each mark is filled from the task's Sub Category fields (the closest field name wins), then from its Key Points. A mark with no value
 * is shown as [Field name] so it is noticed. Pure: no React, no storage.
 */

const STOP = new Set(['of', 'the', 'a', 'an', 'no', 'number', 'for', 'to', 'and']);
// Plural "s" is ignored ("Imports" = "Import", "Advance's" = "Advance") so a small difference in spelling still finds the format.
const tokens = (s) => String(s || '').toLowerCase().replace(/'s\b/g, '').replace(/[^a-z0-9%&]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
export const normName = (s) => tokens(s).join(' ');
const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

/** The {marks} in a template, in order, once each. */
export function placeholdersOf(template) {
  const out = [];
  String(template || '').replace(/\{([^{}]+)\}/g, (_, name) => { const n = clean(name); if (n && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n); return ''; });
  return out;
}

/** How well a field label answers a mark: 0 = no, else higher is closer (all of the mark's words are in the label; fewer extra words is closer). */
function score(mark, label) {
  const m = tokens(mark);
  const l = tokens(label);
  if (!m.length || !l.length) return 0;
  if (!m.every((w) => l.includes(w))) return 0;
  return m.length / l.length;
}

/** The value for a mark: the best matching Sub Category field of the entry with a value, then a matching Key Point. */
export function fieldValue(entry, mark) {
  const fields = Object.entries((entry && entry.subCategoryFields) || {}).filter(([, v]) => clean(v));
  let best = null;
  fields.forEach(([k, v]) => { const sc = score(mark, k); if (sc > 0 && (!best || sc > best.sc)) best = { sc, v: clean(v) }; });
  if (best) return best.v;
  const kps = (entry && Array.isArray(entry.keyPoints) ? entry.keyPoints : []).filter((k) => k && clean(k.value));
  kps.forEach((k) => { const sc = score(mark, k.key); if (sc > 0 && (!best || sc > best.sc)) best = { sc, v: clean(k.value) }; });
  if (best) return best.v;
  const own = { title: entry && entry.title, category: entry && entry.category, 'sub category': entry && entry.subCategory, mail: entry && entry.reference, notes: entry && entry.notes };
  const key = String(mark).trim().toLowerCase();
  return own[key] ? clean(own[key]) : '';
}

/** The line for an entry: { text, missing } - missing = the marks that had no value (shown as [Mark] in the text). */
export function renderTemplate(template, entry) {
  const missing = [];
  const text = String(template || '').replace(/\{([^{}]+)\}/g, (_, name) => {
    const mark = clean(name);
    const v = fieldValue(entry, mark);
    if (v) return v;
    if (!missing.includes(mark)) missing.push(mark);
    return `[${mark}]`;
  }).replace(/\s+/g, ' ').trim();
  return { text, missing };
}

/** One name contains the other ("Imports Payment" in "Imports Payment Initiation"); a short name (ESI, PT) only ever matches exactly. */
const related = (a, b) => !!a && !!b && Math.min(a.length, b.length) >= 8 && (a.includes(b) || b.includes(a));

/** The format for a Sub Category name (exact words first, then one name containing the other: "Imports Payment" and "Imports Payment Initiation"). */
export function findFormat(formats, subCategory) {
  const n = normName(subCategory);
  if (!n) return null;
  const list = Array.isArray(formats) ? formats.filter((f) => f && f.template && f.subCategory) : [];
  return list.find((f) => normName(f.subCategory) === n)
    || list.find((f) => related(normName(f.subCategory), n)) || null;
}

/** The marks of a template that no field of the Sub Category answers: they can be added to it. */
export function unmatchedMarks(template, fieldLabels) {
  return placeholdersOf(template).filter((mark) => !(fieldLabels || []).some((l) => score(mark, l) > 0));
}

/** Formats as the meta/tools document keeps them. */
export function readReportFormats(d = {}) {
  return (Array.isArray(d.reportFormats) ? d.reportFormats : []).filter((f) => f && f.subCategory && typeof f.template === 'string')
    .map((f, i) => ({ id: String(f.id || `rf-${i}`), category: String(f.category || ''), subCategory: String(f.subCategory), template: String(f.template) }));
}

/** The formats from the owner's "Tally Narration formats" sheet (the Report tab uses them until Config > Report formats is edited). */
export const SAMPLE_FORMATS = [
  { category: 'Import Payments', subCategory: 'Imports Payment Initiation', template: 'Initiated an outward remittance transaction in favour of {Name of vendor or suppler} towards the {% of payment}% {Payment type} payment {Type} for USD {USD amount} through {Bank}, Reference No. {Reference no}. Current Status: {Current status}.' },
  { category: 'Payments', subCategory: 'Debit Advice Sharing with Team', template: 'Provided the debit advice to the Imports Team for reference and to facilitate the necessary accounting entries and record maintenance. The debit advice will also serve as payment advice for the respective vendor & Future reference, Name of the vendor: {Name of the vendor}, Debit Advice No: {Debit Advice No} & USD Amount: {USD Amount}' },
  { category: 'Duty Payments', subCategory: 'Custom Duty Payment', template: 'Processed the customs duty payment for BOE No. {BOE No} through the ICEGATE wallet recharge for ₹{Amount} and verified the payment against the BOE.' },
  { category: 'Payments', subCategory: 'PO Advance Payment', template: '{Name}: - Being {Advance %}% advance amount paid against the Po No: {PO No} & Amount: {Amount}/-' },
  { category: 'Payments', subCategory: 'PO Balance Payment', template: '{Name}: - Being the balance amount paid against Invoice No. {Invoice No} and PO No. {PO No}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: 'PO 2nd Advance Payment', template: '{Name}: - Being the 2nd advance payment made against PO No. {PO No}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: 'Invoice Payment', template: '{Name}: - Being amount paid against Invoice No. {Invoice No} towards {Towards}.' },
  { category: 'Payments', subCategory: 'COD Charges - Invoice', template: '{Name}: - Being amount paid towards COD charges against Invoice No. {Invoice No}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: 'COD Charges - Order id', template: '{Name}: - Being amount paid towards COD charges against Order ID: {Order ID}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: 'COD Charges - Purchase Order', template: '{Name}: - Being amount paid towards COD charges against Order ID: {Order ID}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: 'COD Charges - Local auto', template: '{Name}: - Being amount paid towards local auto charges for COD payments against Order ID: {Order ID}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: 'Legal Charges without Case No', template: '{Name}: - Being amount paid towards legal charges for the purpose of {Purpose}.' },
  { category: 'Payments', subCategory: "Employee Advance's", template: 'Being amount paid towards employee advance against Request Form No. {Request Form No}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: "Employee settlement's", template: 'Being amount paid towards employee advance settlement against Settlement Form No. {Settlement Form No}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: "Employee salary advance's", template: 'Being amount paid towards employee salary advance against Request Form No. {Request Form No}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: 'I&C Charges', template: 'Being amount paid towards PuREPower installation charges against Order ID: {Order ID}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: 'Lagour Charges', template: 'Being amount paid towards labour charges for the period of {Period} & Head count: {Head count} × {Rate} = {Amount}/-' },
  { category: 'Payments', subCategory: 'Refund of Sale', template: 'Being amount paid towards sales refund against Order ID: {Order ID}, amounting to ₹{Amount}.' },
  { category: 'Payments', subCategory: 'Credit Card Payments', template: 'Being the amount paid towards {Towards}, amounting to ₹{Amount}, as per the email subject: {Email subject}.' },
  { category: 'HR Statutory Payment', subCategory: 'EPFO', template: 'Made the payment for EPFO for the month of {Month} - with Month: {Month}, Liability Period: {Liability Period}, Amount Paid: {Amount Paid}, Payment Date: {Payment Date}, Status: {Status}.' },
  { category: 'HR Statutory Payment', subCategory: 'ESI', template: 'Made the payment for ESI for the month of {Month} - with Month: {Month}, Liability Period: {Liability Period}, Amount Paid: {Amount Paid}, Payment Date: {Payment Date}, Status: {Status}.' },
  { category: 'HR Statutory Payment', subCategory: 'PT', template: 'Made the payment for PT for the month of {Month} - with Month: {Month}, Liability Period: {Liability Period}, Amount Paid: {Amount Paid}, Payment Date: {Payment Date}, Status: {Status}.' },
  { category: 'Monthly Payments', subCategory: 'Monthly TDS Payments by Section wise', template: 'Made the payment for TDS for the month of {Month} - with Month: {Month}, TDS Section & Code: {TDS Section & Code}, Liability Period: {Liability Period}, Amount Paid: {Amount Paid}, Payment Date: {Payment Date}, Status: {Status}.' },
  { category: 'Payments', subCategory: 'Rent Payments', template: 'Being amount paid towards rent for the month of {Month} for {Premises}, amounting to ₹{Amount}.' },
].map((f, i) => ({ id: `sample-${i}`, ...f }));

const OWN_MARKS = new Set(['title', 'category', 'sub category', 'mail', 'notes']);

/**
 * What it takes for every format to have its Category and Sub Category (only what is missing is created, nothing existing is touched):
 * { categories: [names], subCategories: [{ name, category, labels }], lists } - `lists` is the lists object with them added.
 * A new Sub Category gets a field for each {mark} of its format. Categories are matched by name (a plural "s" is ignored);
 * Sub Categories as findFormat does, so "Imports Payment" is not created again beside "Imports Payment Initiation".
 */
export function planFormatSetup(lists = {}, formats = []) {
  const cats = Array.isArray(lists.categories) ? [...lists.categories] : [];
  const subs = Array.isArray(lists.subCategories) ? [...lists.subCategories] : [];
  const addedCats = [];
  const addedSubs = [];
  const hasCat = (name) => cats.some((c) => normName(c) === normName(name));
  const hasSub = (name) => { const n = normName(name); return subs.some((x) => { const m = normName(x.name); return m && (m === n || related(m, n)); }); };
  (formats || []).forEach((f) => {
    if (!f || !f.subCategory || !f.template) return;
    const category = clean(f.category);
    if (category && !hasCat(category)) { cats.push(category); addedCats.push(category); }
    if (!hasSub(f.subCategory)) {
      const labels = [];
      placeholdersOf(f.template).forEach((mark) => { if (!OWN_MARKS.has(mark.toLowerCase()) && !labels.some((l) => l.toLowerCase() === mark.toLowerCase())) labels.push(mark); });
      const sc = { id: `sc-${Date.now().toString(36)}-${subs.length}`, name: clean(f.subCategory).replace(/[:\s]+$/, ''), category, fields: labels.map((label) => ({ label })) };
      subs.push(sc);
      addedSubs.push({ name: sc.name, category, labels });
    }
  });
  const next = { ...lists, categories: cats, subCategories: subs };
  if (Array.isArray(lists.subCategoryCategories)) {
    const carry = [...lists.subCategoryCategories];
    addedSubs.forEach((x) => { if (x.category && !carry.some((c) => normName(c) === normName(x.category))) carry.push(x.category); });
    next.subCategoryCategories = carry;
  }
  return { categories: addedCats, subCategories: addedSubs, lists: next };
}

/** A Payments category: any whose name has "payment" (Payments, Import Payments, Monthly Payments, Duty Payments...). */
export const isPaymentCategory = (category) => /payment/i.test(String(category || ''));

/** The narration of a report line: what comes after the first ": -" ("Name: - Being amount paid..." -> "Being amount paid..."); a line with no ": -" is all narration. */
export function narrationOf(line) {
  const text = clean(line);
  const m = /:\s*-\s+/.exec(text);
  return m ? text.slice(m.index + m[0].length) : text;
}

/** The Final Narration of an entry in a Payments category with a format: { text, missing } - or null (no Payments category, or no format for its Sub Category). */
export function finalNarration(entry, formats) {
  if (!entry || !isPaymentCategory(entry.category) || !entry.subCategory) return null;
  const f = findFormat(formats, entry.subCategory);
  if (!f) return null;
  const out = renderTemplate(f.template, entry);
  return { text: narrationOf(out.text), missing: out.missing };
}
