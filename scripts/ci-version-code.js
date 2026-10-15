#!/usr/bin/env node
/**
 * Gives a GitHub build an Android versionCode higher than the app on your
 * phone. EAS keeps its build numbers on its own servers (appVersionSource:
 * "remote") and counts up from 1; a GitHub build would otherwise use 1, and
 * Android refuses to install a lower versionCode over a higher one.
 *
 * versionCode = 1000 + GitHub run number, so it is always higher than any
 * EAS build and rises by one with every GitHub build.
 * Only the CI's temporary copy of app.json is changed - never your repo.
 */
const fs = require('fs');
const run = Number(process.argv[2]);
if (!Number.isInteger(run) || run < 1) {
  console.error('Usage: node scripts/ci-version-code.js <github.run_number>');
  process.exit(1);
}
const path = 'app.json';
const app = JSON.parse(fs.readFileSync(path, 'utf8'));
app.expo.android = app.expo.android || {};
app.expo.android.versionCode = 1000 + run;
fs.writeFileSync(path, JSON.stringify(app, null, 2));
console.log(`versionCode set to ${app.expo.android.versionCode} (app version ${app.expo.version})`);
