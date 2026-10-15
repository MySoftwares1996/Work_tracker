import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import plugin from '../../plugins/withReleaseSigning.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

export async function run({ ck, section }) {
  const { applyReleaseSigning } = plugin;
  // Expo's real SDK 57 android/app/build.gradle, saved from expo-template-bare-minimum@57.0.26.
  const src = fs.readFileSync(path.join(here, '..', 'fixtures-app-build.gradle'), 'utf8');
  const out = applyReleaseSigning(src);
  const buildTypes = out.slice(out.indexOf('buildTypes {'));

  section('Release signing (tested on the real SDK 57 template)');
  ck('the template signs release builds with the debug key', /release \{[\s\S]*?signingConfig signingConfigs\.debug/.test(src.slice(src.indexOf('buildTypes {'))));
  ck('release builds use your key when the CI provides one', /release \{[\s\S]*?signingConfig System\.getenv\("ANDROID_KEYSTORE_PATH"\) \? signingConfigs\.release : signingConfigs\.debug/.test(buildTypes));
  ck('debug builds are untouched', /debug \{\s*signingConfig signingConfigs\.debug\s*\}/.test(buildTypes));
  ck('keystore read from the environment, never hardcoded', out.includes('storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))'));
  ck('passwords read from the environment', out.includes('storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")') && out.includes('keyPassword System.getenv("ANDROID_KEY_PASSWORD")'));
  ck('braces still balanced', (out.match(/\{/g) || []).length === (out.match(/\}/g) || []).length);
  ck('applying twice changes nothing', applyReleaseSigning(out) === out);
  let threw = false;
  try { applyReleaseSigning('android { defaultConfig { } }'); } catch { threw = true; }
  ck('an unexpected layout fails loudly instead of shipping a debug-signed APK', threw);

  section('CI build number');
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os_tmp()), 'vc-'));
  fs.writeFileSync(path.join(tmp, 'app.json'), JSON.stringify({ expo: { version: '2.3.0', android: { package: 'x' } } }));
  execFileSync('node', [path.join(root, 'scripts', 'ci-version-code.js'), '7'], { cwd: tmp, stdio: 'ignore' });
  const app = JSON.parse(fs.readFileSync(path.join(tmp, 'app.json'), 'utf8'));
  ck('versionCode = 1000 + run number', app.expo.android.versionCode === 1007);
  ck('other fields kept', app.expo.android.package === 'x' && app.expo.version === '2.3.0');
  let bad = false;
  try { execFileSync('node', [path.join(root, 'scripts', 'ci-version-code.js'), 'abc'], { cwd: tmp, stdio: 'ignore' }); } catch { bad = true; }
  ck('a missing run number is refused', bad);
}

function os_tmp() { return process.env.TMPDIR || '/tmp'; }
