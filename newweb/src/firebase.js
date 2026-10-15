import { initializeApp } from 'firebase/app';

// The same Firebase project as the phone app, so both see the same tasks. Any value can be replaced at build time with a
// VITE_FIREBASE_* variable (the project's own Web app keys, if the default Android key is restricted to Android apps).
const env = import.meta.env;
const PROJECT_ID = env.VITE_FIREBASE_PROJECT_ID || 'work-tracker-3b728';

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyDOmvFSBL5VWAcWChfWcgKyQxtn5EZALJQ',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`,
  messagingSenderId: env.VITE_FIREBASE_SENDER_ID || '872088776442',
  appId: env.VITE_FIREBASE_APP_ID || '1:872088776442:android:50a872782ca60de2c0e343',
};

let app;
export const firebaseApp = () => app || (app = initializeApp(firebaseConfig));
