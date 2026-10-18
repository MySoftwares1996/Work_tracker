# Letting other people use Working Dashboard

Anyone with a Google account can use the tool. They open the website (or install the APK), tap **Sign in with
Google**, and they are ready: their own private space in Firebase is created with that first sign-in, with the
default categories, statuses, priorities and people. The phone app and the website then show the same data,
live. Nothing is set up by hand for each person.

## Once, before inviting anyone

### 1. Turn on the security rules (each person sees only their own data)

`firestore.rules` allows each signed-in person to read and change only `users/<their account>/…`, and closes
everything else. It goes out with the website once you switch it on:

1. Google Cloud → **IAM** (console.cloud.google.com/iam-admin/iam?project=work-tracker-3b728) → the row
   `github-web-deploy@…` → ✎ → **+ Add another role** → **Firebase Rules Admin** → **Save**.
2. GitHub → repo **Settings → Secrets and variables → Actions → Variables** → **New repository variable**:
   `DEPLOY_FIRESTORE_RULES` = `true`.
3. **Actions → Deploy web version → Run workflow**. Its log says "…and the Firestore security rules".

Until this is done, the rules in Firebase are whatever they were before. **Do not invite other people before
this step.**

### 2. Switch on Gmail and the AI (built in)

Fetch Mail reads each person's own Gmail with their own sign-in, and the Daily Report's AI rewrite uses Gemini
inside this Firebase project. Both are switched on once, by you:

1. **Gmail:** Google Cloud → **APIs & Services → Library** → search **Gmail API** → **Enable**
   (console.cloud.google.com/apis/library/gmail.googleapis.com?project=work-tracker-3b728).
2. **AI:** Firebase console → **AI Logic** (under Build / AI) → **Get started** → choose **Gemini Developer API**
   (free tier, works on the free Spark plan) → follow the steps to the end.

### 3. Let other people sign in (add them as test users)

Reading Gmail is a permission Google only gives an unreviewed app for its **test users** (up to 100), so:

1. Google Cloud → **Google Auth Platform → Audience** (older consoles: **APIs & Services → OAuth consent
   screen**). Leave **Publishing status** on **Testing**.
2. **Test users → + Add users** → each person's Gmail address (yours too) → **Save**.

While the status is Testing, **only people on this list can sign in at all** - add everyone who should use the
tool. The first time a person taps Fetch Mail, Google shows "Google hasn't verified this app" → **Continue**, then
asks them to allow Gmail access. That is expected for a private tool.

### 4. Retire the old web app (Dev_Koteswara_Work_Report)

Stop using it, on every browser and device. It keeps its own old copy of your tasks and wrote that copy back over
newer data in Firebase (on 5 Oct it reopened 26 completed tasks). The new website does everything it did, and
reads only what is in Firebase.

## Inviting someone

Send them:
- the website: **https://koti-working-dashboard.web.app**, and/or
- the APK from the latest **Build Android APK** run (Actions → the run → Artifacts).

They tap **Sign in with Google**. That is all.

## Good to know

- **One device, several people:** signing in with a different account on the same phone or browser shows that
  account's own data. The previous account's tasks are never shown to, or sent into, the new one.
- **"Use without an account":** everything stays on that device only. Signing in later moves it into the account.
- **Nothing to set up:** Fetch Mail and the AI report are built in (Google sign-in and Gemini).
- **AI limits:** the free Gemini tier allows a limited number of requests a day for the whole project. If it is
  reached, the app says so and shows the standard report.
- **Free plan limits:** Firebase's free plan allows about 50,000 reads and 20,000 writes a day across all users -
  plenty for a small team.
