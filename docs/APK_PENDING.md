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
