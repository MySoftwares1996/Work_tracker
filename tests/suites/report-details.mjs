import { buildReportModel, reportModelToText, reportLineFor } from '../../src/workingDashboardReport.js';
import { paymentLists, withWebNarrationTypes, makeNarration } from '../../src/workingDashboardPayments.js';
import { blankEntry } from '../../src/workingDashboard.js';
import { collectReportData, dutyBoeNo, entryAmount, buildPeriodSummary, paymentsByVendor } from '../../src/workingDashboardReport.js';
import { bankFollowUpReportLine, addBankFollowUp } from '../../src/bankFollowUp.js';
import { validatePaymentDetails, DEFAULT_NARRATION_TYPES } from '../../src/workingDashboardPayments.js';
import { fieldValue, renderTemplate, effectiveFormats, readReportFormats, removedFormat, SAMPLE_FORMATS } from '../../src/reportFormats.js';
import { parseQuickAdd } from '../../src/quickAdd.js';
import { factsOf, checkFacts } from '../../src/reportStyle.js';
import { templateFrom, saveTemplate, MAX_TEMPLATES } from '../../src/templates.js';

export async function run({ ck, section }) {
  section('Daily Activity Report (web.app): every line from the notes and the Tally narration');
  const lists = withWebNarrationTypes(paymentLists({}));
  const done = (patch) => ({ ...blankEntry(), done: true, status: 'Completed', completedAt: new Date(2026, 9, 7, 12, 0).toISOString(), ...patch });
  const date = '2026-10-07';

  const pay = done({ id: 'p1', title: 'Pay vendor', category: 'Vendor Payments', notes: 'UTR 1234567 shared with vendor' });
  pay.narration = makeNarration({ typeName: 'Payment against Invoice', docNo: 'INV-77' }, pay, lists);
  ck('a payment line keeps its narration and now adds its notes',
    reportLineFor(pay, lists, date, { details: true }) === 'Being amount paid against Invoice No: INV-77. UTR 1234567 shared with vendor.', reportLineFor(pay, lists, date, { details: true }));
  ck('without details (the APK) the payment line is as before', reportLineFor(pay, lists, date) === 'Being amount paid against Invoice No: INV-77');

  const imp = done({ id: 'i1', title: 'Remit to ABC', category: 'Import Payment', paymentDetails: { beneficiary: 'ABC', paymentType: 'Advance', paymentPercent: '30', paymentAgainst: 'Before Dispatch' }, notes: 'Swift copy sent to vendor' });
  imp.narration = makeNarration({ typeName: 'Imports Payments', percent: '30', fieldsValues: { 'Beneficiary Name': 'ABC Trading Co', 'Payment Towards': 'Advance', 'Payment Against': 'Before Dispatch of Goods' } }, imp, lists);
  ck('an import payment is written from its Imports Payments narration, then its notes',
    reportLineFor(imp, lists, date, { details: true }) === 'Initiated an outward remittance transaction in favor of ABC Trading Co towards the Advance 30% payment Before Dispatch of Goods. Swift copy sent to vendor.', reportLineFor(imp, lists, date, { details: true }));

  const duty = done({ id: 'd1', title: 'Duty', category: 'Duty Payment', subCategory: 'Duty', notes: 'Challan saved in shared drive' });
  ck('a duty line keeps its set wording and adds the notes', reportLineFor(duty, lists, date, { details: true }).endsWith('Challan saved in shared drive.'));

  const other = done({ id: 'o1', title: 'GST reconciliation', category: 'Reconciliation', notes: 'Matched 42 invoices\nMatched 42 invoices' });
  ck('other work: title and notes, a note never twice', reportLineFor(other, lists, date, { details: true }) === 'Matched 42 invoices.');

  const text = reportModelToText(buildReportModel({ entries: [pay, imp, other], date, lists, details: true }));
  ck('the whole report carries every note', ['UTR 1234567', 'Swift copy sent', 'Matched 42 invoices'].every((x) => text.includes(x)));

  section('Review fixes: report, formats, quick add, templates');
  // 1. routine activities: an open-office USD holiday and a Sunday
  const routine = [{ id: 'f1', text: 'Daily NOSTRO reconciliation', active: true }];
  const fixed = (o) => buildReportModel({ entries: [], fixedActivities: routine, ...o }).sections.find((x) => x.key === 'fix').rows.length;
  ck('an office-open USD holiday keeps the routine activities', fixed({ date: '2026-10-07', holidays: [{ date: '2026-10-07', tag: 'USD' }] }) === 1);
  ck('an office-closed holiday drops them', fixed({ date: '2026-10-07', holidays: [{ date: '2026-10-07', tag: 'Indian' }] }) === 0);
  ck('a Sunday drops them', fixed({ date: '2026-10-04' }) === 0);
  // 2. a follow-up is judged as of the report date
  const fu = { ...blankEntry(), id: 'fu', title: 'LC with Bank C', category: "Bank Follow Up's", status: 'In-Progress', dueAt: new Date(2026, 9, 12, 10).toISOString(),
    bankFollowUps: [{ d: '2026-10-05', at: new Date(2026, 9, 5, 11).toISOString(), remarks: 'Under review', next: new Date(2026, 9, 9, 10).toISOString() }],
    workLog: [{ d: '2026-10-05', s: 'Followed up' }] };
  const fuDone = { ...fu, done: true, status: 'Completed', completedAt: new Date(2026, 9, 9, 12).toISOString() };
  ck('a follow-up completed later is still in the older report', collectReportData([fuDone], '2026-10-05', lists).followed.length === 1);
  ck('and its line shows the next date, not "Completed."', /Next follow-up: 9 Oct 2026/.test(bankFollowUpReportLine(fuDone, '2026-10-05')) && !/Completed/.test(bankFollowUpReportLine(fuDone, '2026-10-05')));
  ck('on its completion day it is not "followed up" any more', collectReportData([fuDone], '2026-10-09', lists).followed.length === 0);
  const fuSame = { ...fu, bankFollowUps: [{ d: '2026-10-09', at: new Date(2026, 9, 9, 11).toISOString(), remarks: 'Cleared', next: null }], done: true, completedAt: new Date(2026, 9, 9, 12).toISOString() };
  ck('completed that day ends "Completed."', /Completed\.$/.test(bankFollowUpReportLine(fuSame, '2026-10-09')));
  // 14. status spelling from the account's list
  const nys = { ...blankEntry(), id: 'n', title: 'x', category: "Bank Follow Up's", status: 'Not Yet Started' };
  ck('the follow-up uses the list\'s spelling of In Progress', addBankFollowUp(nys, { remarks: 'r', statuses: ['Not Yet Started', 'In Progress', 'Pending'] }, new Date(2026, 9, 5, 11)).status === 'In Progress');
  ck('and the default when the list has none', addBankFollowUp(nys, { remarks: 'r' }, new Date(2026, 9, 5, 11)).status === 'In-Progress');
  // 3. BOE number is one token
  ck('BOE No stops at the number', dutyBoeNo({ notes: 'BOE No 9876543 through ICEGATE', title: '' }, lists) === '9876543');
  ck('a BOE number with a prefix is kept', dutyBoeNo({ notes: 'BOE No: BOE/26/118 paid', title: '' }, lists) === 'BOE/26/118');
  ck('no digit, no BOE number', dutyBoeNo({ notes: 'BOE pending with customs', title: '' }, lists) === '');
  // 8. foreign currency is not rupees
  ck('"Amount: USD 1,000" is not rupees', entryAmount({ keyPoints: [{ key: 'Amount', value: 'USD 1,000' }] }) === 0 && entryAmount({ keyPoints: [{ key: 'Amount', value: '$500' }] }) === 0);
  ck('a rupee amount beside it still counts', entryAmount({ keyPoints: [{ key: 'Amount', value: 'USD 1,000' }, { key: 'Paid', value: 'Rs 80,000' }] }) === 80000);
  const usdPay = { ...blankEntry(), id: 'u', title: 'u', category: 'Vendor Payments', done: true, status: 'Completed', completedAt: new Date(2026, 9, 6, 12).toISOString(), keyPoints: [{ key: 'Amount', value: 'USD 1,000' }] };
  ck('payments by vendor skips it too', paymentsByVendor([usdPay], lists, '2026-10').total === 0);
  // 9. the summary counts payments as the report does
  const dutyDone = { ...blankEntry(), id: 'd', title: 'Duty', category: 'Duty Payments', done: true, status: 'Completed', completedAt: new Date(2026, 9, 6, 12).toISOString() };
  const impDone = { ...dutyDone, id: 'i', category: 'Import Payments' };
  const sm = buildPeriodSummary({ entries: [dutyDone, impDone, usdPay], kind: 'week', date: '2026-10-07', lists, now: new Date(2026, 9, 8) });
  ck('Duty and Import payments are not counted as payments', sm.completed === 3 && sm.payments === 1);
  const rupPay = { ...usdPay, id: 'r', keyPoints: [{ key: 'Amount', value: 'Rs 5,000' }] };
  const dutyAmt = { ...dutyDone, keyPoints: [{ key: 'Amount', value: 'Rs 9,000' }] };
  const impAmt = { ...impDone, keyPoints: [{ key: 'Amount', value: 'Rs 7,000' }] };
  const pv = paymentsByVendor([rupPay, dutyAmt, impAmt], lists, '2026-10');
  ck('payments by vendor leaves Duty and Import out, as the report does', pv.count === 1 && pv.total === 5000);
  // 10. unknown narration type does not block
  const orphan = { ...blankEntry(), category: 'Vendor Payments', narration: { typeName: 'Deleted type', docNo: '' } };
  ck('a narration type gone from the lists does not demand a document number', validatePaymentDetails(orphan, lists, true) === '');
  ck('the employee phrases are spelt right', DEFAULT_NARRATION_TYPES.every((t) => !/Emploee/.test(t.phrase)));
  // 7. report format marks
  const withUsd = { subCategoryFields: { 'USD Amount': '1000' } };
  ck('a rupee mark is not filled from "USD Amount"', fieldValue(withUsd, 'Amount') === '' && renderTemplate('₹{Amount}', withUsd).missing.length === 1);
  ck('a USD mark is', fieldValue(withUsd, 'USD amount') === '1000');
  ck('the exact label beats a longer one', fieldValue({ subCategoryFields: { 'Invoice No Date': 'x', 'invoice no': '77' } }, 'Invoice No') === '77');
  // 5. removing a sample-backed format sticks
  const gone = [removedFormat('PO Advance Payment', 'Payments')];
  const eff = effectiveFormats(gone);
  ck('a removed sample format stays removed', !eff.some((f) => /^PO Advance/.test(f.subCategory)) && eff.length === SAMPLE_FORMATS.length - 1);
  ck('the marker is kept when read back from meta/tools', readReportFormats({ reportFormats: gone })[0].removed === true);
  ck('with no marker the samples are all there', effectiveFormats([]).length === SAMPLE_FORMATS.length);
  // 6. quick add
  const qnow = new Date(2026, 9, 17, 10, 0);
  const qa = (t, o = {}) => parseQuickAdd(t, { now: qnow, ...o });
  ck('the longest category wins', qa('call bank follow up tomorrow', { categories: ['Bank', 'Bank Follow Up'] }).category === 'Bank Follow Up');
  ck('"decision 5" is not 5 Dec', qa('decision 5 pending').dueAt === null);
  ck('"5 marketing" is not 5 Mar', qa('5 marketing plans').dueAt === null);
  ck('"5 dec" still is', new Date(qa('pay 5 dec').dueAt).getMonth() === 11);
  ck('a past date with no year goes to next year', new Date(qa('file 5 oct').dueAt).getFullYear() === 2027 && new Date(qa('file by 5/10').dueAt).getFullYear() === 2027);      // adjusted: a numeric date needs "by/on/before/till" or a year
  ck('a day or month out of range is not a date', qa('INV 45-13').dueAt === null && qa('INV 45-13').title === 'INV 45-13' && qa('ref 31/02').dueAt === null);
  // 12. templates keep the sub category
  const tp = templateFrom({ title: 'Rent', category: 'Payments', subCategory: 'Rent Payments', subCategoryFields: { Month: 'Oct', Premises: 'HO' } });
  ck('a template keeps the sub category and its field labels, not values', tp.fields.subCategory === 'Rent Payments' && Object.keys(tp.fields.subCategoryFields).join() === 'Month,Premises' && Object.values(tp.fields.subCategoryFields).every((v) => v === ''));
  ck('templates are capped by the named limit', Array.from({ length: MAX_TEMPLATES + 5 }).reduce((l, _, n) => saveTemplate(l, { name: `t${n}`, fields: {} }), []).length === MAX_TEMPLATES);
  // 13. report style
  ck('"Ahmed Khan" is a name', factsOf('Ahmed Khan confirmed at the bank').includes('Ahmed Khan'));
  ck('a leading verb is still cut', factsOf('Prepared Tech Profuse payment').includes('Tech Profuse'));
  const cm = { sections: [{ rows: [{ line: 'Paid 250 to the vendor' }] }] };
  ck('the fact 250 is not found inside 2500', !checkFacts(cm, '* Paid 2500 to the vendor').ok && checkFacts(cm, '* Paid 250 to the vendor').ok);
}
