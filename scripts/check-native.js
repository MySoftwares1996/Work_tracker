#!/usr/bin/env node
/**
 * Static checks for the Android side.
 *
 * A Kotlin compiler and the Android SDK are not available here, so this cannot
 * prove the module builds. What it does catch is the class of mistake that has
 * actually broken builds on this project: a Gradle block removed by a newer
 * AGP, a missing SDK-version call, manifest components that do not resolve,
 * unbalanced braces, symbols used without an import, and drift between the
 * functions Kotlin exposes and the ones JavaScript calls.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MOD = path.join(ROOT, 'modules', 'native-tools');
const problems = [];
const read = (p) => fs.readFileSync(p, 'utf8');

/* ---------- gradle ---------- */
const gradlePath = path.join(MOD, 'android', 'build.gradle');
if (!fs.existsSync(gradlePath)) {
  problems.push('MISSING  modules/native-tools/android/build.gradle');
} else {
  // Strip comments first: a comment mentioning compileSdk used to satisfy the
  // check below, which is exactly how the missing SDK-version call slipped
  // through and broke a build.
  const g = read(gradlePath).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Removed in AGP 8, which Expo SDK 57 uses.
  if (/\blintOptions\s*\{/.test(g)) problems.push('GRADLE   lintOptions{} was removed in AGP 8 — use lint{}');
  if (/\baaptOptions\s*\{/.test(g)) problems.push('GRADLE   aaptOptions{} was removed in AGP 8');
  if (!/useDefaultAndroidSdkVersions\(\)/.test(g) && !/compileSdk/.test(g)) {
    problems.push('GRADLE   no compileSdk: call useDefaultAndroidSdkVersions()');
  }
  if (!/namespace\s+"/.test(g)) problems.push('GRADLE   android.namespace is required by AGP 8');
  if (!/applyKotlinExpoModulesCorePlugin\(\)/.test(g)) problems.push('GRADLE   applyKotlinExpoModulesCorePlugin() missing');
  if (/\bversionCode\b|\bversionName\b/.test(g)) {
    problems.push('GRADLE   versionCode/versionName do not belong in a library module and newer AGP rejects them');
  }
  if (/apply plugin: 'kotlin-android'/.test(g)) {
    problems.push("GRADLE   remove apply plugin: 'kotlin-android' — applyKotlinExpoModulesCorePlugin() does it");
  }
}

/* ---------- expo-module config ---------- */
const cfgPath = path.join(MOD, 'expo-module.config.json');
let declaredModules = [];
if (!fs.existsSync(cfgPath)) problems.push('MISSING  expo-module.config.json');
else {
  const cfg = JSON.parse(read(cfgPath));
  declaredModules = cfg.android?.modules || [];
  if (!declaredModules.length) problems.push('CONFIG   expo-module.config.json declares no android modules');
}

/* ---------- kotlin ---------- */
const ktDir = path.join(MOD, 'android', 'src', 'main', 'java');
const ktFiles = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    fs.statSync(p).isDirectory() ? walk(p) : f.endsWith('.kt') && ktFiles.push(p);
  }
})(ktDir);

if (!ktFiles.length) problems.push('MISSING  no Kotlin sources found');

// symbol -> import it requires
const NEEDS_IMPORT = {
  Telephony: 'android.provider.Telephony',
  ContextCompat: 'androidx.core.content.ContextCompat',
  JSONArray: 'org.json.JSONArray',
  JSONObject: 'org.json.JSONObject',
  PowerManager: 'android.os.PowerManager',
  PendingIntent: 'android.app.PendingIntent',
  NotificationChannel: 'android.app.NotificationChannel',
  NotificationManager: 'android.app.NotificationManager',
  SystemClock: 'android.os.SystemClock',
  ActivityNotFoundException: 'android.content.ActivityNotFoundException',
  SharedPreferences: 'android.content.SharedPreferences',
  HandlerThread: 'android.os.HandlerThread',
  IBinder: 'android.os.IBinder',
  SensorManager: 'android.hardware.SensorManager',
  SensorEventListener: 'android.hardware.SensorEventListener',
};

const exposedFunctions = new Set();
const declaredClasses = new Set();

for (const f of ktFiles) {
  const src = read(f);
  const name = path.basename(f);
  const pkg = (src.match(/^package\s+([\w.]+)/m) || [])[1];

  for (const m of src.matchAll(/^(?:class|object)\s+(\w+)/gm)) {
    if (pkg) declaredClasses.add(`${pkg}.${m[1]}`);
  }
  for (const m of src.matchAll(/AsyncFunction\("(\w+)"\)|Function\("(\w+)"\)/g)) {
    exposedFunctions.add(m[1] || m[2]);
  }

  for (const [sym, imp] of Object.entries(NEEDS_IMPORT)) {
    const used = new RegExp(`\\b${sym}\\b`).test(src.replace(/^import .*$/gm, ''));
    const imported = src.includes(`import ${imp}`) || src.includes(imp + '.');
    if (used && !imported) problems.push(`KOTLIN   ${name}: uses ${sym} without importing ${imp}`);
  }

  // Any androidx import needs an androidx dependency the module declares
  // itself. It declares none, so androidx is not guaranteed to be on the
  // classpath - "Unresolved reference: ContextCompat".
  for (const m of src.matchAll(/^import (androidx\.[\w.]+)/gm)) {
    problems.push(`KOTLIN   ${name}: imports ${m[1]} but the module declares no androidx dependency`);
  }
  // A nullable Intent handed to PendingIntent.
  if (/getLaunchIntentForPackage\([^)]*\)\s*$/m.test(src)) {
    problems.push(`KOTLIN   ${name}: getLaunchIntentForPackage() can return null - add ?: Intent()`);
  }

  for (const [open, close, label] of [['{', '}', 'braces'], ['(', ')', 'parens']]) {
    const stripped = src.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/gm, '');
    const a = (stripped.match(new RegExp('\\' + open, 'g')) || []).length;
    const b = (stripped.match(new RegExp('\\' + close, 'g')) || []).length;
    if (a !== b) problems.push(`KOTLIN   ${name}: unbalanced ${label} (${a} vs ${b})`);
  }
}

for (const cls of declaredModules) {
  if (!declaredClasses.has(cls)) problems.push(`CONFIG   declares ${cls} but no such class exists`);
}

/* ---------- manifest ---------- */
const manPath = path.join(MOD, 'android', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manPath)) {
  const man = read(manPath);
  for (const m of man.matchAll(/android:name="(\.[\w.]+)"/g)) {
    problems.push(`MANIFEST relative component ${m[1]} — AGP 8 needs the fully qualified name`);
  }
  for (const m of man.matchAll(/android:name="([\w.]+\.(?:Service|Receiver|\w*Service|\w*Receiver))"/g)) {
    const cls = m[1];
    if (cls.startsWith('android.')) continue;
    if (!declaredClasses.has(cls)) problems.push(`MANIFEST declares ${cls} but no such class exists`);
  }
  if (/foregroundServiceType/.test(man) && !/FOREGROUND_SERVICE_/.test(man)) {
    problems.push('MANIFEST foregroundServiceType set but no matching FOREGROUND_SERVICE_* permission');
  }
}

/* ---------- kotlin <-> javascript drift ---------- */
const wrapper = read(path.join(MOD, 'index.js'));
for (const fn of exposedFunctions) {
  if (!wrapper.includes(fn)) problems.push(`BRIDGE   Kotlin exposes ${fn}() but modules/native-tools/index.js never calls it`);
}
for (const m of wrapper.matchAll(/Native\.(\w+)\(/g)) {
  if (!exposedFunctions.has(m[1])) problems.push(`BRIDGE   index.js calls Native.${m[1]}() which Kotlin does not expose`);
}

/* ---------- permissions declared in app.json ---------- */
const app = JSON.parse(read(path.join(ROOT, 'app.json'))).expo;
const perms = new Set(app.android?.permissions || []);
const manifestPerms = fs.existsSync(manPath)
  ? [...read(manPath).matchAll(/uses-permission android:name="([\w.]+)"/g)].map((m) => m[1])
  : [];
for (const p of manifestPerms) {
  if (!perms.has(p)) problems.push(`PERMS    ${p} is in the module manifest but not app.json`);
}

/* ---------- would EAS actually upload it? ---------- */
/*
 * EAS Build uploads the project from git and honours .gitignore. For months a
 * bare "android/" pattern excluded modules/native-tools/android/, so every
 * build shipped without the native module while every check here - which reads
 * from disk - passed. Ask git directly instead.
 */
const { execSync } = require('child_process');
let gitAvailable = true;
try { execSync('git rev-parse --is-inside-work-tree', { cwd: ROOT, stdio: 'ignore' }); }
catch { gitAvailable = false; }

if (gitAvailable) {
  const MUST_SHIP = ['src', 'modules', 'plugins', 'assets', 'apps-script', 'App.js', 'index.js', 'app.json', 'package.json', 'eas.json'];
  const onDisk = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      if (['node_modules', '.git', '.expo'].includes(f)) continue;
      const p = path.join(d, f);
      fs.statSync(p).isDirectory() ? walk(p) : onDisk.push(path.relative(ROOT, p).split(path.sep).join('/'));
    }
  })(ROOT);
  const shipped = onDisk.filter((f) => MUST_SHIP.some((m) => f === m || f.startsWith(m + '/')));
  for (const f of shipped) {
    try {
      // --no-index tests the PATTERNS, not the index. Without it, a file that
      // happens to be tracked here reports as not-ignored even when the same
      // pattern excludes it on a fresh clone - which is how this check first
      // passed against the broken .gitignore.
      execSync(`git check-ignore --no-index -q -- "${f}"`, { cwd: ROOT, stdio: 'ignore' });
      problems.push(`GITIGNORE ${f} is ignored by git, so EAS Build will never receive it`);
    } catch { /* exit 1 = not ignored, which is what we want */ }
  }
}

console.log(`Checked ${ktFiles.length} Kotlin files, gradle, manifest and the JS bridge.`);
if (problems.length) {
  problems.forEach((p) => console.log('  ' + p));
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log('No problems found.');
console.log('Note: this is static analysis. It cannot prove the Kotlin compiles.');
