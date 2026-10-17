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
