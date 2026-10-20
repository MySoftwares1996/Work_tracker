import fs from 'fs';
import { quickDueOptions, weeklySummaryTimes, calendarWeeks, filterEntries, EMPTY_WD_FILTER, isWdFilterActive, blankEntry } from '../../src/workingDashboard.js';
import { defaultNextFollowUp, withQuickRemark, followUpsByBank, bankFollowUpReportLine, addBankFollowUp } from '../../src/bankFollowUp.js';
import { noteWork } from '../../src/workingDashboardPayments.js';
import { entryAmount, fmtRupees, buildPeriodSummary, buildReportModel, reportModelToText } from '../../src/workingDashboardReport.js';
import { toWebTask, fromWebDoc } from '../../src/cloudSync.js';

export async function run({ ck, section }) {
  section('Next follow-up date skips days off');
  const e = { dueAt: new Date(2026, 9, 1, 11, 0).toISOString() };
  const sat = new Date(2026, 9, 10, 15, 0);     // Saturday -> Sunday is off -> Monday 12 Oct
  ck('Saturday: next is Monday, not Sunday', new Date(defaultNextFollowUp(e, sat)).getDate() === 12);
  ck('a holiday and a leave day are skipped too', new Date(defaultNextFollowUp(e, sat, { holidays: [{ date: '2026-10-12', officeClosed: true }], leaveDays: ['2026-10-13'] })).getDate() === 14);
  ck('at the task\'s due time', new Date(defaultNextFollowUp(e, sat)).getHours() === 11);

  section('Quick remarks');
  ck('a tapped remark fills empty remarks', withQuickRemark('', 'Under process') === 'Under process');
  ck('...or is added after what is written', withQuickRemark('Spoke to Rao.', 'Under process') === 'Spoke to Rao; Under process');
  ck('the same one twice is not repeated', withQuickRemark('Under process', 'under process') === 'Under process');

  section('Bank-wise view');
  const now = new Date(2026, 9, 8, 12, 0);
  const bf = (id, bank, created, due) => ({ ...blankEntry(), id, title: id, category: "Bank Follow Up's", createdAt: new Date(2026, 9, created).toISOString(), dueAt: new Date(2026, 9, due, 10).toISOString(),
    bankFollowUps: bank ? [{ d: '2026-10-05', at: new Date(2026, 9, 5).toISOString(), remarks: 'x', bank }] : [] });
  const list = [bf('a', 'SBI', 1, 7), bf('b', 'sbi', 6, 9), bf('c', 'HDFC', 7, 9), bf('d', '', 7, 9)];
  const g = followUpsByBank(list, new Date(2026, 9, 30, 12));
  ck('grouped by bank, most open first, unnamed last', g.map((x) => `${x.bank}:${x.open}`).join() === 'SBI:2,HDFC:1,Bank not named:1', g.map((x) => `${x.bank}:${x.open}`).join());
  ck('overdue and oldest counted', g[0].overdue === 2 && g[0].oldestDays === 29);
  const f = (bank) => filterEntries(list, { ...EMPTY_WD_FILTER, bank }, now).map((x) => x.id).join();
  ck('Register filter by bank', f('SBI') === 'a,b' && f('-') === 'd');
  ck('the bank filter counts as a filter', isWdFilterActive({ ...EMPTY_WD_FILTER, bank: 'SBI' }) && !isWdFilterActive(EMPTY_WD_FILTER));

  section('Escalation');
  const old = { ...bf('o', 'SBI', 1, 7), title: 'LC with SBI', priority: 'Medium', createdAt: new Date(2026, 8, 1).toISOString() };
  const up = noteWork({ ...old, priority: 'High', escalation: { asked: '2026-10-08', escalatedOn: '2026-10-08' } }, 'Escalated', now);
  ck('the report line says so', bankFollowUpReportLine(up, '2026-10-08') === 'LC with SBI: Escalated to manager (open 37 days).', bankFollowUpReportLine(up, '2026-10-08'));
  ck('...and it is in that day\'s report', reportModelToText(buildReportModel({ entries: [up], date: '2026-10-08' })).includes('Escalated to manager'));
  const both = noteWork({ ...addBankFollowUp(old, { remarks: 'Still pending' }, now), priority: 'High', escalation: { asked: '2026-10-08', escalatedOn: '2026-10-08' } }, 'Escalated', now);
  ck('with a follow-up the same day: added at the end', bankFollowUpReportLine(both, '2026-10-08').endsWith('Escalated to manager.'));
  const back = fromWebDoc(JSON.parse(JSON.stringify(toWebTask(up))), blankEntry());
  ck('escalation syncs with the web app', back && back.escalation && back.escalation.escalatedOn === '2026-10-08');

  section('Quick due times');
  const morning = quickDueOptions(new Date(2026, 9, 8, 9, 0));        // Thursday
  ck('in an hour, today 5 PM, tomorrow, next Monday', morning.map(([l]) => l).join('|') === 'In 1 hour|Today 5 PM|Tomorrow 10 AM|Next Monday 10 AM', morning.map(([l]) => l).join('|'));
  ck('no "Today 5 PM" in the evening', !quickDueOptions(new Date(2026, 9, 8, 18, 0)).some(([l]) => l === 'Today 5 PM'));
  const sat2 = quickDueOptions(new Date(2026, 9, 10, 9, 0));
  ck('Saturday: the next working day is Monday (named), no separate Next Monday', sat2.some(([l]) => l === 'Mon 10 AM') && !sat2.some(([l]) => l === 'Next Monday 10 AM'), sat2.map(([l]) => l).join('|'));

  section('Narration type remembered, duplicate warning, shortcuts, calendar (screens)');
  const wdScreen = fs.readFileSync('src/screens/WorkingDashboard.js', 'utf8');
  ck('the narration type is remembered per category', wdScreen.includes('narrationByCategory: { ...(w.narrationByCategory || {}), [row.category]: row.narration.typeName }'));
  ck('a duplicate is asked about on phone width', wdScreen.includes("'Looks like a task you already have'") && wdScreen.includes('const twin = phoneLayout'));
  ck('web.app shortcuts N, / and Esc', wdScreen.includes("ev.key === 'n'") && wdScreen.includes("ev.key === '/'") && wdScreen.includes("ev.key === 'Escape'"));
  const weeks = calendarWeeks([{ id: 'x', dueAt: new Date(2026, 9, 8, 10).toISOString() }, { id: 'y', done: true, dueAt: new Date(2026, 9, 8, 11).toISOString() }], 2026, 9);
  ck('calendar starts on Monday 28 Sep', weeks[0][0].key === '2026-09-28' && weeks.every((w) => w.length === 7));
  ck('open tasks on their day only', weeks.flat().find((d) => d.key === '2026-10-08').tasks.map((x) => x.id).join() === 'x');

  section('Week summary reminder (APK) and payment totals');
  const times = weeklySummaryTimes({ weeklySummaryDay: 5, weeklySummaryTime: '17:30' }, new Date(2026, 9, 8, 12, 0));
  ck('next four Fridays at 17:30', times.length === 4 && times[0].getDay() === 5 && times[0].getDate() === 9 && times[0].getHours() === 17 && times[0].getMinutes() === 30 && times[1].getDate() === 16);
  ck('after Friday 17:30 it starts next week', weeklySummaryTimes({ weeklySummaryDay: 5 }, new Date(2026, 9, 9, 18, 0))[0].getDate() === 16);
  ck('amount from an Amount key point', entryAmount({ keyPoints: [{ key: 'Amount', value: '₹4,35,000' }] }) === 435000);
  ck('amount written in Rs', entryAmount({ keyPoints: [{ key: 'Note', value: 'Paid Rs. 12,500.50 today' }] }) === 12500.5);
  ck('no amount: 0', entryAmount({ keyPoints: [{ key: 'Ref', value: 'PO 4521' }] }) === 0 && entryAmount({}) === 0);
  ck('Indian grouping', fmtRupees(435000) === '₹4,35,000');
  const paid = (id, amt) => ({ ...blankEntry(), id, title: id, category: 'Vendor Payments', done: true, status: 'Completed', completedAt: new Date(2026, 9, 6, 12).toISOString(), keyPoints: amt ? [{ key: 'Amount', value: amt }] : [] });
  const sum = buildPeriodSummary({ entries: [paid('a', '₹50,000'), paid('b', '1,00,000'), paid('c', '')], kind: 'week', date: '2026-10-08', now });
  ck('the summary adds the payments up', sum.paymentTotal === 150000 && sum.text.includes('Payments total: ₹1,50,000 (2 of 3 payments had an amount)'), sum.text);
  const notify = fs.readFileSync('src/workingDashboardNotify.js', 'utf8');
  ck('the reminder is booked on the phone only', notify.includes("if (Platform.OS === 'web' || !cfg.weeklySummary) return 0;"));
}
