# ArcTester — Development Roadmap & Progress Tracker

Last updated: 2026-11-09
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
- [ ] PostgreSQL migration completed and tested.
- [x] Latest main-branch ArcTester CI run succeeded for commit `9ed21dc` (PR #13); this is a baseline check, not full end-to-end confirmation.
- [ ] Full regression suite for the stabilization branch and all feature workflows green.

**Important:** Previous development messages reported that many existing features were implemented and that earlier test runs passed. Those reports are not a substitute for a fresh verification against the current repository. The latest audit is still in progress. The latest `main` commit (`8c752c7`) has a successful ArcTester CI run, but that run does not verify every feature end-to-end. No application fixes have yet been committed on this stabilization branch.

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

- [ ] Replace or repair SQLite-specific raw analytics SQL for PostgreSQL (quoted identifiers, boolean expressions, numeric result types).
- [ ] Create a PostgreSQL-compatible Prisma migration baseline and a safe SQLite-to-PostgreSQL data migration plan; preserve IDs and relations.
- [ ] Resolve cross-site authentication cookie behavior between Vercel and Render; prefer a same-origin API proxy or implement secure cross-site cookies with CSRF/origin protections.
- [ ] Resolve the dual frontend structure: package scripts currently run Vite (`web/src/main.tsx`), while a separate Next.js `web/app` tree and `next` dependency also exist. Decide which is canonical from deployment/configuration evidence before removing or migrating anything.

### High priority correctness and reliability

- [ ] Fix and regression-test the assigned-exam deadline / heartbeat / autosubmit race.
- [ ] Make invigilation state changes and audit-event writes atomic.
- [ ] Handle foreign-key conflicts during bulk question deletion with a clear API response.
- [ ] Prevent learner-level train/test leakage in every training pipeline that may contain repeated learner samples.
- [ ] Move long-running TensorFlow training out of normal HTTP request handling or otherwise prove it safely fits host limits.
- [ ] Audit session revocation, logout behavior, device registry semantics, rate limiting, and bootstrap-admin race conditions.
- [ ] Audit route validation, pagination bounds, import limits, and error responses.
- [ ] Verify answer autosave/recovery behavior, including refresh, reconnect, multiple tabs, and deadline boundaries.

### Frontend quality

- [ ] Re-test every student and admin navigation path, modal, tab, form, and responsive layout.
- [ ] Add a top-level React error boundary and safe browser-storage handling where needed.
- [ ] Refactor the large App component incrementally without replacing or regressing the existing UI.
- [ ] Add regression tests for every confirmed UI bug.

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
| 2026-11-09 | Baseline verification | Confirmed latest `main` CI run succeeded and found both Vite scripts and a Next.js app tree. | CI run `42534604301` passed on PR #13; feature-level end-to-end verification remains pending. |
