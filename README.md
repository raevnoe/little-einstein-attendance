# Little Einstein Discovery School — Kindergarten Attendance System

A Progressive Web-Based Application RFID Attendance Monitoring and Student Performance
Evaluation System with SMS Notification for the Kindergarten of Little Einstein Discovery School.

> Capstone prototype. Built phase-by-phase. **Phases 1–12 complete and tested.** Next: Phase 13 — Testing and Client Validation.

## Architecture

```
React PWA (client/)  ──HTTP──▶  Node.js / Express API (server/)  ──▶  Firebase Admin SDK  ──▶  Cloud Firestore
                                        │
                                        ├──▶ IPROG SMS API
                                        └──◀ UHF RFID reader / adapter
Authentication: Firebase Authentication (roles via Custom Claims, verified on the server)
```

Secrets (Firebase Admin credentials, IPROG SMS API token) live **only** in `server/.env`.
Anything in `client/.env` prefixed with `VITE_` is bundled into the browser and is public.

## Project structure

```
.
├── client/          React + Vite + Tailwind CSS frontend (the PWA)
│   ├── public/      Static assets served as-is
│   └── src/
│       ├── lib/     Framework-agnostic helpers (API client)
│       ├── App.jsx
│       └── main.jsx
├── server/          Express API
│   └── src/
│       ├── config/      Environment variable loading/validation
│       ├── middleware/  Express middleware (errors, 404, later: auth/roles)
│       ├── routes/      Route modules, all mounted under /api
│       ├── app.js       Builds the Express app
│       └── index.js     Starts the HTTP server
└── shared/          Constants used by both sides (roles, Firestore collection names). No secrets.
```

This is an npm workspaces monorepo: one `npm install` at the root installs everything.

## Requirements

- Node.js 22.9 or newer (developed on Node 24)
- npm 10 or newer

## Setup

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
```

## Running in development

Use two terminals from the project root:

```bash
npm run dev:server   # API on http://localhost:5000/api
npm run dev:client   # App on http://localhost:5173
```

The Vite dev server proxies `/api/*` to the API, so the browser talks to a single origin.
Open http://localhost:5173 — the page shows **"API online"** when both are running.

## Scripts (run from the root)

| Script                 | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `npm run dev:client`   | Start the Vite dev server                      |
| `npm run dev:server`   | Start the API with auto-restart on file change |
| `npm run start:server` | Start the API without watching (production)    |
| `npm run build`        | Production build of the client into `client/dist` |
| `npm run preview`      | Serve the built client locally                 |
| `npm run lint`         | Lint the client (oxlint)                       |
| `npm test`             | Client and server tests (Node built-in test runner; in-memory Firebase fake, mock SMS; no network) |

## PWA (Phase 12)

The manifest and service worker exist only in the **production build**; the dev server never
registers a service worker. To test installability and offline behaviour:

```bash
npm run dev:server   # API
npm run build && npm run preview   # app on http://localhost:4173 (/api is proxied like in dev)
```

- The service worker (`client/src/sw/`, written to `dist/sw.js` by `client/vite-plugins/serviceWorker.js`)
  caches only the app shell: `index.html`, the hashed `assets/*`, the manifest, icons and favicon.
  API responses, tokens and other origins are never cached; offline actions are blocked, never queued.
- A new deploy shows "A new version is available" with a **Reload** button; nothing reloads by itself.
- The in-app logo (`client/src/assets/school-logo.png`), `client/public/favicon.png` and the PWA icons in
  `client/public/icons/` are generated from the **official school logo** `client/brand/official-logo.png`
  (kept unchanged, not shipped) by `node client/scripts/generate-icons.mjs` (uses installed Chrome/Edge).
  The logo is only scaled to fit (never cropped, stretched or recoloured). Re-run the script if the logo changes.
- UI colours in `client/src/index.css` are **sampled from the logo**, not official colour codes.
- Script headings use **Caveat Bold** (SIL Open Font License 1.1; licence text in
  `client/src/assets/fonts/Caveat-OFL.txt`), taken once from the `@fontsource/caveat` 5.3.0 package (latin
  subset) and bundled with the app. It is precached with the app shell, so it works offline, and no font
  service is contacted at runtime. It is used only for short headings; body text, forms, tables and numbers
  use the system font.

## API

Protected routes need `Authorization: Bearer <Firebase ID token>`. The role comes only from the
verified token's `role` custom claim, and the user's `users/{uid}` profile must exist, be active,
and match that role.

| Method | Path                               | Access             | Description                                         |
| ------ | ---------------------------------- | ------------------ | --------------------------------------------------- |
| GET    | `/api/health`                      | public             | API liveness check                                  |
| GET    | `/api/auth/me`                     | any signed-in user | Verified identity + profile                         |
| GET    | `/api/admin/test`                  | admin              | Authorization check                                 |
| PATCH  | `/api/admin/users/:uid/role`       | admin              | Set role `{ "role": "teacher" }` (claim + profile)  |
| POST   | `/api/admin/users/:uid/deactivate` | admin              | Block sign-in, revoke sessions (nothing is deleted) |
| POST   | `/api/admin/users/:uid/reactivate` | admin              | Undo a deactivation                                 |
| PATCH  | `/api/admin/users/:uid/mobile-number` | admin           | Parent's SMS number `{ "mobileNumber": "0917..." }` (null removes) |
| GET    | `/api/teacher/test`                | teacher            | Authorization check                                 |
| GET    | `/api/parent/test`                 | parent             | Authorization check                                 |
| GET    | `/api/admin/parents`               | admin              | Parent accounts (for linking to students)           |
| GET    | `/api/students?q=&status=`         | admin, teacher     | List/search students (`status`: active/inactive/all) |
| GET    | `/api/students/:studentId`         | admin, teacher     | Student details + linked parents                    |
| POST   | `/api/students`                    | admin              | Create student (409 if Student ID exists)           |
| PATCH  | `/api/students/:studentId`         | admin              | Edit student (Student ID cannot change)             |
| POST   | `/api/students/:studentId/deactivate` | admin           | Mark inactive (record is kept)                      |
| POST   | `/api/students/:studentId/reactivate` | admin           | Mark active again                                   |
| GET    | `/api/parent/children`             | parent             | The caller's own linked, active children            |
| GET    | `/api/parent/children/:studentId`  | parent             | One own child (404 for anyone else's)               |
| GET    | `/api/rfid-cards?q=&status=&assignment=` | admin, teacher | List/search UHF RFID cards                     |
| GET    | `/api/rfid-cards/:uid`             | admin, teacher     | Card details + current/previous student             |
| POST   | `/api/rfid-cards`                  | admin              | Register card `{ "uid": "..." }` (409 if exists)    |
| POST   | `/api/rfid-cards/:uid/assign`      | admin              | Assign unassigned card `{ "studentId": "..." }`     |
| POST   | `/api/rfid-cards/:uid/reassign`    | admin              | Explicitly move an assigned card to another student |
| POST   | `/api/rfid-cards/:uid/unassign`    | admin              | Remove from student (record + history kept)         |
| POST   | `/api/rfid-cards/:uid/deactivate`  | admin              | Deactivate (also unassigns)                         |
| POST   | `/api/rfid-cards/:uid/reactivate`  | admin              | Reactivate (returns unassigned)                     |
| GET    | `/api/attendance?date=&q=&status=` | admin, teacher     | Daily Attendance roster (default: today)            |
| POST   | `/api/attendance/scan`             | admin, teacher     | TESTING: process a typed RFID UID `{ "uid": "..." }` |
| GET    | `/api/parent/children/:studentId/attendance` | parent  | Own child's last 30 days (404 for anyone else's)  |
| GET    | `/api/performance?studentId=&date=&area=` | admin, teacher | Performance evaluations (no student/date = today) |
| GET    | `/api/performance/:id`             | admin, teacher     | One evaluation (`{studentId}_{date}_{area}`)       |
| POST   | `/api/performance`                 | admin, teacher     | Save (create or update) the one evaluation for student/date/area |
| PATCH  | `/api/performance/:id`             | admin, teacher     | Change `starRating` and/or `observation`          |
| GET    | `/api/parent/children/:studentId/performance?date=` | parent | Own child's evaluations (last 30 days or one date) |
| GET    | `/api/parent/fetchers`             | parent             | The caller's own Fetchers                           |
| POST   | `/api/parent/fetchers`             | parent             | Register `{ fullName, relationship, studentIds }` (own active children only) |
| PATCH  | `/api/parent/fetchers/:fetcherId`  | parent             | Edit own Fetcher (404 for anyone else's)            |
| POST   | `/api/parent/fetchers/:fetcherId/deactivate` | parent  | Deactivate own Fetcher (record is kept)             |
| GET    | `/api/parent/dismissals`           | parent             | Today's dismissal status of own children (never a code) |
| POST   | `/api/parent/dismissals`           | parent             | Text a dismissal code to the caller's phone `{ studentId, fetcherId }` |
| GET    | `/api/dismissals?date=`            | admin, teacher     | Dismissal requests for a day (default today)        |
| POST   | `/api/dismissals/:id/verify`       | admin, teacher     | Check the Fetcher's code `{ otp, requestNumber }` (does not release) |
| POST   | `/api/dismissals/:id/release`      | admin, teacher     | Confirm handover after verification `{ requestNumber }` |
| GET    | `/api/admin/fetchers?status=`      | admin              | Every Fetcher with parent and children names        |
| POST   | `/api/admin/fetchers/:fetcherId/deactivate` | admin    | Deactivate any Fetcher                              |
| GET    | `/api/admin/users`                 | admin              | Every account (sorted by name)                      |
| POST   | `/api/admin/users`                 | admin              | Create account `{ email, firstName, lastName, role, mobileNumber? }` (password set by the person via email link) |
| GET    | `/api/admin/overview`              | admin              | Dashboard counts (incl. today's SMS sent/failed/skipped) |
| GET    | `/api/admin/audit-logs?from=&to=&...` | admin           | Audit log (read-only; max 31 days per request)      |
| GET    | `/api/reports/today`               | admin, teacher     | Today's attendance, evaluation and dismissal counts |
| GET    | `/api/reports/attendance?from=&to=&section=&studentId=` | admin, teacher | Attendance report (max 31 days) |
| GET    | `/api/reports/performance?from=&to=&section=&studentId=&area=` | admin, teacher | Performance report (max 31 days) |
| GET    | `/api/notifications?after=`        | admin, teacher, parent | Own in-app notifications (the bell), newest first |
| POST   | `/api/notifications/seen`          | admin, teacher, parent | Mark own notifications seen `{ upTo }`         |

RFID UIDs are normalized (whitespace, `:` and `-` removed, uppercased) and must be 4–64 hex
characters. A student has at most one card; every assignment change runs in a Firestore
transaction.

Admins cannot change their own role or deactivate themselves (prevents lockout).

### Daily Attendance (Phase 6A)

One record per student per school day: `attendance/{studentId}_{YYYY-MM-DD}`, where the date is the
school-local date in `SCHOOL_TIME_ZONE` (server env, default `Asia/Manila`). All scans go through
`processRfidScan()` in `server/src/services/attendance.service.js`, inside a Firestore transaction:
first scan = time in, next scan after the debounce = time out, later scans change nothing.
Unknown, inactive, or unassigned cards and inactive students never create attendance.

The RFID debounce (default 10 s) is read from the Firestore document `systemSettings/attendance`
field `rfidDebounceSeconds` (integer 0–300; missing/invalid = default; cached for 30 s).

`POST /api/attendance/scan` receives a card UID from the staff Attendance page and calls `processRfidScan()`.

### Physical UHF RFID reader (Phase 6B)

The WYUAN UHF60U connects by USB and acts as a keyboard: it types the card UID and presses Enter.
Open **Attendance** (today). The **UHF RFID Reader** panel shows **RFID Reader Ready** while keystrokes
would reach the page, and **Scanning paused** while a text box is selected or the window is not active
(typing into text boxes is never intercepted). Each scan goes through the same request as the manual
UID form, so the server applies all the usual rules. The manual UID form remains as a fallback.
Only one reader is supported; time in / time out is decided by scan order, as before.

### Student Performance Evaluation (Phase 7)

A teacher records, per student, school date and performance area, a **1–5 star rating** and an
optional short observation (max 500 characters). This is not a grading system: no percentages,
letter grades or grade computation. One record per student/date/area:
`performance/{studentId}_{YYYY-MM-DD}_{area}`; saving the same area again updates it (in a Firestore
transaction). Areas are defined in `shared/src/performance.js`. The evaluator (`teacherId`) and
timestamps are set by the server. The "Daily Average Star Rating" is only a visual summary.

### SMS notification via IPROG SMS (Phase 8)

> ⚠️ The IPROG SMS API token is a **secret**. It belongs **only** in `server/.env`, never in
> `client/.env`, never in a `VITE_*` variable, never in Git, chat, screenshots, or this README.
> If it is ever exposed, revoke it in IPROG and create a new one.

Setup (in `server/.env`, see `server/.env.example`):

| Variable              | Meaning                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| `SMS_PROVIDER`        | `iprog` (default, real SMS), `mock` (log only; refused in production), or `philsms` (legacy) |
| `IPROG_SMS_API_TOKEN` | API token from your IPROG SMS account (sent in the JSON body, server-side only)  |
| `PHILSMS_API_TOKEN`, `PHILSMS_SENDER_ID` | Legacy PhilSMS provider only (not in use)            |

IPROG is used only to deliver SMS (`POST https://www.iprogsms.com/api/v1/sms_messages`); the
dismissal OTP (Phase 9) is generated and verified by this application, not by IPROG.

Restart the API after changing these. If the token is missing, attendance still
works and each SMS is recorded as `failed` (not configured).

Parent phone numbers: an admin opens **Students → a student → Parent Accounts** and adds the
parent's mobile number (stored on the parent's account as `+639XXXXXXXXX`). The bootstrap
script also accepts `--mobile 09171234567` for parent accounts.

When SMS is sent (by the server, after the attendance record is saved):

- first valid scan of the day (time in): *"Little Einstein Discovery School: Ana Cruz has arrived at school at 7:45 AM."*
- valid scan after the debounce (time out): *"Little Einstein Discovery School: Ana Cruz has checked out at 3:10 PM."*
- **never** for unknown/inactive/unassigned cards, inactive students, debounced scans, scans
  after checkout, or rejected requests.

Every linked, **active** parent account with a valid number gets one SMS; the same number is
texted once even if two parents share it. The result is stored in `notifications`
(`sent` = accepted/queued by the provider, not a delivery confirmation; `failed`; or `skipped` when no parent
has a number). An SMS failure never undoes the attendance record. The Attendance page shows a
one-line SMS result after each test scan (no phone numbers).

Test mode: automated tests run the API with `SMS_PROVIDER=mock` (or an IPROG provider with a
fake network call), so they never send real SMS and never need a real token. For local
development without sending SMS, set `SMS_PROVIDER=mock` in `server/.env`.

### Fetchers and Dismissal Verification (Phase 9)

A **Fetcher** is a person a parent authorizes to pick up their child. Fetchers have **no account
and no role**. Parents manage them under **Fetchers & Dismissal** (name, relationship, which of
their own children they may collect); admins see every Fetcher under **Fetchers** and can
deactivate one.

Dismissal flow:

1. The parent chooses the child and the Fetcher and taps **Send code to my phone**. The server
   generates a 6-digit code (`crypto.randomInt`) and texts it **only** to that parent's registered
   mobile number. The code is never shown in the app, returned by the API, logged, or stored —
   only a salted scrypt hash is kept, and only after the SMS provider accepted the message.
2. The parent gives the code to the Fetcher.
3. The teacher opens **Dismissal**, checks the Fetcher's identity, and enters the code (**Verify**).
4. The teacher separately taps **Confirm handover** (**Release**). The server records who
   verified and who released, and when.

Rules: one record per child per school day (`dismissalRecords/{studentId}_{YYYY-MM-DD}`); a new
code replaces the previous one; codes expire after 10 minutes and lock after 5 incorrect entries
(`systemSettings/dismissal` fields `otpExpiryMinutes` 1–30 and `otpMaxAttempts` 3–10); at most one
code request per child per 60 seconds and 5 per day; a deactivated, edited, or no-longer-authorized
Fetcher cancels the request at verification or release. Attendance is not involved: a time-out
scan is not a dismissal, and a release does not record a time-out.

## Creating users (bootstrap)

The first admin must be created from the command line. Run the script with `node` directly
(not `npm run`) so npm does not echo the password:

```bash
cd server
node --env-file=.env scripts/createUser.js --email admin@school.test --password "<strong password>" --first Ana --last Cruz --role admin
```

## Development phases

1. Project foundation ✅
2. Firebase + Authentication ✅
3. Role-based authorization ✅
4. Student management ✅
5. RFID card management ✅
6. Attendance (6A: foundation + manual UID input ✅; 6B: UHF reader, keyboard emulation ✅)
7. Performance evaluation ✅
8. SMS notification (IPROG SMS; PhilSMS kept as legacy) ✅
9. Fetcher + OTP dismissal ✅
10. Reports ✅
11. Audit logs + security hardening ✅
12. PWA and offline support ✅
13. Testing and client validation — next
14. Deployment / demo preparation

Added along the way (developer requests): UI redesign, admin account management, RFID card registration with
the reader, live updates and notification sounds, in-app notification bell, page addresses per role, Performance
Evaluation quick phrases / star words / "Save all", and the Fetcher relationship dropdown.
