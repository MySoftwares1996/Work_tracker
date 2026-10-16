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
- New web: all task cards the same size (equal height in a row, buttons at the bottom). Web only, nothing to port.
- **Save as template** (new web, built): "Save as template" in the entry form and on each card (📋), and "Start from a template" chips in a new entry; stored in `users/<uid>/meta/tools` as `templates` with its own stamp, the same shape as the phone's (`src/templates.js`), so the two already share them. **Owner asked it for the next APK build too:** port it then. Note the phone has no New / Edit form at phone width, so decide where it goes there (a "Save as template" action on a task's card / detail, and the templates list under Config) - ask the owner.
- New web: the due alert shows the task's Sub Category fields (the Banker's Reply) to type; they are saved with Mark done, Done + DAR, Silence, Skip, Snooze, Move, or the Save button, and go into the daily report. For the phone's Past Due Alert, port the same at the next APK build (ask the owner).
- New web: marking a task Completed needs ALL its Sub Category fields filled (form, card ✓ / DAR, table, and the due alert's Mark done / Done + DAR / Move to Completed); other statuses leave them optional. Port to the phone's Complete / Done buttons at the next APK build (ask the owner).
- New web: cards show 'CHECKLIST (4/6 DONE)' with a progress bar. The phone's cards: port the same line at the next APK build if the owner wants it.
- New web: entry form columns rebalanced (due date / time / repeats moved under the first column, key points and attachment links under the middle), so there is no empty space. Web only, nothing to port.
