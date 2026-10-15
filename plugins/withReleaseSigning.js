/**
 * Signs RELEASE builds with your own keystore when the CI provides one.
 *
 * Expo's generated android/app/build.gradle signs release builds with the
 * DEBUG key (release { signingConfig signingConfigs.debug }). An APK built
 * that way cannot be installed over the copy on your phone - Android rejects
 * the different signature - and the only way forward is to uninstall, which
 * deletes all the app's data.
 *
 * With ANDROID_KEYSTORE_PATH set (GitHub Actions sets it), release builds use
 * your keystore. Without it nothing changes, so EAS builds - which inject
 * their own signing - behave exactly as before.
 *
 * If the template's layout ever changes so the edit cannot be made, this
 * throws instead of silently producing a debug-signed APK.
 */
const MARKER = '// mpt-release-signing';

function applyReleaseSigning(src) {
  if (src.includes(MARKER)) return src;              // already applied

  const sc = src.indexOf('signingConfigs {');
  if (sc < 0) throw new Error('withReleaseSigning: no signingConfigs block in app/build.gradle');
  const insertAt = sc + 'signingConfigs {'.length;
  const release = `
        ${MARKER}
        release {
            if (System.getenv("ANDROID_KEYSTORE_PATH")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }`;
  let out = src.slice(0, insertAt) + release + src.slice(insertAt);

  const bt = out.indexOf('buildTypes {');
  if (bt < 0) throw new Error('withReleaseSigning: no buildTypes block in app/build.gradle');
  const rel = out.indexOf('release {', bt);
  if (rel < 0) throw new Error('withReleaseSigning: no buildTypes.release block in app/build.gradle');
  const debugSig = 'signingConfig signingConfigs.debug';
  const sig = out.indexOf(debugSig, rel);
  const nextBlockEnd = out.indexOf('\n        }', rel);
  if (sig < 0 || (nextBlockEnd > 0 && sig > nextBlockEnd)) {
    throw new Error('withReleaseSigning: release build type does not use signingConfigs.debug as expected');
  }
  out = out.slice(0, sig)
    + 'signingConfig System.getenv("ANDROID_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug'
    + out.slice(sig + debugSig.length);
  return out;
}

module.exports = function withReleaseSigning(config) {
  // Required here, not at the top, so applyReleaseSigning() can be tested
  // without Expo installed.
  const { withAppBuildGradle } = require('@expo/config-plugins');
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: expected a Groovy build.gradle');
    }
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.applyReleaseSigning = applyReleaseSigning;
