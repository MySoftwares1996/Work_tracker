# Web changes held for the next APK build

The owner's rule: every change made to the web version is **held here** and goes into the Android app (APK) **only at the next APK build,
when the owner asks for it**. Until then nothing in this list is ported, and no APK build is started by anyone but the owner.
When a change is made to the web version (`newweb/`), add a line here in the same commit. When the owner starts the next APK build, port the
items below into the Expo app (`src/`), remove them from this list, and note the build date.

Last APK build the owner asked for: 2026-10-16 (merge of PR 6). Included: the phone shows a quiet notification (not silence) while the web app is in use
(`AlarmReceiver.kt`). The phone's report already carries the Sub Category fields and the notes.

## Not ported at that build (still held)

- Sub Categories grouped per category with an editor on the phone, and "Next reminder date & time" per category (`reminderCategories`, `nextReminderAt`): the phone ignores both.
- A checkbox on the phone's report to leave the Sub Category fields out.
- Anything new on the web from now on: add a line here in the same commit.
