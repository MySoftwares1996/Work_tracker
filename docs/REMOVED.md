# Removed features - the complete list

Every removal is logged here in the same commit that makes it. Nothing is taken out without the owner saying so; a look change that
drops something must list it here and in the reply. Restoring any line below is a request away (the commit is in git history).

## Restored on 2026-10-22 (owner asked)
- **Glass** is back as a seventh colour (phone Config > Appearance and website Config; periwinkle ground, indigo accent, dark twin). The other old themes stay removed.
- **Pending as on Today** is its own tile again on the website Dashboard and the phone Home (the TODAY panel number stays too).

- Website Dashboard: the separate "Pending as on Today" tile and the "TODAY n tasks need you" wording were merged into one big panel titled "Pending as on Today" (as in the owner's picture, 2026-10-22); Next month moved up to the fifth tile.

- Company, bank and person names in code comments, placeholders, demo data and test samples were replaced by neutral ones (Vendor A, Bank A, Banker A, Person A ...) (2026-10-23, owner asked; code only, no task data touched).

- The two built-in lines at the top of the report's Payments section (the Tally ledger line and the "Prepared payment files..." line) are gone: the report has no fixed points now (2026-10-23, owner asked). Points are written in Config > Report points and ticked per task.

- The phone's "quiet notification" for task alerts while the web app is in use (it was only in unreleased Kotlin): the phone now shows nothing while the desktop is in use, as the owner asked (2026-10-24).

## Ledger redesign (2026-10-18) - things that went with it
| What | Where | Note |
|---|---|---|
| **Glassmorphism** theme (and Pearl, Neumorphism, Claymorphism, 3D Hero, Warm) | phone `src/theme.js` | Replaced by "Ledger" in six colours (Forest, Harbour, Plum, Ember, Ink, Rose). The owner approved "one look", but dropping Glass was not called out; it should have been. |
| "Classic" UI switch (`uiMode`) | phone Config | Stored values map to Ledger (`themeKeyOf`). |
| Website themes Vivid Violet, Aqua Green, Ocean Blue, Sunset Orange, Lilac Mist, Midnight Black | `newweb/src/themes.js` | Replaced by the same six Ledger colours + dark mode follow. |
| "Pending as on Today" as its own tile | website Dashboard | Still there, as the big number in the TODAY panel ("n tasks need you", opens the same list). |
| "Pending as on Today" tile on the phone Home | phone Home | Moved behind "More counts" (still opens the same list). |
| Emoji icons in the chrome | both | Replaced by line icons. |

## Earlier removals (from the commit history)
| Date | Removed | Commit |
|---|---|---|
| 10-18 | Unused code: dead exports, legacy sources, old CSV / backup code, unused styles and preview images | 33f341c |
| 10-18 | Apps Script / Google Sheet integration | d496aff |
| 10-17 | Register board view (now the plain card grid) | 9f4eecb |
| 10-17 | Entry form fields: Key points, Attachment links | da53c6f |
| 10-17 | Phone Settings screen and daily auto backup | fbfb3a0 |
| 10-17 | Old phone Config sections (cloud sync, backup, time slots, fixed activities, leave days, activity log, PIN page, walk / water, quick add settings) | d53934c |
| 10-17 | Unused dead exports and imports | abefa13 |
| 10-16 | "Website inside the app" option | e20e784 |
| 10-16 | Deploy instant sync workflow | 4cbd370 |
| 10-16 | Desk cards on the website Dashboard | 79924b3 |
| 10-16 | Monthly Payments in the sample report formats | 1989d8f |
| 10-15 | New Entry form / Narration tab at phone width (the form is back since) | dbcc7fc |
