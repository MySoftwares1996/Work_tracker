/**
 * The web app's payment features, ported so the phone writes, reads and reports a payment exactly as the
 * web app does: Sub Categories (with their own rule fields), the Tally Narration builder, Import Payment
 * details, the vendor (payee) found in a narration field / sub category field / mail subject, and the small
 * per-entry work log the Daily Activity Report reads.
 *
 * Kept pure (no React, no storage) like workingDashboard.js. Entries use the phone's shape (title,
 * reference = the web app's description / mailChain); every other field keeps the web app's own name
 * (subCategory, subCategoryFields, paymentDetails, narration, workLog, skippedDates) so it syncs unchanged.
 *
 * `lists` = { subCategories, subCategoryCategories, narrationTypes } - the web app's lists, as they arrive
 * through Realtime Sync (see firebaseSyncCore.decodeLists), or the defaults below until they do.
 */

/* ---------- categories ---------- */

const s = (v) => String(v === undefined || v === null ? '' : v);
export const isDomesticPaymentCategory = (cat) => /domestic/i.test(s(cat)) && /payment/i.test(s(cat));
export const isImportPaymentCategory = (cat) => /import/i.test(s(cat)) && /payment/i.test(s(cat));
export const isUrgentPaymentCategory = (cat) => /urgent/i.test(s(cat)) && /payment/i.test(s(cat));
/** "In-Progress", "In Progress" and "in_progress" are the same status. */
export const normStatus = (status) => s(status).trim().toLowerCase().replace(/[-_\s]+/g, ' ');
/** A status that means no work has happened yet - never a Daily Activity Report line by itself. */
export const isUnstartedStatus = (status) => /not\s*(yet\s*)?start/i.test(s(status).trim());

/* ---------- the web app's default lists ---------- */

// Stable ids, so two phones (or a phone and a later web copy) seed the same records.
export const DEFAULT_NARRATION_TYPES = [
  { id: 'nr-adv-po', name: 'Advance against Purchase Order', hasPercent: true, phrase: 'Advance amount paid against Po No: ', docLabel: 'PO No', fields: [], leadFieldLabel: '' },
  { id: 'nr-adv2-po', name: '2nd Advance against Purchase Order', hasPercent: true, phrase: '2nd Advance amount paid against Po No: ', docLabel: 'PO No', fields: [], leadFieldLabel: '' },
  { id: 'nr-balance', name: 'Balance Payment against Purchase Order/Invoice', hasPercent: false, phrase: 'Balance amount paid against Invoice No: ', docLabel: 'Invoice No', fields: [], leadFieldLabel: '' },
  { id: 'nr-cod-inv', name: 'COD Charges against Invoice', hasPercent: false, phrase: 'Amount Paid twds COD Charges Against Invoice No: ', docLabel: 'Invoice No', fields: [], leadFieldLabel: '' },
  { id: 'nr-cod-order', name: 'COD Charges against Order Id', hasPercent: false, phrase: 'Amount Paid twds COD Charges Against Order Id: ', docLabel: 'Order Id', fields: [{ label: 'Vendor Name', options: [] }], leadFieldLabel: 'Vendor Name' },
  { id: 'nr-cod-po', name: 'COD Charges against PO', hasPercent: false, phrase: 'Amount Paid twds COD Charges Against PO No: ', docLabel: 'PO No', fields: [{ label: 'Vendor Name', options: [] }], leadFieldLabel: 'Vendor Name' },
  { id: 'nr-ic', name: 'I&C Charges', hasPercent: false, phrase: 'Amount paid twds I&C Charges for Order id: ', docLabel: 'Order Id', fields: [], leadFieldLabel: '' },
  { id: 'nr-emp-adv', name: 'Employee Advance Request', hasPercent: false, phrase: 'Amount Paid Against Employee Advance Request Form No: ', docLabel: 'Form No', fields: [], leadFieldLabel: '' },
  { id: 'nr-emp-set', name: 'Employee Advance Settlement', hasPercent: false, phrase: 'Amount Paid Against Employee Settlement Request Form No: ', docLabel: 'Form No', fields: [], leadFieldLabel: '' },
  { id: 'nr-inv', name: 'Payment against Invoice', hasPercent: false, phrase: 'amount paid against Invoice No: ', docLabel: 'Invoice No', fields: [], leadFieldLabel: '' },
  { id: 'nr-legal-case', name: 'Legal Charges (against Case No)', hasPercent: false, phrase: 'amount paid for Legal Charges against Case No: ', docLabel: 'Case No(s)', fields: [], leadFieldLabel: '' },
  { id: 'nr-legal', name: 'Legal Charges (without Case No)', hasPercent: false, phrase: 'amount paid for Legal Charges for ', docLabel: 'Description', fields: [], leadFieldLabel: '' },
];

/*
 * Narration types offered only on the website (web.app): the screen adds them to its lists with
 * withWebNarrationTypes. A `template` type writes its own sentence instead of "Being [%] phrase doc no":
 * {%} is the % ("30%"), {Label} is that field's value.
 */
export const WEB_NARRATION_TYPES = [
  {
    id: 'nr-import-remit', name: 'Imports Payments', hasPercent: true, phrase: '', docLabel: '', leadFieldLabel: '',
    template: 'Initiated an outward remittance transaction in favor of {Beneficiary Name} towards the {Payment Towards} {%} payment {Payment Against}.',
    fields: [
      { label: 'Beneficiary Name', options: [] },
      { label: 'Payment Towards', options: ['Advance', 'Balance', 'After Credit Completed'] },
      { label: 'Payment Against', options: ['Against Production of Goods', 'Before Dispatch of Goods', 'Against BOE'] },
    ],
  },
];

/** The lists with the web-only narration types added (one already in the list by id or name is left as it is). */
export function withWebNarrationTypes(lists) {
  const have = lists.narrationTypes || [];
  const add = WEB_NARRATION_TYPES.filter((x) => !have.some((nr) => nr.id === x.id || nr.name === x.name));
  return add.length ? { ...lists, narrationTypes: [...have, ...add] } : lists;
}

/** A narration type that needs no document number (a template type without a document label). */
export const narrationNeedsDoc = (nr) => !(nr && nr.template && !nr.docLabel);

// The web app's Import Payment choices (index.html, pdPaymentType / pdPaymentAgainst).
export const PAYMENT_TYPES = ['Advance', 'Balance', 'Remaining Balance'];
export const PAYMENT_AGAINST = ['Before Dispatch', 'Before Production', 'Against BOE', 'Against BL', 'Against CI', 'After Credit Period'];

/**
 * The payment lists to use: the web app's when they have arrived, else the defaults. Sub categories saved as
 * plain names (before rule fields existed) become { id, name, fields: [] }. With no saved choice of which
 * categories carry a Sub Category, the ones that look like Duty / Demand Draft / Import / Domestic / Urgent
 * payments do - the web app's one-time default.
 */
export function paymentLists(w = {}, categories = []) {
  const subCategories = (Array.isArray(w.subCategories) ? w.subCategories : [])
    .map((sc, i) => (typeof sc === 'string' ? { id: `sc-${i}-${sc}`, name: sc, fields: [] } : sc))
    .filter((sc) => sc && sc.name)
    .map((sc) => ({ ...sc, fields: Array.isArray(sc.fields) ? sc.fields.filter((f) => f && f.label) : [] }));
  const narrationTypes = (Array.isArray(w.narrationTypes) ? w.narrationTypes : DEFAULT_NARRATION_TYPES)
    .filter((nr) => nr && nr.name)
    .map((nr) => ({ ...nr, fields: Array.isArray(nr.fields) ? nr.fields.filter((f) => f && f.label) : [], leadFieldLabel: typeof nr.leadFieldLabel === 'string' ? nr.leadFieldLabel : '' }));
  const subCategoryCategories = Array.isArray(w.subCategoryCategories)
    ? w.subCategoryCategories
    : (categories || []).filter((c) => /duty/i.test(s(c)) || /demand\s*draft/i.test(s(c)) || isDomesticPaymentCategory(c) || isUrgentPaymentCategory(c) || isImportPaymentCategory(c));
  return { subCategories, narrationTypes, subCategoryCategories };
}

/* ---------- Key Points ---------- */

/** Key Points as the web app keeps them: [{ key, value }]. Plain strings (older phone entries) become { key: '', value }. */
export function normalizeKeyPoints(kp) {
  if (kp === undefined || kp === null || kp === '') return [];
  if (typeof kp === 'string') {
    try { return normalizeKeyPoints(JSON.parse(kp)); } catch { return [{ key: 'Note', value: kp }]; }
  }
  if (Array.isArray(kp)) {
    return kp.map((p) => (p && typeof p === 'object'
      ? { key: s(p.key ?? p.label ?? ''), value: s(p.value ?? p.text ?? '') }
      : { key: '', value: s(p) })).filter((p) => p.key || p.value);
  }
  if (typeof kp === 'object') return Object.keys(kp).map((k) => ({ key: k, value: s(kp[k]) }));
  return [];
}
/** "Amount: ₹50,000", or the bare value when there is no key. */
export const keyPointText = (p) => (p && typeof p === 'object' ? [s(p.key).trim(), s(p.value).trim()].filter(Boolean).join(': ') : s(p));

/* ---------- work log ---------- */

const p2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/**
 * The web app's per-entry diary of real status moves ({ d: 'YYYY-MM-DD', s: status }, the last 20), so the
 * report knows what was worked on each day. A move to "Not yet started" is not work.
 */
export function noteWork(entry, status, now = new Date()) {
  if (!entry || isUnstartedStatus(status)) return entry;
  const log = Array.isArray(entry.workLog) ? entry.workLog.slice(-19) : [];
  log.push({ d: dayKey(now), s: s(status) });
  return { ...entry, workLog: log };
}
export const workedOn = (entry, date) => Array.isArray(entry?.workLog) && entry.workLog.some((w) => w && w.d === date);

/* ---------- Sub Category ---------- */

/*
 * A category carries a Sub Category only once there are Sub Categories to pick: before the web app's lists arrive
 * (or on a phone never signed in) none exist, and asking for one blocked completing every payment for good.
 */
export const categoryHasSubCategory = (lists, cat) => !!cat && (lists?.subCategories || []).length > 0 && (lists?.subCategoryCategories || []).includes(cat);
export const findSubCategory = (lists, name) => (lists?.subCategories || []).find((x) => x.name === name) || null;

/** True once the entry's Sub Category and every field its rule asks for are filled in - or none is needed. */
export function subCategoryComplete(entry, lists) {
  if (!entry || !categoryHasSubCategory(lists, entry.category)) return true;
  if (!entry.subCategory) return false;
  const sc = findSubCategory(lists, entry.subCategory);
  if (!sc || !sc.fields.length) return true;
  const vals = entry.subCategoryFields || {};
  return sc.fields.every((f) => s(vals[f.label]).trim() !== '');
}

/* ---------- payee (vendor) ---------- */

// Only a label that IS the vendor's name: "Vendor Name", "Name of Payee", "Pay To", "Party Name", "Beneficiary".
export const PAYEE_RX = /^\s*(?:name\s+of\s+(?:the\s+)?)?(?:vendor|payee|paye|pay\s*to|party|beneficiary|supplier)(?:'?s)?(?:\s+name)?\s*:*\s*$/i;
const escRx = (x) => s(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function leadLabels(nr) {
  if (!nr) return [];
  if (Array.isArray(nr.leadFieldLabels)) return nr.leadFieldLabels.filter(Boolean);
  return nr.leadFieldLabel ? [nr.leadFieldLabel] : [];
}
export const isPayeeField = (nr, label) => !!label && (leadLabels(nr).includes(label) || PAYEE_RX.test(s(label)));

/** "Label: value" for each filled Sub Category field, except the vendor field (it leads the report line). */
export function subCategoryText(sc, vals = {}) {
  if (!sc || !sc.fields || !sc.fields.length) return '';
  return sc.fields.map((f) => {
    if (PAYEE_RX.test(s(f.label))) return '';
    const v = s((vals || {})[f.label]).trim();
    return v ? `${s(f.label).replace(/[\s:]+$/, '')}: ${v}` : '';
  }).filter(Boolean).join(', ');
}

export function subCategoryPayee(entry, lists) {
  const sc = findSubCategory(lists, entry?.subCategory);
  if (!sc) return '';
  const vals = entry.subCategoryFields || {};
  const f = sc.fields.find((x) => PAYEE_RX.test(s(x.label)) && s(vals[x.label]).trim());
  return f ? s(vals[f.label]).trim() : '';
}

/** The Sub Category part of a saved narration, rebuilt with the current rules when the Sub Category is known. */
export function narrationSubText(entry, lists) {
  const sc = findSubCategory(lists, entry?.subCategory);
  if (sc) return subCategoryText(sc, entry.subCategoryFields);
  const n = entry?.narration || {};
  return n.subCategoryText !== undefined ? s(n.subCategoryText) : '';
}

/** The vendor in a mail subject: "PURE EV: Purchase Order - G Power Auto Parts - INPO/PP/26-27/0155" -> "G Power Auto Parts". */
export function payeeFromMail(mail) {
  const str = s(mail).replace(/\s+/g, ' ').trim();
  if (!str) return '';
  const parts = str.split(/\s+[-–—|]\s+/).map((x) => x.trim()).filter(Boolean);
  const isRef = (p) => /[A-Z]{2,}[A-Z0-9]*\/[A-Z0-9/-]*\d/i.test(p) || /^(po|wo|inv|invoice|bill)\s*(no\.?|#|:)?\s*\d/i.test(p);
  const isLabel = (p) => /:\s*$/.test(p) || (/(purchase|work|service)\s+order|^po$|^invoice$|^payment$|^re:|^fw:|^fwd:/i.test(p) && p.split(' ').length <= 5);
  const i = parts.findIndex(isRef);
  for (let j = i - 1; j >= 0; j--) { if (!isLabel(parts[j]) && !isRef(parts[j])) return parts[j]; }
  const k = parts.findIndex((p) => /(purchase|work|service)\s+order/i.test(p));
  if (k >= 0 && parts[k + 1] && !isRef(parts[k + 1])) return parts[k + 1];
  return '';
}

/** Takes the vendor name out of a mail chain (for the Tally narration). */
export function stripPayeeFromMail(mail, payee) {
  let out = s(mail);
  const p = s(payee).trim();
  if (!out || !p) return out.trim();
  const esc = escRx(p);
  out = out.replace(new RegExp(`\\s*[-–—|]\\s*${esc}(?=\\s*[-–—|]|\\s*$)`, 'i'), '').replace(new RegExp(esc, 'i'), '');
  return out.replace(/\s*[-–—|]\s*[-–—|]\s*/g, ' - ').replace(/^\s*[-–—|]\s*|\s*[-–—|]\s*$/g, '').replace(/\s+/g, ' ').trim();
}

/** What leads the report line: every filled Lead field in field order, joined with " - "; else the first vendor-name field. */
export function payeeValue(nr, fieldsValues = {}) {
  const fv = fieldsValues || {};
  const val = (l) => s(fv[l]).trim();
  const leads = leadLabels(nr);
  if (leads.length) {
    const fields = (nr && nr.fields) || [];
    const order = fields.map((f) => f.label).filter((l) => leads.includes(l)).concat(leads.filter((l) => !fields.some((f) => f.label === l)));
    const got = order.map(val).filter(Boolean);
    if (got.length) return got.join(' - ');
  }
  const labels = (nr && nr.fields ? nr.fields.map((f) => f.label) : []).concat(Object.keys(fv));
  for (const l of labels) if (PAYEE_RX.test(s(l)) && val(l)) return val(l);
  return '';
}

export const findNarrationType = (lists, n) => (n ? (lists?.narrationTypes || []).find((x) => x.name === n.typeName || (n.typeId && x.id === n.typeId)) || null : null);

/** The vendor for an entry: its narration's payee field, else a Sub Category vendor field, else the one in the mail chain. */
export function taskPayee(entry, lists) {
  const n = entry?.narration || {};
  const nr = findNarrationType(lists, n);
  return s((nr && payeeValue(nr, n.fieldsValues)) || subCategoryPayee(entry, lists) || payeeFromMail(entry?.reference) || '').trim();
}

/* ---------- Tally narration ---------- */

/**
 * "Being " + [%] + phrase + document no + other extra fields + note + Sub Category fields + mail chain.
 * The payee never goes in (not even through the mail subject).
 */
/**
 * web.app writes document numbers the Tally way: several are joined with " & " (typed with commas, "and" or "&"), and a PO
 * number follows as "& Po No: ...". The phone keeps the earlier text. platformSetup.web.js turns `web` on.
 */
export const narrationStyle = { web: false };
export const joinNumbers = (v) => s(v).split(/\s*(?:[,;&\n]|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean).join(' & ');
/** web.app: the PO No box is offered unless the type is itself "against PO No" (its own number is the PO). */
export const narrationOffersPo = (nr) => !!nr && !nr.template && narrationNeedsDoc(nr) && !/^\s*po\b/i.test(s(nr.docLabel));

export function buildNarrationText(nr, { percent, docNo, poNo, purpose, mailChain, fieldsValues, subCategoryText: subText, placeholders = false } = {}) {
  if (!nr) return '';
  const fv = fieldsValues || {};
  // The form's preview shows a blank field as [Label], so a missing name or % is seen before copying.
  const blank = (label) => (placeholders ? `[${label}]` : '');
  if (nr.template) {
    const pct = s(percent).trim();
    let text = s(nr.template).replace(/\{([^{}]+)\}/g, (m, key) => (key === '%' ? (pct ? `${pct}%` : blank('%')) : (s(fv[key]).trim() || blank(key))));
    text = text.replace(/\s+([.,])/g, '$1');
    const end = text.match(/[.]\s*$/) ? '.' : '';
    if (end) text = text.replace(/[.]\s*$/, '');
    [s(docNo).trim(), s(purpose).trim(), s(subText).trim()].filter(Boolean).forEach((bit) => { text += ` ${bit}`; });
    text += end;
    if (s(mailChain).trim()) {
      const mail = stripPayeeFromMail(mailChain, payeeValue(nr, fv) || payeeFromMail(mailChain));
      if (mail) text += ` ${mail}`;
    }
    return text.replace(/\s+/g, ' ').trim();
  }
  const extra = (nr.fields || []).filter((f) => !isPayeeField(nr, f.label)).map((f) => s(fv[f.label]).trim()).filter(Boolean);
  let text = 'Being ';
  if (nr.hasPercent) text += s(percent).trim() ? `${s(percent).trim()}% ` : (placeholders ? '[%] ' : '');
  const web = narrationStyle.web;
  text += s(nr.phrase) + ((web ? joinNumbers(docNo) : s(docNo).trim()) || (narrationNeedsDoc(nr) ? blank(nr.docLabel || 'Document No') : ''));
  if (web && narrationOffersPo(nr) && joinNumbers(poNo)) text += ` & Po No: ${joinNumbers(poNo)}`;
  [extra.join(' '), s(purpose).trim(), s(subText).trim()].filter(Boolean).forEach((bit) => { text += ` ${bit}`; });
  if (s(mailChain).trim()) {
    const payee = payeeValue(nr, fv) || payeeFromMail(mailChain);
    const mail = stripPayeeFromMail(mailChain, payee);
    if (mail) text += ` ${mail}`;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** The narration fields still blank in a form draft ({ percent, docNo, fieldsValues }): their labels, in form order. */
export function narrationMissing(nr, draft = {}) {
  if (!nr) return [];
  const out = [];
  if (nr.hasPercent && !s(draft.percent).trim()) out.push('%');
  if (narrationNeedsDoc(nr) && !s(draft.docNo).trim()) out.push(nr.docLabel || 'Document No');
  (nr.fields || []).forEach((f) => { if (!s((draft.fieldsValues || {})[f.label]).trim()) out.push(f.label); });
  return out;
}

/** Report form: "Payee: narration". */
export function buildNarrationReportText(nr, parts = {}) {
  const body = buildNarrationText(nr, parts);
  const payee = payeeValue(nr, parts.fieldsValues);
  return payee ? `${payee}: ${body}` : body;
}

/** An entry's narration rebuilt from its saved parts with the current rules ('report' = "Payee: ..."). */
export function narrationFor(entry, lists, kind = 'tally') {
  const n = entry && entry.narration;
  if (!n) return '';
  const nr = findNarrationType(lists, n);
  if (!nr) return s(n.text || n.reportText);
  const parts = { percent: n.percent, docNo: n.docNo, purpose: n.purpose, fieldsValues: n.fieldsValues, subCategoryText: narrationSubText(entry, lists), mailChain: n.includeMail === false ? '' : entry.reference };
  return kind === 'report' ? buildNarrationReportText(nr, parts) : buildNarrationText(nr, parts);
}

/**
 * The narration object stored on an entry (the web app's shape), from a form draft
 * { typeName, percent, docNo, purpose, fieldsValues, includeMail }; null when no type is picked.
 */
export function makeNarration(draft, entry, lists) {
  const nr = (lists?.narrationTypes || []).find((x) => x.name === draft?.typeName);
  if (!nr) return null;
  const percent = s(draft.percent).trim();
  const docNo = s(draft.docNo).trim();
  const poNo = s(draft.poNo).trim();
  const purpose = s(draft.purpose).trim();
  const includeMail = draft.includeMail === true;
  const fieldsValues = Object.fromEntries(Object.entries(draft.fieldsValues || {}).filter(([, v]) => s(v).trim()));
  const sc = findSubCategory(lists, entry?.subCategory);
  const subText = subCategoryText(sc, entry?.subCategoryFields);
  const parts = { percent, docNo, poNo, purpose, fieldsValues, subCategoryText: subText };
  return {
    typeId: nr.id, typeName: nr.name, percent, docNo, poNo, purpose, fieldsValues, subCategoryText: subText, includeMail,
    text: buildNarrationText(nr, { ...parts, mailChain: includeMail ? entry?.reference : '' }),       // Copy Narration (Tally)
    reportText: buildNarrationReportText(nr, parts),                                                 // the report, without the mail chain
  };
}

/* ---------- what the entry form shows ---------- */

/**
 * Which payment sections the form shows for a category + status, as on the web app: Import payment details
 * while an Import Payment is In Progress; Sub Category (if the category carries one), Tally Narration and the
 * DAR tick once the entry is Completed.
 */
export function paymentSections(category, status, lists, done = false) {
  const st = normStatus(status);
  const completed = done || st === 'completed';
  return {
    importDetails: isImportPaymentCategory(category) && st === 'in progress',
    subCategory: categoryHasSubCategory(lists, category) && completed,
    narration: completed,
  };
}

/** The message the web app shows when a required payment field is missing, or ''. */
export function validatePaymentDetails(entry, lists, done = false) {
  const st = normStatus(entry.status);
  const completed = done || st === 'completed';
  if (isImportPaymentCategory(entry.category) && st === 'in progress') {
    const pd = entry.paymentDetails || {};
    if (!s(pd.paymentPercent).trim() || !pd.paymentType || !pd.paymentAgainst) return 'Import Payment marked In Progress needs Payment %, Payment Type, and Payment Against.';
  }
  if (categoryHasSubCategory(lists, entry.category) && completed) {
    if (!entry.subCategory) return 'Select a Sub Category before marking this Completed.';
    const sc = findSubCategory(lists, entry.subCategory);
    const missing = sc ? sc.fields.filter((f) => !s((entry.subCategoryFields || {})[f.label]).trim()) : [];
    if (missing.length) return `Fill in ${missing.map((f) => f.label).join(', ')} before marking this Completed.`;
  }
  if (entry.narration) {
    const nr = findNarrationType(lists, entry.narration);
    // A type no longer in the lists (nr null) cannot say it needs a document number.
    if (nr && narrationNeedsDoc(nr) && !s(entry.narration.docNo).trim()) return `Enter the ${nr.docLabel || 'document number'} for the Tally Narration, or clear the Narration Type.`;
    if (nr && nr.hasPercent && !s(entry.narration.percent).trim()) return 'Enter the % for the Tally Narration.';
    const missing = nr ? nr.fields.filter((f) => !s((entry.narration.fieldsValues || {})[f.label]).trim()) : [];
    if (missing.length) return `Fill in ${missing.map((f) => f.label).join(', ')} for the Tally Narration.`;
  }
  return '';
}
