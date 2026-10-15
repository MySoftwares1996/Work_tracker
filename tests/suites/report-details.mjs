import { buildReportModel, reportModelToText, reportLineFor } from '../../src/workingDashboardReport.js';
import { paymentLists, withWebNarrationTypes, makeNarration } from '../../src/workingDashboardPayments.js';
import { blankEntry } from '../../src/workingDashboard.js';

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
}
