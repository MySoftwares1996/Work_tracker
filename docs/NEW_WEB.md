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

## Put it online (its own Hosting site, run by hand)
1. Firebase console > Hosting > **Add another site** (for example `work-dashboard-new`). Do not use the sites already in use.
2. GitHub > Settings > Secrets and variables > Actions > **Variables** > new variable `FIREBASE_NEWWEB_SITE` = that site's name.
   The secret `FIREBASE_SERVICE_ACCOUNT` is the same one the other website deploy uses (docs/DEPLOY_WEB.md).
3. Firebase console > Authentication > Settings > **Authorized domains** > add `<site>.web.app`.
4. GitHub > Actions > **Deploy new web app** > Run workflow. It runs only when you press the button.

If Google sign-in says the key is not allowed, create the project's own Firebase **Web** app and set the repository variables
`VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_APP_ID` (the workflow passes them to the build when set).
