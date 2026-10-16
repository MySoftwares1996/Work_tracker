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
- New web: Report tab '✨ Rewrite with Gemini' (Firebase AI Logic, free tier; optional instructions kept on the computer). The phone already has its own AI rewrite (src/aiBuiltin.js); nothing to port. Owner must switch on AI Logic once (docs/NEW_WEB.md).
- New web: App Check (reCAPTCHA v3) on the website, for Gemini from 2 Nov 2026; needs the web app id + site key as GitHub variables (docs/NEW_WEB.md). Phone already uses its own app registration; nothing to port.
- New web: Config > Gemini API key (kept in the browser only); the report rewrite uses the free route first and the key only as a backup. Web only, nothing to port.
- New web: Report tab rebuilt on the phone's report engine (sections Other work completed / Payments / Followed up, Tally payment lines, bank follow-ups, Excel CSV, Print/PDF, Email, Gemini merge that keeps every item). The website now writes workLog / bankFollowUps. Phone: nothing to port (it is the same engine).
- New web: interactive loading screen after a refresh (logo draws, orbits, tilts to the pointer, tap = spin + sparkles; real steps and tips; ?demo&loading previews it). Web only, nothing to port.
- Phone (WebPresence.kt, written, ships at the next APK build): a booked alarm stays quiet when the task was moved to a later date or time on the web app. New web: a due alert closes by itself when the task changes on another computer / the phone (moved, snoozed, silenced, skipped, done); the page re-reads the server when the tab is shown again, the network returns or the window is clicked; the sync dot shows the last update time; the alert window is half the width.
- New web: the due alert is landscape (about 940 x 400): the task and remarks on the left, tabs Reply / Reminder / Move / Snooze on the right, Mark done / Done + DAR / Silence / Skip / Open task in a bar along the bottom. Web only, nothing to port.
- New web: the Dashboard is compact (about 880 px wide, tiles in two small rows, lists in two columns); all tiles and features kept. Web only, nothing to port.
- New web: Dashboard 'desk' (chosen: F): Bank follow-ups card (days open, banker's last update, next follow-up), Payments this month by vendor (amounts from Key Points, phone's paymentsByVendor), Today's report so far with Open Report / Gemini. Web only; the phone already has Payments by vendor.
- New web: Config > Report formats (per Sub Category line templates with {Field} marks; the 22 formats from the Tally narration sheet are built in; saved in meta/tools reportFormats). The phone report is unchanged; port later if wanted (ask the owner).
- New web: Config > Report formats > 'Create the missing ones' adds only the categories and sub categories (with a field per {mark}) that the formats need and your lists lack; nothing existing is changed. Lists are shared with the phone (meta/lists), which just shows them.
- New web: (1) the categories / sub categories the report formats need are created automatically, once per account (meta/tools.formatSetupAt stops repeats; the Config button still does it again); (2) Dashboard breakdown cards by Category, Status, Pending with and Priority; a Category opens a window with its Sub Category breakdown, a row opens the Register filtered (new sub category filter). Web only.
- New web: 'Final Narration' (the report line after the dash) shown read-only with a Copy button in the New / Edit entry form and the due alert's Reply tab, for Payments categories whose Sub Category has a report format. Web only.
- New web: the required star (*) sits on the same line as its Sub Category field name. Web only.
- New web: New / Edit entry uses the whole screen (full window, bigger fields on tall screens, Save / Cancel bar fixed at the bottom). Web only.
- New web: a Copy button beside Mail chain in the New / Edit entry form. Web only.
- New web: Daily report chips open a window with the lines inside (other work, payments, followed up, left out, merged duplicates); each line has a Move to choice, moves are kept per day on that computer and drive the text, copy, print, Excel and Gemini; Undo my moves. Shared report engine: `excludedList` and `entry` on duplicates added (additive). Web only.
- New web: the 'Monthly Payments' category and its two sample report formats (HR Statutory Payment, Monthly TDS Payments) are no longer created by the automatic setup. Web only.
- New web: sample report formats updated from the new Tally sheet: category 'HR Statutory Payment' (sub categories EPFO, ESI, PT) and 'Monthly Payments' (Monthly TDS Payments by Section wise); short sub category names (ESI, PT) now match only exactly. Web only.
- New web: sample report format 'Rent Payments' (category Payments) added from the Tally sheet. Web only.
- New web: the Dashboard no longer shows the Bank follow-ups, Payments this month by vendor and Today's report so far cards. Web only.
- New web: the Dashboard fills a wide screen (greeting and quick add on one line, all ten tiles in one row, equal breakdown cards, up to 1900px wide). Web only.
- New web: a ✕ button in the Register filters clears every filter at once. Web only.
- New web: Dashboard 'Next Month' tile (open tasks due next month; opens the Register with the new 'Next Month' due filter). Web only.
- New web: the Dashboard breakdown cards count only tasks due this month; new 'Next month' row with By category and By priority cards; rows and the category window open the Register on the same month. Web only.
- New web: a task with a due date but no time alerts once at 7:00 PM and only on its due date (was 9:00 AM, and could pop up next morning). The phone app still alerts such tasks at its own time; port the 7 PM rule to the phone's alert booking (`entryAlertPlan`) at the next APK build. Web only for now.
- New web: report formats 'Demand Draft' > Online / Offline from the Tally sheet (written under Other work, not Payments; only Payments categories go under Payments). Web only.
- New web: report formats for Employee Advance's / settlement's / salary advance's, Credit Card Payments and Rent Payments now start with 'Name: - ' like the other Payments formats (updated Tally sheet). Web only.
- New web: remarks written in a task's Notes are added at the end of its report line for payments written from a report format (they were dropped before). Web only.
- New web: a short remark in Notes (e.g. 'Paid') was dropped from the payment line when its word was already in the line; fixed (shared `withEntryNotes`, used only with details = website). Web only.
- New web: sample report formats that are not in an account's saved list (added later from a new Tally sheet) are now used too; the saved ones keep their wording (`effectiveFormats`). Web only.

- APK: the app's home is now the new website inside the app (`WebApp.js`), so the web items above reach the APK with no porting; only the native alarm / presence items still need the next build. Needs the owner's say to build, then a test on a phone: sign-in, opening cards, the entry form, copy, print, CSV, back button, "Use the older phone screens".
