# Working Dashboard

The Working Dashboard from **My Personal Tracker** as a separate Android app. Same version of the tool, same
screens, look and features (see `CHANGELOG.md`). The app opens straight on the Working Dashboard; ⚙ at the top
right opens the app settings (app lock, theme, text size, alert permissions, backup / restore).

Built with Expo SDK 57 / React Native 0.86, the same as My Personal Tracker.

**Anyone can use it:** they sign in with Google and get their own private data, on the phone and the web
(`docs/NEW_USERS.md` - turn on the security rules before inviting anyone).

**The same app also runs in a web browser** (see "Web version" below): one code base, one set of screens and
logic, so every change reaches the phone and the web together.

## What you must do once before the first build

1. **Register the app in Firebase** (Realtime Sync and Google sign-in need it). The app's package is
   `com.koteswara.workingdashboard`.
   - Firebase console → the same project My Personal Tracker uses → Project settings → **Add app** → Android.
   - Package name: `com.koteswara.workingdashboard`.
   - Add the **SHA-1** (and SHA-256) of the signing key you create in `docs/BUILD_WITH_GITHUB.md` (Part B):
     `keytool -list -v -keystore working-dashboard.jks -alias workingdashboard`.
   - Download the new **google-services.json** and replace the one in this folder.
     The file in this zip is My Personal Tracker's and does **not** contain the new package, so a build stops with
     "No matching client found for package name" until you replace it.
   - In Firebase → Authentication, nothing changes: the same Google sign-in and the same web app.
2. **Signing key and GitHub build**: follow `docs/BUILD_WITH_GITHUB.md`.
   (Or EAS: `npm install`, `eas init` - it creates a new EAS project and adds its id to app.json - then
   `npm run build:apk`.)

## Moving your data from My Personal Tracker

Either:
- **Realtime Sync**: in the new app, Working Dashboard → Config → Realtime Sync → sign in with the same Google
  account. Every entry comes down from the web app.
- **Backup**: in My Personal Tracker, Settings → Back up everything. In Working Dashboard, ⚙ → Restore from a
  backup → pick that file. Only its Working Dashboard (entries, lists, config, activity log) and the theme /
  app-lock settings are taken.

Both apps can stay installed: they are separate apps with separate data, both synced with the same web app.
Turn off the alerts in one of them (Working Dashboard → Config → alerts), or both will ring for the same task.

## Commands

```
npm install
npm run verify        # project checks, native static checks and the tests (743)
npm start             # dev client
npm run build:apk     # EAS preview APK (after `eas init`)
npm run web           # the web version, live at http://localhost:8081
npm run build:web     # the web version as a static site, in dist/
npm run deploy:web    # put dist/ on Firebase Hosting (FIREBASE_HOSTING_SITE=<site>)
```

## Web version

**Online automatically:** after the one-time setup in `docs/DEPLOY_WEB.md`, every push to `main` builds the
web version and puts it on Firebase Hosting (`.github/workflows/web-deploy.yml`).

`npm run build:web` writes the whole site to `dist/`, which can also go on any other static host (Netlify,
GitHub Pages, ...). It is the same app as the APK - the same screens, the same Working Dashboard logic,
report and sync - and it fits itself to the screen it is opened on:

| Screen | Layout |
|---|---|
| Phone (under 600 px) | exactly the app: two cards a row, the tab bar at the foot, sheets from the bottom |
| Tablet (600 px +) | three cards a row, sheets open as centred dialogs, content at a readable width |
| Desktop (900 px +) | four cards a row and the tabs in a side bar on the left |

The breakpoints are in `src/layout.js`; an Android tablet gets the same layouts.

**Once, for Google sign-in (Realtime Sync) on the web:** Firebase console → Authentication → Settings →
Authorized domains → add the address the site is served from (`localhost` is already there). If sign-in says the
API key is not allowed, put the project's own *Web* app keys (Firebase → Project settings → Your apps → Web) in a
`.env` file as `EXPO_PUBLIC_FIREBASE_API_KEY` and `EXPO_PUBLIC_FIREBASE_APP_ID` and build again
(`src/firebaseWebConfig.js`).

What a browser cannot do, so only the Android app does it: the full-screen alarm and alerts with the app closed
(the web shows a browser notification while the tab is open), home-screen widgets, and the phone's fingerprint
unlock (the web uses the PIN). Data on the web is kept in that browser; Realtime Sync keeps it the
same as the phone.

**How it is built:** `metro.config.js` swaps each phone-only package for a small browser version in `web/shims/`
when bundling for the web, and `src/platformSetup.web.js` adds the browser's Alert dialog. Everything in `src/`
is shared, so a change is made once.

## Layout

- `App.js` - navigation (Working Dashboard, Settings, Past Due Alert), alarm and notification handling.
- `src/screens/WorkingDashboard.js`, `WdPaymentFields.js`, `PastDueAlert.js`, `WdAlertSettings.js`, `Settings.js` - the screens.
- `src/workingDashboardPayments.js` - the web app's Sub Category, Tally narration and Import Payment rules.
- `src/workingDashboard*.js`, `src/pastDue.js`, `src/cloudSync.js`, `src/firebaseSync*.js`, `src/RealtimeSync.js` -
  the logic, alerts and sync (unchanged from My Personal Tracker).
- `modules/native-tools` - the native full-screen alarm (ringing service, alarm screen, boot restore).
- `src/layout.js` - the phone / tablet / desktop breakpoints.
- `src/account.js`, `src/screens/Welcome.js`, `firestore.rules` - sign-in, one private space per Google account.
- `web/shims/`, `metro.config.js`, `src/platformSetup.web.js` - the browser versions of the phone-only packages.
- `scripts/deploy-web.js`, `.github/workflows/web-deploy.yml` - the web deploy (`docs/DEPLOY_WEB.md`).
- `tests/` - `npm test`.
