import fs from 'fs';
import { isQuietTime, setAlertOffDays, entryAlertPlan, lastFollowUpLine, filterEntries, EMPTY_WD_FILTER, DEFAULT_ALERTS, blankEntry } from '../../src/workingDashboard.js';
import { addBankFollowUp, bankFollowUpReportLine, followUpsDueToday, isLongPending, followUpWho, LONG_PENDING_DAYS } from '../../src/bankFollowUp.js';
import { buildPeriodSummary, reportMailUrl, reportHtml } from '../../src/workingDashboardReport.js';

export async function run({ ck, section }) {
  section('Walk / water reminders keep quiet hours and days off (APK)');
  const night = { quietHours: true, quietFrom: '21:00', quietTo: '08:00' };
  ck('22:00 is quiet', isQuietTime(new Date(2026, 9, 7, 22, 0), night));
  ck('11:00 is not', !isQuietTime(new Date(2026, 9, 7, 11, 0), night));
  setAlertOffDays([], ['2026-10-08']);
  ck('a leave day is quiet with days off on', isQuietTime(new Date(2026, 9, 8, 11, 0), { quietOffDays: true }));
  ck('...and not without', !isQuietTime(new Date(2026, 9, 8, 11, 0), {}));
  setAlertOffDays([], []);
  const notify = fs.readFileSync('src/workingDashboardNotify.js', 'utf8');
  ck('the reminders leave quiet slots out', notify.includes('!quiet(t)') && /armTodaysReminders = \(reminders = \{\}, ringtone = 'chime', alerts = null\)/.test(notify));

  section('Bank follow-ups: who, the last word on the alarm, long pending');
  const now = new Date(2026, 9, 7, 12, 0);
  const base = { ...blankEntry(), id: 'f1', title: 'LC with SBI', category: "Bank Follow Up's", priority: 'Medium', createdAt: new Date(2026, 8, 1).toISOString(), dueAt: new Date(2026, 9, 7, 15, 0).toISOString() };
  const a = addBankFollowUp(base, { remarks: 'Awaiting SWIFT copy', bank: ' SBI ', banker: 'Mr. Rao' }, new Date(2026, 9, 5, 11, 0));
  ck('the bank and banker are kept', a.bankFollowUps[0].bank === 'SBI' && a.bankFollowUps[0].banker === 'Mr. Rao');
  ck('left out when blank', !('bank' in addBankFollowUp(base, { remarks: 'x' }, now).bankFollowUps[0]));
  ck('who text', followUpWho(a.bankFollowUps[0]) === 'Mr. Rao, SBI');
  ck('the report names them', bankFollowUpReportLine(a, '2026-10-05').startsWith('LC with SBI: Followed up with Mr. Rao, SBI.'), bankFollowUpReportLine(a, '2026-10-05'));
  ck('without names it says "the bank"', bankFollowUpReportLine(addBankFollowUp(base, { remarks: 'x' }, now), '2026-10-07').includes('Followed up with the bank.'));
  ck('the alarm line', lastFollowUpLine(a) === 'Last (5 Oct, Mr. Rao, SBI): Awaiting SWIFT copy', lastFollowUpLine(a));
  ck('no line for other tasks', lastFollowUpLine(blankEntry()) === '');
  const plan = entryAlertPlan(a, now, DEFAULT_ALERTS);
  ck('the alarm body carries it', plan.length && plan.every((x) => x.body.includes('Last (5 Oct, Mr. Rao, SBI): Awaiting SWIFT copy')));
  ck(`long pending at ${LONG_PENDING_DAYS}+ days`, isLongPending(a, now) && !isLongPending({ ...a, createdAt: new Date(2026, 9, 1).toISOString(), bankFollowUps: [] }, now));
  const fresh = { ...base, id: 'f2', createdAt: new Date(2026, 9, 6).toISOString(), dueAt: new Date(2026, 9, 7, 9, 0).toISOString() };
  const list = followUpsDueToday([fresh, a], now);
  ck('long pending listed first', list[0].entry.id === 'f1' && list[0].long && !list[1].long);

  section('Search finds remarks, banker and narration');
  const n = { ...blankEntry(), id: 'n1', title: 'Vendor', narration: { typeName: 'Imports Payments', text: 'Initiated an outward remittance in favor of ACME' } };
  const q = (query, deep) => filterEntries([a, n], { ...EMPTY_WD_FILTER, query }, now, { deep }).map((e) => e.id).join();
  ck('banker remarks', q('swift', true) === 'f1' && q('swift', false) === '');
  ck('banker name', q('rao', true) === 'f1');
  ck('narration', q('acme', true) === 'n1' && q('acme', false) === '');

  section('Fuller summary, Email to an address, PDF');
  const done = (id, d, cat = 'Audit') => ({ ...blankEntry(), id, title: id, category: cat, done: true, status: 'Completed', completedAt: new Date(2026, 9, d, 12).toISOString() });
  const late = { ...blankEntry(), id: 'late', title: 'GST return', pendingWith: 'Rami', dueAt: new Date(2026, 9, 2, 10).toISOString() };
  const sum = buildPeriodSummary({ entries: [done('a', 5), done('b', 5), done('c', 6), late], kind: 'week', date: '2026-10-07', now });
  ck('completed each day', sum.perDay['2026-10-05'] === 2 && sum.text.includes('5 Oct 2026: 2'), sum.text);
  ck('overdue tasks by name', sum.text.includes('- GST return (due 2 Oct 2026, with Rami)'), sum.text);
  ck('mail to a saved address', reportMailUrl('S', 'B', 'boss@co.com').startsWith('mailto:boss%40co.com?subject=S'));
  ck('several addresses, junk dropped', reportMailUrl('S', 'B', 'a@x.com, nope; b@y.in').startsWith('mailto:a%40x.com,b%40y.in?'));
  ck('no address: blank To', reportMailUrl('S', 'B').startsWith('mailto:?subject='));
  const html = reportHtml('Report <1>', 'Line & one');
  ck('the PDF page escapes the text', html.includes('<title>Report &lt;1&gt;</title>') && html.includes('Line &amp; one'));
  ck('expo-print is a dependency (the APK can make PDFs)', JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies['expo-print']);
}
