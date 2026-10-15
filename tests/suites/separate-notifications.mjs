import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import plugin from '../../plugins/withSeparateNotifications.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

export async function run({ ck, section }) {
  const { applySeparateNotificationsPatch, BUILDER } = plugin;
  section('withSeparateNotifications: every task notification on its own, never bundled');
  // The installed expo-notifications' own builder, so a version that moved the line fails here, not in the APK build.
  const file = path.join(root, 'node_modules', 'expo-notifications', BUILDER);
  const src = fs.readFileSync(file, 'utf8');
  const out = applySeparateNotificationsPatch(src);
  ck('each notification gets a group of its own (its identifier)', out.includes('builder.setGroup("mpt-" + notification.notificationRequest.identifier)'));
  ck('set right after the expandable text style, inside build()', /BigTextStyle\(\)\.bigText\(content\.text\)\)\n\s*\/\/ mpt-separate-notifications[^\n]*\n\s*builder\.setGroup/.test(out));
  ck('nothing else changes', out.replace(/\n\s*\/\/ mpt-separate-notifications[^\n]*\n\s*builder\.setGroup\([^\n]*\)/, '') === src);
  ck('applying twice changes nothing', applySeparateNotificationsPatch(out) === out);
  let threw = false;
  try { applySeparateNotificationsPatch('class ExpoNotificationBuilder { }'); } catch { threw = true; }
  ck('an unexpected layout fails loudly instead of silently skipping the patch', threw);

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  ck('the build compiles expo-notifications from the patched source, not its prebuilt copy',
    (pkg.expo?.autolinking?.android?.buildFromSource || []).includes('expo-notifications'));
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  ck('the plugin is listed in app.json', JSON.stringify(app.expo.plugins).includes('./plugins/withSeparateNotifications'));
}
