import fs from 'fs';
import { entryAlertPlan, applyQuietHours, setAlertOffDays, DEFAULT_ALERTS, blankEntry } from '../../src/workingDashboard.js';
import { snoozeMinutesOf } from '../../src/workingDashboardActions.js';
import { buildNarrationText, narrationMissing } from '../../src/workingDashboardPayments.js';
import { followUpAge, followUpAgeText, followUpsDueToday } from '../../src/bankFollowUp.js';
import { buildPeriodSummary, summaryPeriod, reportMailUrl } from '../../src/workingDashboardReport.js';

export async function run({ ck, section }) {
  section('Quiet hours: nothing rings at night or on days off');
  const now = new Date(2026, 9, 7, 12, 0);           // Wed 7 Oct 2026, noon
  const late = { ...blankEntry(), id: 'q1', title: 'Late task', priority: 'Medium', dueAt: new Date(2026, 9, 7, 22, 30).toISOString() };
  const quiet = { ...DEFAULT_ALERTS, quietHours: true, quietFrom: '21:00', quietTo: '08:00', followUps: false };
  const plan = entryAlertPlan(late, now, quiet);
  ck('an alert in quiet hours moves to when they end', plan.every((x) => x.at.getHours() >= 8 && x.at.getHours() < 21) && plan.some((x) => x.at.getDate() === 8 && x.at.getHours() === 8), plan.map((x) => x.at.toString()));
  ck('all of them ring once there, not several times', plan.filter((x) => x.at.getDate() === 8 && x.at.getHours() === 8 && x.at.getMinutes() === 0).length === 1);
  ck('without quiet hours it rings at 22:30', entryAlertPlan(late, now, { ...quiet, quietHours: false }).some((x) => x.at.getHours() === 22 && x.at.getMinutes() === 30));
  ck('High priority rings anyway (by default)', entryAlertPlan({ ...late, priority: 'High' }, now, quiet).some((x) => x.at.getHours() === 22));
  ck('...unless that is switched off', !entryAlertPlan({ ...late, priority: 'High' }, now, { ...quiet, quietExceptHigh: false }).some((x) => x.at.getHours() === 22));
  const items = [{ at: new Date(2026, 9, 7, 14, 0), key: 'due' }];
  ck('a day window (13:00-15:00) works too', applyQuietHours(items, late, { quietHours: true, quietFrom: '13:00', quietTo: '15:00' })[0].at.getHours() === 15);
  setAlertOffDays([{ date: '2026-10-09', title: 'Office holiday', officeClosed: true }], ['2026-10-12']);
  const onDays = (d) => [{ at: new Date(2026, 9, d, 11, 0), key: 'due' }];
  const off = { quietOffDays: true };
  ck('a holiday the office is closed on is quiet', applyQuietHours(onDays(9), late, off).length === 0);
  ck('a leave day is quiet', applyQuietHours(onDays(12), late, off).length === 0);
  ck('a Sunday is quiet', applyQuietHours(onDays(11), late, off).length === 0);
  ck('a working day rings', applyQuietHours(onDays(8), late, off).length === 1);
  ck('days off ring when not chosen', applyQuietHours(onDays(9), late, {}).length === 1);
  setAlertOffDays([], []);

  section('Phone alarm: snooze 5 / 15 / 30 / 60 minutes');
  ck('SNOOZE is 15 minutes', snoozeMinutesOf('SNOOZE') === 15);
  ck('the strip\'s lengths are read', snoozeMinutesOf('SNOOZE:5') === 5 && snoozeMinutesOf('SNOOZE:30') === 30 && snoozeMinutesOf('SNOOZE:60') === 60);
  ck('other actions are not snoozes', snoozeMinutesOf('DONE') === 0 && snoozeMinutesOf('SNOOZE:x') === 0 && snoozeMinutesOf(null) === 0);
  const kt = fs.readFileSync('modules/native-tools/android/src/main/java/expo/modules/nativetools/AlarmStyles.kt', 'utf8');
  ck('the alarm screen sends SNOOZE:<minutes> for 5, 30 and 60', kt.includes('act("SNOOZE:$min")') && /SNOOZE_CHOICES = intArrayOf\(5, 30, 60\)/.test(kt));
  const app = fs.readFileSync('App.js', 'utf8');
  ck('walk / water Snooze books the reminder again', app.includes('snoozeNudge(a.taskId, min)'));

  section('Tally narration: blank fields show, and Copy warns');
  const nr = { name: 'Imports Payments', template: 'Initiated an outward remittance in favor of {Beneficiary Name} towards {%} payment.', fields: [{ label: 'Beneficiary Name' }], hasPercent: true };
  ck('the preview shows [Label] for a blank field', buildNarrationText(nr, { placeholders: true }) === 'Initiated an outward remittance in favor of [Beneficiary Name] towards [%] payment.', buildNarrationText(nr, { placeholders: true }));
  ck('what is copied leaves them out', !buildNarrationText(nr, {}).includes('['));
  ck('the blank fields are named', narrationMissing(nr, { fieldsValues: {} }).join('|') === '%|Beneficiary Name');
  ck('nothing is missing once filled', narrationMissing(nr, { percent: '30', fieldsValues: { 'Beneficiary Name': 'ACME' } }).length === 0);

  section('Bank follow-ups: days open, and the Dashboard\'s "Follow-ups today"');
  const bf = { ...blankEntry(), id: 'b1', title: 'LC with SBI', category: "Bank Follow Up's", createdAt: new Date(2026, 8, 25, 9).toISOString(), dueAt: new Date(2026, 9, 7, 10).toISOString(),
    bankFollowUps: [{ d: '2026-10-01', at: new Date(2026, 9, 1, 11).toISOString(), remarks: 'Under review' }, { d: '2026-10-05', at: new Date(2026, 9, 5, 11).toISOString(), remarks: 'Awaiting SWIFT' }] };
  ck('days open and follow-ups counted', followUpAge(bf, now).days === 12 && followUpAge(bf, now).count === 2);
  ck('card text', followUpAgeText(bf, now) === 'Open 12 days · 2 follow-ups', followUpAgeText(bf, now));
  const later = { ...bf, id: 'b2', dueAt: new Date(2026, 9, 9, 10).toISOString() };
  const other = { ...bf, id: 'b3', category: 'Vendor Payments' };
  const list = followUpsDueToday([later, bf, other, { ...bf, id: 'b4', done: true }], now);
  ck('only open bank follow-ups due by tonight', list.length === 1 && list[0].entry.id === 'b1');
  ck('with the last follow-up and overdue', list[0].overdue && list[0].last.remarks === 'Awaiting SWIFT');

  section('Weekly / monthly summary, and the report by email');
  ck('a week runs from Monday', summaryPeriod('week', '2026-10-07').from === '2026-10-05' && summaryPeriod('week', '2026-10-05').from === '2026-10-05');
  ck('a month runs from the 1st', summaryPeriod('month', '2026-10-07').from === '2026-10-01');
  const done = (id, cat, d) => ({ ...blankEntry(), id, title: id, category: cat, done: true, status: 'Completed', completedAt: new Date(2026, 9, d, 12).toISOString(), createdAt: new Date(2026, 9, d, 9).toISOString() });
  const sum = buildPeriodSummary({ entries: [done('a', 'Vendor Payments', 6), done('b', 'Audit', 7), done('c', 'Domestic Payments', 7), done('d', 'Audit', 2), bf], kind: 'week', date: '2026-10-07', now });
  ck('completed in the week, Domestic payments left out', sum.completed === 2 && sum.payments === 1 && sum.others === 1, sum.text);
  ck('follow-ups in the week', sum.followUps === 1 && sum.followUpTasks === 1);
  ck('open now and overdue', sum.open === 1 && sum.overdue === 1);
  ck('the text names the period', sum.text.startsWith('Weekly summary: 5 Oct 2026 - 7 Oct 2026'), sum.text);
  ck('the month counts the 2nd too', buildPeriodSummary({ entries: [done('d', 'Audit', 2)], kind: 'month', date: '2026-10-07', now }).completed === 1);
  const url = reportMailUrl('Daily Activity Report', 'Line 1\nLine & 2');
  ck('mail link carries the subject and the text', url === 'mailto:?subject=Daily%20Activity%20Report&body=Line%201%0ALine%20%26%202', url);

  section('web.app: always the newest version after a deploy');
  const dep = fs.readFileSync('scripts/deploy-web.js', 'utf8');
  ck('the page addresses are not cached', dep.includes("source: '/', headers: [{ key: 'Cache-Control', value: 'no-cache' }]") && dep.includes("source: '**/!(*.*)'"));
}
