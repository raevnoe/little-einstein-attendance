# Deploying Little Einstein (free: Firebase Hosting + Vercel)

```text
Browser / PWA ──> https://little-einstein-attendance.web.app      (Firebase Hosting, Spark/free plan)
       │              the React PWA (client/dist)
       │
       └─ API calls ──> https://<your-vercel-project>.vercel.app/api   (Vercel Hobby/free plan)
                           Express API (server/) ──> Firestore, Firebase Auth, IPROG SMS
```

* No credit card is needed for either service.
* The API runs as a Vercel serverless function in Singapore (`sin1`), next to your Firestore database
  (`asia-southeast1`). Files: `api/index.mjs`, `vercel.json`, `.vercelignore`.
* Vercel's Hobby plan is for personal, non-commercial use. A capstone prototype fits. If the school later uses the
  system for real, move the API to a paid/school-owned plan.
* Secrets (Firebase service account, IPROG token) live only in `server/.env` on your PC and in Vercel's
  Environment Variables. `.vercelignore` keeps every `.env` file and key file out of the upload - never remove those lines.

Commands are for **PowerShell**, run from the project folder (`E:\THESIS PROJECT SYSTEM`).

---

## Part A - the API on Vercel (one-time setup)

### 1. Create a free Vercel account

<https://vercel.com/signup> → *Hobby*. Then install the CLI and sign in:

```powershell
npm install -g vercel
vercel login
```

### 2. Create the Vercel project

```powershell
vercel link
```

Answer: *Set up?* **Y** · scope: your account · *Link to existing project?* **N** ·
name: **little-einstein-api** · directory: **./** · *Modify settings?* **N** (`vercel.json` already has them).

### 3. Add the environment variables

Vercel dashboard → **little-einstein-api** → *Settings* → *Environment Variables*. Add each one for
**Production** (tick *Sensitive* for the secret ones). Copy the secret values from your `server/.env`:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `FIREBASE_PROJECT_ID` | `little-einstein-attendance` |
| `FIREBASE_CLIENT_EMAIL` | from `server/.env` (secret) |
| `FIREBASE_PRIVATE_KEY` | from `server/.env`, **without** the surrounding double quotes (secret) |
| `SCHOOL_TIME_ZONE` | `Asia/Manila` |
| `SMS_PROVIDER` | `iprog` |
| `IPROG_SMS_API_TOKEN` | from `server/.env` (secret) |
| `CLIENT_ORIGIN` | `https://little-einstein-attendance.web.app,https://little-einstein-attendance.firebaseapp.com` |

`CLIENT_ORIGIN` is the list of sites allowed to call the API from a browser. `NODE_ENV=production` hides error
details and refuses the mock SMS provider. Never paste these values into chat, code or a `VITE_*` variable.

### 4. Deploy the API

```powershell
vercel deploy --prod
```

The address printed as *Production* (e.g. `little-einstein-xxxx-<team>.vercel.app`) belongs to that one deployment
only. Use the project's **permanent** address instead: Vercel dashboard → project → *Settings* → *Domains*
(normally `https://little-einstein-api.vercel.app`). It always points to the latest production deployment.
Open **`<permanent address>/api/health`** → you should see `{"status":"ok", ...}`.

---

## Part B - the PWA on Firebase Hosting

### 5. Point the app at the API

Create the file **`client/.env.production`** (used only by `npm run build`; local development keeps `/api`):

```text
VITE_API_BASE_URL=https://little-einstein-api.vercel.app/api
```

Use the address from step 4 if it is different. This value is public (it is not a secret).

### 6. Build and deploy

```powershell
npm run build
firebase deploy --only hosting
```

### 7. Check the live site

1. In the browser you tested with before: DevTools → **Application → Storage → Clear site data** (once - it still
   holds the old broken answer), then reload.
2. Open <https://little-einstein-attendance.web.app> and sign in as the admin → the dashboard loads.

---

## Updating later

* Server change (`server/`, `shared/`) → `vercel deploy --prod`
* App change (`client/`, `shared/`) → `npm run build` then `firebase deploy --only hosting`
* Firestore rules → `firebase deploy --only firestore:rules`

## If something goes wrong

* **"Cannot reach the server"** after signing in: check `<api address>/api/health`, and that
  `client/.env.production` has that address + `/api`, then rebuild and redeploy Hosting.
* **CORS error in the browser console**: `CLIENT_ORIGIN` on Vercel must list the exact site address
  (https, no trailing slash). Redeploy the API after changing a variable (`vercel deploy --prod`).
* **500 errors**: Vercel dashboard → project → *Logs*. The app never logs secrets.
* **SMS**: with `SMS_PROVIDER=iprog`, arrival/departure and dismissal-code SMS are really sent and use credits.
