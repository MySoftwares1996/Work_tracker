/**
 * Lets the pure logic modules run under plain node.
 *
 * src/sms.js and friends import react-native and expo packages that do not
 * exist outside a device. This resolve hook swaps those for the small stubs in
 * tests/stubs, so the parsing, dedupe, merge and crypto logic can be tested
 * without a simulator.
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

// fileURLToPath, not URL.pathname: pathname leaves %20 in place.
const here = path.dirname(fileURLToPath(import.meta.url));
const STUBS = {
  'react-native': 'react-native.mjs',
  '@react-native-async-storage/async-storage': 'async-storage.mjs',
  'expo-task-manager': 'expo-task-manager.mjs',
  'expo-background-fetch': 'expo-background-fetch.mjs',
  'expo-location': 'expo-location.mjs',
  'expo-notifications': 'expo-notifications.mjs',
  'expo-file-system/legacy': 'empty.mjs',
  'expo-sharing': 'empty.mjs',
  'expo-document-picker': 'empty.mjs',
  'expo-image-picker': 'empty.mjs',
  'expo-image-manipulator': 'empty.mjs',
  'expo-modules-core': 'expo-modules-core.mjs',
  'expo-secure-store': 'expo-secure-store.mjs',
  'expo-local-authentication': 'expo-local-authentication.mjs',
  '@react-native-firebase/app': 'firebase.mjs',
  '@react-native-firebase/auth': 'firebase.mjs',
  '@react-native-firebase/firestore': 'firebase.mjs',
  '@react-native-google-signin/google-signin': 'firebase.mjs',
};

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) {
    return { url: pathToFileURL(path.join(here, 'stubs', STUBS[specifier])).href, shortCircuit: true };
  }
  // Asset-importing modules cannot run under node; swap the whole module.
  if (/(^|\/)ringtones$/.test(specifier) || specifier.endsWith('/ringtones.js')) {
    return { url: pathToFileURL(path.join(here, 'stubs', 'ringtones.mjs')).href, shortCircuit: true };
  }
  if (specifier.includes('modules/native-tools')) {
    return { url: pathToFileURL(path.join(here, 'stubs', 'native-tools.mjs')).href, shortCircuit: true };
  }

  // Metro resolves extensionless relative imports ("./store"); node does not.
  if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL) {
    const abs = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const candidate of [abs + '.js', path.join(abs, 'index.js')]) {
      if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }

  return next(specifier, context);
}
