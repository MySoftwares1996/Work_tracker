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
- A task due on a date with no time alerts once, at 7 PM on that date, and never again (`DATE_ONLY_ALERT` in `workingDashboard.js`; the website's `dueAlertAt` does the same): no evening-before, next-morning or daily reminders for it.
- Each alert's text carries the task's priority, category, person and mail chain (`entryAlertPlan`).
- Done vs DAR: ✓ / Done completes a task and keeps it out of the daily report; DAR completes it into the report.
  Same on cards, the Past Due screen and the alert buttons.
- After a reboot, task alerts that came due in the last 12 hours while the phone was off are listed in one "Missed while the phone was off" notification (`AlarmStore.restoreAll`, Kotlin: needs the next APK build).
- Not done: a server push (Firebase function) so the phone follows web edits instantly instead of up to 15 min later.

## Look and feel - the phone follows the website

- One look, "Ledger" (the owner approved the redesign; the older Pearl / Glass / Warm looks and the "Classic" switch are gone, stored theme
  keys are mapped by `themeKeyOf`): warm paper ground, flat white cards with a 1px line, Fraunces titles and big numbers, Manrope for the rest,
  the sliding accent pill kept only for the tablet / side bar. Shared pieces: `src/themeTokens.js` (tokens, six themes, dark twins; plain data so
  the tests read it) re-exported by `src/theme.js` (provider), `src/icons.js` (the line icons), `src/fonts.js`, `src/ui.js` (PhoneBar, Card, Btn,
  Field, Chip, Segmented, Sheet, Group / Item, EmptyState, SearchField, Toggle), `src/screens/wdCards.js` (PhoneHeader, PhoneKpi, PhoneRow, PhoneDoneRow, Fab).
- Website only: macOS frosted side bar, sticky top bar, hover lift, Links / Narration tabs, wide-screen dashboard columns.
- APK and phone width: the same tiles, cards, finder (search button in the header, `src/CommandPalette.js`) and Register / Completed
  table switch (`src/EntryTable.js`); the APK tab bar is `AppTabs` in `src/ui.js`.

- Phone width: the New / Edit Entry form, Quick add and the + button are available again (the owner wants every card to open); no Narration tab.

## Features added in the 20-feature round (where they live)

Quick add `src/quickAdd.js` · Share a mail into the app (Android Share > Working Dashboard, `consumeSharedText`) · Templates
`src/templates.js` · Checklists `src/checklist.js` · Attachment links (entry `attachments`) · Smart snooze tips
(`snoozeSuggestions` in `pastDue.js`) · Weekly / monthly AI rewrite (`buildSummaryPrompt`) · Narration history
`src/narrationHistory.js` · Report Excel / PDF (`reportCsvRows`) · Payments by vendor (`paymentsByVendor`) · Instant sync
(`functions/`, `docs/INSTANT_SYNC.md`; needs deploying) · Meeting mode (`alerts.holdUntil`) · Offline pill · Voice add (website
mic) · Recent Changes (`undoHistory`) · `?` shortcuts · Daily auto backup (`src/autoBackup.js`, phone) · Audit trail
(`src/audit.js`). Links, templates, AI instructions and meeting mode sync through `users/<uid>/meta/tools`; checklists,
attachments and the audit trail ride on the task itself (`cloudSync.js`).

Split-out tabs of `WorkingDashboard.js` (props only, state stays in the screen): `src/screens/WdBinTab.js`, `WdLinksTab.js`, `WdMoreTab.js`, `WdHolidaysTab.js`, `WdHolidaySheet.js`.

## APK builds - the owner's rules

- Never start, re-run or trigger an APK build (the "Build Android APK" workflow, which also runs on every push to `main`) without the owner saying so in that message.
- Every change made to the web version is held in `docs/APK_PENDING.md` and goes into the APK only at the next APK build the owner asks for. Add a line there in the same commit as each web change; when the owner asks for the next build, port the listed items, then clear them.

## The APK's phone screens - decided by the owner

The owner wants the APK to look and feel like a real phone app (not the website): `Both` / phone width now uses a new layout in the native screens
(`WorkingDashboard.js`, `wdCards.js`, `ui.js`): a five-tab bottom bar (Home, Tasks, Report, Done, More; Holidays, Bin and Config are reached from More,
with a back arrow in the app bar), a compact app bar (logo, title, finder, alerts bell), Home with coloured tiles you swipe sideways and "Needs attention" /
"Coming up" rows (`PhoneRow`), Tasks with filter chips and rows that slide open to Done / DAR, and the New / Edit Entry form on the phone too
(every card opens; the old "no form at phone width" rule is gone). The website is not shown inside the app any more (the owner had the "website inside the app" option removed). The previews the owner approved are the model; more screens
(entry form, Report, Done) are being brought to the same look step by step, each shown to the owner first.

The phone's Config is now only the website's topics - an account card (sign in / out), Alerts, Appearance, Entry form options, Sub categories, Next reminder, Report formats and Gemini (AI) key (`WdLists.js`, `WdReportFormats.js`, `WdGeminiKey.js`, `WdAlertSettings.js`); the old Config sections (cloud sync, backup, time slots, fixed activities, leave days, activity log, PIN lock page, walk / water, quick add settings...) were removed at the owner's request. The separate Settings screen (app lock, backups, permissions) and the daily auto backup were removed too; More keeps Holidays, Links, Bin, Config, App lock (opt-in: PIN on / off here; nothing forces a PIN at first launch) and App updates (Check for an update now).

Web-to-phone parity round: the phone's More page now has Links, Next reminder (categories that ask for a reminder; `nextReminderAt` on the task, an alert at that time), Report formats
(`WdReportFormats.js`, formats in `src/reportFormats.js`, synced in `meta/tools`) and Gemini (AI) key (`WdGeminiKey.js`, `src/aiBuiltin.js`, kept on the phone). The Report's four boxes open their tasks with Move to
(`src/reportExtras.js`, shared with `newweb/`); Home has Pending as on today / Next month tiles and this-month / next-month breakdown cards. Sub Category / narration / reminder lists are written back to `meta/lists`.

The due date quick picks also offer "Month end -1 ... -5" (a drop-down): the last working days of the month (not Sundays, holidays or leave days), a date alone so it alerts once at 7 PM (`src/monthEnd.js`, shared; phone form and `newweb` form).

The owner chose the "UI Studio" designs: Dashboard = Option 1 (Classic Enhanced: 11 pastel tiles, this / next month breakdown cards, Needs attention / Due today rows with Done and DAR buttons) and Register = plain card grid ("A": three across on the website; the phone has All / Overdue / Today chips). The phone has no Quick add bar (the owner asked).

Phone look - "Ledger", Forest by default (replaces the Warm theme): ground #F7F5EF, card #FFFFFF, soft fill #EFEBDF, line #E4E0D4, ink #16231F, muted #5E6B66,
primary #0B6B52, primaryDark #123A2F (hero panel, selected chips, profile card, Welcome), primaryTint #E3F1EC / #0B5A45, mint #9BD3BF, danger #B42318, amber #C27A0E
(dots; `t.warn` is the text-safe #8F5806); cards radius 20, hero 24, buttons and fields 14, no shadows (only the + button has a soft one). Config > Appearance has six colour
swatches (Forest, Harbour, Plum, Ember, Ink, Glass, Rose - Glass also swaps the ground to a periwinkle tint; each swaps primary / primaryDark / tint), "Follow the phone's dark mode" (`settings.followDark`, every theme has a dark twin) and
Text size (`settings.fontLevel`). Tokens and the 4.5:1 contrast check live in `src/themeTokens.js` / `tests/suites/ledger-theme.mjs`; screens read `t.*` only (`t.primary`, `t.primaryDark`,
`t.tint`, `t.tintText`, `t.mint`, `t.heroDim`, `t.dangerTint`, `t.prioDot`, `t.fontDisplay`). Fonts: `@expo-google-fonts/fraunces` (titles, big numbers: `display()`) and `manrope`
(`src/fonts.js` loads them with `useAppFonts` in `App.js` - never blocking, the system font is the fallback - and `patchText()` gives every `<Text>` without a family the Manrope
weight of its fontWeight; a TextInput sets `fontFamily: ff(600)` itself). Chrome icons are `src/icons.js` line icons (no emoji in the chrome). The signed-in name chip sits top right of the
app bar on every phone screen with the search and meeting-mode circles (`PhoneHeader`, `userLabel` in `WorkingDashboard.js`; on the phone the New entry + is a green circle in this bar next to Refresh / Search / Meeting mode - there is no floating button over the cards). Layouts follow the artboards: Home (hero panel, three tinted tiles, Needs attention), Tasks (search, All / Overdue /
Today / Week chips, cards with Done / DAR), the entry form (2-up category / pending, priority buttons, due row, notes, MORE DETAILS pills opening popups, sticky Cancel / Save), Report (day strip,
four count boxes, white report card, Copy report / Rewrite with AI bar), Done, More (dark profile card), Config, the full-screen alert (colour by priority) and Welcome (`WdFormBits.js` has the form's pills).

Sync: a phone push sends only the fields that changed since the phone last saw the server's copy (`diffWebDoc` in `firebaseSyncCore.js`, snapshot `MPT_RT_SNAP_<uid>`), so an offline phone no longer undoes web edits; unsent work for an account that is signed out is kept under `MPT_UNSYNCED_<uid>` (`account.js`).

## Phone updates (over the air) - `docs/PHONE_UPDATES.md`

A JavaScript-only change to the phone app can be published without a new APK: the "Publish phone update" workflow (manual, `.github/workflows/phone-update.yml`,
needs the `EXPO_TOKEN` secret and `EAS_PROJECT_ID` variable the owner sets) sends it to builds made with the update settings (`app.config.js`, read from
`EAS_PROJECT_ID`); the phone offers "Restart" (`src/PhoneUpdate.js`). Native changes (Kotlin, new libraries, permissions) still need a full build and a new
`version` in `app.json`. Never run the update workflow or an APK build without the owner saying so in that message.

## The new web app (`newweb/`)

A separate Vite + React site with its own look (centred top tab bar, bold tiles), on the same Firebase data as the app. It is not part of the
Expo build; its own tests are `cd newweb && npm test`, and it is what the "Deploy web version" workflow now puts on the main website
(`docs/NEW_WEB.md`; the Expo website is no longer deployed, the APK is unchanged). A change to the task data shape must be mirrored in `newweb/src/data.js`. Its Report tab uses the phone's report engine directly (`newweb/src/reportEngine.js` imports `src/workingDashboardReport.js`, `reportStyle.js`, `workingDashboardPayments.js`; the website replaces AsyncStorage with a stub in `vite.config.js`), so the two write the same report; the website writes `workLog` / `bankFollowUps` when it completes a task, moves its status or logs a bank follow-up (`logWork`, `addFollowUp` in `newweb/src/data.js`). Its tests are `tests/suites/newweb-report.mjs`.

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
  Gmail (Fetch Mail, add a task from a mail) is read with the Google sign-in (`src/gmailApi.js`). The Google Apps Script / Sheet sync was removed; `src/cloudSync.js` now only holds the entry <-> web document converters (`toWebTask`, `fromWebDoc`).
- **A bug on both** (a task, a list, an alert or a report is wrong everywhere): look at the data first - the entry shape
  and its sync (`cloudSync.js`, `firebaseSyncCore.js`, `store.js`), then the shared logic (`workingDashboard.js`,
  `workingDashboardNotify.js`, `workingDashboardReport.js`). Do not fix it in a screen.
- **A bug on one platform**: look at what differs - `Platform.OS`, `useLayout()`, `web/shims/`, the native module, phone
  permissions (alarms need exact alarms, full-screen intent and "Open over other apps"; the website needs a click before
  it can play sound). Say what works on the other platform before changing anything.
- **A change** says its target (APK / web.app / Both); anything in shared logic is called out, and the other platform is
  checked (`npm run verify` runs the checks and tests; `npx expo export -p web` builds the website; the APK is only
  proven by the CI build).

## Removals - the owner wants every one listed

Never take a feature, theme, tile, option or screen out without being asked. If a redesign or clean-up drops something, say so in the
reply and add a line to `docs/REMOVED.md` in the same commit. That file is the complete list.
