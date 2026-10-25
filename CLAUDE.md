# CLAUDE.md

## Project

**Title:**

A Progressive Web-Based Application RFID Attendance Monitoring and Student Performance Evaluation System with SMS Notification for Kindergarten of Little Einstein Discovery School

**Client:**

Little Einstein Discovery School

**Target Users:**

* Admin
* Teacher
* Parent

**Non-account participant:**

* Fetcher

---

# 1. Project Scope

This project is a **Progressive Web Application (PWA)** for Little Einstein Discovery School.

The system is specifically for **kindergarten students**.

The main functions are:

1. RFID-based attendance monitoring
2. Student performance evaluation
3. SMS notifications
4. Parent daily record viewing
5. Fetcher verification through OTP
6. Administrative student and account management
7. Attendance and performance reports

The system is **not**:

* A Learning Management System (LMS)
* A full grading system
* A quarterly grade computation system
* A replacement for the school's existing academic grading process
* A general school management system

Performance evaluation uses:

* Teacher observations/descriptive notes
* Visual star ratings
* Simple daily star averages where appropriate

Do not introduce academic grade computation unless explicitly requested.

The system focuses on **daily kindergarten attendance and performance records**.

---

# 2. Development Rule

Work on **one development phase at a time**.

After completing a phase:

1. Run the required tests.
2. Run lint.
3. Run the production build when appropriate.
4. Report all changes.
5. Report all tests and their results.
6. Report known limitations.
7. STOP.

Do **not** automatically begin the next phase.

The developer/user must explicitly request the next phase.

Do not skip phases unless the developer/user explicitly instructs you to do so.

---

# 3. Current Development Status

Completed:

* Phase 1: Project Foundation
* Phase 2: Firebase Authentication
* Phase 3: Role-Based Authorization and Routing
* Phase 4: Student Management
* Phase 5: RFID Card Management
* Phase 6A: Attendance Foundation + manual/mock RFID UID input
* Phase 7: Performance Evaluation (browser test passed)
* Phase 8: SMS Notifications (PhilSMS, now IPROG SMS) - tested by the developer
* Phase 6B: Physical UHF RFID reader integration, keyboard-emulation mode - tested by the developer
* Phase 9: Fetcher Management and Dismissal OTP Verification (browser test passed)
* Phase 10: Reports and Dashboard Improvements (browser test passed)
* Phase 11: Audit Logs and Security Hardening (browser test passed)

* Phase 12: PWA and Offline Support - tested by the developer

Developer confirmation (2026-10-24): Phases 1-12 are all tested and complete. Do not re-test or re-verify them;
test only new changes. Next: Phase 13 (Testing and Client Validation) when the developer requests it - its
deliverables are being decided by the developer's team (see the paper/proposal discussion).

Planned order:

1. Project Foundation
2. Firebase + Authentication
3. Role-Based Authorization
4. Student Management
5. RFID Card Management
6. Attendance
7. Performance Evaluation
8. SMS Notifications
9. Fetcher / Dismissal OTP
10. Reports
11. Audit Logs and Security Hardening
12. PWA / Offline Behavior
13. Testing and Client Validation
14. Deployment

Do not implement functionality from future phases unless it is required to complete the current phase.

---

# 4. Technology Stack

## Frontend

* React
* Vite
* JavaScript
* Tailwind CSS when appropriate
* Firebase client SDK for authentication
* PWA support will be added in the dedicated PWA phase

## Backend

* Node.js
* Express
* Firebase Admin SDK

## Database

* Cloud Firestore

## Storage

* Firebase Storage where required

## External Services

* PhilSMS SMS API

## Hardware

* UHF RFID reader

The RFID system must use **UHF RFID**.

Do not replace UHF RFID with LF RFID or assume LF RFID readers/cards.

## Design

* Figma
* Lucidchart

## Version Control

* Git
* GitHub

---

# 5. Architecture

The system follows this architecture:

```text
React PWA
    |
    | HTTPS / REST API
    v
Node.js + Express Backend
    |
    +--> Firebase Admin SDK
    |       |
    |       +--> Firebase Authentication
    |       +--> Cloud Firestore
    |       +--> Firebase Storage
    |
    +--> PhilSMS SMS API
    |
    +--> UHF RFID Reader Adapter / Bridge
```

The frontend must communicate with protected application data through the backend API.

Do not introduce direct Firestore client access for elevated application operations.

The backend is responsible for authorization and sensitive operations.

---

# 6. Authentication

Firebase Authentication is used for account authentication.

Current supported account roles:

* `admin`
* `teacher`
* `parent`

`fetcher` is NOT an authenticated account role.

Do not add `fetcher` as a Firebase Custom Claim role.

The Fetcher will be handled through the dismissal verification process.

---

# 7. Role Security

Firebase Custom Claims are the authoritative source of the user's role.

Never trust a role supplied by:

* Request body
* Query parameter
* URL parameter
* Local storage
* Frontend state
* Custom request header
* Client-controlled JavaScript

The backend must verify the Firebase ID token using Firebase Admin SDK.

Protected routes should use:

```text
requireAuth
    ↓
requireRole(...)
```

Backend authorization is mandatory.

Frontend role-based rendering is only for user experience and navigation.

Frontend restrictions must never be considered a security boundary.

---

# 8. User Accounts

User profiles are stored in Firestore.

The Firebase Authentication UID must be used to associate authentication with the Firestore user profile.

A user profile should contain information such as:

```text
uid
email
firstName
lastName
role
active
createdAt
updatedAt
```

The role stored in the profile must remain synchronized with the Firebase Custom Claim.

When changing a role:

1. Validate the requested role.
2. Update the Firebase Custom Claim.
3. Update the Firestore profile.
4. Handle failures safely.
5. Prevent privilege escalation.

Supported roles:

```text
admin
teacher
parent
```

Reject unsupported roles such as:

```text
fetcher
student
guardian
```

unless explicitly added by the developer/user later.

---

# 9. Account Deactivation

Deactivating a user must:

1. Mark the Firestore profile as inactive.
2. Disable the Firebase Authentication account where appropriate.
3. Revoke refresh tokens where appropriate.
4. Prevent API access through backend authorization.

Do not delete the user's account or historical records when simply deactivating them.

Admins must not accidentally lock themselves out.

Do not allow an admin to deactivate or change their own account role unless explicitly required and safely implemented.

---

# 10. Student Management

Students are kindergarten students.

Student records must be separate from RFID card records.

Important:

**Student ID and RFID UID are different values.**

Example:

```text
Student ID:
K2026-001

RFID UID:
300833B2DDD901C40A000000
```

Do not use the RFID UID as the student's permanent Student ID.

Students should support information such as:

* Student ID
* First Name
* Middle Name
* Last Name
* Date of Birth
* Gender
* Kindergarten level/section
* Parent relationship/account
* Contact information where appropriate
* Active/inactive status
* Created date
* Updated date

Avoid collecting unnecessary personal information.

Validate student input on the backend.

The backend must enforce required fields and data integrity.

---

# 11. RFID Card Management

RFID cards are managed separately from students.

Use UHF RFID.

Recommended conceptual relationship:

```text
Student
   |
   +---- RFID Card
             |
             +---- Physical RFID UID
```

RFID card records should support:

* Physical UID
* Student association
* Active/inactive status
* Assigned date
* Unassigned date where applicable
* Created/updated timestamps

RFID UID should be unique.

Do not automatically create a student when an unknown RFID UID is scanned.

Unknown RFID scans should be logged for administrator visibility.

---

# 12. RFID Scanning

The system will use UHF RFID scanning.

There may be two scanning points:

```text
Entry Reader
Exit Reader
```

The RFID reader communication must remain modular.

Do not tightly couple the application to one specific reader model unless explicitly required.

A reader adapter/bridge may be used between the physical reader and backend.

The system should be designed so another compatible UHF reader can be substituted later.

---

# 13. Attendance Rules

Attendance is recorded once per student per school day.

Basic behavior:

```text
First valid entry scan
        ↓
Create attendance record
        ↓
Record time-in

Exit scan
        ↓
Update same attendance record
        ↓
Record time-out
```

Do not create multiple attendance records for the same student and school day because of repeated scans.

If a student scans after already having a time-out:

* Do not create a second attendance record.
* Log the event as an anomaly/audit event when appropriate.

Unknown RFID UID:

* Do not create attendance.
* Log the unknown UID for admin visibility.

RFID debounce:

* Default: 10 seconds
* Configurable through system settings when implemented

Repeated scans within the debounce period should not create duplicate attendance events.

Attendance should use the school's local date/time appropriately.

---

# 14. Offline Behavior

The PWA may cache:

* Application shell
* Static assets
* Other safe static resources

Do NOT silently queue critical operations offline.

The following require an active internet connection:

* Attendance submission
* RFID processing
* OTP generation
* OTP verification
* Performance submission
* SMS-triggering actions
* Other server-authoritative operations

When an operation requires the internet and the user is offline, show a clear message such as:

> You’re offline — this action requires an internet connection.

Do not create an offline attendance queue unless explicitly requested and designed carefully.

---

# 15. Performance Evaluation

Performance evaluation is for kindergarten students.

It is not academic grade computation.

Teachers may record:

* Subject/activity
* Star rating
* Descriptive observation
* Date
* Teacher
* Student

Star ratings should be visual and easy for teachers to understand.

Example:

```text
★★★★★
★★★★☆
★★★☆☆
```

Daily averages may be calculated when useful.

Do not introduce:

* Quarterly grades
* GPA
* Weighted academic grading
* Full report-card computation

unless explicitly requested.

---

# 16. SMS Notifications

IPROG SMS is the active provider (replaced PhilSMS by developer decision, after Phase 8):
`POST https://www.iprogsms.com/api/v1/sms_messages`, JSON body
`{ api_token: IPROG_SMS_API_TOKEN, phone_number: "639XXXXXXXXX", message }`; success body has
`status: 200` and `message_id`. Provider: `server/src/services/sms/iprog.provider.js`.
`SMS_PROVIDER` = `iprog` (default) | `mock` | `philsms` (legacy, kept but not in use).
Use only IPROG's plain SMS API; the dismissal OTP is generated/verified by this app.

Legacy PhilSMS API (replaced the earlier Semaphore plan in Phase 8):
`POST https://app.philsms.com/api/v3/sms/send`, `Authorization: Bearer {PHILSMS_API_TOKEN}`,
body `{ recipient: "639XXXXXXXXX", sender_id, type: "plain", message }`.

SMS functionality must remain on the backend.

Never expose the PhilSMS API token (`PHILSMS_API_TOKEN`) or sender ID configuration in:

* React code
* `VITE_*` variables
* Browser JavaScript
* Git
* Client-visible configuration
* Logs, error responses, or Firestore

The frontend must call the backend when an SMS-triggering action is required.
There is no endpoint that lets the frontend send an arbitrary SMS.

The backend communicates with PhilSMS.

Phase 8 implementation (complete):

* Boundary: `attendance.service` → `notification.service` → `sms/sms.service` → `sms/philsms.provider`.
  Another provider can be added by implementing the same `send({ to, message })` shape.
* Trigger: SMS is requested only AFTER the attendance transaction commits, and only for an
  actual time-in (arrival) or time-out (departure). Never for rejected, debounced, or
  after-checkout scans, and never inside the Firestore transaction.
* Recipients: the student's linked parent accounts that are active and have a valid
  `mobileNumber` on `users/{uid}` (stored as `+639XXXXXXXXX`; set by admins). Numbers are
  deduplicated after normalization. Phone numbers are never copied into students or attendance.
* Records: one `notifications/{attendanceId}_{event}_{number}` document per recipient
  (status `sent` = accepted by PhilSMS, not confirmed delivery; `failed`; or one `skipped`
  record when no parent has a number). The deterministic ID prevents re-sending the same event.
* Failure: any SMS problem (missing token/sender ID, HTTP/provider error, network, timeout)
  is recorded as `failed`; the attendance record is never rolled back.
* Testing: `SMS_PROVIDER=mock` (refused in production) logs instead of sending. Automated
  tests never send real SMS and never need a real token.

SMS should be used for appropriate events such as:

* Student arrival
* Student departure
* Dismissal OTP
* Other approved school notifications

Do not send SMS repeatedly because of RFID debounce or duplicate requests.

---

# 17. Parent Role

Parents can:

* View their child's daily attendance
* View their child's performance records
* Receive SMS notifications
* View notifications/messages
* Manage approved Fetcher information where implemented

Parents must only access data belonging to their associated child/children.

Never allow a parent to request another student's records simply by changing a student ID in the URL or request body.

Backend authorization must verify ownership/relationship.

---

# 18. Fetcher

Fetcher is NOT a login role.

A Fetcher does not receive a normal system account.

When a parent cannot personally fetch the child:

1. Teacher/authorized staff initiates the dismissal process.
2. The system generates a secure OTP.
3. OTP is sent to the parent through SMS.
4. Parent gives the OTP to the Fetcher.
5. Teacher enters/verifies the OTP.
6. If valid, the child may be released.
7. The dismissal is recorded.

OTP requirements:

* Generated by the backend.
* Short-lived.
* Single-use.
* Not stored as plain text when avoidable.
* Never exposed to unauthorized users.
* Invalid or expired OTP must be rejected.
* Successful verification invalidates the OTP.

Phase 9 implementation (developer spec: the PARENT requests the code for one own child and one
own authorized Fetcher; the teacher verifies, then separately confirms the release):

* `fetchers/{autoId}`: `parentId` (owner, from the token only), `fullName`, `relationship`,
  `studentIds[]` (owner's active children only), `active`. No Fetcher contact data is collected.
  Model `server/src/models/fetcher.model.js`, service `fetcher.service.js`.
* `dismissalRecords/{studentId}_{schoolDate}`: ONE record per child per school day; a new code
  replaces the old one on the same document (no two live codes; no second release that day).
  Status: sending -> awaiting-verification | sms-failed -> verified | locked | expired | cancelled
  -> released. Model `dismissal.model.js` (explicit allow-list views; `otpHash`/`otpSalt` never
  leave the server), service `dismissal.service.js`.
* OTP: `crypto.randomInt` 6 digits; scrypt hash with a random salt, bound to dismissal ID +
  request number; `timingSafeEqual`. Usable only after the SMS provider accepted it (failed SMS
  deletes the hash). Expiry/attempts from `systemSettings/dismissal` (defaults 10 min / 5).
  Limits: 60 s cooldown and 5 codes per child per day, checked inside the transaction.
* The OTP SMS is sent with `sendSms()` to the requesting parent's `users/{uid}.mobileNumber`.
  It is NOT written to `notifications` (that record stores message text, which would contain the code).
* Verify/release are Firestore transactions; both re-check that the Fetcher is active, still
  authorized, and unchanged (name/relationship) and that the client's `requestNumber` matches.
  `verifiedBy`/`releasedBy`/timestamps come from the server only. Attendance is never touched.
* Teachers have no section assignment in the data model, so any teacher/admin may verify any
  student's dismissal in this one school.
* Dev-only manual-test helper: `GET /api/dev/dismissal-otp/:studentId` (`routes/dev.routes.js`,
  `services/sms/devOtpOutbox.js`) returns the requesting parent's own current code from process
  memory. Only when NODE_ENV != production AND SMS_PROVIDER=mock AND the mock provider is active;
  not mounted otherwise. Client button `DevOtpPeek` renders only under `import.meta.env.DEV`.
* Tests: `server/test/*.test.js` run the real Express app against an in-memory Firebase fake
  (`server/test/helpers/`) via `node --test --experimental-test-module-mocks`; SMS is mocked.

---

# 19. Firestore Collections

Planned collections include:

```text
users
students
rfidCards
attendance
performance
fetchers
dismissalRecords
announcements
notifications
auditLogs
systemSettings
```

Do not create unnecessary collections.

Before adding a new collection, determine whether an existing collection can properly support the requirement.

Maintain clear relationships between documents.

---

# 20. Data Integrity

Backend validation is required.

Do not rely only on frontend validation.

Prevent:

* Duplicate Student IDs
* Duplicate RFID UIDs
* Invalid roles
* Invalid student references
* Unauthorized student access
* Duplicate daily attendance
* Duplicate OTP use
* Invalid parent/student relationships

Use server-side timestamps where appropriate.

---

# 21. API Security

All protected APIs must require authentication.

Use Firebase Admin SDK to verify tokens.

Use role middleware for role-specific operations.

Return appropriate HTTP status codes:

```text
401 = unauthenticated
403 = authenticated but unauthorized
404 = resource not found
400 = invalid request
409 = conflict/duplicate where appropriate
500 = unexpected server error
```

Do not expose:

* Stack traces
* Firebase service-account credentials
* Private keys
* API keys
* Internal secrets
* Sensitive database details

in production responses.

---

# 22. Environment Variables

Client-side variables using:

```text
VITE_*
```

are considered public.

Never put secrets in `VITE_*` variables.

Server-only secrets include:

* Firebase Admin credentials
* PhilSMS API token
* Other private API credentials

These belong only in server environment configuration.

Never commit real `.env` files containing secrets.

Maintain `.env.example` files with placeholders only.

---

# 23. Firebase Credentials

Firebase Admin credentials must remain server-side.

Never place:

* Service account private key
* Firebase Admin private credentials
* PhilSMS API token

inside the React application.

If a credential is exposed, treat it as compromised and rotate it.

Do not paste private keys into ChatGPT or Claude.

---

# 24. PWA Requirements

The application is a PWA.

Do not describe the final system as merely a normal website.

The final PWA should support:

* Installability
* Application manifest
* Service worker
* Appropriate caching
* Responsive interface
* Mobile-friendly behavior

Offline caching must follow the offline rules in this document.

Do not implement aggressive offline synchronization without explicit approval.

---

# 25. UI/UX

The interface should be:

* Simple
* Clean
* Responsive
* Easy for kindergarten teachers to use
* Suitable for desktop and tablet
* Understandable without technical knowledge

Avoid unnecessary animations and complicated interfaces.

Prioritize:

* Clear buttons
* Clear labels
* Readable student information
* Fast attendance visibility
* Simple performance input
* Clear error messages
* Confirmation for destructive actions

Use consistent terminology.

Preferred terminology:

```text
Student
Teacher
Parent
Fetcher
RFID Card
Attendance
Performance Evaluation
Dismissal Verification
```

Avoid unnecessarily broad terminology such as:

```text
Integrated Management System
School Management Platform
Enterprise Management
```

unless explicitly required.

---

# 26. Routing

React Router is not required immediately.

Simple role-based rendering is acceptable while the application is small.

Current state (developer request, 2026-10-24): page addresses WITHOUT React Router - `client/src/lib/routes.js`
(pure rules, tested) + `lib/router.js` (History API, `usePathname`, `navigate`). See "Page addresses" below.

When the number of pages becomes large enough, React Router may be introduced.

If React Router is added:

* Protect authenticated routes.
* Protect role-specific routes.
* Do not rely on frontend route protection as the only security mechanism.

Backend authorization remains mandatory.

---

# 27. Code Organization

Keep frontend and backend separated.

Frontend:

```text
client/
  src/
    auth/
    components/
    lib/
    pages/
```

Backend:

```text
server/
  src/
    config/
    middleware/
    models/
    routes/
    services/
    utils/
```

Use reusable functions instead of duplicating logic.

Keep controllers/routes/services reasonably separated as the project grows.

Do not over-engineer simple features.

---

# 28. State Management

Do not add Redux unless there is a demonstrated need.

Prefer:

* React state
* Context
* Existing AuthProvider
* Small reusable hooks

Add TanStack Query or another state/data library only when there is a clear benefit and after inspecting the existing architecture.

Do not add packages simply because they are popular.

---

# 29. Dependencies

Before adding an npm package:

1. Check whether the existing platform can already perform the task.
2. Check whether an existing dependency already provides the functionality.
3. Determine whether the package is necessary.
4. Explain why it is needed.

Do not add dependencies unnecessarily.

Avoid duplicate libraries that solve the same problem.

---

# 30. Development Workflow

Before modifying code:

1. Inspect the relevant files.
2. Understand the existing implementation.
3. Reuse existing utilities.
4. Make the smallest appropriate change.
5. Test the change.

Do not rewrite working authentication or authorization code without a specific reason.

Do not delete working functionality merely to simplify development.

Do not silently change architecture.

---

# 31. Testing

Every phase should include appropriate testing.

At minimum, when applicable:

```text
npm run lint
npm run build
```

For backend functionality:

* Test valid requests.
* Test missing authentication.
* Test invalid authentication.
* Test unauthorized roles.
* Test invalid input.
* Test duplicate data.
* Test edge cases.

For security-sensitive functionality:

* Test privilege escalation attempts.
* Test forged/tampered tokens.
* Test client-supplied roles.
* Test inactive accounts.
* Test unauthorized resource access.

Manual browser testing should be performed for important UI/authentication changes when possible.

---

# 32. Test Data

Use clearly identifiable test accounts and data.

Example:

```text
test.admin@example.com
test.teacher@example.com
test.parent@example.com
```

Do not put real passwords into:

* Source code
* Git
* README
* `.env.example`
* Console logs

Avoid printing passwords in command output.

Do not paste passwords or private keys into chat.

---

# 33. Git

Keep commits organized by meaningful development phase.

Examples:

```text
feat: complete phase 1 project foundation
feat: add firebase authentication
feat: add role based authorization
feat: add student management
feat: add RFID card management
```

Do not commit:

```text
.env
private keys
service account JSON files
password files
temporary credentials
```

Check Git status before committing.

---

# 34. Error Handling

Errors should be understandable to users.

Examples:

```text
Incorrect email or password.
You do not have permission to perform this action.
This student could not be found.
This RFID card is already assigned.
You’re offline — this action requires an internet connection.
Something went wrong. Please try again.
```

Do not show technical stack traces to normal users.

Server logs may contain appropriate technical details during development, but never log secrets.

---

# 35. Audit Logging

Important security-sensitive events should eventually be recorded in:

```text
auditLogs
```

Examples:

* Login/security events
* Role changes
* Account deactivation
* RFID assignment
* RFID reassignment
* Attendance anomalies
* OTP verification
* Dismissal verification
* Important administrative changes

Audit logging is planned for Phase 11 unless a current phase explicitly requires it.

Do not add complex audit infrastructure prematurely.

---

# 36. Attendance Data Model Rule

There should be one attendance record per:

```text
student + school date
```

The record can contain:

```text
studentId
schoolDate
timeIn
timeOut
status
createdAt
updatedAt
```

Do not create duplicate attendance records because of repeated RFID scans.

---

# 37. RFID Data Model Rule

RFID UID is a physical identifier.

Student ID is the school's logical student identifier.

Never assume they are interchangeable.

An RFID card can be:

```text
assigned
unassigned
inactive
```

When a card is replaced, preserve the student's identity and update the RFID assignment rather than changing the student's Student ID.

---

# 38. Parent Data Access Rule

A parent may only access authorized child records.

For every parent request involving a student:

1. Authenticate the parent.
2. Verify the parent-child relationship.
3. Only then return the requested data.

Never rely only on a frontend-selected student ID.

---

# 39. Future Phase Boundaries

Do not implement these prematurely:

### RFID

Do not implement physical reader communication before the RFID card data model is stable.

### Attendance

Do not implement full attendance processing before student and RFID relationships are ready.

### Performance

Do not introduce academic grading.

### SMS

Do not expose PhilSMS credentials.

### Dismissal

Do not treat Fetcher as an account role.

### Reports

Do not build complex reporting before the underlying attendance/performance data is stable.

### PWA

Do not add complicated offline synchronization.

---

# 40. Important Terminology

Use:

**Progressive Web Application (PWA)**

not simply:

**Website**

Use:

**UHF RFID**

not:

**LF RFID**

Use:

**Fetcher**

not:

**Guardian**

when referring to a person authorized to physically fetch the child.

Use:

**Performance Evaluation**

not:

**Grade Computation**

Use:

**Student Performance**

for descriptive observations and star ratings.

Use:

**Daily Attendance**

for daily attendance records.

---

# 41. Academic Scope Protection

The project is a capstone prototype for kindergarten attendance and performance monitoring.

Do not expand the scope without explicit approval.

Do not add:

* Payroll
* Billing
* Inventory
* Library management
* Full enrollment management
* Learning modules
* Online exams
* Advanced grading systems
* Teacher payroll
* General school administration modules

unless explicitly requested.

Keep the system aligned with the approved capstone scope.

---

# 42. Security Priority

When choosing between convenience and security:

Prefer the secure implementation.

Especially protect:

* Authentication
* Authorization
* Student records
* Parent/child relationships
* RFID identities
* Attendance records
* Fetcher information
* OTPs
* SMS credentials
* Firebase Admin credentials

Never weaken authentication or authorization simply to make a feature easier to implement.

---

# 43. Claude Code Behavior

Claude Code must:

* Inspect before modifying.
* Explain important architectural changes.
* Reuse existing code.
* Avoid unnecessary dependencies.
* Avoid unnecessary refactoring.
* Avoid scope creep.
* Keep security server-side.
* Test every phase.
* Stop after completing the requested phase.

If a requirement is ambiguous, do not invent a major architecture change.

Prefer the smallest solution consistent with this document.

If an architectural conflict is discovered, report it before making a major change.

---

# 44. Phase Completion Report

At the end of every phase, provide:

## 1. Files created

List every new file.

## 2. Files modified

List every modified file.

## 3. Files deleted

List any deleted files and explain why.

## 4. Packages

List packages added, removed, or updated.

## 5. Features implemented

Briefly describe what works.

## 6. Tests

List tests performed and results.

Example:

```text
Lint: PASS
Production build: PASS
Backend tests: 25 passed
Browser test: PASS
```

## 7. Known limitations

List anything not completed.

## 8. Security considerations

List any remaining security concerns.

## 9. Next phase

State the next planned phase only.

**Do not implement the next phase automatically.**

---

# 45. Current Instruction

The project currently has:

```text
Phase 1 — COMPLETE
Phase 2 — COMPLETE
Phase 3 — COMPLETE
Phase 4 — COMPLETE
Phase 5 — COMPLETE
Phase 6A — COMPLETE (attendance foundation + manual/mock RFID UID input)
Phase 6B — COMPLETE (WYUAN UHF60U, keyboard emulation; tested by the developer)
Phase 7 — COMPLETE (browser test passed)
Phase 8 — COMPLETE (SMS notifications, now IPROG SMS; tested by the developer; see §16)
Phase 9 — COMPLETE (Fetchers + dismissal OTP; see §18)
Phase 10 — COMPLETE (reports + dashboards; see summary below)
Phase 11 — COMPLETE (audit logs + hardening; browser test passed; see summary below)
Phase 12 — COMPLETE (PWA + offline; tested by the developer; see summary below)
Phase 13+ — NOT STARTED
```

Phase 8 summary (details in §16):

* PhilSMS token/sender ID live only in `server/.env` (`PHILSMS_API_TOKEN`, `PHILSMS_SENDER_ID`).
* Arrival/departure SMS are sent only after a committed time-in/time-out; SMS failure never
  affects attendance.
* Parent numbers: `users/{uid}.mobileNumber` (parents only, `+639XXXXXXXXX`, set by admins via
  `PATCH /api/admin/users/:uid/mobile-number`), deduplicated per event.
* Tests use `SMS_PROVIDER=mock` or a fake-fetch PhilSMS provider; no real SMS is sent.
* Known limitations: "sent" means accepted by PhilSMS (no delivery-report polling); SMS is sent
  synchronously during the scan request (bounded by a 10 s timeout); no automatic retry of
  failed SMS; notification records are not shown in a UI yet.

Current target: Phases 1-12 complete and tested (developer, 2026-10-24). Do not start Phase 13 until requested.
Version control: private GitHub repo https://github.com/raevnoe/little-einstein-attendance (branch main).

Phase 6B summary: the WYUAN UHF60U (USB `VID_FFFF&PID_0035`, no COM port) runs in keyboard-emulation
mode: it types the card UID and presses Enter. On the staff Attendance page (today),
`ReaderScanPanel` collects those keystrokes with `client/src/lib/rfidKeyboardScanner.js` (ignores
text fields, shortcuts and slow typing) and submits through `client/src/lib/attendanceScan.js`, the
same function the manual UID fallback uses -> `POST /api/attendance/scan` -> `processRfidScan()`.
Scan source (developer request, 2026-10-26): the screen sends an allow-listed `method` with each scan - "reader"
(ReaderScanPanel) or "manual" (ManualScanPanel; also when absent) - and the SERVER maps it (`SCAN_SOURCE_BY_METHOD`,
shared/src/attendance.js; `scanSourceFor` in routes/attendance.routes.js) to `entrySource`/`exitSource` =
`rfid-reader` | `manual-entry`; any other value -> 400 `validation/invalid-scan-method`, nothing recorded. It is
REPORTED BY THE SCREEN, not proof (the reader types like a keyboard) and changes no attendance rule. Records before this
keep `manual-test` (unknown source). Audit details carry `source` for time-in/out and rejected scans; the staff
Attendance list shows a "typed" mark beside manual-entry times; parents never see sources. Tests:
server/test/attendanceSource.test.js. One reader only; no entry/exit reader identification.
Do not add node-hid/serial/WinUSB or reverse-engineer the vendor HID interface unless requested.
Client unit tests: `npm test` (Node built-in test runner).

Phase 9 summary (details in §18): parents manage their own Fetchers and request a dismissal code
that is texted only to their own registered number; teachers/admins verify the code and then
separately confirm the release; admins view/deactivate Fetchers and browse dismissal records.
Known limitations: no audit-log entries yet (Phase 11); no release SMS to the parent; a 6-digit
code hash is only as strong as the short expiry + attempt limit (no server-side pepper);
staff error messages distinguish expired/locked/used codes (staff need this to act).

Phase 10 summary (Reports and Dashboard Improvements):

* API (read-only; `server/src/services/report.service.js`): `GET /api/reports/today`,
  `/api/reports/attendance?from&to&section&studentId`, `/api/reports/performance?from&to&section&studentId&area`
  (admin + teacher; `routes/reports.routes.js`) and `GET /api/admin/overview` (admin only).
  Unknown or repeated query parameters -> 400.
* Date range: YYYY-MM-DD school dates, default today, inclusive, max `MAX_REPORT_RANGE_DAYS` = 31
  (`shared/src/reports.js`); invalid, future or reversed ranges -> 400. Queries are single-field
  ranges on `schoolDate` / `evaluationDate` (no composite index needed).
* Attendance rules (developer decisions): NO absence totals across a range (no school calendar;
  weekends/holidays are never assumed). `noTimeIn` is given per day only, and is `null` on days
  with no attendance record in the whole school. `time-out-recorded` / `no-time-out-recorded` are
  DERIVED report statuses (never stored); "No time out recorded" is not proof of dismissal either way.
* Performance: star counts per area and the existing per-day Daily Average Star Rating only
  (hidden when an area filter is applied). No range averages, percentages or grades.
* Admin SMS counts: today's `notifications` sent/failed/skipped, read with
  `select('status', 'createdAt')`; counts only. Reports never return RFID UIDs, scan sources,
  parent IDs, phone numbers, SMS text, teacher IDs, or OTP data.
* Client: `Reports` tab for admin/teacher (`pages/ReportsPage.jsx`, `components/reports/`);
  dashboards show `TodaySummary` (+ `AdminOverview` for admins). CSV export is built in the browser
  (`client/src/lib/csv.js`; cells starting with = + - @ tab or CR get a leading apostrophe).
  Printing uses `print:` classes + `@media print` in `index.css` (no PDF library). Parent
  dashboard unchanged.
* Known limitations: report rosters use each student's CURRENT active status (no enrollment
  history). Rejected/unknown RFID scans are in the Phase 11 audit log, not in reports.

Phase 11 summary (Audit Logs and Security Hardening):

* `auditLogs/{autoId}` (model `server/src/models/auditLog.model.js`, events in `shared/src/audit.js`):
  eventType, category, outcome (success|failure|denied), occurredAt (server timestamp, exact),
  schoolDate (DATE only, for display), actor {type user|system|cli, uid, role} taken from the verified
  token + profile (`auditContext(req)`), target {type, id}, reason code, allow-listed `details`, route
  PATTERN. Never stored: passwords, tokens, headers, request bodies, OTPs/hashes/salts, SMS text,
  provider secrets, phone numbers, emails, birth dates, observation text, Fetcher names, IP, user agent.
  Free-text detail values that look like a phone number/email are redacted; IDs are kept.
* Write policy (developer decision, `services/audit.service.js`): `auditInTransaction(tx, event)` for
  every change that runs in a Firestore transaction - students, RFID cards, time-in/time-out, performance,
  Fetchers, dismissal request/verify/release, user profile changes, CLI user creation. Single-document
  writes were moved into small transactions for this. If the audit write fails, nothing commits.
  Firebase Auth steps (claims, disabled flag, sessions) cannot join a transaction: role change and
  reactivation undo the Auth step if the profile+audit transaction fails; deactivation audits the
  profile change first and records a separate `failure` entry + 502 if disabling sign-in then fails.
  `recordAudit()` (best effort, never throws, logs only the event type + error code) for: access denied
  in requireRole (forbidden / inactive / missing profile; 5-min suppression per user+reason+API area),
  parent ownership denials (another family's existing student/Fetcher; 5 min), rejected RFID scans
  (unknown/inactive/unassigned card, inactive student, scan after time-out; 10 min per card+outcome;
  debounced repeats not audited), dismissal refusals that change nothing, and the arrival/departure
  SMS outcome (counts only, actor system). Suppression is in memory, max 1000 keys. Forged/invalid
  tokens are not stored (no trustworthy actor). Failed password sign-ins are not observable by the server.
* Viewer: `GET /api/admin/audit-logs?from&to&category&eventType&outcome&actorUid&targetType&targetId&limit&cursor`
  (admin only; `services/auditQuery.service.js`). Default last 7 days, max 31; limit 1-100 (default 50);
  cursor = last document ID. One single-field range query on `occurredAt` (desc), other filters in memory,
  hard cap of 2000 documents read per request -> `scanLimitReached` + cursor (shown in the UI). No
  composite indexes. No update/delete route. Client: admin `Audit Log` tab (`pages/admin/AuditLogPage.jsx`).
* NOT tamper-proof: Firestore rules deny clients and the API cannot change entries, but anyone with the
  service account or Firebase console access can. No automatic deletion: the school must define retention.
* Hardening: `middleware/securityHeaders.js` (Cache-Control no-store, nosniff, no-referrer, X-Frame-Options
  DENY, CSP default-src 'none' on every API response); stack traces/internal messages only when NODE_ENV is
  explicitly development or test (`env.debugErrors`); start-up warning when NODE_ENV is unset or not
  production. Parent email/mobile number in `GET /api/students/:id` are admin-only (teachers get
  `hasMobileNumber`). Dev OTP helper unchanged and still unavailable in production.
* Dependencies: root `firebase` dependency removed (the client declares its own); `source-map-js`
  1.2.1 -> 1.2.2 (in range). Not fixable without breaking upgrades, left as is: `firebase` client ->
  @firebase/firestore -> @grpc/grpc-js (the client imports only firebase/app + firebase/auth, so that code
  is not bundled), and gaxios 6 / uuid 9 via firebase-admin -> @google-cloud/storage (no fixed 6.x/9.x).

Phase 12 summary (PWA and Offline Support; client only, no backend change, no new packages):

* Manifest `client/public/manifest.webmanifest` (standalone, start_url/scope `/`, theme `#2e3192`,
  background `#ffffff`); icons `client/public/icons/` (192, 512, maskable 512, apple-touch 180) +
  `client/public/favicon.png`, all generated from the OFFICIAL logo (see "UI redesign" below).
* Service worker: hand-written, no Workbox/vite-plugin-pwa. `client/vite-plugins/serviceWorker.js`
  (build only) writes `dist/sw.js` = SW_CONFIG + `src/sw/swPolicy.js` + `src/sw/serviceWorker.js`.
  SW_CONFIG = explicit precache allow-list (index.html, hashed JS/CSS, public/ manifest/icons/favicon;
  never .map, sw.js or other HTML), cache version = hash of those files, `VITE_API_BASE_URL`.
* Request policy (`classifyRequest`): default = not handled. Handled only: same-origin GET navigations
  (network first, cached index.html when the network fails) and precached files without a query string
  (cache first). Never handled: non-GET, any `Authorization` header, other origins (cross-origin API,
  Firebase Auth), `/api*` and `/__/*` always, and the same-origin path of `VITE_API_BASE_URL` (fails
  closed if that is the site root). No runtime `cache.put`, no queue, no background sync. Cache lookups
  use `ignoreVary` (hosts send `Vary: Origin`; Vite's crossorigin script/style requests carry Origin -
  found in the browser test). The server's `Cache-Control: no-store` headers are unchanged.
* Updates: install never calls skipWaiting; `lib/serviceWorkerRegistration.js` (registered from main.jsx
  only when `import.meta.env.PROD`, `updateViaCache: 'none'`, re-checked when the tab becomes visible)
  shows "A new version is available. [Reload]" (`components/ConnectionStatus.jsx`); Reload posts
  SKIP_WAITING and reloads once on controllerchange. Activate deletes only OLD `led-app-shell-*` caches.
* Offline: `lib/apiCore.js` (request logic moved out of apiClient.js, behaviour unchanged online) sends
  nothing while `navigator.onLine === false` and throws `ApiError(OFFLINE_MESSAGE, 0, 'network/offline')`;
  a fetch failure while offline gives the same message, otherwise "Cannot reach the server" as before.
  This covers every action, including the student/RFID forms that had no per-form check.
  `ConnectionStatus` (above every screen via App.jsx) shows an offline banner; nothing when online.
  `SignedInApp` reloads the account once on the `online` event, ONLY after a failed account load (an
  open dashboard/form is never reset).
* Tests (client `npm test`, 72): swPolicy, serviceWorker (real generated sw.js in a fake SW scope:
  precache = allow-list, API/auth/cross-origin/POST untouched, zero runtime puts, offline shell, Vary),
  serviceWorkerRegistration (prompt only for updates, no auto reload, reload once), apiClient (offline
  guard for all operations, no replay, online behaviour, claims-stale retry), manifest (fields + PNG sizes).
  Headless-Chrome check of `vite preview` (scratch script, not committed): 23/23 - SW active, manifest
  without installability errors, Cache Storage = 9 shell files only after API calls, API responses not
  from the SW, offline banner, no replay, offline shell with the server down, update prompt -> Reload ->
  new worker active + old cache deleted. Not done by Claude: signed-in role checks (needs passwords).
* Known limitations: `navigator.onLine === true` does not prove the API is reachable (then the existing
  "Cannot reach the server" message is shown); signed-in users who open the app offline see the offline
  message until the connection returns (Firebase keeps the session; data is never shown from cache);
  hosting must serve `sw.js` and `index.html` without long HTTP caching (Phase 14).

UI redesign status: COMPLETE - Stages 1-5 browser-tested and approved by the developer. The Phase 12 browser
test with signed-in roles is still pending (not yet confirmed by the developer).

UI redesign (requested by the developer before the Phase 12 browser test; visual only - no backend,
auth, scanner, service-worker, API or data changes; no new packages). Staged; STOP after each approved stage.

* Stage 1 DONE - branding + design system:
  * Official logo `client/brand/official-logo.png` (5232x4702 RGBA, transparent; NOT shipped, never edited).
    `client/scripts/generate-icons.mjs` (headless Chrome, `object-fit: contain`, so never cropped/stretched/
    recoloured) writes `client/src/assets/school-logo.png` (640x575, in-app), `public/favicon.png` (64),
    `public/icons/*` (white squares; maskable logo at 58% width = inside the safe circle). The placeholder
    book-and-star icon, `favicon.svg` and `client/icons-src/` were removed.
  * Colour tokens in `client/src/index.css` are SAMPLED logo pixels, not official codes: navy #2e3192
    (brand-600), purple #662d91 (grape-500), yellow #f9ed32 (sun-400), green #39b54a (leaf-400), cyan
    #00aeef (sky-500), light blue #77cff2 (sky-300). Existing token names kept (brand, leaf, mist, star,
    paper=#ffffff) so every class still works; `canvas`, `sky`, `sun`, `grape` added. `sky-50/100/300/500/700`
    override Tailwind's defaults (older screens' sky-700 hovers/sky-500 borders now use the logo cyan).
    Text contrast documented in index.css; pure logo green/cyan/yellow/light blue are fills only.
  * System font stack for all text (Stage 5 added one bundled script font for short headings only). Reusable UI in `client/src/components/ui/`: classes.js (buttonClass,
    inputClass, LABEL, CARD, TABLE/TH/TD/TR, FOCUS_RING), Button, Field (label/hint/error + aria), Card/
    CardHeader, PageHeader, Badge, Alert, LoadingState/EmptyState, InlineConfirm, ResponsiveTable,
    BrandStripe (logo orbit colours), icons.jsx (inline SVG icons, aria-hidden).
* Stage 2 DONE - shell + shared states + signed-out pages:
  * `AppShell` `layout="sidebar"` (Admin/Teacher: left sidebar from 1024px with logo, icon nav, user + sign
    out; below that a compact header + scrollable pill nav) or `layout="top"` (Parent, every size). Nav
    items gained `icon`; `aria-label="Sections"`, `aria-current`, `onNavigate`, section keys, `key={visit}`
    remounts and print hiding unchanged. Dashboards changed only their NAV icons + layout prop.
  * `SchoolMark`/`SchoolLogo` use the real logo (SchoolLogoIcon removed). `SystemScreen` for loading /
    account error (Retry + Sign out) / config error / AccessDeniedPage. Panel/ErrorMessage/QuietButton keep
    their APIs with new styling. ConnectionStatus restyled; its texts, roles and Reload behaviour unchanged.
  * Landing (same copy + sections/anchors; added a "Safe Dismissal" feature card describing the existing
    Phase 9 flow) and Login (same sign-in logic; added a show/hide password toggle).
* Stage 2 browser-tested and approved by the developer.
* Stage 3 DONE (pending developer browser test) - staff work screens, markup only:
  * Attendance: ReaderScanPanel is a large status card (same texts, role="status", Resume button, pause
    reasons, recent scans aria-live); ManualScanPanel is a collapsible card, COLLAPSED by default, content kept
    mounted with `hidden` (typed UID/result survive; the field cannot hold focus while collapsed). Summary
    tiles show the API's `summary` counts only. Table on >=640px, one card per student on phones (table
    still prints). ScanResultMessage got icons. No scanner/scan-submission code changed.
  * Performance: segmented tabs (same role="tab"/aria-selected); student + date in a card; student header
    with the Daily Average Star Rating; one card per area (`<li>`, same remount keys); StarInput = 44px
    SVG stars, same radiogroup/radio/aria-checked, plus a visible "N of 5" text. StarDisplay unchanged.
  * Dismissal (staff): cards with a step indicator (Verify code -> Confirm handover -> Released, from the
    status only), larger code field (still autoComplete="off", same sanitising), release confirmation via
    InlineConfirm (same two steps, "Yes, child released"). DismissalStatusBadge now uses Badge; its
    PRIMARY_BUTTON/DANGER_BUTTON/INPUT exports are unchanged for the stage 4-5 screens still using them.
* Stage 3 browser-tested and approved by the developer.
* Stage 4 DONE - management screens, markup only:
  * Students: list = toolbar + table (>=640px) / cards (phones); detail = header + Profile / RFID Card /
    Parent Accounts sections, deactivate via InlineConfirm (same text and flow), ParentMobileNumber restyled
    (same save/remove/offline logic, same key reset); form = grouped sections with the shared Field
    (hint still hidden while a field shows an error; same IDs, disabled fieldset while saving).
  * RFID Cards: list as Students; UID shown as `UID_CHIP` (ui/classes.js); detail keeps run()/actions;
    unassign + deactivate use InlineConfirm, assign/reassign keep the StudentPicker + Confirm step.
  * Fetchers (admin): cards with "May collect" chips (invalid ones flagged), deactivate via InlineConfirm,
    filters got real ids/labels (`fetcher-search`, `fetcher-status`).
  * Audit Log: same filters/date validation/cursor "Load more"/scan-limit notice; Badge outcomes; entries as
    bordered rows. StatusBadge and RfidStatusBadge now use Badge (same labels).
* Stage 4 browser-tested and approved by the developer.
* Stage 5 DONE - school-website visual style, parent screens, dashboards,
  reports + print, consistency pass. Markup/CSS only: same API paths, payloads, state, keys, confirmations,
  offline guards; no backend, auth, scanner or service-worker change; no new npm packages.
  * Font: Caveat Bold, OFL 1.1, from @fontsource/caveat 5.3.0 (latin subset) copied ONCE into
    `client/src/assets/fonts/caveat-latin-700.woff2` + `Caveat-OFL.txt`; `@font-face` + `--font-script`
    (`font-script` class) in index.css. Bundled as a hashed asset, so the existing precache allow-list
    (.woff2 already allowed) caches it - shell is now 11 files. Use it ONLY for short headings/phrases;
    every script heading has `print:font-sans` (printed reports stay plain).
  * `ui/Decor.jsx`: Sparkle, StarShape, Squiggle (wavy underline), ScriptHeading, HeroBanner (navy hero with
    logo-colour circles/ring/sparkles, script h1, print:hidden; home screens only), InitialsAvatar.
    CardHeader/Panel gained `script` + `accent` props (default off, so older callers are unchanged).
    AppShell's page h1 is script + squiggle. icons.jsx: ArrowRightIcon, PrinterIcon.
  * Parent: HeroBanner greeting (logo on a white disc, child chips inside the hero, same aria-pressed);
    Today card = status banner (same role="status" text) + Arrival / Departure cards (Time In / Time Out,
    "Not recorded yet" when empty); history = timeline; performance = day cards, observations labelled
    "Teacher's observation". Dismissal: 3-step "how it works", per-child card showing only fields the API
    already returns (code requested/expires/released, codes sent today, status hint); cooldown/daily limit
    are server constants and are shown only through the server's error message. Fetcher deactivation uses
    InlineConfirm (same text, two steps). FetcherForm uses the shared Field. DevOtpPeek unchanged (DEV only).
  * Dashboards: `StaffWelcome` hero (h1; the home tab passes no AppShell title) with quick actions that only
    call the existing `navigate(key)` for Attendance/Performance/Dismissal (in both roles' NAV). TodaySummary/
    AdminOverview: same endpoints and numbers, grouped with icons. StatCard: same props, accent bar.
  * Reports: segmented tabs, shared input/label classes for filters (same ids/presets/handlers), card header
    with script title (print: logo + plain title + rule), CSV/Print buttons with icons (same CSV code), info
    notes as Alert, tables with TH styling. Table scrollers (+ ResponsiveTable) are `relative` so sr-only
    labels cannot widen the page (pre-existing 463px overflow on phones).
  * Consistency: Landing section h2s + Login h1 in script; unused PRIMARY_BUTTON/DANGER_BUTTON/INPUT exports
    removed from DismissalStatusBadge.jsx.
  * Checked by Claude: lint, 72 client + 154 server tests, build, Phase 12 headless check 23/23, and a scratch
    preview harness (real components, mocked apiClient/useAuth; not committed) at 390/768/1280 px for every
    screen (no horizontal overflow) + print-media emulation of both reports. NOT done: signed-in browser test.
* Stage 5 browser-tested and approved by the developer. The UI redesign (Stages 1-5) is complete.

Post-redesign UX fixes (client only; PENDING developer browser test):

* Mobile bottom navigation: `AppShell` `BottomNav` (sidebar layout only, below 640px; the pill row is hidden there
  for that layout, unchanged 640-1023px, sidebar unchanged from 1024px, parent layout unchanged). First 4 nav items
  (`BOTTOM_NAV_SLOTS`) + "More" (disclosure, `aria-expanded`; closes on select / Escape / tap outside; stays
  highlighted while a More section is open). Same `onNavigate`. `<main>` gets bottom padding on phones; print hidden.
* Parent uses the same `BottomNav` below 640px (any layout with `nav`): 2 equal slots (Daily Records | Fetchers &
  Dismissal), no More; columns = slot count (`BOTTOM_NAV_COLUMNS`). Parent pill row unchanged from 640px.
* RFID scan feedback: `ScanFeedbackCard` (large card for the newest reader scan, inside one always-mounted
  `role="status"` region; Recent scans list kept, no longer aria-live). Text from `lib/scanFeedback.js`
  (`describeScanResult`), which only reads the existing scan response: `submitAttendanceScan` now also returns
  `studentName`, `attendance` {timeIn,timeOut} and `offline` (existing fields unchanged). Success / already-recorded
  cards clear after 5 s; warnings/errors stay until the next scan or Dismiss. Times use the attendance list's
  `timeZone`. No scanner, debounce, API, SMS or backend change. Manual UID panel unchanged.

Admin account management (added on developer request after the Phase 12 implementation; PENDING developer browser test):

* API (admin only, `routes/admin.routes.js`): `GET /api/admin/users` (every account, `toPublicUser`, sorted by
  name) and `POST /api/admin/users` `{ email, firstName, lastName, role, mobileNumber? }` -> 201. Any other body
  field (uid, active, password, claims...) -> 400. Field errors in `details.fields`; duplicate email -> 409.
* `createAccount()` in `services/userAccount.service.js` (also used by `npm run user:create`, actor cli):
  Firebase Auth user with a 32-byte random password that is never returned, logged or stored -> role claim ->
  profile + `user.created` audit entry in one transaction; any failure after the Auth user exists deletes it.
* Password: the admin's browser calls Firebase `sendPasswordResetEmail` (`client/src/lib/passwordSetupEmail.js`)
  right after creation; the person sets their own password from that link. A failed email does not undo the
  account; "Send password setup email" on the account resends it. Email text = Firebase's Password reset template.
* Client: admin `Accounts` tab (`pages/admin/AccountsPage.jsx`): search/role/status filters, Add account form,
  per account: parent mobile number (existing `ParentMobileNumber`), send setup email, change role, deactivate /
  reactivate (InlineConfirm; existing endpoints and self-lockout rule). No delete (accounts are deactivated).
* Tests: `server/test/accounts.test.js` (fake Auth now supports createUser/deleteUser).

RFID card registration with the reader (added on developer request; PENDING developer physical reader test):

* `POST /api/rfid-cards` accepts an optional `studentId`: the card is registered AND assigned in ONE transaction
  (same checks as assign: student exists, active, has no card; both `rfid.card.registered` and `rfid.card.assigned`
  audited). Without `studentId` the behaviour is unchanged (unassigned card). Tests: `server/test/rfidRegistration.test.js`.
* Client: RFID Cards -> "Register Cards" opens `components/rfid/RfidCardRegister.jsx` (replaces the deleted
  `RfidCardForm.jsx`). It listens with the existing `createKeyboardScanBuffer` (same pause rule as the Attendance
  reader), looks the card up (`GET /api/rfid-cards/:uid`; 404 = new), shows "already registered" + Open card for known
  cards, and for new cards the existing `StudentPicker` (optional) + Register button. A person always confirms.
* UHF safety (`lib/rfidRegistration.js`, `classifyRegistrationScan`, client tests `test/rfidRegistration.test.js`):
  the same card read again is ignored; a DIFFERENT card while one is on screen -> "More than one card detected",
  nothing saved, Start over; the card just registered is ignored until another card is scanned. Typing the UID
  remains as a fallback ("Reader not available? Type the UID instead").
* Known limitation: while the student search box is focused, scanning pauses (reader keystrokes would go into it).

Pictures (developer request; visual only, PENDING developer browser review):

* `client/src/assets/images/` (WebP, converted once in headless Chrome so the existing precache allow-list caches
  them; .jpg is not precached): `classroom.webp` (landing hero `HeroPhoto`, replaces `HeroIllustration`, which is
  now unused but kept), `teamwork-hands.webp` (landing About card, decorative alt=""), `doodles-grid.webp`
  (grayscale + low opacity via `DoodleBackdrop` on the landing Features section and the Login brand panel),
  `doodles-dashed.webp` (pre-converted to WHITE lines on transparent; faint layer inside every `HeroBanner`).
* `DoodleBackdrop` (`ui/Decor.jsx`, tone light|dark) is decorative, aria-hidden and print:hidden.
* The source pictures look like stock/AI images supplied by the developer: confirm the licence before deployment,
  and prefer real school photos (with parental consent) for the final version.

Deployment preparation (developer request, ahead of Phase 14; NOT yet deployed/verified by the developer):

* Cause of "Your account could not be loaded / null is not an object (evaluating 'e.profile')" on Firebase Hosting:
  no backend was deployed, and the `**` rewrite answered `/api/auth/me` with index.html. `lib/apiCore.js` now
  rejects any non-JSON/non-object success body as "Cannot reach the server" (tests in `client/test/apiClient.test.js`).
* Hosting (developer decision: must be FREE, no credit card): PWA on Firebase Hosting (Spark), API on Vercel Hobby as one
  serverless function: `api/index.mjs` (default export = createApp()), `vercel.json` (install = npm ci --omit=dev
  -w server, empty static output `vercel-static`, region sin1 next to Firestore asia-southeast1, /api/(.*) -> /api,
  maxDuration 30), `.vercelignore` (NOT a git repo: this list keeps .env files/keys out of the upload). Client calls
  the API cross-origin: `client/.env.production` VITE_API_BASE_URL=https://<project>.vercel.app/api; CLIENT_ORIGIN on
  Vercel = the Hosting domains. Firebase credentials = service account env vars on Vercel. `firebase.json`: SPA
  rewrite + Cache-Control no-cache. The audit-suppression memory is per serverless instance (occasional duplicate
  denied/rejected-scan entries). A Cloud Run variant was prepared and then removed. Steps in `DEPLOYMENT.md`.
* Dependency pin (first Vercel deploy crashed with ERR_REQUIRE_ESM): firebase-admin 14 -> jwks-rsa 4.1.0 does
  `require('jose')` and jose 6 is ESM-only; Node's require(esm) hides this locally, Vercel's runtime loader does not.
  Root `package.json` `overrides: { "jwks-rsa": "3.2.2" }` (jose 4.15.9, lru-memoizer 2.3.0 + nested lru-cache 6 /
  yallist 4). npm 11 would not re-resolve the existing lock, so those lock entries were copied from a fresh
  resolution of the same override. `npm ls` reports jwks-rsa "invalid" (firebase-admin asks ^4.0.1) - expected.
  firebase-admin only uses jwks({ jwksUri, cache, requestAgent }), getSigningKeys(), getPublicKey() (same in 3.x).
  Checked with `node --no-experimental-require-module`: app loads, forged token -> 401, real JWKS keys fetched.
  Remove the override when jwks-rsa/firebase-admin no longer require() an ESM-only jose.

Sign-out confirmation (developer request; PENDING developer browser test): `components/SignOutButton.jsx` asks
"Sign out?" in a native modal `<dialog>` (Cancel focused, Escape / click outside cancel, cannot be cancelled while
signing out). `confirm={false}` on the account-error screen (App.jsx) and AccessDeniedPage, where signing out is the
only way forward. Same `logout()`; no auth change.
Student form parent list (developer request): `StudentForm` shows only ACTIVE parent accounts, plus inactive ones
already linked to that student (still labelled "inactive" so the link can be removed). Client only; the server's
parent validation is unchanged.

Live updates + notification sounds (developer request; PENDING developer browser test). Client only, no new packages:
* Polling (no WebSockets: the API is serverless; no client Firestore listeners: section 5). `lib/poller.js`
  (`createPoller`, `browserIsIdle`; tests `client/test/poller.test.js`): skips while the tab is hidden or offline, never
  overlaps, `resume()` on visibilitychange/online only if the data is one interval old. `useApiData(path, { refreshMs })`
  refreshes in the background WITHOUT a loading state (open forms are not reset) and returns `updatedAt`.
* Screens: staff Dismissal today 15 s (`DISMISSAL_REFRESH_MS`); parent Today/history 60 s (`PARENT_REFRESH_MS`);
  Attendance today 30 s -> 60 s and paused when idle. Others are manual (Refresh). `components/UpdatedNote.jsx`.
  Firestore free quota (50k reads/day) is the reason for these intervals - the Attendance list reads every student.
* Sounds: `lib/sounds.js` (Web Audio tones: success, error, arrival, departure, alert; unlocked on the first
  click/key via `installAudioUnlock()` in main.jsx; on/off per device in localStorage `led.sound`, default on).
  `components/SoundToggle.jsx` next to Sign out in AppShell. Played: reader scan result (`soundForScan` in
  scanFeedback.js: success / error / none for repeats), a NEW awaiting-verification dismissal request on refresh
  (+ aria-live announcement), and the parent's child time in / time out appearing on refresh. Never on first load.
* Volume raised after the developer's browser test (tones were too quiet): gains about doubled (+6 dB), notes
  slightly longer, all tones routed through one soft limiter (DynamicsCompressor) so overlaps do not distort.
* Developer test (2026-10-24): reader attendance, reader card registration, real SMS, Phase 12 signed-in roles,
  admin accounts, live updates/sounds/sign-out/bottom nav/scan card, and the deployment reported as tested by the
  developer; only finding = sounds too quiet (fixed above, re-check pending). Phase 13/14 not started.
* Checked: 100 client tests; headless Chrome harness 12/12 (new request appears + 1 alert, typed code kept, no repeat,
  parent arrival appears + sound, hidden tab sends no requests). A hidden tab / locked phone does not poll or play.
* More sounds (developer request, 2026-10-24): `welcome` after a successful sign-in from the Login form only (a session
  restored on page load is silent); `success`/`error` when saving a Performance Evaluation (AreaEvaluationRow); `update`
  when a REFRESH BUTTON brings changed data (`lib/refreshSound.js`: JSON snapshot taken on press, compared on arrival;
  `useApiData().refresh()` vs silent `reload()`; AttendancePage has its own). Never for automatic refreshes or the first
  load. A screen's specific sound wins (Dismissal alert, parent arrival): `playSound(name, { skipIfRecentMs })`.

In-app notifications - the bell (developer request, 2026-10-24; PENDING developer browser test):

* Storage (developer decision: save when the event happens, NOT rebuilt from existing records - quota): subcollection
  `users/{uid}/inbox/{deterministic id}` (`COLLECTIONS.USER_INBOX`; model `server/src/models/inbox.model.js`): kind,
  audience parent|staff|admin, title, body, link (section key), studentId (parent items), notifiedAt, createdAt.
  `users/{uid}.notificationsSeenAt` = seen marker (not audited: a reading marker, not an account change). No cleanup:
  items stay (the bell shows the newest 30). Firestore rules already deny clients everywhere.
* Writers (`services/inbox.service.js`), all AFTER the commit and best effort (never fail/undo the action, log only kind
  + error code): arrival/departure -> active linked parents; Performance Evaluation saved -> one item per child per day
  listing areas (no stars/observation); dismissal code sent / code SMS failed -> requesting parent (never the code);
  request waiting (only when the SMS was accepted) and code locked -> all active teachers+admins (names the Fetcher, as the
  Dismissal screen does); released -> active linked parents; rejected scan (unknown/inactive/unassigned card, inactive
  student; NOT scan-after-time-out) -> admins, only when the audit entry was written (10-min suppression) and once per
  card+reason+day; arrival/departure SMS failed/skipped -> admins, one running daily count.
* API (`routes/notifications.routes.js`, admin/teacher/parent, own inbox only - uid/role from the token):
  `GET /api/notifications?after=<ISO>` (newest first, max 30; with `after` only newer = usually 1 read) and
  `POST /api/notifications/seen { upTo }` (moves forward only, never past now). No create/update/delete route. Shown only
  for the CURRENT role's audiences, parent items only while the child is still linked + active. ISO times are FLOORED to
  the millisecond (`isoFloor`; Timestamp.toDate() rounds) and `after`/`upTo` mean the end of that millisecond.
* Client: `useNotifications` (one instance in AppShell; staff 30 s, parent 60 s; poller.js rules) + `NotificationBell`
  (header on phones/tablets, beside the logo in the desktop sidebar). Opening marks everything shown as seen; unread items
  stay highlighted while open; an item opens its section if the account has it. New unread items play `notify` (skipped if
  another sound played within 2 s) and are announced (aria-live). `lib/notificationFeed.js` = pure helpers (tested).
* Layout: on phones (<640px) the sound button moved to the "signed in as" line so the top row fits 320-360px screens.
  `buttonClass({ size: 'icon' })` added; the compact SoundToggle used `w-11 px-0`, where px-4 won and squeezed the icon to
  10px (pre-existing) - both icon buttons now use size icon.
* Tests: `server/test/notifications.test.js` (13; the fake Firestore now supports subcollections), client
  `test/notificationFeed.test.js` + `test/refreshSound.test.js`. Scratch harness (real AppShell/bell, mocked API, not
  committed): no horizontal overflow at 320/360/390 px; panel at 360/768/1280; open -> POST seen + badge cleared; item ->
  its section. NOT done by Claude: signed-in browser test against the deployed API.
* Known limitations: polling (30-60 s), not instant; nothing when the app is closed (that would be Web Push); inbox items
  are never deleted (the school may add a cleanup rule later).
* Fix (2026-10-24): selecting a parent item now opens the exact place. The bell calls `onNavigate(link, item)`;
  ParentDashboard selects `item.studentId` and sets `focus` { n, target today|performance, date }: arrival/departure
  scroll to Today, performance opens ChildPerformance on that day (`initialDate`, remounted per tap) and scrolls once it
  has loaded (`onLoaded`). Performance items now store `date` (exposed in the view); older ones get it from their ID
  (`itemDate` in notificationFeed.js). Sidebar `lg:z-40` so the bell panel is above page content (it was behind the
  dashboard hero: the sticky aside had no z-index).

Form/UX updates (developer request, 2026-10-24; PENDING developer browser test). Client + shared constants only, no API change:

* Fetcher relationship = dropdown `FETCHER_RELATIONSHIPS` (shared/src/dismissal.js; Mother/Father deliberately excluded
  - they are the parents) + "Other (type it)". The server still accepts any valid text; stored values not in the list
  open as Other with the text filled in.
* Performance Evaluation: `STAR_RATING_LABELS` (1 Needs support, 2 Developing, 3 Good, 4 Very good, 5 Excellent;
  shared/src/performance.js) next to StarInput and single-area StarDisplay (`showLabel`: parent view, All Records,
  performance report; never for averages). Quick-phrase chips (`OBSERVATION_PHRASES` positive/support) toggle a sentence
  in the observation (`lib/observationPhrases.js`, tested); the note stays free text. "Save all changes (n)" on
  DailyEvaluation saves every changed area that has a rating, one request each (`lib/performanceEvaluation.js`
  saveAreaEvaluation, also used by the per-area button), one sound at the end; unrated changed areas are reported and kept
  as drafts. Rows report drafts via `onDraftChange`; "Unsaved changes" badge. Landing copy made role-neutral ("For
  parents, teachers & school staff", "Login"). Phone header `relative` so the bell panel is above page content.

Page addresses (developer request, 2026-10-24; PENDING developer browser test). Client only, no new packages:

* `/` landing, `/login`, `/admin-dashboard`, `/teacher-dashboard`, `/parent-dashboard` + one section part:
  attendance, performance, dismissal, reports, students, rfid-cards (staff), fetchers, accounts, audit-log (admin),
  fetchers (parent "Fetchers & Dismissal"). Section keys inside the dashboards are unchanged (`rfid`, `audit`,
  `records`...); routes.js maps them. Addresses carry sections only - never Student IDs, UIDs or the selected child.
* Rules (`resolveRoute`): signed in -> always the account's OWN dashboard (another role's / unknown / "/" / "/login"
  address is replaced, no extra Back step); signed out -> a dashboard address shows /login and that section opens after
  signing in (`returnTo`, memory only, own role only); unknown -> "/". Intentional sign-out (`beginSignOut` in
  SignOutButton) -> "/". Case and trailing slash are ignored. UX only: the API still checks the verified role.
* Dashboards get `section` + `onSectionChange` from App.jsx (admin/teacher keep the `visit` remount on every tab
  click). Back/Forward/refresh/bookmarks work; Firebase Hosting's `**` rewrite and the SW navigation fallback already
  serve index.html for any address (asset links are absolute).
* Checked: client tests (routes.test.js), scratch App harness in headless Chrome (real App, mocked auth/API; not
  committed): 18 scenarios (role redirect, nav -> address, Back/Forward, reload keeps section, unknown section, signed-out
  -> /login -> back to section after sign-in, sign out -> /, landing Log in, parent performance notification selects the
  child, opens the day and scrolls - smooth scrolling is not animated in headless Chrome, checked with reduced motion).
