# ArcTester — Completion Execution Plan

**Repository:** `smdgamekingindo-TN/ArcTester`  
**Plan branch:** `chatgpt/arctester-completion-execution-plan`  
**Baseline date:** 2026-11-11  
**Purpose:** A code-level execution contract for finishing the existing product. This plan is intentionally implementation-focused: target files, expected changes, reasons, dependencies, tests, acceptance gates and PR boundaries.

> **Important:** This is a plan, not evidence that the listed work has already been implemented. A checkbox is only checked after the code is merged and the required verification passes on the exact commit. Do not treat old phase percentages as current measurements without re-auditing them.
>
> **Detailed execution instructions:** Follow [ARC_TESTER_AGENT_EXECUTION_SPEC.md](./ARC_TESTER_AGENT_EXECUTION_SPEC.md) for task IDs, source-to-database tracing, exact investigation/implementation loops, test scenarios, parallelization rules, status meanings and required reporting. The parent plan defines scope; the execution spec defines how the agent must carry it out.

---

## 0. Verified repository baseline

### 0.1 Current architecture confirmed from repository files

- Root workspaces: `web` and `api` (`package.json`).
- Web: React + TypeScript + Vite; primary orchestration currently lives in `web/src/App.tsx`.
- API: Node.js + TypeScript + Express + Prisma + Zod; active database is PostgreSQL.
- Native app: Expo/React Native TypeScript under `mobile/`.
- Desktop app: Electron under `desktop/`.
- Main API router registration is in `api/src/index.ts`.
- API route modules currently registered include:
  - `api/src/testRoutes.ts`
  - `api/src/auth.ts`
  - `api/src/examRoutes.ts`
  - `api/src/questionAdminRoutes.ts`
  - `api/src/modelRoutes.ts`
  - `api/src/modelTrainingJobRoutes.ts`
  - `api/src/announcementRoutes.ts`
- Current Prisma schema is `api/prisma/schema.prisma`. It already contains announcement views and student notification relations/models; inspect the complete schema before proposing any new table.
- Student communications are wired through `web/src/useStudentCommunications.ts`, `StudentAnnouncementDialog.tsx`, `StudentAnnouncementsInbox.tsx`, `StudentNotificationBanner.tsx` and `StudentNotificationsInbox.tsx`.
- Student navigation/dashboard work from PR #106 is already merged. Do not redo it:
  - Merge commit: `fd9a3b8805f0491da02e5bd0234395d261a26d7b`.
  - PR: https://github.com/smdgamekingindo-TN/ArcTester/pull/106
  - Its latest required Actions jobs passed: API/web test-lint-build, mobile typecheck, TensorFlow dataset preparation tests and SQLite-to-PostgreSQL migration utility tests.
- The current Actions definition is `.github/workflows/ci.yml`. It runs those four jobs; a green run proves those jobs, not real-device or production deployment qualification.
- The master roadmap was last audited 2026-11-10 and predates PR #106. Its recorded 65% is stale as a current completion score. Recalculate only after the source/test audit below.
- The repository search returned no open issues at the time this plan was prepared. Existing closed PRs #104 and #105 address topic-filter API validation and concurrent first-session creation; preserve those fixes.

### 0.2 Known engineering constraints

1. Keep PostgreSQL and the existing Prisma data model authoritative. Do not revive SQLite as the runtime database; `api/prisma-sqlite` is a migration source only.
2. Reuse existing attempts, answers, exam snapshots, assignments, sessions, notifications and audit records. No parallel tracking system.
3. Preserve immutable published exam snapshots and all historical user data.
4. Server authorization, exam deadlines, grading and submission status are authoritative.
5. Local browser storage is a recovery layer, not a substitute for server state.
6. Never expose answer keys before the relevant submission/review policy permits it.
7. A stale heartbeat or browser focus event is not proof of cheating.
8. Keep the product usable on modest hardware; avoid heavyweight runtime dependencies and unnecessary refactors.
9. Do not add push/email/cloud dependencies unless the product requirement and configuration exist.
10. Do not weaken or delete a regression test to make CI green.

---

## 1. Execution protocol — applies to every task

### 1.1 Before editing a feature

For the feature being worked on:

1. Read the relevant requirements in `docs/PRODUCT_REQUIREMENTS.md`, this master roadmap and (for intelligence) `docs/ARC_TESTER_INTELLIGENCE_ROADMAP.md`.
2. Read the route/component, its direct dependencies, Prisma models and existing tests.
3. Trace the real request/response and state lifecycle from UI to API to database and back.
4. Write down the observed defect or missing acceptance criterion, with a reproducible scenario.
5. Identify the smallest set of files that can implement the complete fix.
6. Check whether an earlier PR already implemented the requirement. Do not duplicate it.

### 1.2 Implementation rules

- Fix the underlying contract/state bug, not just the visible symptom.
- Keep route validation at the API boundary (Zod), authorization in the API, and business invariants in the service/transaction layer where applicable.
- Use database transactions and unique constraints for multi-record critical operations.
- Keep client UI state derived from authoritative API state where possible.
- Add tests for normal flow, invalid input, authorization/ownership, retries/concurrency, empty state and failure state as applicable.
- Prefer feature-sized PRs with related implementation + tests together. Avoid one PR per tiny edit and avoid one giant PR containing unrelated subsystems.
- Do not merge a PR unless the user explicitly asks. Never claim a PR is merged based on green CI alone.

### 1.3 Verification ladder

Run checks in this order to catch cheap failures early:

1. Targeted test for the changed feature.
2. Related API/web test suite.
3. API/web lint and production build.
4. Root formatting check.
5. Mobile typecheck if shared contracts, API behavior or mobile code changed.
6. Dataset/migration tests if those areas changed.
7. Full required GitHub Actions on the exact PR head SHA.

Commands confirmed by repository scripts/workflow:

```bash
# API / web suites
npm test --workspace=api
npm test --workspace=web

# Full root suites, lint, build and formatting
npm test
npm run lint
npm run build
npm run format:check

# Mobile typecheck (CI command)
npm run typecheck --prefix mobile

# TensorFlow dataset preparation test (CI command)
python -m unittest scripts/test_prepare_tensorflow_dataset.py -v

# Prisma generation/migration (use a disposable clean PostgreSQL database)
npm run prisma:generate --workspace=api
npx prisma migrate deploy --schema=api/prisma/schema.prisma
```

For SQLite migration utility tests, use the exact command in `.github/workflows/ci.yml`; do not invent a replacement command. Record the command and result in the PR body.

---

## 2. Workstream A — baseline audit and executable backlog

**Priority:** P0  
**Depends on:** Nothing  
**Goal:** Stop re-discovering the same issues during implementation.

### Files to inspect/update

- `docs/ARC_TESTER_16_PHASE_MASTER_ROADMAP.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/ARC_TESTER_INTELLIGENCE_ROADMAP.md`
- `package.json`, `api/package.json`, `web/package.json`
- `.github/workflows/ci.yml`
- `api/prisma/schema.prisma`
- API route modules listed in section 0.1
- `web/src/App.tsx`, `web/src/App.test.tsx`, student/admin feature components
- `mobile/` and `desktop/` package manifests and entry points

### Exact work

- [ ] Record the current `main` SHA and confirm PR #106 is in its ancestry.
- [ ] Inventory every route registered in `api/src/index.ts`; map each to its test file(s).
- [ ] Inventory all student and admin navigation destinations; click/route test each destination.
- [ ] Map every Prisma model to the API routes that read/write it and the owning UI workflow.
- [ ] Search for TODO/FIXME, stub handlers, disabled controls, placeholder success responses, swallowed errors and unhandled promise paths. Classify each as real defect, intentional limitation or stale comment.
- [ ] Inspect all existing tests before adding new ones. Mark acceptance criteria already covered; do not rewrite working tests.
- [ ] Inspect the latest Actions run for `main`; record required jobs and any flaky/slow steps.
- [ ] Create a prioritized checklist with evidence links and exact file/test targets.
- [ ] Update stale roadmap audit date/status only when the evidence is available.

### Output

A short audit section in the master roadmap with: current HEAD SHA, merged PR evidence, confirmed gaps, tests that already cover completed work, unresolved risks and links to the implementation PRs.

### Exit gate

No feature implementation starts from assumptions. Every P0/P1 task must point to a requirement, observed code path and test target.

---

## 3. Workstream B — practice engine and student learning correctness

**Priority:** P0  
**Depends on:** Workstream A  
**Relevant phases:** 3, 4, 5, 6, 7, 12

### Target code

- API: `api/src/testRoutes.ts`
- API data invariants: `api/prisma/schema.prisma` only if a demonstrated invariant cannot be enforced by existing fields/constraints
- Web orchestration: `web/src/App.tsx`
- Existing practice modules: `web/src/practiceConfig.ts`, `web/src/StudentPracticeSession.tsx`, `web/src/StudentPracticeResults.tsx`, `web/src/StudentPracticeSubjectTopicFilters.tsx`, `web/src/StudentPracticePaperConfiguration.tsx`, `web/src/StudentPracticeResumePreview.tsx`
- Existing tests: `web/src/App.test.tsx` and the API test files covering `/tests`; add focused tests beside the existing practice test suites rather than expanding one monolithic test unnecessarily.

### What to implement / verify

- [ ] Trace subject-first paper creation from selected subjects and independent subject-topic filters through request validation, question selection and response warnings.
- [ ] Verify selected question count, difficulty, subject quota and no-duplicate selection behavior.
- [ ] Verify shortfall responses identify the affected subject/topic and requested versus available counts.
- [ ] Verify invalid topic filters and duplicate subject-topic pairs remain rejected (regression coverage from PR #104).
- [ ] Verify practice attempt creation, answer persistence, restore, timer and submission use the server's attempt/deadline state.
- [ ] Verify refresh/re-entry restores the same in-progress attempt and locally backed-up answers without creating a second attempt.
- [ ] Verify navigating between workspaces does not destroy the in-progress practice state or force the exam view over the selected workspace.
- [ ] Verify scoring uses authoritative answer snapshots, correct denominators and separate unanswered counts.
- [ ] Verify completed history excludes unfinished attempts and duplicate submission cannot score twice.
- [ ] Verify result review exposes explanations/correct answers only after the permitted submission state.
- [ ] Verify student A cannot read or mutate student B's attempt by changing an attempt identifier.

### Tests to add/strengthen

- API integration: valid single-subject, multi-subject, independent topic filters, invalid unselected subject, duplicate filters, empty pools, insufficient pools, difficulty constraints, duplicate selection prevention, ownership and repeated submission.
- Web component/integration: configure → start → answer → navigate away/back → reload/restore → submit → result; empty/loading/error states; timer expiry; answer selection and review.
- Regression: ensure PR #104 validation and existing selection semantics remain unchanged.

### Acceptance gate

The practice workflow passes from the real student UI through API persistence and back to results. A passing isolated selector test is not sufficient.

---

## 4. Workstream C — formal examination lifecycle, recovery and race safety

**Priority:** P0  
**Depends on:** Workstream A; can run in parallel with B after API ownership boundaries are agreed  
**Relevant phases:** 7, 8, 9, 10, 12

### Target code

- API: `api/src/examRoutes.ts`
- API models: `api/prisma/schema.prisma` (only additive changes if a missing invariant is proven)
- Web runtime/orchestration: `web/src/App.tsx`
- Existing client helpers: `web/src/assignedExamHeartbeat.ts`, `web/src/localExamBackup.ts`, `web/src/safeStorage.ts`, `lib/answerRecovery.ts` (verify actual import path before editing)
- UI: `web/src/StudentAssignedExamPreview.tsx`, exam session/result components already imported by `App.tsx)
- Existing API and browser integration tests for exam session lifecycle.

### What to implement / verify

- [ ] Trace assignment eligibility → session creation/resume → server start/deadline → heartbeat → revisioned autosave → pause/resume → reconnect → submission → grading/review.
- [ ] Preserve the concurrent first-session creation recovery fixed by PR #105; add no second session or duplicate SESSION_STARTED audit event.
- [ ] Ensure only the assigned student can start/read/write the assignment session.
- [ ] Ensure server start time and deadline remain authoritative; local clock is display-only.
- [ ] Verify pause duration is accounted for exactly once and terminated/expired sessions cannot resume.
- [ ] Verify answer revisions reject stale writes and client conflict UI retains the student's unsynced answer for an explicit retry/reconciliation path.
- [ ] Verify local answer backup is scoped to the correct account and is cleared on logout/account switch.
- [ ] Verify reconnect synchronization is idempotent and does not overwrite a newer server revision.
- [ ] Verify repeated/concurrent submission returns one stable submission/result and creates one grading outcome.
- [ ] Verify deadline grace/review-required behavior and candidate messaging.
- [ ] Verify a candidate who never starts still appears in attendance.
- [ ] Verify invigilator pause/resume/terminate requires admin authorization, reason where required, and audit event.

### Tests to add/strengthen

- API PostgreSQL integration: simultaneous first starts, simultaneous submits, duplicate retries, stale revisions, unauthorized student/admin actions, paused/terminated/expired states, server deadline and grace boundary, attendance including NOT_STARTED.
- Web integration: timer display from server offset, heartbeat failure classification, local backup after reload, reconnect, account switching/logout cleanup, conflict and retry UI, submit pending/received/graded/review-required states.
- Keep real multi-device tests in the manual release checklist; CI simulation is not physical-device proof.

### Acceptance gate

All lifecycle transitions have explicit allowed/denied outcomes and API + browser regression coverage. No client-only clock or UI state can override server authority.

---

## 5. Workstream D — announcements and notifications end-to-end

**Priority:** P0  
**Depends on:** Workstream A; may run in parallel with B/C if changes do not overlap `App.tsx` without coordination  
**Relevant phases:** 11, 12, 16

### Target code

- API: `api/src/announcementRoutes.ts`; inspect whether notification creation is already integrated with `api/src/examRoutes.ts` and other event-producing routes before adding a new service.
- Data: `api/prisma/schema.prisma`; existing `Announcement`, `AnnouncementView` and `StudentNotification` structures must be reused unless audit proves a missing field/constraint.
- Web: `web/src/useStudentCommunications.ts`
- Web views: `web/src/StudentAnnouncementDialog.tsx`, `web/src/StudentAnnouncementsInbox.tsx`, `web/src/StudentNotificationBanner.tsx`, `web/src/StudentNotificationsInbox.tsx`, `web/src/StudentAnnouncementPreview.tsx`
- Admin: `web/src/AdminWorkspace.tsx`
- Integration wiring: `web/src/App.tsx`
- Tests: existing API announcement tests and communication-related web tests; add focused API/UI suites where coverage is absent.

### What to implement / verify

- [ ] Admin can create, edit where policy permits, publish and expire an announcement.
- [ ] API validates title/message/expiry and rejects malformed or unauthorized writes.
- [ ] Active student notice query excludes expired/unpublished announcements.
- [ ] Each student's acknowledgement is independent; one student's seen state never changes another's.
- [ ] Acknowledged announcements do not reappear as popups; inbox still displays correct history/state.
- [ ] Assignment, exam-availability and result events create notifications for the correct recipient set only.
- [ ] Critical notification creation is transactionally coupled to the event or safely retryable.
- [ ] Add a database uniqueness/idempotency guard only after identifying a stable event key; do not use fragile message-text matching.
- [ ] Retrying an event/worker does not create duplicate user-visible notifications.
- [ ] Read/unread transitions and unread counts stay consistent across banner, inbox and dashboard.
- [ ] API/UI loading, empty and failure states are visible and retryable.
- [ ] External push/email is not introduced unless credentials/configuration and delivery-state requirements already exist.

### Tests to add/strengthen

- API integration: admin vs student access, publish/expiry boundary, recipient scoping, per-user acknowledgement, repeat acknowledgement, duplicate event delivery, transaction rollback and read-state updates.
- Web integration: announcement popup once, acknowledgement persistence, inbox history, notification banner/inbox no duplicate accessible controls, unread counts, API failure and retry.
- Regression: preserve PR #106 dashboard counts and navigation, and avoid the earlier duplicate accessible-name/button regressions.

### Acceptance gate

An admin-created announcement and each notification event can be followed from API write to the correct student's inbox, with no cross-user leak or duplicate on retry.

---

## 6. Workstream E — student/admin UI completion and safe modularization

**Priority:** P1 (raise any broken core workflow to P0)  
**Depends on:** A; coordinate with B/C/D to avoid simultaneous edits to `App.tsx`  
**Relevant phase:** 12

### Target code

- `web/src/App.tsx` — current state orchestration and page switching; do not replace wholesale.
- `web/src/App.test.tsx` — retain as cross-workspace regression suite.
- `web/src/StudentNavigation.tsx`, `web/src/StudentDashboardWelcome.tsx` — already implemented; change only for a verified defect.
- `web/src/AdminWorkspace.tsx` — admin workspace navigation/forms/tables.
- Existing student feature components imported from `App.tsx`.
- `web/src/styles.css` — shared responsive/focus/reduced-motion styles.
- Add focused feature component files only where a current block of `App.tsx` can be extracted with stable props and tests.

### What to implement / verify

- [ ] Build a route/navigation matrix from every student/admin navigation action to its intended page/state.
- [ ] Fix dead buttons, incorrect page destinations, stale selected state and inaccessible controls found by that matrix.
- [ ] Verify student/admin roles cannot enter each other's workspace by direct UI action and API request.
- [ ] Verify phone-width and desktop-width layout for dashboard, practice builder, assigned exam, results, announcements, question bank and admin tables/forms.
- [ ] Ensure all forms have labels, validation, busy/disabled states and actionable errors.
- [ ] Ensure destructive admin actions require confirmation and are protected server-side.
- [ ] Check keyboard-only navigation, focus visibility, semantic headings, contrast and reduced-motion behavior.
- [ ] Extract only high-change/high-complexity blocks from `App.tsx` into feature components/hooks. Move one coherent feature at a time and preserve public behavior.
- [ ] Add focused component tests before/with each extraction. Keep `App.test.tsx` for integration-level wiring.
- [ ] Preserve PR #106 student dashboard shortcuts, count badges, grouped navigation and admin behavior.

### Tests to add/strengthen

- Web integration for every navigation destination and role boundary.
- Component tests for forms, dialogs, tables, empty/loading/error states.
- Responsive viewport assertions for critical layouts where test tooling supports them.
- Keyboard interaction tests for primary workflows and destructive confirmations.
- Full `npm test --workspace=web` after each extraction batch.

### Acceptance gate

Every visible control has a real action, all routes are reachable by the correct role, core student flows survive navigation, and no large untested rewrite is introduced.

---

## 7. Workstream F — intelligence analytics, models and recommendations

**Priority:** P1; promote data leakage/security defects to P0  
**Depends on:** A and trustworthy B/C data contracts  
**Relevant phases:** 5, 13, 14, 15

### Target code

- API intelligence modules under `api/src/intelligence/` (inventory exact files before editing).
- API endpoints: model registry/training modules registered in `api/src/index.ts`: `api/src/modelRoutes.ts`, `api/src/modelTrainingJobRoutes.ts`, `api/src/modelTrainingWorker.ts`.
- Prisma: `api/prisma/schema.prisma` model dataset, evaluation, training job, registry and audit models.
- Dataset scripts: `scripts/` including `scripts/test_prepare_tensorflow_dataset.py`.
- Student UI analytics/recommendation components imported by `web/src/App.tsx`; inspect exact existing components before creating replacements.
- Intelligence requirements: `docs/ARC_TESTER_INTELLIGENCE_ROADMAP.md`.

### What to implement / verify

- [ ] Trace all analytics to completed practice answer records and verified formal submissions; exclude unfinished attempts and separate REVIEW_REQUIRED.
- [ ] Verify student isolation for every analytics/recommendation endpoint.
- [ ] Verify weak-area thresholds, unanswered denominator and insufficient-history behavior.
- [ ] Verify recommendation reasons are derived from actual evidence and respect recent-question cooldown.
- [ ] Audit training dataset export for PII removal, provenance, feature schema version and leakage.
- [ ] Verify train/test splitting is student-grouped and chronological where required.
- [ ] Compare TensorFlow candidates and statistical baseline on identical held-out samples.
- [ ] Validate model artifact schema/version/metrics before inference or promotion.
- [ ] Verify missing, malformed, stale and rejected artifacts fall back safely.
- [ ] Prevent synthetic datasets from being presented as real-data qualification.
- [ ] Do not expose predictions below evidence thresholds; do not describe heuristics as trained ML.
- [ ] Keep model training out of request handlers; use the existing worker/job design.

### Tests to add/strengthen

- API integration: data provenance, student isolation, insufficient data, review-required exclusion, artifact validation/rejection, promotion/rollback permissions.
- Unit: feature extraction determinism, split leakage checks, baseline metrics, fallback and recommendation cooldown/reason generation.
- Python: privacy-safe dataset conversion and malformed input tests.
- Dataset qualification report must state dataset source, row count, excluded fields, train/test split, metrics and limitations. Synthetic-only results remain pipeline tests.

### Acceptance gate

Every user-visible insight has a traceable data source and sufficiency rule; every promoted model beats/justifies its baseline on valid held-out data and has a tested fallback.

---

## 8. Workstream G — security, platform and release blockers

**Priority:** P0 for confirmed critical/high findings; otherwise P1  
**Depends on:** A; final pass after B–F

### Target code

- API security: `api/src/auth.ts`, `api/src/index.ts`, `api/src/errors.ts`, route modules and Zod schemas.
- Database: `api/prisma/schema.prisma`, migrations under `api/prisma/migrations/`.
- Web: `web/src/apiClient.ts`, `web/src/safeStorage.ts`, auth/session UI.
- Mobile: Expo auth/token storage/API configuration under `mobile/`.
- Desktop: Electron main/preload/security configuration under `desktop/`.
- CI/deploy: `.github/workflows/ci.yml`, Vercel/Render configuration files actually present in repository.
- Docs: `README.md`, product requirements and release checklist.

### What to implement / verify

- [ ] Audit every mutating API route for authentication, role checks, ownership checks, Zod validation and safe error handling.
- [ ] Test cookie CSRF/origin guard and bearer-token native flow separately.
- [ ] Confirm secrets are absent from source, build output, logs and error responses.
- [ ] Review dependency advisories; fix reachable critical/high vulnerabilities without blindly upgrading incompatible major versions.
- [ ] Verify CORS allowlist and production cookie settings from actual deployment configuration.
- [ ] Verify database migrations from a clean PostgreSQL database and backup/restore on a disposable non-production database.
- [ ] Verify web production build and browser authentication against a staging API.
- [ ] Verify Android build installs and completes login, practice, assigned exam, reconnect and notification flows on a real device.
- [ ] Verify desktop package installs and core supported workflows; document platform limitations.
- [ ] Keep iOS qualification explicitly blocked if Apple tooling/device access is unavailable; do not mark it passed by inference.
- [ ] Update README commands and architecture to match the actual Vite + API workspace, not historical Next.js/backend wording.

### Tests to add/strengthen

- API authorization matrix: anonymous, student, admin, owner and non-owner.
- CSRF/CORS and cookie/bearer tests.
- Migration deploy against empty PostgreSQL; migration utility tests from CI.
- Mobile typecheck/build and device smoke checklist.
- Desktop packaging smoke test.
- Staging deployment smoke tests recorded separately from CI.

### Acceptance gate

No unresolved critical/high security issue without explicit mitigation/acceptance; migration and restore are proven on non-production data; release claims distinguish CI, staging and physical-device evidence.

---

## 9. PR sequence and merge boundaries

Use these as coherent implementation PRs. The exact split may change after Workstream A finds overlap or dependencies, but scope must remain narrow.

| Order | Proposed PR | Scope | Required evidence before merge |
|---:|---|---|---|
| 1 | Practice workflow correctness | B: API + web + tests | Practice end-to-end and ownership/regression tests |
| 2 | Formal exam lifecycle hardening | C: API + web + tests | Start/recovery/autosave/heartbeat/submit concurrency tests |
| 3 | Communication workflow completion | D: announcement/notification API + web + tests | Recipient isolation, expiry, acknowledgement and retry-idempotency tests |
| 4 | Admin/student UX acceptance | E: focused component extraction + responsive/accessibility fixes | Navigation matrix and UI regression suite |
| 5 | Intelligence qualification | F: analytics/model/recommendation gaps | Data provenance, leakage checks, baseline and fallback evidence |
| 6 | Security/release blockers | G: confirmed findings and release docs | Security matrix, migration/restore and staging/device evidence |

**PR sizing:** Keep each PR reviewable. If a workstream is too large, split only at a real contract boundary (for example API invariant first, then UI integration) and document the dependency. Do not split a trivial one-line test adjustment into its own PR.

**Merge rule:** Wait for every required check on the exact PR head SHA. If CI fails, retrieve the failing job log, identify the first root-cause failure, fix only that cause, rerun the targeted test, then push. Never stack speculative commits while a previous failure is not understood.

---

## 10. Definition of done

A feature is complete only when all applicable items are true:

- [ ] Requirement and acceptance criteria are linked.
- [ ] API contract and UI behavior agree.
- [ ] Authorization and data ownership are enforced server-side.
- [ ] Normal, invalid, empty, failure, retry and concurrency paths are covered as appropriate.
- [ ] Existing regression tests remain meaningful and pass.
- [ ] No unrelated behavior was changed.
- [ ] Documentation describes actual shipped behavior.
- [ ] Targeted tests pass locally/CI.
- [ ] Required Actions jobs pass on exact PR head.
- [ ] PR description records changed files, why, test commands/results, limitations and manual checks.
- [ ] Phase status is updated only with evidence; production/device checks are not inferred from CI.

## 11. Explicitly out of scope for the one-day push

Do not burn the day on speculative redesigns or optional integrations:

- No full rewrite of `web/src/App.tsx`.
- No new database or ORM migration unless a demonstrated product invariant requires it.
- No hosted LLM, Python inference service or GPU dependency.
- No push/email provider integration without configured credentials and a clear requirement.
- No collaborative-filtering feature without sufficient privacy-safe data.
- No claim that browser code detects force-close, crash, power-off or all cheating.
- No production data migration or destructive cleanup without a tested backup/restore and explicit approval.
- No release sign-off for platforms/devices that were not actually tested.

### 0.3 Verified changes merged after PR #106

**Current main SHA at this evidence update:** `a20fbde1a6b4e629fb0a88f571a9bc005dda781a`.

The following implementation batches are merged; they do not imply that the whole related workstream is complete:

- [PR #108](https://github.com/smdgamekingindo-TN/ArcTester/pull/108): account-isolated student communications state and authoritative unread counts. [Actions](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42970039296).
- [PR #109](https://github.com/smdgamekingindo-TN/ArcTester/pull/109): preserve web practice recovery after transient restore failures. [Actions](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42969068077).
- [PR #110](https://github.com/smdgamekingindo-TN/ArcTester/pull/110): create result notifications transactionally when reviewed exam results are released. [Actions](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42969307401).
- [PR #111](https://github.com/smdgamekingindo-TN/ArcTester/pull/111): align the announcement message limit with API validation. [Actions](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42969430206).
- [PR #112](https://github.com/smdgamekingindo-TN/ArcTester/pull/112): mobile notification inbox, unread count, mark-read and announcement acknowledgement. [Actions](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42970348800).
- [PR #113](https://github.com/smdgamekingindo-TN/ArcTester/pull/113): mobile practice-attempt persistence, resume, server-deadline timer recovery and in-app result review. [Actions](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42971079913).
- [PR #114](https://github.com/smdgamekingindo-TN/ArcTester/pull/114): cross-student practice-attempt ownership regression tests. [Actions](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42971389338).
- [PR #115](https://github.com/smdgamekingindo-TN/ArcTester/pull/115): scheduled announcement publishing and removal of duplicate announcement handlers that previously shadowed the dedicated router. [Actions](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42972911817).
- [PR #116](https://github.com/smdgamekingindo-TN/ArcTester/pull/116): Expo SDK-compatible native dependencies and a CI-built Android standalone APK artifact. [Main CI](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42974335120) · [Android APK build](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42974338953).
- [PR #117](https://github.com/smdgamekingindo-TN/ArcTester/pull/117): Windows NSIS installer packaging and downloadable CI artifact. [Main CI](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42974783000) · [Windows installer build](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42974783052).

The four standard CI jobs passed on the exact merged heads for these PRs. The Android and Windows workflows additionally completed native/package builds and uploaded artifacts. These are build/CI results, not device installation or runtime qualification.

**Still unverified:** Android physical-device sign-in/backend connectivity, offline/background/restart recovery and notification behavior; iOS build and device qualification; Windows installer runtime smoke tests; staging deployment, production migration and backup/restore; representative real-data qualification for Intelligence.


---

## 12. Execution status log

Update this table as work proceeds. Link every row to the implementation PR and its Actions run.

| Workstream | Status | PR | Actions / evidence | Remaining blocker |
|---|---|---|---|---|
| A — Baseline audit | IN PROGRESS | [#115](https://github.com/smdgamekingindo-TN/ArcTester/pull/115) | [CI #42972911817](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42972911817) confirmed the duplicate announcement route shadowing and its fix | Finish full route-to-test, navigation and model-ownership inventories |
| B — Practice correctness | IN PROGRESS | [#109](https://github.com/smdgamekingindo-TN/ArcTester/pull/109), [#113](https://github.com/smdgamekingindo-TN/ArcTester/pull/113), [#114](https://github.com/smdgamekingindo-TN/ArcTester/pull/114) | [#113 CI](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42971079913) · [#114 CI](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42971389338) | Finish full student UI/API lifecycle audit and Android device recovery smoke tests |
| C — Formal exam lifecycle | NOT STARTED | — | Existing phase evidence predates this audit; no new completion claim | Trace and test assignment → session → heartbeat → pause/resume → submit → review |
| D — Communications | IN PROGRESS | [#108](https://github.com/smdgamekingindo-TN/ArcTester/pull/108), [#110](https://github.com/smdgamekingindo-TN/ArcTester/pull/110), [#111](https://github.com/smdgamekingindo-TN/ArcTester/pull/111), [#112](https://github.com/smdgamekingindo-TN/ArcTester/pull/112), [#115](https://github.com/smdgamekingindo-TN/ArcTester/pull/115) | [#108 CI](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42970039296) · [#112 CI](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42970348800) · [#115 CI](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42972911817) | Complete delivery/acknowledgement audit and verify behavior on installed clients |
| E — UX and maintainability | IN PROGRESS | [#116](https://github.com/smdgamekingindo-TN/ArcTester/pull/116), [#117](https://github.com/smdgamekingindo-TN/ArcTester/pull/117) | [Android APK build](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42974338953) · [Windows installer build](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42974783052) | Install and smoke-test both artifacts; iOS build/device qualification remains |
| F — Intelligence | BLOCKED / UNVERIFIED | — | Existing intelligence roadmap and dataset CI only | Requires representative privacy-approved real data and staging qualification; finish remaining code acceptance audit |
| G — Security/release | IN PROGRESS | [#114](https://github.com/smdgamekingindo-TN/ArcTester/pull/114), [#116](https://github.com/smdgamekingindo-TN/ArcTester/pull/116), [#117](https://github.com/smdgamekingindo-TN/ArcTester/pull/117) | [Ownership CI](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42971389338) · [Android build](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42974338953) · [Windows build](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42974783052) | Staging security checks, backup/restore drill, installed-device tests and production release validation |

**Next action:** Complete Workstream A's route-to-test and ownership maps, then investigate the highest-severity remaining formal-exam lifecycle gap in Workstream C. Continue independent code work while device/staging/real-data gates remain explicitly unverified.
