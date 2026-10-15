import fs from 'fs';
import { isWarningKey, entryAlertPlan } from '../../src/workingDashboard.js';

export async function run({ ck, section }) {
  section('Warnings before the due time are a notification only (phone and website)');
  ck('"Due in 1 hr", "Due tomorrow" and deadline warnings are warnings', ['due-60', 'due-15', 'due-eve', 'dl-120', 'dl-eve'].every(isWarningKey));
  ck('the due moment, due today, overdue, deadline and follow-ups are not', !['due', 'due-day', 'due-late', 'dl', 'dl-day', 'nag-10', 'daily-1', 'snooze'].some(isWarningKey));
  const now = new Date(2026, 9, 13, 8, 0);
  const high = { id: 'h', title: 'Imports Payment', priority: 'High', alertMode: 'alarm', dueAt: new Date(2026, 9, 13, 10, 45).toISOString(), deadlineAt: new Date(2026, 9, 13, 17, 0).toISOString() };
  const plan = entryAlertPlan(high, now, { warningsRing: true, deadline: true });
  ck('no warning of any task is an alarm, whatever the settings', plan.filter((x) => isWarningKey(x.key)).every((x) => !x.alarm));
  ck('the due time still rings as the alarm', plan.find((x) => x.key === 'due').alarm === true);
  const web = fs.readFileSync('src/WebAlarm.js', 'utf8');
  ck('the website opens no alarm window for a warning', /if \(isWarningKey\(d\.key\)\) return;/.test(web));
  const settings = fs.readFileSync('src/screens/WdAlertSettings.js', 'utf8');
  ck('Config no longer offers to make warnings ring', !settings.includes("'Warnings ring too'"));
}
