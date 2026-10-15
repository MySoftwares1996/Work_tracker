# Building the APK with GitHub Actions (free)

GitHub builds a signed APK on its servers every time you push to `main`; you download it from the Actions tab.
Written for Windows + PowerShell. About 30 minutes the first time.

---

## Part A - Register the app in Firebase first

See README.md, step 1. Without the new `google-services.json` the build stops at "No matching client found".
Do Part B first if you want to add the key's SHA-1 in the same visit.

---

## Part B - Create the app's signing key (5 min)

This is a new app, so it gets its own key. Keep it forever: every update must be signed with the same key, or it
will not install over the app.

```powershell
keytool -genkeypair -v -keystore working-dashboard.jks -alias workingdashboard -keyalg RSA -keysize 2048 -validity 10000
```
(keytool comes with Java. Choose a password and answer the questions; the same password can be used for the key.)

Write down: **keystore password**, alias **workingdashboard**, **key password**.

Its SHA-1 for Firebase:
```powershell
keytool -list -v -keystore working-dashboard.jks -alias workingdashboard
```

Move `working-dashboard.jks` somewhere safe outside the project folder and back it up.

Turn it into text for GitHub:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\working-dashboard.jks")) | Set-Clipboard
```

---

## Part C - Create the GitHub repository

github.com → **+** → **New repository** → name `working-dashboard` → **Private** → do not add a README,
.gitignore or licence → **Create repository**.

---

## Part D - Add the four secrets

Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the long line from Part B |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `workingdashboard` |
| `ANDROID_KEY_PASSWORD` | key password |

---

## Part E - Push the code

In PowerShell, in the unzipped `working-dashboard-app` folder:
```powershell
git init
git add -A
git commit -m "Working Dashboard 1.0.0"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/working-dashboard.git
git push -u origin main
```

The push starts the first build: **Actions** tab → **Build Android APK**.

---

## Part F - Install

On the finished run → **Artifacts** → **WorkingDashboard-APK** → unzip → `WorkingDashboard-v1.0.0-buildN.apk`.
Copy it to the phone and open it. It installs as a new app next to My Personal Tracker.

## Every build after this

```powershell
git add -A
git commit -m "what changed"
git push
```

## Troubleshooting

- **No matching client found for package name 'com.koteswara.workingdashboard'** - replace google-services.json
  (README, step 1).
- **Google sign-in fails with DEVELOPER_ERROR** - the SHA-1 of the signing key is not added to the Android app in
  Firebase. Add it, download google-services.json again, push.
- **Secret ... is not set** - a secret name in Part D is missing or misspelt.
- **Keystore was tampered with, or password was incorrect** / **Cannot recover key** - a password or the alias
  secret is wrong.
- **`npm ci` fails** - run `npm install` on your PC, then commit and push `package-lock.json`.
