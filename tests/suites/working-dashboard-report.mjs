import {
  buildReportModel, reportModelToText, reportLineFor, isPaymentCategory, verifyAiRewrite, mergeAiReport, DEFAULT_PAYMENT_INTRO,
  dutyBoeNo, importReportLine, notesForReport, isPaymentEntry,
} from '../../src/workingDashboardReport.js';
import { blankEntry } from '../../src/workingDashboard.js';
import { paymentLists, DEFAULT_NARRATION_TYPES } from '../../src/workingDashboardPayments.js';

export async function run({ ck, section }) {
  const date = '2026-10-03';
  const e = (patch) => ({ ...blankEntry(), ...patch });
  const at = (h, m = 0, d = 3) => new Date(2026, 9, d, h, m).toISOString();
  const lists = paymentLists({
    subCategories: [{ id: 's1', name: 'COD Charges', fields: [{ label: 'Vendor Name', options: [] }, { label: 'Order Id', options: [] }] }],
    subCategoryCategories: ['Domestic Payment', 'Duty Payment'],
    narrationTypes: DEFAULT_NARRATION_TYPES,
  });
  const narr = (typeName, extra = {}) => ({ typeName, typeId: (DEFAULT_NARRATION_TYPES.find((x) => x.name === typeName) || {}).id, percent: '', docNo: '', purpose: '', fieldsValues: {}, ...extra });

  section('Working Dashboard Report: lines, as the web app writes them');
  ck('isPaymentCategory still names any payment category', isPaymentCategory('payments') && isPaymentCategory('Urgent Payments') && !isPaymentCategory('MIS'));
  ck('a task with notes reads what was done, without the task name in front', reportLineFor(e({ title: 'Send GST mail', notes: 'Mailed to Rami' }), lists) === 'Mailed to Rami.');
  ck('a task without notes is the task itself (the AI rewrite turns it into a sentence)', reportLineFor(e({ title: 'Reviewed ledger' }), lists) === 'Reviewed ledger');
  ck('notes that begin with the name are not repeated after it', reportLineFor(e({ title: 'Cash Inflow & Outflow Statement', notes: 'Cash Inflow & Outflow Statement - prepared daily and monthly' }), lists) === 'Prepared daily and monthly.', reportLineFor(e({ title: 'Cash Inflow & Outflow Statement', notes: 'Cash Inflow & Outflow Statement - prepared daily and monthly' }), lists));
  ck('Past Due remark stamps, bullets and title repeats are taken out of the notes',
    notesForReport(e({ title: 'Call bank', notes: '[1 Oct] - spoke to RM\n* spoke to RM\nCall bank' })).join('|') === 'Spoke to RM.');
  const paid = e({
    title: 'Pay G Power', category: 'Vendor Payments', reference: 'PURE EV: Purchase Order - G Power Auto Parts - INPO/PP/26-27/0155',
    narration: narr('Advance against Purchase Order', { percent: '30', docNo: 'INPO/PP/26-27/0155' }),
  });
  ck('a narrated payment is a payment line', isPaymentEntry(paid, lists));
  ck('...read "Vendor: narration", the vendor taken from the mail subject and the mail chain left out',
    reportLineFor(paid, lists) === 'G Power Auto Parts: Being 30% Advance amount paid against Po No: INPO/PP/26-27/0155', reportLineFor(paid, lists));
  const cod = e({ title: 'COD', category: 'Vendor Payments', narration: narr('COD Charges against Order Id', { docNo: 'OD123', fieldsValues: { 'Vendor Name': 'Devi Cargo' } }) });
  ck('a lead field (Vendor Name) leads the line and stays out of the narration', reportLineFor(cod, lists) === 'Devi Cargo: Being Amount Paid twds COD Charges Against Order Id: OD123', reportLineFor(cod, lists));
  const duty = e({ title: 'Duty for BOE', category: 'Duty Payment', done: true, notes: 'BOE No: 1234567' });
  ck('a completed duty payment reads the set ICEGATE line with its BOE No',
    reportLineFor(duty, lists) === 'Made duty payment against BOE No: 1234567 through ICEGATE wallet recharge. The duty payment has been verified with the BOE.');
  ck('...the BOE No is also read from a BOE field', dutyBoeNo(e({ subCategoryFields: { 'BOE No': '99/88' } }), lists) === '99/88');
  const imp = e({ title: 'Remit to supplier', category: 'Import Payments', paymentDetails: { beneficiary: 'Shenzhen Co', paymentPercent: '30', paymentType: 'Advance', paymentAgainst: 'Before Dispatch' } });
  ck('an Import Payment reads the outward remittance line', importReportLine(imp, lists) === 'Initiated an outward remittance transaction in favor of Shenzhen Co towards the advance 30% payment before dispatch.', importReportLine(imp, lists));
  ck('...and with no details it is an ordinary line', importReportLine(e({ category: 'Import Payments' }), lists) === null);

  section('Working Dashboard Report: what goes in which section');
  const worked = (d = date, s = 'In-Progress') => [{ d, s }];
  const entries = [
    e({ id: '1', ...paid, dar: true, done: true, completedAt: at(11) }),
    e({ id: '2', ...paid, title: 'Pay G Power again', dar: true, done: true, completedAt: at(12) }),       // same line - payments are never deduped
    e({ id: '3', title: 'Reconcile NOSTRO', notes: 'Done for the day', done: true, completedAt: at(9) }),   // in by default (the web app's "Done + DAR")
    e({ id: '4', title: 'Done only', notes: 'x', dar: false, done: true, completedAt: at(9) }),            // "Done": left out, counted
    e({ id: '5', title: 'Done yesterday', done: true, completedAt: at(9, 0, 2) }),
    e({ id: '6', title: 'Chasing a reply', notes: 'Followed up by phone', workLog: worked() }),             // worked on today
    e({ id: '7', title: 'Edited only', notes: 'x', updatedAt: at(15) }),                                   // touched, but no status move
    e({ id: '8', title: 'Domestic run', category: 'Domestic Payment', done: true, completedAt: at(10) }),  // Domestic: skipped entirely
    e({ id: '9', ...imp, workLog: worked() }),                                                           // import set In Progress today
    e({ id: '10', ...duty, completedAt: at(16) }),
  ];
  const fixed = [{ id: 'f1', text: 'Daily cash position check', active: true }, { id: 'f2', text: 'Paused activity', active: false }];
  const log = [
    { id: 'l1', title: 'Team standup', details: '', auto: false, at: at(10) },
    { id: 'l2', title: 'Auto note', details: '', auto: true, at: at(10) },
  ];
  const m = buildReportModel({ entries, fixedActivities: fixed, activityLog: log, date, lists });
  const rows = (k) => m.sections.find((x) => x.key === k).rows;
  ck('both payments are kept (never deduped)', m.data.payments === 2);
  ck('other work: the completed task, the import remittance and the duty payment', m.data.others === 3, JSON.stringify(rows('oth').map((r) => r.line)));
  ck('followed up: only the entry whose status moved today (work log)', m.data.followed === 1 && rows('fol')[0].line === 'Followed up by phone.');
  ck('a "Done" only completion is left out and counted', m.data.excluded === 1);
  ck('Domestic / Urgent payments are skipped and counted', m.data.skippedPayments === 1 && !JSON.stringify(m.sections).includes('Domestic run'));
  ck('duty and import lines are marked as fixed wording', rows('oth').filter((r) => r.fixed).length === 2);
  ck('routine activities only include the active one', rows('fix').length === 1);
  ck('other activities only include the manual log entry', rows('gen').length === 1 && rows('gen')[0].line === 'Team standup');
  ck('the payments section carries the intro lines', m.sections.find((x) => x.key === 'pay').intro.length === DEFAULT_PAYMENT_INTRO.length);

  section('Working Dashboard Report: duplicate lines are dropped outside Payments');
  const dm = buildReportModel({ entries: [
    e({ id: 'a', title: 'Send report', done: true, completedAt: at(9) }),
    e({ id: 'b', title: 'Send report', workLog: worked() }),
  ], date, lists });
  ck('one copy kept, one counted as a duplicate', dm.data.others === 1 && dm.data.followed === 0 && dm.dupes === 1);

  section('Working Dashboard Report: rendering to text');
  const text = reportModelToText(m);
  ck('starts with the report title and formatted date', text.indexOf('Daily Activity Report — Sat, 3 Oct 2026') === 0);
  ck('no section headings in the report itself', !/Payments \(2\)|Other work completed|Followed up \/ in progress|Routine daily activities/.test(text));
  const withHeadings = reportModelToText(m, { headings: true });
  ck('the AI draft keeps its headings: other work first, then payments, intro lines before the payment bullets',
    withHeadings.indexOf('Other work completed') < withHeadings.indexOf('Payments (2)') && withHeadings.indexOf(DEFAULT_PAYMENT_INTRO[1]) < withHeadings.indexOf('* G Power Auto Parts:') && !withHeadings.includes('Payments made below'));
  const routine = [{ id: 'f1', text: 'Daily NOSTRO reconciliation', active: true }];
  const fixedOf = (opts) => buildReportModel({ entries: [], fixedActivities: routine, date, ...opts }).sections.find((x) => x.key === 'fix').rows.length;
  ck('routine activities on a working day', fixedOf({}) === 1);
  ck('none on a leave day', fixedOf({ leaveDays: [date] }) === 0);
  ck('none inside a multi-day holiday', fixedOf({ holidays: [{ date: '2000-01-01', endDate: '2999-12-31' }] }) === 0);
  ck('an empty day says so plainly', reportModelToText(buildReportModel({ entries: [], date })).includes('No completed or updated entries for this date.'));

  section('Working Dashboard Report: AI rewrites');
  const bullets = m.data.bullets;
  ck('the model counts every bullet (2 intro + 2 payments + 3 other + 1 followed + 1 routine + 1 other activity)', bullets === 10, String(bullets));
  const payBullets = rows('pay').map((r) => `* ${r.line}`);
  const okRewrite = ['Payments (2)', ...DEFAULT_PAYMENT_INTRO.map((l) => `* ${l}`), ...payBullets, 'Other', '* a', '* b', '* c', '* d', '* e', '* f'].join('\n');
  ck('a rewrite keeping every payment line and bullet count passes', verifyAiRewrite(m, okRewrite).ok === true);
  ck('a rewrite that changes a payment line is rejected', verifyAiRewrite(m, okRewrite.split(payBullets[0]).join('* Someone else entirely')).ok === false);
  ck('a rewrite with fewer bullets is rejected', verifyAiRewrite(m, payBullets.join('\n')).ok === false);

  const ai = [
    'Other work completed', '* Reconciled the NOSTRO account for the day.', '* Paid duty somehow differently', '* remitted money',
    'Payments (2)', '* reworded payment',
    'Followed up / in progress', '* Followed up on the pending reply by phone.',
    'Routine daily activities', '* Checked the daily cash position.',
  ].join('\n');
  const merged = mergeAiReport(m, ai, []);
  ck('merging keeps the AI wording where it kept every item', merged && merged.text.includes('Followed up on the pending reply by phone.') && merged.ai >= 2);
  ck('...payments always stay exactly as generated', merged.text.includes(rows('pay')[0].line) && !merged.text.includes('reworded payment'));
  ck('...duty and import lines are put back word for word', merged.text.includes('through ICEGATE wallet recharge') && merged.text.includes('Initiated an outward remittance transaction'));
  ck('...a section the AI left out keeps the standard wording', merged.text.includes('* Team standup') && merged.kept >= 1);
  ck('a reply with no section headings is not used', mergeAiReport(m, '* just bullets', []) === null);
}
