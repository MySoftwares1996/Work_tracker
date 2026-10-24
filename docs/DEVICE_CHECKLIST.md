# Real-device checks (before / after an APK build)

These need a real phone and the website open on a computer. Each takes a few minutes. Tick them off after the next APK build.

## Sync
- [ ] **Field-by-field merge.** Put the phone in airplane mode. Change a task's *Status* on the phone. On the website change the same task's *Due date*. Turn the phone's network back on. Both changes must show on both sides.
- [ ] **Same field on both.** Same steps but change the *Status* on both: the newer edit wins on both sides.
- [ ] **Offline task.** Add a task on the phone offline; it appears on the website after the phone reconnects.

## Alerts
- [ ] **Website in use = phone shows nothing.** Use the website (click or type), then let a task come due within 45 minutes: no alarm and no notification on the phone; the website shows its alert.
- [ ] **Website idle 45+ minutes** (or closed): the phone rings at the due time.
- [ ] **Skipped list.** After the first case, Config > Alerts > "Skipped on this phone" shows the task and "The website was in use".
- [ ] **Keep the phone quiet while this window is visible** (website Config > Alerts): with it on, a visible but untouched window still keeps the phone silent.
- [ ] After a reboot, the missed-alert notice appears (Kotlin from an earlier round).

## Look
- [ ] **Fonts.** Titles use the serif face and the rest the sans face on the phone (the font patch has not been tried on a real phone).
- [ ] **Glass.** Config > Appearance > Glass: frosted cards over the soft blue / lilac / pink glows on Home, Tasks, Report and the entry form; text is readable; dark mode switches to plain dark.

## Entry form
- [ ] **Draft + Reset.** Type in New entry, close the app, reopen New entry: the text is back; Reset clears it.
- [ ] **Report points.** More > Config > Report points: add a point for a Category; it shows on the website and in the day's report.

## Accounts
- [ ] **New account.** Sign in with a Google account that has no data: no Categories, Sub Categories or Pending with; the website shows the first-run guide.
