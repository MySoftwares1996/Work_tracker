# Phone updates - change the app's screens without a new APK

The Android app is mostly JavaScript (its screens and logic) on top of a small native shell. An APK made with the update settings below can
download a newer copy of the JavaScript from Expo's update service when it opens, so a screen change reaches the phone in a minute or two
instead of after a 12-minute build and a re-install.

## One-time setup (you do this; the token is never pasted in chat)

1. Sign in at https://expo.dev as the owner (`mysoftwares1996`) and create a project (name `working-dashboard`). Copy its **Project ID**
   (a long id like `1234abcd-....`, on the project's page).
2. expo.dev > Account settings > Access tokens > create a token. In GitHub: repository Settings > Secrets and variables > Actions >
   **Secrets** > New repository secret: name `EXPO_TOKEN`, the token as the value.
3. Same page, **Variables** > New repository variable: name `EAS_PROJECT_ID`, the project id as the value.
4. Ask for the APK build once ("Build the APK now"). That build has the update settings (`app.config.js`). Install it.

## Every change after that

- GitHub > Actions > **Publish phone update** > Run workflow > type what changed. It runs the checks, then publishes. Nothing runs by itself.
  (GitHub only lists a workflow there once its file is on `main`. Until then, or any time, `git tag phone-update-N && git push origin phone-update-N`
  publishes the update from the tagged commit.)
- On the phone: the app looks for an update when it opens and when it comes back to the front (at most once a minute), downloads it quietly,
  and shows "A new version of the app is ready - Restart" (`src/PhoneUpdate.js`).

## What an update can and cannot carry

- Can: any change to the screens and logic in `App.js` and `src/` (Home, Tasks, the forms, the Report, sync, alert planning text...).
- Cannot: a new native library, a change to the Kotlin code (`modules/native-tools`: alarms, presence), new Android permissions, or a new Expo
  SDK. Those need a full APK build. If one is made, raise `version` in `app.json` first: updates only go to builds with the same version
  (`runtimeVersion` policy `appVersion`), so an older build never receives JavaScript it cannot run.
- The update files are hosted by Expo. They hold the app's JavaScript (the same code that is in the APK), not your data.
- Without `EAS_PROJECT_ID` nothing is different from before: the build has no update settings and the app never looks for updates.
