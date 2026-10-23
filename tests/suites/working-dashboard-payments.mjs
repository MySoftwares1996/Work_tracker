import {
  paymentLists, DEFAULT_NARRATION_TYPES, normalizeKeyPoints, keyPointText, noteWork, workedOn, categoryHasSubCategory, subCategoryComplete,
  payeeFromMail, stripPayeeFromMail, buildNarrationText, makeNarration, narrationFor, taskPayee, paymentSections, validatePaymentDetails, PAYEE_RX,
  withWebNarrationTypes, narrationStyle, narrationOffersPo,
} from '../../src/workingDashboardPayments.js';
import { blankEntry, completeEntry, withStatus, isNonWorkingDay, isOfficeClosed, nextWorkingDay, autoSkipDailyOnNonWorking, normalizeHolidays, skipEntryToday, isSkippedToday, holidayBlocks, filterEntries } from '../../src/workingDashboard.js';
import { closedOn } from '../../src/pastDue.js';
import { toWebTask, fromWebDoc, fromWebDocOver, normalizeSheetTask } from '../../src/cloudSync.js';
import { decodeLists, encodeLists } from '../../src/firebaseSyncCore.js';

export async function run({ ck, section }) {
  const now = new Date(2026, 9, 5, 10, 0);     // Mon 5 Oct 2026
  const e = (patch) => ({ ...blankEntry(), ...patch });
  const lists = paymentLists({
    subCategories: ['Plain old', { id: 's1', name: 'PO Advance', fields: [{ label: 'PO No', options: [] }, { label: 'Vendor Name', options: [] }] }],
    narrationTypes: DEFAULT_NARRATION_TYPES,
  }, ['Domestic Payment', 'Import Payments', 'Duty Payment', 'MIS']);

  section('Working Dashboard payments: the web app\'s lists');
  ck('categories that look like Domestic / Import / Duty payments carry a Sub Category by default', ['Domestic Payment', 'Import Payments', 'Duty Payment'].every((c) => categoryHasSubCategory(lists, c)) && !categoryHasSubCategory(lists, 'MIS'));
  ck('an explicit (even empty) choice from the web app wins', !categoryHasSubCategory(paymentLists({ subCategoryCategories: [] }, ['Domestic Payment']), 'Domestic Payment'));
  ck('a sub category saved as a plain name gets an empty rule', lists.subCategories[0].name === 'Plain old' && lists.subCategories[0].fields.length === 0);
  ck('the twelve standard Tally narration types are there until the web app sends its own', paymentLists({}).narrationTypes.length === 12);

  section('Working Dashboard payments: Key Points as { key, value }');
  ck('plain strings (older phone entries) become values', JSON.stringify(normalizeKeyPoints(['PO 12'])) === JSON.stringify([{ key: '', value: 'PO 12' }]));
  ck('objects and JSON text are read', normalizeKeyPoints('[{"key":"Amount","value":"₹5,000"}]')[0].key === 'Amount' && normalizeKeyPoints({ Amount: 5 })[0].value === '5');
  ck('blank rows are dropped', normalizeKeyPoints([{ key: '', value: '' }, null]).length === 0);
  ck('shown as "Key: value"', keyPointText({ key: 'Amount', value: '₹5,000' }) === 'Amount: ₹5,000' && keyPointText({ key: '', value: 'x' }) === 'x');

  section('Working Dashboard payments: found again later');
  const kpEntry = e({ title: 'Pay vendor', keyPoints: [{ key: 'Amount', value: '₹50,000' }] });
  ck('Register search finds a Key Point\'s value and key', filterEntries([kpEntry], { query: '50,000' }).length === 1 && filterEntries([kpEntry], { query: 'amount' }).length === 1);
  const noSubs = paymentLists({}, ['Domestic Payment']);
  ck('with no Sub Categories to pick (lists not synced yet), a payment can still be completed', !categoryHasSubCategory(noSubs, 'Domestic Payment') && subCategoryComplete(e({ category: 'Domestic Payment' }), noSubs) && validatePaymentDetails(e({ category: 'Domestic Payment', status: 'Completed' }), noSubs) === '');

  section('Working Dashboard payments: the work log');
  const moved = noteWork(e({}), 'In-Progress', now);
  ck('a status move is logged with its day', moved.workLog.length === 1 && moved.workLog[0].d === '2026-10-05' && workedOn(moved, '2026-10-05'));
  ck('"Not yet started" is not work', !noteWork(e({}), 'Not Yet Started', now).workLog);
  ck('only the last 20 moves are kept', noteWork(e({ workLog: Array.from({ length: 25 }, () => ({ d: 'x', s: 'y' })) }), 'Pending', now).workLog.length === 20);
  ck('completing logs it', workedOn(completeEntry(e({}), now), '2026-10-05'));
  ck('a status picked on the phone logs it; the same status does not', withStatus(e({ status: 'Pending' }), 'In-Progress', now).workLog.length === 1 && !withStatus(e({ status: 'Pending' }), 'Pending', now).workLog);

  section('Working Dashboard payments: Sub Category');
  const dom = e({ category: 'Domestic Payment', status: 'Completed' });
  ck('a Sub Category is needed before a Domestic Payment is completed', !subCategoryComplete(dom, lists) && /Sub Category/.test(validatePaymentDetails(dom, lists)));
  ck('...and every field its rule asks for', /PO No, Vendor Name/.test(validatePaymentDetails({ ...dom, subCategory: 'PO Advance' }, lists)));
  ck('...complete once they are filled in', subCategoryComplete({ ...dom, subCategory: 'PO Advance', subCategoryFields: { 'PO No': '1', 'Vendor Name': 'X' } }, lists));
  ck('an Import Payment In Progress needs its payment details', /Payment %/.test(validatePaymentDetails(e({ category: 'Import Payments', status: 'In-Progress' }), lists)));
  ck('...fine once filled in', validatePaymentDetails(e({ category: 'Import Payments', status: 'In Progress', paymentDetails: { paymentPercent: '30', paymentType: 'Advance', paymentAgainst: 'Before Dispatch' } }), lists) === '');
  const sec = paymentSections('Import Payments', 'In-Progress', lists);
  ck('the form shows import details while In Progress, Sub Category and narration once Completed', sec.importDetails && !sec.narration && paymentSections('Domestic Payment', 'Completed', lists).subCategory && paymentSections('MIS', 'Completed', lists).narration);

  section('Working Dashboard payments: the Tally narration');
  const mail = 'SAMPLE: Purchase Order - Sample Vendor - INPO/PP/26-27/0155 - SAMPLE Co';
  ck('the vendor is found in a mail subject', payeeFromMail(mail) === 'Sample Vendor');
  ck('...and taken out of it for Tally', stripPayeeFromMail(mail, 'Sample Vendor') === 'SAMPLE: Purchase Order - INPO/PP/26-27/0155 - SAMPLE Co');
  ck('only labels that ARE the vendor count as payee fields', PAYEE_RX.test('Vendor Name') && PAYEE_RX.test('Name of Payee') && !PAYEE_RX.test('Vendor Invoice No'));
  const adv = DEFAULT_NARRATION_TYPES[0];
  ck('"Being" + % + phrase + document no + mail chain without the vendor',
    buildNarrationText(adv, { percent: '30', docNo: 'PO-1', mailChain: mail }) === 'Being 30% Advance amount paid against Po No: PO-1 SAMPLE: Purchase Order - INPO/PP/26-27/0155 - SAMPLE Co');
  const entry = e({ category: 'Domestic Payment', reference: mail, subCategory: 'PO Advance', subCategoryFields: { 'PO No': 'PO-1', 'Vendor Name': 'Sample Vendor' } });
  const n = makeNarration({ typeName: adv.name, percent: '30', docNo: 'PO-1', includeMail: false }, entry, lists);
  ck('the stored narration has the web app\'s shape', n.typeId === adv.id && n.typeName === adv.name && n.includeMail === false && n.subCategoryText === 'PO No: PO-1' && n.text.startsWith('Being 30% '));
  ck('the vendor typed in a Sub Category field leads the report', taskPayee({ ...entry, narration: n }, lists) === 'Sample Vendor');
  ck('rebuilt with the current rules for the report', narrationFor({ ...entry, narration: n }, lists, 'report').startsWith('Being 30% Advance amount paid against Po No: PO-1'));
  ck('no type picked: no narration', makeNarration({ typeName: '' }, entry, lists) === null);
  ck('a narration needs its document number', /PO No/.test(validatePaymentDetails({ ...entry, status: 'Pending', narration: { ...n, docNo: '' } }, lists)));

  section('Working Dashboard payments: the web app\'s fields travel both ways');
  const full = e({
    id: 'p1', title: 'Pay', category: 'Domestic Payment', done: true, completedAt: new Date(2026, 9, 5, 15, 0).toISOString(), dar: false,
    keyPoints: [{ key: 'Amount', value: '₹5,000' }, 'old string'], subCategory: 'PO Advance', subCategoryFields: { 'PO No': 'PO-1' }, narration: n,
    paymentDetails: { paymentPercent: '30' }, workLog: [{ d: '2026-10-05', s: 'Completed' }], skippedDates: ['2026-10-04'], seriesId: 's-1',
  });
  const doc = toWebTask(full);
  ck('"Done" only is written as darInclude: false', doc.darInclude === false);
  ck('Key Points go as { key, value } (they read "[object Object]" on the web app before)', doc.keyPoints[0].key === 'Amount' && doc.keyPoints[1].value === 'old string');
  ck('Sub Category, narration, payment details, work log, skipped days and series are sent', doc.subCategory === 'PO Advance' && doc.narration.typeName === adv.name && doc.paymentDetails.paymentPercent === '30' && doc.workLog.length === 1 && doc.skippedDates[0] === '2026-10-04' && doc.seriesId === 's-1');
  ck('an entry that never had them does not clear the web app\'s', !('narration' in toWebTask(e({ id: 'x' }))) && !('subCategory' in toWebTask(e({ id: 'x' }))));
  const back = fromWebDoc(JSON.parse(JSON.stringify(doc)), blankEntry());
  ck('...and read back the same', back.subCategory === 'PO Advance' && back.narration.docNo === 'PO-1' && back.workLog[0].s === 'Completed' && back.dar === false && back.keyPoints[0].value === '₹5,000');
  ck('a web task with darInclude: true is in the report', fromWebDoc({ id: 1, description: 'x', status: 'Completed', darInclude: true }, blankEntry()).dar === true);
  ck('a web task that says nothing about it is in the report too (the web app\'s default)', fromWebDoc({ id: 1, description: 'x', status: 'Completed' }, blankEntry()).dar === true);
  ck('a sheet row that says nothing stays out (no change for the sheet)', normalizeSheetTask({ id: 1, description: 'x' }, blankEntry()).dar === false);
  ck('JSON text from the sheet is read as objects', normalizeSheetTask({ id: 1, description: 'x', narration: JSON.stringify(n), subCategoryFields: '{"PO No":"9"}' }, blankEntry()).subCategoryFields['PO No'] === '9');
  ck('an echo of the phone\'s own write keeps every payment field', fromWebDocOver(full, JSON.parse(JSON.stringify(doc)), blankEntry()).narration.text === n.text);

  section('Working Dashboard payments: the lists document');
  const webLists = { categories: ['A'], priorities: ['High'], statuses: ['Pending'], pendingWith: ['Self', 'Vendor'], subCategories: [{ name: 'S', fields: [] }], subCategoryCategories: ['A'], narrationTypes: [{ name: 'N' }], darPaymentIntro: ['l1', 'l2'] };
  const dec = decodeLists(webLists);
  ck('the web app\'s Pending With list is read (it is named pendingWith there)', dec.lists[3].join() === 'Self,Vendor' && dec.format === 'named');
  ck('its payment lists come along', dec.extra.subCategories.length === 1 && dec.extra.narrationTypes[0].name === 'N' && dec.extra.darPaymentIntro[1] === 'l2' && dec.extra.subCategoryCategories[0] === 'A');
  const enc = encodeLists([['A'], ['High'], ['Pending'], ['Self']], 'named');
  ck('written back under the web app\'s name, and nothing else (merged, so its payment lists stay)', enc.pendingWith[0] === 'Self' && !('assignees' in enc) && !('narrationTypes' in enc));
  ck('a document an older phone wrote (assignees) is still read', decodeLists({ categories: [], assignees: ['Me'] }).lists[3][0] === 'Me');

  section('Working Dashboard payments: non-working days');
  const hols = normalizeHolidays([
    { date: '2026-10-12', name: 'Columbus Day', type: 'USD Holiday' },
    { date: '2026-10-20', name: 'Dussehra', type: 'Indian Bank Holiday' },
    { date: '2026-10-21', name: 'Market only', type: 'USD Holiday', officeClosed: true },
    { date: '2026-10-22', name: 'Bank open', type: 'Indian Bank Holiday', officeClosed: false },
    { date: '2026-10-23', title: 'Added on the phone' },
  ]);
  ck('a USD (market) holiday is a working day; an Indian bank holiday is not', !isOfficeClosed(hols[0]) && isOfficeClosed(hols[1]));
  ck('the web app\'s "Office closed" tick wins either way', isOfficeClosed(hols[2]) && !isOfficeClosed(hols[3]));
  ck('a holiday added on the phone with no calendar is a day off', isOfficeClosed(hols[4]));
  ck('Sundays, closed holidays and leave days are non-working', isNonWorkingDay('2026-10-11', hols) && isNonWorkingDay('2026-10-20', hols) && isNonWorkingDay('2026-10-14', [], ['2026-10-14']) && !isNonWorkingDay('2026-10-12', hols));
  ck('the next working day passes over Columbus Day no more', nextWorkingDay('2026-10-10', hols) === '2026-10-12');
  ck('the Past Due Alert does not call a USD holiday "office closed"', closedOn(e({ dueAt: new Date(2026, 9, 12, 10, 0).toISOString() }), hols) === null && closedOn(e({ dueAt: new Date(2026, 9, 20, 10, 0).toISOString() }), hols).name === 'Dussehra');
  const daily = e({ id: 'd1', recurrence: 'daily', dueAt: new Date(2026, 9, 20, 9, 30).toISOString(), deadlineAt: new Date(2026, 9, 20, 18, 0).toISOString() });
  const skipped = autoSkipDailyOnNonWorking([daily, e({ id: 'o', recurrence: 'none', dueAt: daily.dueAt })], hols, [], now);
  const d1 = skipped.entries.find((x) => x.id === 'd1');
  ck('a Daily task due on a closed day moves to the next working day, same time', skipped.moved.length === 1 && new Date(d1.dueAt).getDate() === 22 && new Date(d1.dueAt).getHours() === 9, d1.dueAt);
  ck('...recorded as skipped (not done), the deadline moved by the same gap', d1.skippedDates[0] === '2026-10-20' && !d1.done && new Date(d1.deadlineAt) - new Date(d1.dueAt) === 8.5 * 3600000 && d1.localEditAt > 0);
  ck('...a one-off on that day is left alone', skipped.entries.find((x) => x.id === 'o').dueAt === daily.dueAt);
  ck('nothing to move: the same array back', autoSkipDailyOnNonWorking([e({ recurrence: 'daily', dueAt: new Date(2026, 9, 6, 9, 0).toISOString() })], hols, [], now).moved.length === 0);
  section('Working Dashboard: continuous holidays, as the web app shows them');
  const blocks = holidayBlocks(normalizeHolidays([
    { date: '2026-01-14', name: 'Bhogi' }, { date: '2026-01-15', name: 'Makar Sankranti' },        // Wed + Thu: 2 days
    { date: '2026-01-19', name: 'Martin Luther King Jr. Day' },                                     // Mon: Sat 17 - Mon 19
    { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti' },                                         // Fri: Fri 2 - Sun 4
    { date: '2026-11-11', name: 'Veterans Day' },                                                   // Wed alone: no block
  ]));
  ck('holidays next to each other make one block', blocks[0].start === '2026-01-14' && blocks[0].end === '2026-01-15' && blocks[0].days === 2 && blocks[0].names.join(' + ') === 'Bhogi + Makar Sankranti');
  ck('a Monday holiday takes in the weekend before it', blocks[1].start === '2026-01-17' && blocks[1].end === '2026-01-19' && blocks[1].days === 3);
  ck('a Friday holiday takes in the weekend after it', blocks[2].start === '2026-10-02' && blocks[2].end === '2026-10-04');
  ck('a lone midweek holiday is not a block', blocks.length === 3);
  ck('the web app\'s alert switch is kept when off', normalizeHolidays([{ date: '2026-10-02', name: 'x', alert: false }])[0].alert === false && !('alert' in normalizeHolidays([{ date: '2026-10-02', name: 'x' }])[0]));

  const sk = skipEntryToday(e({ id: 's' }), now);
  ck('Skip: open, silenced today, skipped today', !sk.done && sk.lastAckDate === '2026-10-05' && isSkippedToday(sk, now));

  section('Working Dashboard payments: Imports Payments narration (web.app only)');
  const wl = withWebNarrationTypes(paymentLists({}));
  const imp = wl.narrationTypes.find((x) => x.name === 'Imports Payments');
  ck('web.app adds Imports Payments to the standard twelve', wl.narrationTypes.length === 13 && !!imp);
  ck('added once only', withWebNarrationTypes(wl).narrationTypes.length === 13);
  const ifv = { 'Beneficiary Name': 'ABC Trading Co', 'Payment Towards': 'Balance', 'Payment Against': 'Against BOE' };
  ck('Imports Payments writes the remittance sentence with the name in it',
    buildNarrationText(imp, { percent: '70', fieldsValues: ifv }) === 'Initiated an outward remittance transaction in favor of ABC Trading Co towards the Balance 70% payment Against BOE.');
  const ie = e({ id: 'imp', category: 'Import Payment', status: 'Completed', done: true });
  const inr = makeNarration({ typeName: 'Imports Payments', percent: '70', fieldsValues: ifv }, ie, wl);
  ck('Imports Payments needs no document number', validatePaymentDetails({ ...ie, narration: inr }, wl) === '');
  ck('Imports Payments still needs the %', validatePaymentDetails({ ...ie, narration: { ...inr, percent: '' } }, wl) !== '');
  ck('the APK (no such type) shows the saved text', narrationFor({ ...ie, narration: inr }, paymentLists({})) === inr.text);

  section('web.app narration: numbers joined with " & ", then the PO No');
  const bal = DEFAULT_NARRATION_TYPES.find((x) => x.id === 'nr-balance');
  const advPo = DEFAULT_NARRATION_TYPES.find((x) => x.id === 'nr-adv-po');
  const parts = { docNo: '52, 56', poNo: 'INPO/PP/26-27/0111' };
  narrationStyle.web = true;
  ck('Invoice numbers and the PO No, as Tally wants them', buildNarrationText(bal, parts) === 'Being Balance amount paid against Invoice No: 52 & 56 & Po No: INPO/PP/26-27/0111', buildNarrationText(bal, parts));
  ck('"and" and "&" between numbers also work', buildNarrationText(bal, { docNo: '52 and 56 & 57' }) === 'Being Balance amount paid against Invoice No: 52 & 56 & 57');
  ck('no PO: nothing added', buildNarrationText(bal, { docNo: '52' }) === 'Being Balance amount paid against Invoice No: 52');
  ck('a type that is already "against PO No" offers no PO box', narrationOffersPo(advPo) === false && narrationOffersPo(bal) === true);
  ck('the stored narration keeps the PO No', makeNarration({ typeName: bal.name, ...parts }, {}, paymentLists({})).poNo === 'INPO/PP/26-27/0111');
  narrationStyle.web = false;
  ck('the phone keeps the earlier text', buildNarrationText(bal, parts) === 'Being Balance amount paid against Invoice No: 52, 56');
}
