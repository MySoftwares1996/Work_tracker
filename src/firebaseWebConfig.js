/**
 * The Firebase JS SDK's settings (the browser build's Firebase, and the built-in AI on both phone and web): the same project ("work-tracker-3b728") the Android app and the
 * Banking Work Tracker web app use, so all of them see the same entries.
 *
 * Any value can be replaced at build time with an EXPO_PUBLIC_FIREBASE_* variable (in a .env file) - for
 * example the apiKey / appId of the project's own Firebase *Web* app (Firebase console -> Project settings ->
 * Your apps -> Web), if the Android key below is restricted to Android apps.
 */
import { initializeApp, getApps, getApp as getFbApp } from 'firebase/app';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'work-tracker-3b728';

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDOmvFSBL5VWAcWChfWcgKyQxtn5EZALJQ',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID || '872088776442',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:872088776442:android:50a872782ca60de2c0e343',
};

export function firebaseApp() {
  return getApps().length ? getFbApp() : initializeApp(firebaseConfig);
}
