# Web changes held for the next APK build

The owner's rule: every change made to the web version is **held here** and goes into the Android app (APK) **only at the next APK build,
when the owner asks for it**. Until then nothing in this list is ported, and no APK build is started by anyone but the owner.
When a change is made to the web version (`newweb/`), add a line here in the same commit. When the owner starts the next APK build, port the
items below into the Expo app (`src/`), remove them from this list, and note the build date.

Last APK build the owner asked for: 2026-10-17 (Warm look, preview-E layouts, user name chip). Included: the phone shows a quiet notification (not silence) while the web app is in use
(`AlarmReceiver.kt`). The phone's report already carries the Sub Category fields and the notes.

## Held for the next build

Everything listed here earlier has been ported into the phone's own screens (the phone app has its own native screens now, not the website),
so the old list was cleared on 2026-10-17. From now on, add a line here with each change to `newweb/` that the phone should follow.

- Phone: App lock can be skipped at first launch and turned on / off from More > App lock (`AppLockGate.js`).
- New web: a small Copy beside Final Narration and Mail chain in the entry form. Web only, nothing to port.
- Phone: readable text on the orange in dark Warm (theme onAccent); every fire-and-forget failure is now logged (quietCatch.js).
- Phone: Gemini key moved to secure storage (old one migrates), 60 s limit on Gemini calls (phone + web), one id helper (src/ids.js).
- Kotlin changes (alarm settings survive reboot, quiet channel, web-presence rules) need a full APK build; the JS fixes (Bin page, app lock, field-level sync, report fixes) go out with a phone update.
- Bank follow-up: "Tomorrow / In 2 days / In 3 days / Next week" quick-pick chips beside the next follow-up date (phone sheet `WdBankFollowUp.js`, `followUpPicks` in `src/bankFollowUp.js`); skip Sundays, holidays, leave days; website (alert Reminder tab) already done.
- Phone: an update bar at the top while the app checks / downloads an update - progress, elapsed clock, estimated time left (UpdateBar.js, updateProgress.js, PhoneUpdate.native.js); JS only, goes out with a phone update.
- Phone (JS only, expo-file-system + expo-sharing already in the build): Completed tab heading "Completed this week: N" (since Monday); Reopen already offers the Undo bar (`act` -> `offerUndo`). More > Export a backup saves every task (done and binned too) with lists / links / templates / report formats as one JSON file and opens the share sheet (`src/backupExport.js`, shared with the website's Config > Export a backup, which Import reads back).
- New web: Config > Report formats "Remove format" now writes the same removal marker as the phone and keeps other markers (`formatsAfterEdit`, `savedFormats` in the store). Web only, nothing to port. Browser test: `cd newweb && npm run test:e2e`.
- Phone + web: "This week" review card on Home / Dashboard (done since Monday, due in 7 days, overdue, up to 3 "Slipping" tasks: snoozed 3+ times or 7+ days overdue; hidden when empty). Logic `src/weeklyReview.js` (shared), phone card `src/screens/WdWeeklyReview.js`; the phone side is JS only, so it can go out as a phone update.
- Phone: pull down to refresh on every tab (Screen onRefresh). Website: installable (web app manifest), visible keyboard focus, popups keep keyboard focus inside.
- Phone: friendly empty states (Tasks, Done, Bin, no match) and a one-time 'Alarms that actually ring' screen when Open over other apps / full-screen alarms are off (EmptyState in ui.js, WdAlarmIntro.js).
- Phone: one-tap DAR and ✓ (the notes box and checklist-first sheets were website-only), a short vibration on Done, darker Warm text/accent for contrast. Kotlin (needs APK): a 'Missed while the phone was off' notification.
- New web: friendly empty states (All clear / Nothing matches / Nothing completed yet / Dashboard lists / Bin), skeleton rows until the first server answer, bulk actions in the Register (checkboxes, sticky bar: Done, DAR, Move date, Bin, Clear; Escape clears; `newweb/src/bulk.js`), and an in-page explainer before the browser's notification prompt ("Not now" remembered 7 days). Web only, nothing to port. Browser test: `cd newweb && npm run test:e2e` (`tests/e2e/bulk.mjs`).
- Phone (JS only): the Google Apps Script / Sheet sync is gone (nothing set the script URL any more): Fetch Mail reads Gmail with the Google sign-in only, the AI report uses the built-in Gemini only, the background refresh no longer pulls a sheet, and the stored `cloudSyncUrl` is dropped on load (`REMOVED_WD_FIELDS` in `src/storeCore.js`). Deleted `src/sheets.js`, `src/workingDashboardReportCloud.js`.
- web only, nothing to port: the website (newweb/) has the new "Ledger" look (Forest and five other colour themes, dark mode, serif titles, new Dashboard / Register / entry form / Report / Config layouts, Ctrl+Enter saves the entry form).
- Phone (JS only, goes out as a phone update): the "Ledger" redesign of the whole phone app - six colour themes with dark twins (Forest default; Config > Appearance has swatches, "Follow the phone's dark mode" and Text size), Fraunces + Manrope fonts (new dependencies `@expo-google-fonts/fraunces` and `manrope`, pure JS + .ttf assets, loaded with expo-font which the APK already has), line icons, new Home / Tasks / entry form / Report / Done / More / Config / full-screen alert / Welcome layouts. Files: `src/themeTokens.js`, `theme.js`, `fonts.js`, `icons.js`, `ui.js`, `screens/wdCards.js`, `WdFormBits.js`, `WorkingDashboard.js`, `PastDueAlert.js`, `Welcome.js`. Nothing native: the native launch splash (app.json, navy) and the Kotlin alarm screens keep their colours until a full build. The website (newweb/) was restyled separately.
- New web: 'Per row' (cards per row: Auto or 1 to 6, remembered per tab) on Register, Completed, Bin and Links. Web only, nothing to port.
- New web: every page now uses the full window width (no 1320 px centre column). Web only, nothing to port.
- Phone: a Refresh button in the app bar (reads the website's edits now and looks for a new app version). New web: a Refresh button in the top bar (checks for a newer site build and reloads on it, else re-reads data from the server).
- Phone: the floating + button is now a green + in the app bar (Home and Tasks), so it no longer covers the DAR button.
- New web: fixed a crash after sign-in (hook order) and added an error screen; web only.
- Glass colour theme and the Pending as on Today tile on Home are back (web done; the phone gets them in the next phone update / build).
- New web: New entry keeps what was typed (refresh / closed form) with a Reset button; tasks saved on a slow connection survive a refresh (local cache). Phone form: not done yet.
- Phone: New entry keeps its draft (AsyncStorage) with a Reset button (src/entryDraft.js); goes out with the next phone update.
- New web: asks the server directly 4 s and 15 s after start when the live listener stays on the saved copy; clearer banner when saved tasks are shown. Web only.
- New web: Glass is now a real glass finish (blue-to-lilac sky, frosted cards, glossy tiles and buttons) in light mode; the big Dashboard panel reads "Pending as on Today" and Next month is the fifth tile (all looks). Phone Glass is still colour only.
