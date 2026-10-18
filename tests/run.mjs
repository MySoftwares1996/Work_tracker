/**
 * Test runner. `npm test`
 * Covers the Working Dashboard's logic: alerts and alarms, recurrence, Past Due Alert, web-app and sheet sync,
 * the daily report, widgets, backups, storage and app lock.
 */
import { register } from 'node:module';
// The parent must be this module's URL as-is. Re-encoding it breaks any path
// containing a space, which this project's folder name has.
register('./loader.mjs', import.meta.url);

let pass = 0, fail = 0;
const failures = [];
export const ck = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); }
};
export const section = (t) => console.log('\n' + t);

// A fresh checkout has no node_modules; say so instead of throwing a stack.
try {
  await import('@babel/parser');
} catch {
  console.error('Dependencies are not installed yet. Run:\n\n  npm install\n');
  process.exit(2);
}

const suites = ['./suites/app-lock.mjs', './suites/ui-colour.mjs', './suites/backup.mjs', './suites/cloud-sync.mjs', './suites/firebase-sync-core.mjs', './suites/full-screen-alarm.mjs', './suites/native.mjs', './suites/options.mjs', './suites/past-due.mjs', './suites/report-style.mjs', './suites/serial-queue.mjs', './suites/signing.mjs', './suites/step-back.mjs', './suites/store.mjs', './suites/swipe.mjs', './suites/sync-dirty.mjs', './suites/wd-notify.mjs', './suites/widgets.mjs', './suites/working-dashboard-mail.mjs', './suites/working-dashboard-payments.mjs', './suites/working-dashboard-report.mjs', './suites/working-dashboard.mjs', './suites/web.mjs', './suites/account.mjs', './suites/gmail.mjs', './suites/bank-follow-up.mjs', './suites/report-details.mjs', './suites/separate-notifications.mjs', './suites/notification-buttons.mjs', './suites/improvements.mjs', './suites/improvements-2.mjs', './suites/improvements-3.mjs', './suites/checklist-on-complete.mjs', './suites/warnings-notification-only.mjs', './suites/quick-add.mjs', './suites/newweb-report.mjs', './suites/month-end.mjs', './suites/update-progress.mjs', './suites/weekly-review.mjs'];
for (const s of suites) {
  const mod = await import(s);
  await mod.run({ ck, section });
  if (mod.runExtra) await mod.runExtra({ ck, section });
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failed: ' + failures.join(', ')); process.exit(1); }
