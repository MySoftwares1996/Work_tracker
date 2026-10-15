# Put the web version online automatically

After this one-time setup, every push to `main` builds the web version and puts it on Firebase Hosting
(`.github/workflows/web-deploy.yml`). Everything below can be done from a phone's browser; no computer is
needed.

The site is a **separate Hosting site** in the same Firebase project (`working-dashboard-655ca`), so the
Banking Work Tracker web app, if it is hosted on the project's main site, is never replaced. The deploy refuses
to run without a separate site.

## 1. Create the site

1. Open <https://console.firebase.google.com> → project **working-dashboard-655ca** → **Hosting**
   (under Build). If Hosting was never used, tap **Get started** and skip through the steps.
2. Scroll down → **Add another site** → enter a name, for example `koti-working-dashboard`.
   It must be unique worldwide; if it is taken, try another.
3. Your website address is `https://<that-name>.web.app`. Keep the name for step 4.

## 2. Allow Google sign-in on that address

Firebase console → **Authentication** → **Settings** → **Authorized domains** → **Add domain** →
`<that-name>.web.app`. Without this, Realtime Sync sign-in on the website is refused.

## 3. A key that lets GitHub deploy (secret `FIREBASE_SERVICE_ACCOUNT`)

1. Open <https://console.cloud.google.com/iam-admin/serviceaccounts?project=working-dashboard-655ca>.
2. **Create service account** → name `github-web-deploy` → **Create and continue**.
3. Roles: add **Firebase Hosting Admin** and **API Keys Viewer** → **Continue** → **Done**.
4. Open the new account → **Keys** → **Add key** → **Create new key** → **JSON** → **Create**. A `.json` file
   downloads. Open it and copy all of its text.
5. GitHub → this repository → **Settings** → **Secrets and variables** → **Actions** → **Secrets** tab →
   **New repository secret**: name `FIREBASE_SERVICE_ACCOUNT`, value: paste the whole JSON text → **Add secret**.
6. Delete the downloaded file afterwards. Anyone with it can change your website.

## 4. Tell GitHub the site name (variable `FIREBASE_HOSTING_SITE`)

Same page → **Variables** tab → **New repository variable**: name `FIREBASE_HOSTING_SITE`, value: the site
name from step 1 (only the name, e.g. `koti-working-dashboard`, not the full address) → **Add variable**.

## 5. First deploy

GitHub → **Actions** → **Deploy web version** → **Run workflow**. In 3-5 minutes it turns green and its
summary shows the address. After that it runs by itself on every push to `main`.

## If sign-in on the website says the API key is not allowed

The build uses the Android app's key by default. Use the project's own Web app keys instead:
Firebase console → ⚙ Project settings → **Your apps** → the Web app (add one with **</>** if there is none) →
copy `apiKey` and `appId`. Add them as two more repository **variables**: `EXPO_PUBLIC_FIREBASE_API_KEY` and
`EXPO_PUBLIC_FIREBASE_APP_ID`, then run the workflow again.

## Deploying from a computer instead

```
npm install
npm run build:web
npx firebase-tools@15 login
FIREBASE_HOSTING_SITE=koti-working-dashboard npm run deploy:web
```

## If the workflow fails

- **"Secret FIREBASE_SERVICE_ACCOUNT is not set"** / **"Variable FIREBASE_HOSTING_SITE is not set"**:
  step 3 or 4 was missed, or the name is misspelt.
- **"Permission denied" / 403**: the service account is missing a role from step 3.
- **"Site not found" / 404**: the variable does not match the site name in Firebase Hosting exactly.
- **Checks or tests fail**: the code has a problem, and nothing was deployed. The site keeps its last version.

## Security rules

To deploy `firestore.rules` (each account reads and writes only its own data) with the site, give the key the
**Firebase Rules Admin** role and add the repository variable `DEPLOY_FIRESTORE_RULES` = `true`. See
`docs/NEW_USERS.md`.
