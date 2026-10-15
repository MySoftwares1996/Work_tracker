// The same app runs on Android and in a browser. On the web, the packages below only exist on a phone, so
// each is swapped for the small browser version in web/shims. The app's own code is the same on both.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const shim = (name) => path.join(__dirname, 'web', 'shims', name);

const WEB_SHIMS = {
  '@react-native-firebase/app': shim('firebase-app.js'),
  '@react-native-firebase/auth': shim('firebase-auth.js'),
  '@react-native-firebase/firestore': shim('firebase-firestore.js'),
  '@react-native-google-signin/google-signin': shim('google-signin.js'),
  '@react-native-community/datetimepicker': shim('datetimepicker.js'),
  'react-native-android-widget': shim('android-widget.js'),
  'expo-notifications': shim('notifications.js'),
  'expo-task-manager': shim('task-manager.js'),
  'expo-background-fetch': shim('background-fetch.js'),
  'expo-secure-store': shim('secure-store.js'),
  'expo-file-system/legacy': shim('file-system.js'),
  'expo-sharing': shim('sharing.js'),
};

const baseResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) return { type: 'sourceFile', filePath: WEB_SHIMS[moduleName] };
  return (baseResolve || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
