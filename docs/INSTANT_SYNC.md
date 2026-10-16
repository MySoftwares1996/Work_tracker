# Instant sync to the phone (optional)

Without this, an edit made on the website reaches the phone's alarms within about 15 minutes (the background refresh).
With it, within a few seconds. The app side is built in; only the small server function below must be deployed once.

1. Firebase console -> your project -> **Upgrade to the Blaze plan** (pay-as-you-go; this function costs next to nothing
   for one person's use, and the free monthly allowance covers it).
2. On a computer with Node 20: `npm install -g firebase-tools`, then `firebase login`.
3. In this repository's folder: `firebase use <your-project-id>` and `firebase init functions` is NOT needed - the
   `functions/` folder is ready. Run:

   ```
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
   (The "Deploy instant sync" GitHub workflow was removed: the free Spark plan cannot deploy functions, and the deploy failed with a 403.
   Deploy from a computer with the Blaze plan if instant sync is wanted later.)
4. Install the new APK, open the app once while signed in with Google (it saves the phone's token to
   `users/<uid>/meta/devices`), then edit a task on the website: the phone follows within seconds.

What it does: when any document in `users/<uid>/tasks` changes, `tasksChanged` (functions/index.js) sends the phone a
silent data message `{ kind: 'wd-tasks-changed' }`; the app's background notification task then runs the same refresh the
15-minute job runs (`refreshWdAlerts`). A burst of edits sends one message, 1 second after the first. Target: the phone follows an edit within 10 seconds. Tokens of removed installs are cleaned up.

If it does not work: Firebase console -> Functions -> Logs shows each run; `users/<uid>/meta/devices` must hold a token.
