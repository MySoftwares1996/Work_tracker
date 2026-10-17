import { isBankFollowUpCategory, addBankFollowUp, followUpsOn, bankFollowUpReportLine, defaultNextFollowUp, followUpPicks, applyFollowUpPick } from '../../src/bankFollowUp.js';
import { blankEntry } from '../../src/workingDashboard.js';
import { buildReportModel, reportModelToText } from '../../src/workingDashboardReport.js';
import { toWebTask, fromWebDoc } from '../../src/cloudSync.js';

export async function run({ ck, section }) {
  section('Bank follow-ups: the banker\'s update and the next date, into the Daily Activity Report');
  ck('both bank follow-up categories are recognised', isBankFollowUpCategory("Urgent Bank Follow Up's") && isBankFollowUpCategory("Bank Follow Up's") && isBankFollowUpCategory('Bank Follow-ups'));
  ck('other categories are not', !isBankFollowUpCategory('Domestic Payments') && !isBankFollowUpCategory('Bank Reconciliation'));

  const day1 = new Date(2026, 9, 5, 11, 0);
  const day2 = new Date(2026, 9, 8, 15, 30);
  const base = { ...blankEntry(), id: 'bf1', title: 'LC amendment with SBI', category: "Bank Follow Up's", status: 'Not Yet Started', dueAt: new Date(2026, 9, 5, 10, 0).toISOString() };
  const next1 = new Date(2026, 9, 8, 10, 0).toISOString();
  const a = addBankFollowUp(base, { remarks: 'Documents received, under review with trade desk', next: next1 }, day1);
  ck('the follow-up is kept with the day and the next date', a.bankFollowUps.length === 1 && a.bankFollowUps[0].d === '2026-10-05' && a.bankFollowUps[0].next === next1);
  ck('the task stays open and is due again on the next follow-up date', !a.done && a.dueAt === next1);
  ck('Not Yet Started becomes In-Progress', a.status === 'In-Progress');
  ck('today goes into its work log', (a.workLog || []).some((w) => w.d === '2026-10-05'));
  const b = addBankFollowUp(a, { remarks: 'Amendment issued; awaiting SWIFT copy', next: new Date(2026, 9, 10, 10, 0).toISOString() }, day2);
  ck('later follow-ups add to the history', b.bankFollowUps.length === 2 && followUpsOn(b, '2026-10-08').length === 1);

  ck('the report line has the banker\'s update and the next date',
    bankFollowUpReportLine(a, '2026-10-05') === "LC amendment with SBI: Followed up with the bank. Banker's update: Documents received, under review with trade desk. Next follow-up: 8 Oct 2026.",
    bankFollowUpReportLine(a, '2026-10-05'));
  ck('no line on a day without a follow-up', bankFollowUpReportLine(b, '2026-10-06') === '');

  const m1 = buildReportModel({ entries: [b], date: '2026-10-05' });
  const m2 = buildReportModel({ entries: [b], date: '2026-10-08' });
  ck('day 1 report: under Followed up, with day 1\'s update', reportModelToText(m1).includes('Documents received, under review with trade desk. Next follow-up: 8 Oct 2026.') && !reportModelToText(m1).includes('SWIFT'));
  ck('day 2 report: day 2\'s update and its next date', reportModelToText(m2).includes('Amendment issued; awaiting SWIFT copy. Next follow-up: 10 Oct 2026.'));

  const done = { ...addBankFollowUp(b, { remarks: 'SWIFT copy received' }, new Date(2026, 9, 10, 12, 0)), done: true, status: 'Completed', completedAt: new Date(2026, 9, 10, 12, 5).toISOString() };
  ck('completed that day: the update, then Completed', reportModelToText(buildReportModel({ entries: [done], date: '2026-10-10' })).includes("Banker's update: SWIFT copy received. Completed."));
  ck('"Done" only (✓) keeps it out of the report', !reportModelToText(buildReportModel({ entries: [{ ...done, dar: false }], date: '2026-10-10' })).includes('SWIFT copy received'));

  ck('the next date starts tomorrow at the due time', new Date(defaultNextFollowUp(base, day1)).getDate() === 6 && new Date(defaultNextFollowUp(base, day1)).getHours() === 10);
  const back = fromWebDoc(JSON.parse(JSON.stringify(toWebTask(b))), blankEntry());
  ck('the follow-ups sync with the web app', back && Array.isArray(back.bankFollowUps) && back.bankFollowUps.length === 2 && back.bankFollowUps[1].remarks === 'Amendment issued; awaiting SWIFT copy');

  // Follow up again in N days: quick picks that skip Sundays / holidays / leave days.
  const sat = new Date(2026, 9, 17, 9, 0);   // Saturday 17 Oct 2026
  const picks = followUpPicks(sat, (k) => new Date(`${k}T12:00:00`).getDay() === 0);
  ck('four picks, labelled', picks.map((x) => x.label).join('|') === 'Tomorrow|In 2 days|In 3 days|Next week');
  ck('Tomorrow (a Sunday) moves to Monday', picks[0].key === '2026-10-19', picks[0].key);
  ck('In 2 days / 3 days / next week', picks[1].key === '2026-10-19' && picks[2].key === '2026-10-20' && picks[3].key === '2026-10-24', JSON.stringify(picks));
  const withHol = followUpPicks(sat, (k) => new Date(`${k}T12:00:00`).getDay() === 0 || k === '2026-10-19');
  ck('a holiday is skipped too', withHol[0].key === '2026-10-20' && withHol[1].key === '2026-10-20');
  const kept = new Date(applyFollowUpPick(new Date(2026, 9, 18, 15, 30).toISOString(), '2026-10-20'));
  ck('a pick keeps the existing time', kept.getDate() === 20 && kept.getHours() === 15 && kept.getMinutes() === 30);
  ck('no time yet: 10:00', new Date(applyFollowUpPick(null, '2026-10-20')).getHours() === 10);
  const noNext = addBankFollowUp(base, { remarks: 'Will revert' }, day1);
  ck('no next date: due date unchanged (no nagging)', noNext.dueAt === base.dueAt && noNext.bankFollowUps[0].next === null);
}
