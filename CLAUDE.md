# Working Dashboard - notes for Claude

One code base builds both the Android app and the website, so every screen change reaches both unless it is
limited on purpose.

## Where a change applies

The owner names the target of each change with one of these. Apply it there and nowhere else.

| Name | Means | How to limit it in code |
|---|---|---|
| **APK** | The Android app only | `Platform.OS !== 'web'` |
| **web.app** | The website only (`…web.app`), at every screen size | `Platform.OS === 'web'` |
| **Both** | The APK and the website opened on a phone (phone-width screens) | `!useLayout().tablet` (width under 600, `src/layout.js`) |

- With none of the three named, ask which one before changing anything.
- Logic shared by both (the report, sync, alerts, data) cannot be split this way: say so when a request
  touches it.
- A tablet (600+) and a desktop browser (900+) are not "Both". On the website they are part of **web.app**.

## Alerts - how they work now (keep this in step with the code)

Several sessions have changed the alert code; check this list before changing it, and update it when it changes.

- The due moment, deadline, overdue and follow-up alerts are booked on the phone as full-screen alarms,
  `wd:<entry id>:<key>`; the warnings before them (`isWarningKey`: "Due in 1 hr", "Due tomorrow", "Deadline in 2 hr") are always a notification only - on the website too, where they open no alarm window (`src/WebAlarm.js`); the owner asked for this for every task, so there is no setting to make them ring (`src/workingDashboardNotify.js`, native `AlarmReceiver`). Walk / water nudges are `nudge:`.
- Web in use = phone silent: web.app writes an "in use" note while the tab is open and used (`src/RealtimeSync.js`);
  the phone shows only a quiet notification for task alerts while it is fresh (3 min; was nothing before the next APK build) and the tab had input in the last 15 min
  (`webActiveUntil` in `src/firebaseSyncCore.js`, native `WebPresence.kt`). Unknown = it rings.
- A task alert's full-screen alarm opens the app's own Past Due Alert (full screen, every option: remarks, Mark done,
  Done + DAR, Silence, Skip, Snooze, Move, status, repeat); other alarms use the simple native screen
  (`AlarmRingingActivity`).
- APK delivery: by default an alarm opens full screen at once, on the lock screen and while the phone is in use (needs
  "Open over other apps"; Config > Alerts shows it). Config > Alerts > "Show alarms in the notification centre instead"
  (`alarmAsNotification`) turns that off: the alarm is then a notification only (`AlarmStore.notificationOnly`).
- web.app rings its own alarm window in the browser while the tab is open (`src/WebAlarm.js`).
- With the app closed, a background refresh (about every 15 min) reads the web app's edits from Firestore and rebooks
  the alerts (`refreshWdAlerts` in `src/workingDashboardActions.js`). Tapping an alert for a task that is done or
  binned says so (`PastDueAlert`).
- The full-screen alert (`PastDueAlert`) is coloured by the task's priority, shows priority / category / pending with / recurring /
  status, and offers Mark done, Done + DAR, Silence today, Skip, Snooze 15 m-5 h, Move, Status, Recurring. Warnings before the due
  time open it too ("DUE IN ..."). With "Open over other apps" allowed its notification is a silent line (`QUIET_CHANNEL_ID` in
  `AlarmRingService.kt`). A second alarm and the "Missed" alert open full screen as well; the week summary is a `summary:` alarm.
  Attendance alerts (logged in, break, back, logged out) open the simple full screen without ringing (`EXTRA_QUIET`); the ongoing "At the office" line is Android's required notice and stays a notification.
- Each alert's text carries the task's priority, category, person and mail chain (`entryAlertPlan`).
- Done vs DAR: ✓ / Done completes a task and keeps it out of the daily report; DAR completes it into the report.
  Same on cards, the Past Due screen and the alert buttons.
- Not done: a server push (Firebase function) so the phone follows web edits instantly instead of up to 15 min later.

## Look and feel - the phone follows the website

- One "modern" look (Config > Appearance > Interface style; "Classic" turns it off): Pearl with a tinted backdrop, 12px corners,
  soft shadows, compact stat tiles, a priority dot instead of a card stripe, the sliding accent pill in the tab bar / side bar,
  automatic dark mode. Shared pieces: `src/theme.js` (SKIN), `src/ui.js` (BottomTabs / AppTabs / SideTabs, Card, Btn, Field, Sheet).
- Website only: macOS frosted side bar, sticky top bar, hover lift, Links / Narration tabs, wide-screen dashboard columns.
- APK and phone width: the same tiles, cards, finder (search button in the header, `src/CommandPalette.js`) and Register / Completed
  table switch (`src/EntryTable.js`); the APK tab bar is `AppTabs` in `src/ui.js`.

- Phone width (APK and web under 600): no New / Edit Entry form (`formOn` in `WorkingDashboard.js`), no Quick add bar, no + button and no
  Narration tab; tablets and desktop keep them. The owner asked for this; entries cannot be added or edited at phone width.

## Features added in the 20-feature round (where they live)

Quick add `src/quickAdd.js` · Share a mail into the app (Android Share > Working Dashboard, `consumeSharedText`) · Templates
`src/templates.js` · Checklists `src/checklist.js` · Attachment links (entry `attachments`) · Smart snooze tips
(`snoozeSuggestions` in `pastDue.js`) · Weekly / monthly AI rewrite (`buildSummaryPrompt`) · Narration history
`src/narrationHistory.js` · Report Excel / PDF (`reportCsvRows`) · Payments by vendor (`paymentsByVendor`) · Instant sync
(`functions/`, `docs/INSTANT_SYNC.md`; needs deploying) · Meeting mode (`alerts.holdUntil`) · Offline pill · Voice add (website
mic) · Recent Changes (`undoHistory`) · `?` shortcuts · Daily auto backup (`src/autoBackup.js`, phone) · Audit trail
(`src/audit.js`). Links, templates, AI instructions and meeting mode sync through `users/<uid>/meta/tools`; checklists,
attachments and the audit trail ride on the task itself (`cloudSync.js`).

## APK builds - the owner's rules

- Never start, re-run or trigger an APK build (the "Build Android APK" workflow, which also runs on every push to `main`) without the owner saying so in that message.
- Every change made to the web version is held in `docs/APK_PENDING.md` and goes into the APK only at the next APK build the owner asks for. Add a line there in the same commit as each web change; when the owner asks for the next build, port the listed items, then clear them.

## The new web app (`newweb/`)

A separate Vite + React site with its own look (centred top tab bar, bold tiles), on the same Firebase data as the app. It is not part of the
Expo build; its own tests are `cd newweb && npm test`, and it is what the "Deploy web version" workflow now puts on the main website
(`docs/NEW_WEB.md`; the Expo website is no longer deployed, the APK is unchanged). A change to the task data shape must be mirrored in `newweb/src/data.js`.

## Checks before a deploy or build

`npm run verify` (static checks + tests) · `npx expo export -p web` then `npm run smoke:web` (a real browser walks every tab and
Config section at desktop and phone width; also the "Website smoke test" workflow) · `npm run compile:native` (the Kotlin compiled
with a real compiler against the Android API) · the APK itself is only proven by the CI build. The dashboard's cards and rows live in
`src/screens/wdCards.js`; the screen in `WorkingDashboard.js`.

## Architecture and how to triage a bug (declare this first, then name the target)

- **One code base**: Expo / React Native (`App.js`, `src/`) builds both the Android app and the website
  (`expo export -p web`, deployed to Firebase Hosting). The website swaps native modules for browser versions in
  `web/shims/`; the phone's native Android code is `modules/native-tools` (alarms, tracker, web presence).
- **Shared data**: both talk to the same Firestore account (`users/<uid>/tasks`, `meta/lists`, `meta/calendar`,
  `meta/presence`) through Realtime Sync (`src/RealtimeSync.js`, `src/firebaseSync*.js`, `src/cloudSync.js`), signed in with Google.
  An optional Apps Script / Google Sheet and Gmail are extras (`src/cloudSync.js`, `src/gmail.js`).
- **A bug on both** (a task, a list, an alert or a report is wrong everywhere): look at the data first - the entry shape
  and its sync (`cloudSync.js`, `firebaseSyncCore.js`, `store.js`), then the shared logic (`workingDashboard.js`,
  `workingDashboardNotify.js`, `workingDashboardReport.js`). Do not fix it in a screen.
- **A bug on one platform**: look at what differs - `Platform.OS`, `useLayout()`, `web/shims/`, the native module, phone
  permissions (alarms need exact alarms, full-screen intent and "Open over other apps"; the website needs a click before
  it can play sound). Say what works on the other platform before changing anything.
- **A change** says its target (APK / web.app / Both); anything in shared logic is called out, and the other platform is
  checked (`npm run verify` runs the checks and tests; `npx expo export -p web` builds the website; the APK is only
  proven by the CI build).
