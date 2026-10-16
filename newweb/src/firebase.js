import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

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
// App Check (docs/NEW_WEB.md, "App Check"): with a reCAPTCHA v3 site key the page proves to Firebase that its requests come from this
// website. Google requires it for Gemini (Firebase AI Logic) from 2 November 2026. Without the key the page still works, as before.
const SITE_KEY = env.VITE_RECAPTCHA_SITE_KEY || '';
export const firebaseApp = () => {
  if (app) return app;
  app = initializeApp(firebaseConfig);
  if (SITE_KEY && typeof window !== 'undefined') {
    try { initializeAppCheck(app, { provider: new ReCaptchaV3Provider(SITE_KEY), isTokenAutoRefreshEnabled: true }); } catch { /* the page works without it */ }
  }
  return app;
};
