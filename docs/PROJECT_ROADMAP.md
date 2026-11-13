# ArcTester — Development Roadmap & Progress Tracker

Last updated: 2026-11-13 (stabilization branch)
Tracking rule: **Update this file in every development commit.** A task is only marked complete after implementation, relevant tests, and CI verification. Do not mark a feature complete based only on a previous status message.

## Project delivery order

1. Complete and verify the existing web application.
2. Resolve the backend/frontend audit findings and PostgreSQL migration readiness.
3. Implement the six approved feature groups below.
4. Finish web QA and deployment verification.
5. Start cross-platform/mobile work only after the web application is stable.

## Current verified status

- [ ] Existing feature set fully re-audited end-to-end.
- [ ] All existing features confirmed working.
- [ ] All known backend and frontend bugs fixed.
- [x] PostgreSQL migration completed and tested in CI, including the partial unique index and a real SQLite-to-PostgreSQL data-copy integration test.
- [x] Stabilization branch CI passed on commit `33316c8` (run `42539952910`): API 36 test files / 289 tests; web 22 test files / 82 tests; lint and production builds; mobile typecheck; TensorFlow dataset checks; SQLite-to-PostgreSQL migration utility tests.
- [x] PR #19 CI passed: Playwright E2E tests (student practice flow and formal exam flow) added to CI workflow.
- [ ] Full feature-by-feature end-to-end QA and deployment verification.
- [x] Server-side logout revocation and frontend failure handling verified in CI.

**Important:** The PostgreSQL migration is now implemented and CI-tested. Existing SQLite schema and migrations are preserved in `api/prisma-sqlite/`; a read-only-source data migration utility is available at `scripts/migrate_sqlite_to_postgres.py`. The application has not yet been deployed to Render or Vercel, and the existing feature set still needs a systematic end-to-end QA pass before it can be called complete.

## Existing feature areas to re-verify

The following areas were previously reported as implemented. Treat them as **implemented-but-not-reverified** until the current code and tests confirm them.

- [ ] Authentication, invitations, roles, device/theme preferences.
- [ ] Admin dashboard, statistics, and analytics.
- [ ] Question bank CRUD, subject/topic/difficulty metadata, answer explanations.
- [ ] Question imports (CSV/JSON, paste, Excel paths) and validation/duplicate reporting.
- [ ] Exam creation, question selection, subject quotas, optional topic filters, marks and negative marking.
- [ ] Draft/publish workflow, published exam catalogue, assignment and availability windows.
- [ ] Student practice builder: subject-first selection; optional topic filters per subject; question count and difficulty.
- [ ] Mock tests, custom practice, revise-mistakes workflows.
- [ ] Exam attempt flow, timer, autosubmit, answer persistence/recovery, review and explanations.
- [ ] Assigned exam flow and session/invigilation controls.
- [ ] Announcements with expiry and read tracking.
- [ ] Student performance and subject analytics.
- [ ] Dark mode/theme and responsive UI.

## Audit and reliability backlog

### Critical / deployment blockers

- [x] Replace SQLite-specific raw analytics SQL for PostgreSQL (quoted identifiers, Boolean expressions, numeric result handling, and deterministic history pagination). Verified by the PostgreSQL-backed analytics/API test suite.
- [x] Create a PostgreSQL-compatible Prisma migration baseline and safe SQLite-to-PostgreSQL data migration utility; preserve IDs, relations, and serial sequences. Legacy SQLite schema/migrations are retained in `api/prisma-sqlite/`.
- [ ] Complete production browser verification of cross-site authentication. Code supports `COOKIE_SAME_SITE=None; Secure` and validates Origin for cookie-authenticated mutations. A Vercel + Render deployment guide is now in README; exact service domains and environment variables still need to be confirmed in the user's provider dashboards.
- [ ] Resolve the dual frontend structure: package scripts currently run Vite (`web/src/main.tsx`), while a separate Next.js `web/app` tree and `next` dependency also exist. Decide which is canonical from deployment/configuration evidence before removing or migrating anything.

### High priority correctness and reliability

- [x] Fix and regression-test the assigned-exam deadline / heartbeat / autosubmit race. Deadline heartbeat errors no longer pause the timer and suppress auto-submit.
- [x] Make candidate/invigilation session state changes and audit-event writes atomic, with conditional updates and idempotent repeated pause handling.
- [x] Handle foreign-key conflicts during bulk question deletion with HTTP 409 and a regression test.
- [x] Prevent learner-level train/test leakage in registered training: real-anonymized samples require keyed pseudonymous group IDs, at least five learner groups, and a meaningful held-out sample; grouped holdout tests pass.
- [ ] Move long-running TensorFlow training out of normal HTTP request handling or otherwise prove it safely fits host limits.
- [x] Make logout invalidate all previously issued cookie and bearer JWTs by incrementing the user's `sessionVersion`; replay-after-logout is covered by API regression tests. The Vite UI now waits for server confirmation and preserves the signed-in state if revocation fails.
- [ ] Implement per-device session revocation and audit device registry semantics and rate limiting.
- [x] Serialize one-time administrator bootstrap with `pg_try_advisory_xact_lock`; concurrent bootstrap regression passed in CI run `42542180790`.
- [ ] Audit route validation, pagination bounds, import limits, and error responses.
- [x] Verify invalid exam submissions are rejected before session reconciliation; invalid offline answer regression passed CI run `42543841320`.
- [ ] Keep offline session reconciliation atomic with submission creation; a reused attempt UUID regression verifies rejected offline submissions leave no session, pending CI.
- [ ] Verify answer autosave/recovery behavior, including refresh, reconnect, multiple tabs, and deadline boundaries.
- [ ] Align assignment deadline boundaries across package, start, autosave, heartbeat, and submission review classification; regression coverage added, awaiting CI.
- [x] Verify reconnect cannot reactivate a session changed concurrently by an invigilator; conditional reconnect update and interrupted-session regression passed CI run `42544630276`.
- [x] Verify conditional answer writes cannot commit after a concurrent invigilator pause/termination; paused-session regression passed CI run `42544206972`.
- [ ] Verify heartbeat updates cannot write activity/counters after a concurrent invigilator pause/termination; paused-session heartbeat regression added, awaiting CI.
- [ ] Preserve elapsed paused duration when an invigilator terminates a paused session; regression test added. CI run `42546652750` exposed fixture leakage into global student/assignment totals; the test now deletes its dedicated student fixture, and CI rerun is pending.

### Frontend quality

- [ ] Re-test every student and admin navigation path, modal, tab, form, and responsive layout.
- [x] Add a top-level React error boundary and safe browser-storage handling to the active Vite application.
- [ ] Refactor the large App component incrementally without replacing or regressing the existing UI.
- [x] Add regression tests for confirmed fixes in this stabilization pass (deadline heartbeat, blocked storage, error boundary, concept-search loading timing, and student tab switching during a live mock test). Continue adding tests as the broader UI audit finds issues. The active Vite app now has 8 direct component tests; the remaining Next.js page tests are retained separately because that tree is not part of the current Vite production build.

## Six approved feature groups

All six groups below are approved in scope. Each group remains pending until its acceptance checks and tests pass.

### 1. Classes and student groups

- [ ] Create and manage classes/batches.
- [ ] Add, remove, and bulk-assign students to groups.
- [ ] Assign exams to a class/group.
- [ ] Show group-level performance reports.
- [ ] Enforce appropriate admin/teacher permissions and test edge cases.

### 2. Advanced exam configuration

- [ ] Support multiple exam sections.
- [ ] Configure section-specific question counts/quotas and marks.
- [ ] Support section-specific negative marking.
- [ ] Add optional section timers.
- [ ] Configure pass marks/criteria.
- [ ] Configure attempt limits.
- [ ] Configure result visibility/release policies.
- [ ] Preserve existing subject-first exam creation and optional topic filtering.

### 3. Student toolkit

- [ ] Bookmark questions.
- [ ] Add personal notes to questions.
- [ ] Create and manage revision lists.
- [ ] Report incorrect/ambiguous questions to admins.
- [ ] Use bookmarks and revision lists in practice workflows.

### 4. Study planner

- [ ] Set daily and weekly study goals.
- [ ] Provide a study calendar/planner.
- [ ] Track completed study tasks.
- [ ] Show study streaks and progress.
- [ ] Add useful reminders/notifications without intrusive behavior.

### 5. Account management

- [ ] Change password securely.
- [ ] View and manage active devices/sessions.
- [ ] Revoke sessions/devices.
- [ ] Manage profile details.
- [ ] Manage notification preferences.
- [ ] Ensure logout and revocation invalidate server-side sessions.

### 6. Data management

- [ ] Support multi-sheet Excel imports.
- [ ] Provide column mapping.
- [ ] Maintain import history and validation reports.
- [ ] Provide safe rollback/undo for supported imports.
- [ ] Export questions and exam data.
- [ ] Implement verified backup and restore workflows.

## Definition of done

A task can be checked off only when:
1. The implementation exists in the repository.
2. Relevant automated tests pass.
3. Existing behavior has regression coverage where applicable.
4. Build/type-check/lint checks pass where configured.
5. GitHub Actions for the commit complete successfully.
6. This tracker is updated in the **same commit** as the code change.

## Commit log

| Date | Commit | Summary | Verification |
|---|---|---|---|
| 2026-11-09 | `6da9d670` | Added this roadmap and initial honest status baseline. | Documentation-only; application tests not run. |
| 2026-11-09 | Stabilization | Fixed PostgreSQL SQL compatibility, session/attempt correctness, import conflict handling, learner-group holdouts, frontend storage/error handling, and switched the primary Prisma provider to PostgreSQL. | PostgreSQL CI run `42539952910` passed; API 289 tests, web 82 tests, migration integration, lint, builds and mobile typecheck green. |
| 2026-11-13 | `ec6521d` | PR #19: Playwright E2E tests in CI - student practice flow and formal exam flow added to CI workflow. | Playwright E2E CI job green; student practice flow (start, answer, submit, result) and formal exam flow (start, submit, result) verified. |


## Stabilization work log

- 2026-11-09: Fixed PostgreSQL identifier quoting and boolean literals in the raw SQL analytics queries. The same syntax remains valid for SQLite, but a PostgreSQL-backed integration run is still required.
- 2026-11-09: Fixed the active Vite student app's assigned-exam heartbeat edge case so deadline errors no longer pause the timer and block autosubmission; added unit coverage for deadline, paused-session, and transient-network classifications.
- 2026-11-09: Made invigilator session status changes and audit-event writes atomic, with a conditional status update to detect concurrent changes.
- 2026-11-09: Converted referenced-question bulk-delete foreign-key errors into a clear conflict response instead of a generic 500.


## PostgreSQL and stabilization verification

- Main Prisma provider is PostgreSQL; the SQLite schema and full legacy migration history are preserved separately under `api/prisma-sqlite/`.
- PostgreSQL baseline migration and the custom one-active-model partial unique index migration both apply successfully on a clean PostgreSQL 16 database.
- CI runs the API test suite against PostgreSQL using isolated per-test schemas. The analytics raw SQL paths are therefore exercised on the target database provider.
- The SQLite-to-PostgreSQL migration utility is tested against a real PostgreSQL service: it preserves explicit IDs and foreign-key relationships, converts timestamp values, and resets serial sequences.
- Local Docker Compose now starts PostgreSQL 16, waits for database health, and runs Prisma migrations before starting the API.
- Cross-site cookie configuration and CSRF Origin validation are implemented; production domain configuration and browser-level deployment testing remain pending.
- Active web build is Vite (`web/src/main.tsx`, `vite build`, and the Dockerfile). A separate Next.js `web/app` tree is still present and tested but is not part of the current production build; do not remove it until its intended role is decided.

- 2026-11-09: Aligned deadline comparisons so an assignment is closed consistently at its exact due time across package access, session start, answer saves, heartbeats, and late-submission review classification. Extended the deadline regression to verify package/start/save/heartbeat rejection while preserving a late submission for review. Awaiting CI.

- 2026-11-09: Moved offline session creation and its reconciliation audit event into the same transaction as submission finalization. Idempotency/duplicate-attempt checks now happen before session creation; a reused attempt UUID regression verifies no orphan ACTIVE session remains. Awaiting CI.

## Latest verified CI

- Commit: `33316c8cebbc560419178ea4d236eceadcf5c7c1`
- Workflow run: `42539952910` — success.
- API: 36 test files, 289 tests passed on PostgreSQL.
- Web: 22 test files, 82 tests passed.
- Lint and web/API production builds passed.
- Mobile typecheck and TensorFlow dataset preparation checks passed.
- SQLite-to-PostgreSQL migration utility unit and integration tests passed.


- Commit: `ec6521d` (PR #19)
- Workflow run: Playwright E2E CI job — success.
- Web: Student practice flow E2E test (login, create practice test, answer, submit, view result) passed.
- Web: Formal exam flow E2E test (login, start assigned exam, submit, view result) passed.


- 2026-11-09: Fixed logout token replay. JWTs now carry a user session-version claim, and every protected API route checks it against PostgreSQL. Logout increments the version, invalidating previously issued browser-cookie and bearer tokens. Legacy tokens without the claim are treated as version 0 until logout. Per-device revocation remains separate work. A follow-up commit also ensures database failures during logout revocation are returned to the client; run CI against the final branch head before merge.


- 2026-11-09: Expanded the production Vite application's own UI regression suite to verify that a student can leave a mock-test tab, open Announcements, return to Practice, and retain the selected answer and progress. The first new UI test run exposed a test setup error (the mock-test launch control lives on the Practice page); corrected to navigate there first, and CI must pass on the final PR head after the test setup correction before this item is considered verified.


- 2026-11-09: Corrected the mock-test navigation regression test to enter the Practice page before clicking the mock-test launcher; the test now asserts answer retention after switching to Announcements and back.


- 2026-11-09: Updated the production Vite sign-out flow to await server-side token revocation. If the API/database cannot revoke the session, the app keeps the user signed in and shows an actionable error instead of silently pretending logout succeeded. Added a regression test.
- 2026-11-09: Verified the final auth + UI stabilization changes in CI run `42541320090`: API 36 files / 290 tests, web 22 files / 84 tests, PostgreSQL migrations, migration utility tests, TensorFlow dataset checks, mobile typecheck, lint and production builds all passed. The API-confirmed sign-out behavior passed full CI run `42541320090`.


- 2026-11-09: Made one-time admin bootstrap concurrency-safe with a PostgreSQL advisory transaction lock and added a regression test that runs two different bootstrap requests concurrently; exactly one administrator can be created. The new PostgreSQL concurrency regression test must pass on the current PR head.


## Latest stabilization CI (2026-11-09)

- PR: [#15 — Stabilize existing app and revoke sessions on logout](https://github.com/smdgamekingindo-TN/ArcTester/pull/15) (draft; not merged or deployed).
- Verified commit: `1dde76ab47c6b5625d96a8b41c796e71bc298682`.
- Workflow run: `42542180790` — success.
- API: 37 test files, 291 tests passed on PostgreSQL.
- Web: 22 test files, 84 tests passed; production Vite app direct tests: 8.
- PostgreSQL migrations, SQLite data-migration utility tests, TensorFlow dataset checks, mobile typecheck, lint, and production builds all passed.
- Remaining: feature-by-feature end-to-end QA, deployment-specific cookie/browser verification, Vercel/Render configuration confirmation, and long-running TensorFlow training request lifecycle.


- 2026-11-09: Added a Vercel + Render deployment guide with Vite build/output settings, Docker context, PostgreSQL/JWT/CORS/cookie environment variables, and the third-party-cookie limitation. Actual provider configuration and browser testing remain pending; the deployment-guide documentation should be included in the next CI run.


- 2026-11-09: Hardened exam assignment against concurrent duplicate requests: a uniqueness race now returns HTTP 409 instead of an unhandled 500. The first CI run exposed test-fixture contamination because the new test assigned a student reused by later analytics/offline-submission tests. Moved the concurrency test after analytics and gave it a dedicated student fixture; corrected CI run `42543383789` passed all four jobs.


- 2026-11-09: Exam submission audit found that offline session reconciliation happened before validating submitted question IDs and option indexes. Invalid payloads could therefore leave a session row despite returning HTTP 400. Moved full answer-set validation ahead of session creation, added per-question option bounds checks, and added a regression proving invalid offline submissions do not create a session. Awaiting CI verification for this follow-up.


- 2026-11-09: Hardened answer autosave against a state race: the save transaction now requires the exam session to remain ACTIVE and started, not merely to exist. Added coverage that a paused session rejects an answer save without advancing its revision, then resumes normally. Awaiting CI verification.


- 2026-11-09: Corrected the paused-session termination regression fixture after CI exposed contamination of later global-count assertions; the dedicated student is now deleted at the end of the test. Awaiting a fresh CI run.
- 2026-11-09: Hardened exam-session reconnect against a concurrent invigilator state change. Reconnecting an existing session now conditionally transitions only the exact state originally read and requires a valid start timestamp; a concurrent pause/termination produces HTTP 409 instead of being overwritten. Added interrupted-session recovery coverage; awaiting CI verification.


- 2026-11-09: Hardened submission finalization against an invigilator state race. The transaction now conditionally completes only an ACTIVE session with the same server-owned start timestamp observed before submission; if the session was paused or terminated concurrently, the transaction returns HTTP 409 and rolls back the submission. Added a regression proving a paused session cannot be submitted and remains paused; awaiting CI.


### TensorFlow.js durable training jobs — 2026-11-09

**Implemented on main; CI verification pending**
- Added PostgreSQL `ModelTrainingJob` persistence with QUEUED/RUNNING/SUCCEEDED/FAILED states, progress, result/error payloads, timestamps, worker identity and expiring worker leases.
- Added migration `20261109210000_model_training_jobs`.
- Added admin-only queue submission, list and status endpoints:
  - `POST /admin/model-datasets/:datasetId/tensorflow-jobs`
  - `GET /admin/model-training-jobs`
  - `GET /admin/model-training-jobs/:jobId`
- Added a polling worker that atomically claims queued or expired-lease jobs, renews its lease while training, records inactive model candidates and audit events, and persists terminal failures.
- The API starts the worker outside test mode. The active Vite Model Lab can queue TensorFlow.js jobs and refresh their persisted progress/results.
- Added API integration coverage for admin authorization, queue/status behavior, worker execution and invalid dataset rejection.

**Important limitations / next verification**
- Existing synchronous TensorFlow endpoint remains for compatibility; the Vite Model Lab now exposes the durable queue path.
- Worker progress currently reports lifecycle milestones, not per-epoch training percentage.
- Expired leases permit recovery after a worker disappears; verify multi-instance lease behavior and long-running training under deployment conditions.
- Run PostgreSQL migration deployment, API/web tests, lint and production builds in GitHub Actions. Do not mark this slice complete until the latest main commit has a successful CI run.


## Product audit — four-milestone release gate (2026-11-09)
The product audit is being completed before starting the six approved feature groups. The four audit milestones are:
1. Student experience: authentication, dashboard/navigation, subject-first practice, mock tests, answer persistence/recovery, assigned exams, results and explanations.
2. Administrator experience: question bank/imports, exam authoring/publishing/assignment, invigilation, review queue, analytics and Model Lab.
3. Reliability: offline/reconnect, refresh/restart recovery, multiple tabs, concurrent sessions, and responsive mobile/desktop behavior.
4. Deployment: confirm the canonical Vite frontend, verify Render/PostgreSQL and frontend hosting configuration, cross-site browser authentication, and worker lifecycle.

### Audit findings and fixes
- Confirmed the production browser build is React + Vite (web/src/main.tsx, vite build, web/dist). The separate web/app Next.js tree is not the deployed frontend; retain it until its intended archival/removal is handled deliberately.
- Student/mobile offline synchronization audit found that the Expo workspace accepted any response containing a submission ID without confirming it belonged to the locally queued attempt. It also continued sending later submissions after authentication or server failures.
- Fixed mobile/src/offline/OfflineExamWorkspace.tsx: both immediate and queued uploads now require the server-returned attemptUuid to match the local attempt before marking it synchronized; queued synchronization stops after HTTP 401, 403, or 5xx while preserving pending records. Assignment IDs are URL-encoded.
- The mobile sync fix is implemented on main; its mobile typecheck and full CI run are the verification gate. This does not yet complete the student experience audit.

- Student dashboard audit found a second legacy assigned-exam runner mounted alongside the session-controlled exam centre. The legacy runner submitted directly without the full session/heartbeat/autosave lifecycle. Removed that dashboard entry point and added a regression test requiring students to enter through the single assigned-exam centre. The unused legacy component file is retained temporarily pending the full frontend cleanup.
- Student practice-recovery audit found that cached browser answers were accepted based only on a non-negative integer value. Stale question IDs and option indexes outside the restored question's option range could inflate the answered count or produce a submission rejected by the API. Updated `web/src/App.tsx` to restore only answers whose question belongs to the active attempt and whose option index is valid; added a regression with an unknown question ID and an out-of-range option. Commits: `a145585` (fix), `6b8a438` (regression test). Awaiting CI verification.
- Assigned-exam UI audit found the active Vite screen stored a server deadline and clock offset but never read them, and did not send the backend's session heartbeat endpoint. The countdown therefore referenced an undefined value at runtime, and the browser did not maintain/report its live session. Wired a server-clock-based countdown, 15-second heartbeat, focus/visibility events, reconnect classification, paused-session recovery polling, and deadline-triggered submission. Added a UI regression that advances the countdown and invokes the heartbeat interval. Commits: `ecd6271` (integration), `d7b1731` (prevent overlapping heartbeats), `4230836` (regression test), `a8ad337` (test cleanup). Awaiting CI verification; assigned-exam lifecycle still needs end-to-end testing.
- Student practice/mock-test audit found that attempts had server-owned deadlines in the API but the active Vite UI never displayed a countdown or auto-submitted at expiry; an unused auto-submit ref was the only related client code. Added server time to the attempt-creation response, synchronized the browser countdown with the API clock (including restore after reload), and auto-submit when the deadline expires. Added a UI regression for countdown progression and expiry submission. Commits: `5d8d1bc` (API server time), `4360764` (timer/autosubmit), `4c66d16` (UI regression). Awaiting CI verification.
- CI exposed a test-fixture syntax error in the malformed-cache recovery regression: escaped newline characters had been written literally into the TypeScript array. Corrected the fixture to use real line breaks. This was a test-source formatting failure, not an application runtime failure; rerun CI on the corrected head before treating the practice-recovery/timer slice as verified.
- Assigned-exam UI regression uncovered a second student workflow gap: opening the Assigned exams tab did not fetch assignments, so students saw the empty state until they manually pressed Refresh. Added automatic loading on tab entry with cancellation-safe state updates and visible request errors; the heartbeat regression now exercises the real loaded-assignment path. CI run `42582937402` confirmed the missing fetch through the failed regression (87 other tests passed); fix and rerun pending.

- Student experience slice verification: CI run `42583312075` passed all four jobs on commit `f8eda5d8`: PostgreSQL-backed API tests, Vite web tests/lint/build, mobile typecheck, TensorFlow dataset preparation, and SQLite-to-PostgreSQL migration utility checks. This verifies the practice recovery/timer and assigned-exam loading/heartbeat regressions; full student end-to-end QA is still pending.
- Administrator question-bank audit found that concurrent searches could resolve out of order and an older response could overwrite newer filters. Added a monotonically increasing request sequence in `web/src/AdminWorkspace.tsx` so stale successes and stale failures are ignored, with a component regression that resolves the newer search before the older one. Commits: `0646c2a` and `17aa83e`; awaiting final CI.
- Administrator import audit found the active API route shadowed the newer question-admin preview handler. The route expected JSON in `req.body.questions`, while the UI sends file contents in `req.body.content`; it also returned `preview` instead of the `report` contract the UI reads. Both CSV and JSON previews therefore failed to populate the import report (and JSON preview was always invalid). Updated the active route to parse JSON content, run both formats in dry-run mode, and return the expected report; added API regressions for both formats, no-write behavior, and malformed JSON. Commits: `3814479` and `5c5f851`; awaiting final CI.
- Administrator route-validation audit also found the active question-list endpoint accepted arbitrarily large page numbers. Added a one-million-page upper bound and an API regression for out-of-range input. Commits: `5c78d93` and `e43d2d5`; awaiting CI verification with the import-preview and stale-search regressions.
- CI run `42584176857` confirmed the new administrator stale-search component regression and both CSV/JSON import-preview API regressions passed, along with API suite, lint/build prerequisites, mobile typecheck, dataset checks and migration utility tests. The only failing assertion was the assigned-exam timer test's timestamp fixture: it read the clock twice, producing a 61-second deadline instead of exactly 60 seconds. Corrected the fixture to derive deadline from the same `serverNow` instant in commit `72994c0`; final full CI rerun is pending.
- Student experience audit found that analytics endpoints were already implemented and tested in the API, but the active Vite student UI had no progress screen and never called them. Added a Progress navigation view with practice accuracy, completed attempts, subject-level accuracy, recent practice trend, official submission/grading status, and formal exam subject marks. The view fetches only when opened and separates practice scoring from official exam scoring. Added a Vite UI regression using the existing `/analytics/overview` response contract. Commits: `967f5a0`, `7e60ef8`, `023f3ba`, `bb06946`, `71291bc`; awaiting CI verification.
- Follow-up: wrapped the progress refresh callback in `useCallback` and declared it in the effect dependencies, avoiding an exhaustive-deps lint issue while keeping the fetch-on-open behavior. Commit: `78c7e90`; included in the next full CI run.

- Student progress UI and the combined admin/student stabilization changes are verified green on commit `75cdf5b3`, CI run `42584848026`: all four jobs succeeded. The Vite suite passed 23 test files, the PostgreSQL API suite passed 39 test files, and lint, web/API builds, mobile typecheck, TensorFlow dataset checks, and SQLite-to-PostgreSQL migration utility checks passed. The assigned-exam timer fixture correction, admin search/import/pagination regressions, and student progress dashboard regression are included in this verified run.
- Administrator audit fixes are independently confirmed by run `42584463149` (all four jobs success), including the import preview contract and stale question-search handling.
- Extended the timed-practice UI regression to assert the submitted result includes correct-answer review, unanswered state, and the saved explanation, not only the result heading. Commit: `919a2a2`; awaiting CI.
- CI run `42585108277` confirmed the new result-review assertions for correct answers and explanations, but the test queried the repeated `Not answered` label with a single-element matcher. Updated it to assert at least one matching label; application behavior and the other 89 web tests were passing. Commit: `97fb41b`; rerun pending.
- Reliability audit found that two browser tabs restoring the same practice attempt did not receive each other's answer updates; practice answers were only written to localStorage, with no storage-event listener. Added validated cross-tab answer synchronization for the active attempt and extended the reload-recovery test to simulate a second tab changing an answer while ignoring invalid question IDs/options. Commits: `039d615` and `5eddb22`; awaiting CI. This covers answer visibility across tabs; simultaneous submit/revision races still need verification.
- Extended the multiple-tab reliability fix to official assigned exams: storage events now merge validated answers from another tab, and optimistic autosave conflicts fetch the latest server revision, merge remote/local selections, and retry through the existing serialized save queue. Added a UI regression proving a cross-tab answer is selected and autosaved. Commits: `bf00334` and `7634c87`; awaiting CI.

- Assigned-exam cross-tab synchronization and optimistic autosave conflict recovery are verified green on commit `ad3fb2b3`, CI run `42585763253`: all four jobs passed. The Vite suite passed 23 test files, the PostgreSQL API suite passed 39 test files, and lint/build, mobile typecheck, TensorFlow dataset checks, and SQLite-to-PostgreSQL migration checks passed. No CI errors were reported.
- Deployment account inspection: the connected Render workspace currently has one web service (`FriegthBrokerCMR-Backend`) and no PostgreSQL instances; the connected Vercel team has projects for `freightbrokercmr` and `hussain-portfolio`, but no ArcTester project. ArcTester therefore has deployment instructions but is not provisioned or live. Creating the Render database/API service and Vercel project is an external resource-creation action and remains pending explicit approval; do not mark deployment verification complete.
- Mobile offline reliability audit found that a reconnect sync could overwrite the locally cached exam package even while an offline attempt was in progress. If an administrator published a new exam version, the active attempt could then be resumed or submitted against changed questions. Added a package-version lock after an attempt exists: the same hash is retained, a changed hash is rejected, and pre-attempt refresh remains allowed. Added pure policy tests to the Vite suite. Commits: `cfe2eec`, `7af9d93`, `fdf04ac`; awaiting CI. This fix is scoped to the active `offline/examStore` used by the workspace.
- Hardened the offline package-version guard against a start/sync race: package refresh and attempt creation now use SQLite transactions, so a new version cannot slip in between the attempt check and insert. Commit: `90f6d17`; awaiting CI.
- The first offline cache-policy CI run failed because Vitest followed the test import into `mobile/tsconfig.json`, which extends the Expo config not installed in the web test job. Moved the dependency-free policy to `shared/offlineExamCachePolicy.ts` and updated both app and test imports, keeping the web test runner isolated from Expo. Commits: `d47df06`, `8eb64b8`, `72ef1eb`, `2abc59a`; rerun pending.
- Offline package-version locking and atomic cache/start transitions are verified green on commit `a2c40995`, CI run `42586674753`: all four jobs passed. The Vite suite passed 24 test files, the PostgreSQL API suite passed 39 test files, and mobile typecheck, migrations, dataset checks, lint, and web/API builds passed. The shared policy test now runs without loading the Expo workspace config.
- TensorFlow request-lifecycle audit found the compatibility endpoint `POST /admin/model-datasets/:datasetId/train-tensorflow` still performed up to 500 epochs directly inside the HTTP request, bypassing the durable worker already used by Model Lab. Changed it to validate the dataset and enqueue a persisted job (HTTP 202 + status URL) instead; added a regression proving it creates a QUEUED database job. The worker remains responsible for execution and lease renewal. Commits: `d982888` and `bddb381`; awaiting CI.
- A later CI rerun exposed the same 61-second fixture issue in the practice timer regression (the earlier fix had updated only the assigned-exam fixture). Updated the practice timer fixture to derive its deadline from its own `serverNow` instant. The application timer was not implicated; the other 92 web tests and all 39 API files passed. Commit: `64b34dc`; full rerun pending.
