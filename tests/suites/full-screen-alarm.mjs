import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import plugin from '../../plugins/withAlarmMainActivity.js';
import NativeTools, { __setFullScreenIntentAllowed, __setInitialAlarmAction, __scheduledAlarms } from '../stubs/native-tools.mjs';
import * as tracker from '../../src/tracker.js';
import { cancelForTask } from '../../src/notify.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function run({ ck, section }) {
  const { applyMainActivityPatch } = plugin;
  // Expo's real SDK 57 android/app/.../MainActivity.kt, saved from a prebuild of this project.
  const src = fs.readFileSync(path.join(here, '..', 'fixtures-main-activity.kt'), 'utf8');
  const out = applyMainActivityPatch(src);

  section('withAlarmMainActivity: keeps getIntent() current on a singleTask activity');
  ck('adds the onNewIntent override', out.includes('override fun onNewIntent(intent: Intent)'));
  ck('calls setIntent so getIntent() reflects the new extras', /onNewIntent\(intent: Intent\) \{\s*super\.onNewIntent\(intent\)\s*setIntent\(intent\)/.test(out));
  ck('still calls super.onNewIntent first', out.includes('super.onNewIntent(intent)'));
  ck('imports Intent', out.includes('import android.content.Intent'));
  ck('the rest of the class is untouched', out.includes('override fun getMainComponentName(): String = "main"') && out.includes('invokeDefaultOnBackPressed'));
  ck('braces still balanced', (out.match(/\{/g) || []).length === (out.match(/\}/g) || []).length);
  ck('applying twice changes nothing', applyMainActivityPatch(out) === out);
  let threw = false;
  try { applyMainActivityPatch('class MainActivity { }'); } catch { threw = true; }
  ck('an unexpected layout fails loudly instead of silently skipping the patch', threw);

  section('Full-screen task alarms: src/tracker.js wraps the native module');
  await cancelForTask('t-cleanup'); // harmless no-op, just exercises the guarded path with nothing scheduled

  const ok = await tracker.scheduleFullScreenAlarm('t1', new Date('2026-01-01T09:00:00Z'), 'High Priority', 'Send the report');
  ck('scheduling resolves true', ok === true);
  ck('the native side received the right time and text', __scheduledAlarms().t1.title === 'High Priority' && __scheduledAlarms().t1.body === 'Send the report');
  ck('the date was converted to milliseconds', __scheduledAlarms().t1.atMs === new Date('2026-01-01T09:00:00Z').getTime());

  await tracker.cancelFullScreenAlarm('t1');
  ck('cancelling removes it from the native side', __scheduledAlarms().t1 === undefined);

  ck('an unparsable date is refused rather than scheduling garbage', (await tracker.scheduleFullScreenAlarm('t2', 'not-a-date', 'x', 'y')) === false);

  __setFullScreenIntentAllowed(true);
  ck('allowed reports true', (await tracker.isFullScreenIntentAllowed()) === true);
  __setFullScreenIntentAllowed(false);
  ck('blocked reports false', (await tracker.isFullScreenIntentAllowed()) === false);

  section('Full-screen task alarms: consuming what launched the app');
  __setInitialAlarmAction(null);
  ck('a plain launch (not from the alarm flow) resolves null', (await tracker.consumeInitialAlarmAction()) === null);
  __setInitialAlarmAction({ taskId: 't3', action: 'DONE' });
  const action = await tracker.consumeInitialAlarmAction();
  ck('a Done tap round-trips the task id and action', action.taskId === 't3' && action.action === 'DONE');
  __setInitialAlarmAction({ taskId: 't4', action: null });
  ck('a plain "open" tap (no action button) carries a null action', (await tracker.consumeInitialAlarmAction()).action === null);

  section('Full-screen task alarms: cancelling through notify.js');
  await tracker.scheduleFullScreenAlarm('t5', new Date(Date.now() + 3600_000), 'Medium Priority', 'Water the plants');
  ck('a booked native alarm is there', __scheduledAlarms().t5 !== undefined);
  await cancelForTask('t5');
  ck('cancelForTask also cancels the native alarm', __scheduledAlarms().t5 === undefined);

  ck('the native module stub itself is reachable', typeof NativeTools.scheduleFullScreenAlarm === 'function');
}
