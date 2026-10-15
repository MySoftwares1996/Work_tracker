# The new web app (`newweb/`)

A separate website, built from scratch with its own look: a centred tab bar at the top, bold colourful tiles, cards. It signs in
with Google and reads and writes the **same Firebase account** as the phone app and the Expo website (`users/<uid>/tasks`,
`meta/lists`, `meta/calendar`, `meta/tools`), so both always show the same tasks. It does not touch the phone app or the Expo website.

**Screens:** Dashboard (tiles, quick add, needs attention) · Register (search, filters, sort, cards / table) · Completed · Holidays and
leave days · Bin (restore, delete forever) · Report (daily report text, copy) · Links · Config (lists, account). New / Edit entry form
with category, priority, status, pending with, due date and time, repeat, DAR, mail chain, notes. Done / DAR on every card; a repeating
task (Daily, Weekdays, Weekly, Monthly) makes its next occurrence when completed.

**Not in this version** (use the phone app or the Expo website): editing lists, holidays and links; checklists, attachments, key points,
Tally narration and payment sub categories (they are kept as they are when a task is saved here); alerts and alarms; the AI rewrite and
Excel / PDF report; Gmail fetch.

## Try it without signing in
Open the built site with `?demo` on the address (sample data, nothing is saved anywhere).

## Run and test on a computer
```
cd newweb
npm install
npm run dev        # http://localhost:5173
npm test           # the data logic
npm run build      # newweb/dist
```

## It is now the main website
The "Deploy web version" workflow (every push to `main`, or Run workflow) builds `newweb/` and puts it on the site named by the variable
`FIREBASE_HOSTING_SITE`, so that address shows this app, not the Expo website. The Expo website code is still in the repo (`npm run build:web`,
the "Website smoke test"), only no longer deployed. To go back, change the build and `WEB_DIST_DIR` lines of `.github/workflows/web-deploy.yml`.

## Put it on a separate Hosting site instead (run by hand)
1. Firebase console > Hosting > **Add another site** (for example `work-dashboard-new`). Do not use the sites already in use.
2. GitHub > Settings > Secrets and variables > Actions > **Variables** > new variable `FIREBASE_NEWWEB_SITE` = that site's name.
   The secret `FIREBASE_SERVICE_ACCOUNT` is the same one the other website deploy uses (docs/DEPLOY_WEB.md).
3. Firebase console > Authentication > Settings > **Authorized domains** > add `<site>.web.app`.
4. GitHub > Actions > **Deploy new web app** > Run workflow. It runs only when you press the button.

If Google sign-in says the key is not allowed, create the project's own Firebase **Web** app and set the repository variables
`VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_APP_ID` (the workflow passes them to the build when set).

## "Missing or insufficient permissions" after signing in
The Firebase project is refusing the read. Its security rules are not published yet (a new project starts closed). Firebase console >
Firestore Database > **Rules** > replace everything with the contents of `firestore.rules` in the repository > **Publish**, then reload the site.
The rules let each signed-in person read and write only their own `users/<their id>` data. Check also that a Firestore database has been
created (Build > Firestore Database > Create database).
To publish them from GitHub instead: give the deploy service account the "Firebase Rules Admin" role and set the repository variable
`DEPLOY_FIRESTORE_RULES` to `true`; "Deploy web version" then publishes `firestore.rules` with the site.
