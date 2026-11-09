# ArcTester — Development Roadmap & Progress Tracker

Last updated: 2026-11-09 (stabilization branch)
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
- [ ] Verify answer autosave/recovery behavior, including refresh, reconnect, multiple tabs, and deadline boundaries.
- [x] Verify reconnect cannot reactivate a session changed concurrently by an invigilator; conditional reconnect update and interrupted-session regression passed CI run `42544630276`.
- [x] Verify conditional answer writes cannot commit after a concurrent invigilator pause/termination; paused-session regression passed CI run `42544206972`.
- [ ] Verify heartbeat updates cannot write activity/counters after a concurrent invigilator pause/termination; paused-session heartbeat regression added, awaiting CI.
- [ ] Preserve elapsed paused duration when an invigilator terminates a paused session; regression test added, awaiting CI.

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

## Latest verified CI

- Commit: `33316c8cebbc560419178ea4d236eceadcf5c7c1`
- Workflow run: `42539952910` — success.
- API: 36 test files, 289 tests passed on PostgreSQL.
- Web: 22 test files, 82 tests passed.
- Lint and web/API production builds passed.
- Mobile typecheck and TensorFlow dataset preparation checks passed.
- SQLite-to-PostgreSQL migration utility unit and integration tests passed.


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


- 2026-11-09: Hardened exam-session reconnect against a concurrent invigilator state change. Reconnecting an existing session now conditionally transitions only the exact state originally read and requires a valid start timestamp; a concurrent pause/termination produces HTTP 409 instead of being overwritten. Added interrupted-session recovery coverage; awaiting CI verification.


- 2026-11-09: Hardened submission finalization against an invigilator state race. The transaction now conditionally completes only an ACTIVE session with the same server-owned start timestamp observed before submission; if the session was paused or terminated concurrently, the transaction returns HTTP 409 and rolls back the submission. Added a regression proving a paused session cannot be submitted and remains paused; awaiting CI.
