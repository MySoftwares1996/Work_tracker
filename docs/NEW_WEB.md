# The new web app (`newweb/`)

A separate website with the "Ledger" look: a white top bar (brand, pill tabs, the signed-in person), serif page titles, a dark green TODAY panel with tinted count tiles, white cards with 1px lines. Six colour themes (Forest default, Harbour, Plum, Ember, Ink, Rose), each with a dark twin, set in `src/themes.js` (Config > Appearance also has the dark-mode switch and the text size). It signs in
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

## Gemini for the report (free)

The Report tab has **✨ Rewrite with Gemini**. It uses Firebase AI Logic with the free Gemini Developer API in this project
(`work-tracker-3b728`), so there is no key in the page. Switch it on once:

1. Firebase console > your project > **AI Logic** (under Build) > **Get started**.
2. Choose **Gemini Developer API** (the free one) and accept. It works on the free Spark plan.
3. Reload the website and press **✨ Rewrite with Gemini** on the Report tab.

The free tier has a daily limit for the whole project. If the button says the limit is reached, try again later. The report
text is sent to Google's Gemini to be rewritten; nothing else is sent. If Gemini changes or drops a number, the page tells you which.

## App Check (needed for Gemini from 2 November 2026)

Google will require App Check for Firebase AI Logic from 2 November 2026. The page sends an App Check token when it is built with a
reCAPTCHA v3 site key. Steps (all free):

1. **Register a Web app.** Firebase console > Project settings (gear) > General > Your apps > the `</>` icon > nickname "Working
   Dashboard web" > Register app. Copy the `appId` shown (it looks like `1:872088776442:web:abc123...`). Do not turn on Hosting there.
2. **Create a reCAPTCHA v3 key.** https://www.google.com/recaptcha/admin/create > label "Working Dashboard", type **reCAPTCHA v3**, domains:
   `work-dashboard-3b728.web.app` and `work-tracker-3b728.firebaseapp.com` > Submit. Copy the **Site key** and the **Secret key**.
3. **Give the secret to Firebase.** Firebase console > App Check > **Apps** tab > the web app > **reCAPTCHA** > paste the **Secret key** > Save.
4. **Tell GitHub.** Repository > Settings > Secrets and variables > Actions > **Variables** tab: add `VITE_FIREBASE_APP_ID` = the web appId from step 1,
   and `VITE_RECAPTCHA_SITE_KEY` = the Site key from step 2. (The Site key is public by design; never put the Secret key in GitHub.)
5. Run **Deploy web version**. Then App Check > APIs > Firebase AI Logic should show verified requests; leave enforcement off until
   the verified share is near 100%, or let Google enforce it on 2 November.

## Your own Gemini API key (backup)

Config > **Gemini API key**: paste a key from https://aistudio.google.com/apikey and press **Save key** (**Test key** checks it). The
report rewrite always tries the free Firebase route first; only when that fails (busy, free limit, App Check) the saved key is used.
The key stays in that browser only (localStorage) - it is not saved in the database and not sent anywhere except Google's Gemini.
Anyone who can use that browser profile can see it, so remove it (**Remove key**) on a shared computer.

## Report formats (Config > Report formats)

For each Sub Category you can write the exact line the Daily report uses for a task in it, with the task's own values in `{braces}`:

`{Name}: - Being amount paid against Invoice No. {Invoice No}, amounting to ₹{Amount}.`

- Each `{mark}` is filled from the task's Sub Category field with that name (the closest name wins; "Name" finds "Name of vendor or suppler"), then from its Key Points. A mark with no value shows as `[mark]` and the Report tab counts those lines.
- A task with a format is listed under **Payments** with the standard payment lines, and stays word for word when Gemini rewrites the report.
- The 22 formats from the owner's "Tally Narration formats" sheet are built in (`newweb/src/reportFormats.js`, `SAMPLE_FORMATS`) and used until a format is saved. Saving writes all formats to `users/<uid>/meta/tools` (`reportFormats`), so every browser shows the same ones.
- If a template has a mark the Sub Category has no field for, Config shows an **Add it to the Sub Category** button.

## Speed

- The Report, Config and entry form are separate files (`src/screens/`), loaded when first opened and fetched quietly once the page is idle; Firebase and React are their own cached files (`vite.config.js`). Do not split `@firebase/ai` into its own chunk: the production build then fails at start ("Cannot access ... before initialization"); always open a production build (`npx vite build` + `npx vite preview`), not only the dev server, after changing chunking.
- `public/sw.js` keeps the hashed files and the last page, so the site (and the Android app) opens again without a connection; the page itself is always fetched fresh first.
- Register and Completed show 60 tasks and add more on request. Coming back to the tab re-reads the data at most every 30 s (online again: at once).
