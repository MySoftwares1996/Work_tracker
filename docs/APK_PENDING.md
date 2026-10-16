# Web changes held for the next APK build

The owner's rule: every change made to the web version is **held here** and goes into the Android app (APK) **only at the next APK build,
when the owner asks for it**. Until then nothing in this list is ported, and no APK build is started by anyone but the owner.
When a change is made to the web version (`newweb/`), add a line here in the same commit. When the owner starts the next APK build, port the
items below into the Expo app (`src/`), remove them from this list, and note the build date.

Last APK build the owner confirmed: (none recorded in this file yet)

## Held for the next APK build (web version, newest last)

Shared data (already compatible with the phone's fields, noted where the phone needs a change):

1. **Sub Categories grouped under each category**: `subCategories[].category` in `meta/lists`; add / delete / edit name and fields (with choices); "add several at once". The phone lists all of them under every carrying category and has no editor yet. (`newweb/src/data.js`, `App.jsx` SubCategoryManager / SubCategoryEditor)
2. **Next reminder date & time**, per category: `meta/lists.reminderCategories`, task field `nextReminderAt`. The phone ignores both; to ring on it, book `nextReminderAt` as a follow-up alert.
3. **Due alerts with the task's details and choices** (Mark done, Done + DAR, Silence today, Skip, Snooze 15 min to 5 h, Move with date / time / status / repeat), asking for the next reminder under categories that need one. Uses the phone's own `snoozeUntil`, `lastAckDate`, `skippedDates`. (`newweb/src/AlertCenter.jsx`, `alerts.js`)
4. **Dashboard counts as the phone counts them**, plus the Register opening filtered from each tile (Due and Status filters). The phone already counts this way; only the filters and the This Month / No Due Date / Pending tiles are new on the web.
5. **Daily report** includes the Sub Category fields (the banker's reply) and the Notes. (`reportText` in `newweb/src/data.js`) Check the phone's report does the same.
6. **Entry form**: add / delete options for Category, Priority, Status and Pending with; checklist, attachment links, key points, custom repeat minutes, alert mode; Android-style round clock for times; three columns on one screen (web only).
7. **Config > Appearance**: six colour themes (web only).
8. **Config > Import from an older version**: backup file -> tasks, lists, Sub Categories, narration types, holidays (`newweb/src/importBackup.js`). The phone already has Data Backup / restore.
9. **Alerts settings** (pop-up, sound, desktop notification, test alert) and the full-width pages, mail-subject copy on cards (web only).

Not for the APK (web only): colour themes, three-column form, desktop notification, full-width layout.
- New web: Daily report has a checkbox to include the Sub Category fields (field name: value). Port to the phone report at the next APK build.
- New web: first load shows 'Loading your tasks' until Firestore answers; Firestore uses auto long polling (web only, nothing to port).
- New web: one hour before a timed task is due a notification-only heads-up; at the due time the task's own Alert choice decides (Alarm = pop-up + sound, Reminder = notification only, Default = Config > Alerts). The phone app already has its own warnings (Due in 1 hr).
- Phone + web in step: new web writes the "in use" note (meta/presence). Phone change already made in code (`AlarmReceiver.kt`): while the web app is in use the phone shows a quiet notification instead of nothing; rings when the web app is not in use. Goes live only in the next APK build you ask for.
- New web: the app's own icon (check circle) is now the site logo, tab icon and home-screen icon. Web only, nothing to port.
