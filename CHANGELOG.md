# Working Dashboard - changes

## Unreleased

**For more than one person.** Anyone with a Google account can use the tool (`docs/NEW_USERS.md`).

- **Sign in with Google on first open**, on the phone and the web. A new account is set up by itself on its first
  sign-in (default categories, statuses, priorities and people). "Use without an account" keeps the data on that
  device only.
- **Each account's data stays its own:** signing in with another account on the same device shows that account's
  data, and never sends the previous account's tasks into it. Firestore security rules (`firestore.rules`) let
  each person read and change only their own space.
- **No Apps Script needed:** Fetch Mail reads the person's own Gmail with their Google sign-in, and the Daily
  Report's AI rewrite uses Gemini built into the Firebase project (Firebase AI Logic). A person who already has
  their own script can still add it in Config → Own Apps Script.

**A web version from the same code.** The app now also builds for a web browser (`npm run web`,
`npm run build:web`): the same screens, logic, Daily Activity Report and sync as the APK, so a change is made
once for both.

- **Fits any screen**: two cards a row on a phone (as before), three on a tablet, four on a desktop with the tabs
  in a side bar; sheets open as centred dialogs on bigger screens and the content keeps a readable width.
  An Android tablet gets the same layouts.
- **Browser versions of the phone-only parts**: Google sign-in for Realtime Sync (sign-in popup), alerts as
  browser notifications while the tab is open, backups and CSV saved as downloads, the browser's date / time
  picker, and the app's confirmation dialogs.
- **Automatic web deploy**: every push to `main` puts the web version on its own Firebase Hosting site
  (`docs/DEPLOY_WEB.md`). It never deploys to the project's main site, where the Banking Work Tracker may live.
- Phone-only features stay on the phone: full-screen alarm, home-screen widgets (hidden in the web's
  Settings), fingerprint unlock.

## 1.1.0

Brings in the changes made on the web app (Banking Work Tracker), so both read, write and report an entry the
same way.

- **Payments in the entry form**, shown only when they apply, as on the web app:
  - **Sub Category** with the fields its rule asks for, needed before a Domestic / Urgent / Import / Duty payment
    (or any category set up for it) is completed. Quick Done (the card, the Past Due Alert) opens the form when
    it is still missing.
  - **Tally Narration**: narration type, %, document no, the type's own fields (e.g. Vendor Name), a note and
    "Include mail chain", with a live preview and Copy. The vendor leads the report line and is never put into
    Tally. Cards of entries with a narration get a "⧉ Narration" copy button.
  - **Import Payment** details while In Progress: beneficiary, payment %, type and "against".
  - **Key Points** as key / value rows (Amount - ₹50,000), the way the web app keeps them.
- **Daily Activity Report** rebuilt on the web app's engine: payment lines read "Vendor: narration" without the
  mail chain; a completed duty payment gives the ICEGATE / BOE line and an Import Payment the outward remittance
  line, both kept word for word by the AI rewrite; Domestic and Urgent payments are left out (counted); "Followed
  up" lists entries whose status moved that day (the web app's work log); other lines are the task with its
  notes cleaned up. The AI rewrite is merged section by section, as on the web app.
- **"Done + DAR" by default**: a completed entry is in the report unless it is marked "Done" only, as on the web
  app (its darInclude). Web tasks no longer arrive unmarked, so the phone's report is no longer empty.
- **Non-working days**: only holidays the office is closed on count (the web app's "Office closed" tick; USD
  market holidays are working days). A Daily task skips Sundays, holidays and leave days, and one already due on
  such a day moves to the next working day by itself (recorded as skipped).
- **Skip** in the Past Due Alert works as on the web app: the task stays open, is silenced for today and kept out
  of today's report ("Skipped today" on its card). It works for one-off tasks too.
- **Sync fixes**: the web app's Pending With list now reaches the phone (it is named pendingWith there); its Sub
  Categories, narration types and payment intro lines arrive with Realtime Sync (Config → Sub Categories &
  Narration Types shows them); Key Points no longer reach the web app as "[object Object]"; a task completed on
  the phone is dated the way the web app's report looks for it; the payment fields, work log, skipped days and
  repeat series travel both ways.

## 1.0.0

The Working Dashboard tool of My Personal Tracker (v2.16) as an app of its own, with the same screens, look and
features:

- Dashboard, Register, Completed (search, filters, Sort by, Clear), Holidays, Config, Bin and the Daily Report.
- Alerts: warnings before the due time, a full-screen alarm at it, "still pending" follow-ups and a daily
  "still overdue" note. The ringing alarm has Snooze 15m · Done · DAR · Reminder only; notifications have
  Done · Snooze · Reminder only / Ring as alarm.
- Past Due Alert with Mark done, ✓ DAR, Silence today, Skip, Reminder only / Ring as alarm, Snooze, Move and Repeat.
- Realtime Sync with the web app (Google sign-in, Firestore) and Cloud Sync with the Google Sheet.
- Gmail fetch, the AI-written Daily Activity Report, walk / water nudges.
- Home-screen widgets: Work summary, Work today, Next up.
- Settings: app lock (PIN / fingerprint), theme, text size, alert permissions, backup and restore. A full
  My Personal Tracker backup restores here too (only its Working Dashboard is taken).
