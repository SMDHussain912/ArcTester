# ArcTester — Agent Execution Specification

**Parent plan:** [ARC_TESTER_COMPLETION_EXECUTION_PLAN.md](./ARC_TESTER_COMPLETION_EXECUTION_PLAN.md)  
**Repository:** `smdgamekingindo-TN/ArcTester`  
**Purpose:** Turn the completion plan into an execution contract an implementation agent can follow without repeatedly asking for planning decisions. This document defines how to investigate, implement, test, batch, report and continue work.

> This specification is not proof that a feature exists or is broken. The agent must inspect the current checked-out `main` and the relevant code before making any code-specific claim. A planned task becomes a confirmed task only after source and test evidence establish the gap.

---

## 1. Operating instructions for the implementation agent

### 1.1 Role and objective

Act as the implementation engineer for ArcTester. The objective is to finish the existing product by closing verified requirement gaps while preserving working behavior, user data, API contracts and merged fixes.

Do not spend user time discussing a plan that can be recorded in GitHub. Keep the task state, findings, decisions, code changes and test evidence in repository documentation and PRs.

### 1.2 Mandatory behavior

1. Start from the latest remote `main`; never assume a previous branch or local working tree is current.
2. Read, in order:
   - `docs/ARC_TESTER_16_PHASE_MASTER_ROADMAP.md`
   - `docs/PRODUCT_REQUIREMENTS.md`
   - `docs/ARC_TESTER_COMPLETION_EXECUTION_PLAN.md`
   - `docs/ARC_TESTER_AGENT_EXECUTION_SPEC.md`
   - `docs/ARC_TESTER_INTELLIGENCE_ROADMAP.md` when touching intelligence/model work.
3. Inspect the current implementation and tests before deciding what is missing. Search merged PRs and commit history when a fix may already exist.
4. Never implement from a file path copied blindly from a plan. Confirm the file exists and trace actual imports/call sites first.
5. Do not replace a working subsystem merely because its structure is inconvenient.
6. Do not add schema changes until existing fields, constraints, indexes and transaction boundaries have been inspected.
7. Make coherent batches of related changes. A batch should deliver one complete user-visible or API invariant, not a collection of unrelated edits.
8. Add or update tests in the same change as the implementation.
9. Run targeted tests before broad suites. Fix the first real failure before starting another speculative change.
10. Push a PR when the batch is coherent and verifiable. Do not wait for the entire project to be finished before opening a useful PR.
11. Continue to the next independent task after creating a PR; do not stop merely because one PR is awaiting review, unless the next task conflicts with its files or API contract.
12. Never merge unless explicitly instructed by the repository owner/user. Green Actions is not merge authorization.
13. Never say “completed” when only code was written. Distinguish implemented, locally tested, CI passed, merged, staged and device-verified.

### 1.3 Decision rules

When an acceptance criterion appears implemented:
- Find the implementation.
- Find the test that exercises it.
- Verify the test actually asserts the required behavior, not just a successful status code.
- Mark it `ALREADY COVERED` only if both source and test evidence support that conclusion.

When a criterion appears absent:
- Record the exact source path and function/component/route.
- Record the current behavior.
- Record the expected behavior from the requirement.
- Record the smallest safe implementation boundary.
- Add a failing regression test first where practical.

When a criterion cannot be verified:
- Mark it `BLOCKED / UNVERIFIED`, state the missing environment or evidence, and continue with independent work.
- Do not invent test results or infer real-device behavior from typecheck/build.

When the code contradicts the docs:
- Do not silently choose one.
- Identify whether the code is an intentional product decision or a defect.
- Prefer the explicit product requirement unless a newer approved decision exists.
- Record any required documentation correction.

---

## 2. Required task record

Every task in the execution log must use this structure. Keep it concise but specific.

### Task record template

- **ID:** stable identifier, e.g. `PRACTICE-API-01`
- **Requirement:** exact heading/section in `PRODUCT_REQUIREMENTS.md` or roadmap.
- **Severity:** P0 / P1 / P2, with user impact.
- **Evidence before change:** source paths + function/component + current behavior.
- **Gap:** one sentence describing what is wrong or missing.
- **Expected behavior:** observable result, including error/edge behavior.
- **Implementation plan:** ordered code changes, with exact paths confirmed during audit.
- **Data/API impact:** request/response, schema, authorization, transaction, migration; say “none” when none.
- **Tests:** exact test file(s), scenario, assertion, and command.
- **Acceptance:** binary conditions that must all pass.
- **Status:** NOT STARTED / INVESTIGATING / CONFIRMED GAP / IMPLEMENTING / LOCAL PASS / PR OPEN / CI PASS / MERGED / BLOCKED.
- **Evidence after change:** commit SHA, PR URL, test output or Actions run URL.

Do not create a task record with a guessed function name or guessed test filename. Use the actual symbol found in source.

---

## 3. Execution loop — repeat for every task

### Step 1 — Refresh and protect the working state

- Fetch remote refs and inspect current `main` SHA.
- Check whether the previous implementation branch has uncommitted changes or commits not pushed.
- Never discard, reset or overwrite unrelated user work.
- Create a task branch from the latest `origin/main` unless continuing an existing task branch intentionally.
- Record base SHA in the task log.

### Step 2 — Trace the complete workflow

For a student/admin feature, trace all applicable layers:

1. Navigation entry point / button.
2. React page/component and state owner.
3. API client function and request payload.
4. Express route registration.
5. Authentication and role/ownership middleware.
6. Zod parsing and validation.
7. Business logic/service function.
8. Prisma query/transaction and constraints.
9. API response and error mapping.
10. UI loading/success/empty/error/conflict state.
11. Reload/re-entry/retry behavior.
12. Existing tests and missing assertions.

For a background/model/dataset feature, trace:
1. Trigger and authorization.
2. Job creation and idempotency.
3. Worker lifecycle and retry policy.
4. Input provenance and validation.
5. Processing/model version.
6. Artifact/result persistence.
7. Read API and access control.
8. UI display and fallback.
9. Logs/metrics and failure recovery.
10. Unit, integration and pipeline tests.

Do not stop after inspecting the UI or route alone. A workflow is not understood until the relevant persistence and failure paths are understood.

### Step 3 — Establish a reproducible baseline

- Run the narrowest relevant existing test.
- Record whether it passes before changes.
- If it already fails on base `main`, capture the exact failure and determine whether it is related.
- Write a regression test for the confirmed missing behavior.
- Prefer a test that fails for the right reason; avoid broad snapshots that do not isolate the invariant.

### Step 4 — Implement the smallest complete fix

- Keep existing API shapes stable unless the requirement requires a change.
- If a contract must change, update all consumers (web, mobile, desktop, tests and docs) in the same PR or a clearly ordered dependency PR.
- Put authorization at the API boundary; never trust client-supplied user/role/owner IDs.
- Put multi-record invariants in a database transaction and/or database constraint, not only in frontend state.
- Make retryable operations idempotent where duplicate delivery/request is possible.
- Preserve historical records and immutable snapshots.
- Handle errors explicitly; do not swallow exceptions or return fake success.
- Avoid unrelated formatting/refactors in a functional fix.

### Step 5 — Verify in increasing scope

Use the exact scripts in package manifests and CI. Typical checks:

1. One targeted test.
2. Relevant API or web test suite.
3. Relevant lint.
4. Relevant typecheck.
5. Production build.
6. Root tests/lint/build/format checks.
7. Mobile/desktop checks if their contract or source changed.
8. Dataset/migration checks if those areas changed.
9. GitHub Actions on the exact PR head SHA.

For every command record:
- exact command,
- exit code/result,
- commit SHA tested,
- any skipped check and why.

### Step 6 — Review the diff as a maintainer

Before committing:
- Inspect the full diff, not just the last file edited.
- Check for accidental secrets, generated files, debug output, temporary code and unrelated changes.
- Check whether a new dependency is truly required.
- Check migration forward behavior and rollback implications.
- Check that tests would fail if the regression returned.
- Check no test was weakened or deleted to get green.
- Check docs and comments describe actual behavior.

### Step 7 — Commit, PR and continue

PR description must include:
- User-visible problem / requirement.
- Root cause and why this implementation is correct.
- Exact files changed and their responsibilities.
- API/schema changes (or explicitly none).
- Tests added and scenarios covered.
- Exact commands/results.
- CI run and tested head SHA.
- Known limitations and manual checks not performed.
- Follow-up task IDs, if any.

After opening the PR:
- Record its number and head SHA.
- Wait for checks to finish; inspect failed job logs.
- Fix the root cause and push a new commit if necessary.
- Continue another non-conflicting task while CI/review is pending.
- Do not merge without explicit authorization.

---

## 4. Workstream execution breakdown

The following are investigation and implementation sequences, not assertions that each defect currently exists. The audit must mark each item as ALREADY COVERED, CONFIRMED GAP, BLOCKED or NOT APPLICABLE.

### A — Baseline audit

**A-01 — Repository and CI baseline**
1. Record current `main` SHA and latest successful/failed Actions run.
2. Read root, API, web, mobile and desktop package scripts.
3. Extract required CI jobs, exact commands and any conditional jobs.
4. Record the exact checks that are required for PR merge.
5. Output: baseline table with SHA, workflow run, jobs, command and result.

**A-02 — API route inventory**
1. Read `api/src/index.ts` and follow every imported route registration.
2. List HTTP method + route pattern + handler + middleware.
3. Locate each route's tests.
4. Flag mutating routes without visible auth/role/ownership validation for deeper inspection.
5. Output: route-to-test-to-owner matrix.

**A-03 — UI navigation inventory**
1. Read the current student and admin navigation components and their state/router integration.
2. Enumerate every visible navigation item and action button.
3. Trace each to a rendered destination or API mutation.
4. Identify dead buttons, duplicate destinations, role leakage and stale active-state behavior.
5. Output: navigation matrix with role, action, destination, test and status.

**A-04 — Data model ownership map**
1. Read the complete Prisma schema and relevant migrations.
2. Group models by identity/auth, question bank, practice, formal exams, announcements, notifications, intelligence and audit.
3. For each model identify create/read/update/delete routes and UI owner.
4. Inspect unique constraints, foreign keys, cascade behavior and indexes.
5. Output: model-to-route-to-workflow map; list only demonstrated missing constraints.

**A-05 — Existing work and technical debt**
1. Inspect recent merged PRs, especially #104, #105 and #106.
2. Search TODO/FIXME/stubs/placeholder handlers/disabled controls/swallowed errors.
3. For each match inspect surrounding code and tests; discard stale or intentional comments.
4. Search for duplicate logic and inconsistent API contracts only where it affects a requirement.
5. Output: prioritized evidence-backed backlog; do not report raw search hits as defects.

### B — Practice workflow

**B-01 — Paper configuration contract**
1. Trace subject selection and topic selection from UI state to API payload.
2. Verify topic filters remain scoped to their selected subject.
3. Verify selected subject/topic pairs are validated server-side.
4. Verify requested count and difficulty values are bounded and validated.
5. Tests: valid single/multi-subject payloads; empty/duplicate/unknown filters; invalid topic-subject combinations; malformed count/difficulty.

**B-02 — Question selection and quota accounting**
1. Trace the query that selects eligible questions.
2. Verify no question can be selected twice in one paper.
3. Verify per-subject quotas and topic filters are applied before final count.
4. Verify insufficient pools return structured shortfall details, not silent underfilled success.
5. Verify deterministic behavior where seeded/randomized selection is expected to be reproducible in tests.
6. Tests: sufficient pool, shortfall by subject, shortfall by topic, mixed difficulty, duplicate prevention and empty pool.

**B-03 — Attempt persistence and recovery**
1. Trace attempt creation and uniqueness rules.
2. Trace answer writes, timestamps/revisions and server persistence.
3. Trace client backup key construction and restore ordering.
4. Verify backup is account/attempt scoped and cannot cross users.
5. Verify workspace navigation and browser reload restore the same attempt rather than creating another.
6. Tests: create once, save answer, reload, resume, navigate away/back, stale backup, logout/account switch, API unavailable and retry.

**B-04 — Scoring and result review**
1. Trace scoring from stored question/answer snapshot to persisted result.
2. Verify correct, incorrect, unanswered and excluded questions are counted consistently.
3. Verify denominator and percentage calculation for empty/partial attempts.
4. Verify repeated submission cannot create multiple results or mutate a completed score.
5. Verify answer key/explanation visibility follows review policy.
6. Tests: all-correct, all-wrong, mixed, unanswered, zero-question guard, duplicate submit and unauthorized result access.

**B acceptance:** Complete student workflow from configuration to persisted result passes API + web integration tests; ownership and retry paths are covered.

### C — Formal exam lifecycle

**C-01 — Assignment eligibility and session creation**
1. Trace assignment ownership, availability window, candidate eligibility and attempt limits.
2. Trace session create-or-resume path and database uniqueness/transaction.
3. Preserve PR #105 concurrent first-session fix.
4. Verify only one session and one start audit event can result from concurrent requests.
5. Tests: eligible, ineligible, not-yet-open, expired, wrong student, simultaneous start and repeated start.

**C-02 — Server-authoritative clock and lifecycle**
1. Identify server start timestamp, deadline, pause state and remaining-time calculation.
2. Confirm browser clock is display-only.
3. Trace heartbeat and distinguish connectivity telemetry from integrity/cheating signals.
4. Verify pause/resume/terminate transitions and allowed transition matrix.
5. Tests: normal start, heartbeat loss, reconnect, pause/resume, double pause, terminated resume, deadline boundary and server/client clock skew.

**C-03 — Autosave and conflict recovery**
1. Trace answer revision/version fields and update predicate.
2. Verify stale writes cannot overwrite newer answers.
3. Verify client conflict state preserves unsynced input and offers a deliberate retry/reconcile action.
4. Verify local backup cleanup on logout/account switch and correct attempt scoping.
5. Tests: sequential save, out-of-order save, duplicate request, offline answer, reconnect, conflict and account switch.

**C-04 — Submission, grading and attendance**
1. Trace submit authorization, final answer snapshot, grading and terminal status.
2. Verify transaction/idempotency under simultaneous submits and retries.
3. Verify attendance includes candidates who never started.
4. Verify invigilator actions require appropriate role and audit reason/event.
5. Tests: normal submit, duplicate submit, concurrent submit, expired submit, never-started attendance, unauthorized admin action and review-required outcome.

**C acceptance:** Every transition has a documented allowed/denied result; API integration and browser recovery tests prove no client-side override of server state.

### D — Announcements and notifications

**D-01 — Announcement lifecycle**
1. Trace admin create/edit/publish/expire and student active-list query.
2. Inspect existing announcement schema and view/acknowledgement model.
3. Verify server-side role checks, validation and expiry filtering.
4. Tests: admin write, student denied write, malformed content, unpublished, active, expired and boundary timestamp.

**D-02 — Per-user acknowledgement and inbox**
1. Trace acknowledgement record key and query scoping.
2. Verify acknowledgement for one student does not affect any other student.
3. Verify popup suppression and inbox history use consistent state.
4. Tests: acknowledge once, repeat acknowledgement, two students, reload, inbox history and API failure/retry.

**D-03 — Event-generated notifications**
1. Inventory actual product events that should notify users (assignment, exam availability, result or other explicitly required events).
2. Trace each event's recipient selection and notification creation.
3. Identify a stable event identity for idempotency; do not deduplicate by text.
4. Decide transaction coupling vs durable retry based on current architecture.
5. Verify read/unread count is consistent across all surfaces.
6. Tests: each event recipient set, non-recipient isolation, repeated event, rollback/failure, read/unread and count refresh.

**D acceptance:** An event can be traced to the correct user's notification exactly once, with isolated acknowledgement/read state and visible failure handling.

### E — UI, accessibility and maintainability

**E-01 — Navigation and control audit**
1. Use A-03 matrix.
2. Test every visible action with the correct role.
3. Confirm buttons have real handlers and links have valid destinations.
4. Fix stale state, dead controls and incorrect page transitions.
5. Tests: destination rendering, role restrictions, browser back/re-entry where relevant.

**E-02 — Forms and asynchronous states**
1. Inventory forms in student and admin workflows.
2. Verify labels, validation, disabled/busy state, duplicate-submit prevention and actionable error display.
3. Verify destructive actions have confirmation and server-side authorization.
4. Tests: valid/invalid form, pending, server error, retry, cancel and duplicate click.

**E-03 — Responsive/accessibility pass**
1. Identify primary flows and supported viewport breakpoints from existing CSS/design.
2. Verify phone and desktop layouts without horizontal overflow or hidden critical controls.
3. Verify keyboard order, visible focus, semantic labels/headings and reduced motion.
4. Fix only demonstrated defects; avoid cosmetic redesign unrelated to acceptance.
5. Tests: keyboard interaction and responsive assertions where existing test tooling supports them; record manual checks otherwise.

**E-04 — Safe modularization**
1. Profile/inspect the largest high-change blocks in `App.tsx`.
2. Choose one feature boundary with stable inputs/outputs.
3. Extract component/hook without changing behavior.
4. Add component tests and preserve App integration tests.
5. Compare behavior and run web suite after each extraction batch.
6. Do not perform a wholesale rewrite.

**E acceptance:** All visible core actions work, role navigation is correct, responsive/accessibility defects are fixed with evidence, and extraction preserves behavior.

### F — Intelligence, analytics and models

**F-01 — Analytics correctness and isolation**
1. Trace source records for every displayed metric.
2. Exclude unfinished attempts and apply formal review-required policy.
3. Verify student identity is derived from auth context, not trusted request input.
4. Verify weak-area denominator, sample threshold and insufficient-history behavior.
5. Tests: empty history, one record, mixed practice/exam, unfinished attempt, review-required and cross-user access.

**F-02 — Recommendation evidence**
1. Trace recommendation inputs and scoring/reason generation.
2. Verify every reason maps to actual student performance evidence.
3. Verify cooldown and duplicate recommendation suppression.
4. Verify low-data users receive a safe neutral/insufficient-data state.
5. Tests: reason correctness, cooldown, duplicate suppression, no history and cross-user access.

**F-03 — Dataset privacy and leakage**
1. Trace dataset export inputs and fields.
2. Enumerate direct identifiers and quasi-identifiers; exclude or transform as required.
3. Record dataset provenance and schema version.
4. Verify split strategy prevents student leakage and respects chronology where required.
5. Tests: PII exclusion, malformed rows, missing values, split overlap and deterministic conversion.

**F-04 — Model training, validation and inference**
1. Trace job enqueue, worker, artifact storage, registry and inference.
2. Verify model artifact metadata and schema before loading.
3. Compare candidate and statistical baseline on same valid held-out set.
4. Prevent synthetic-only test data from qualifying a production model.
5. Verify fallback on missing/stale/invalid model.
6. Tests: worker retry, invalid artifact, baseline fallback, metric threshold, promotion permissions and rollback.

**F acceptance:** Insights are traceable to eligible records; models have valid provenance, leakage-safe evaluation and safe fallback. Heuristics are labelled as heuristics.

### G — Security and release

**G-01 — Authorization matrix**
1. Enumerate every mutating and sensitive read route.
2. For each, record anonymous/student/admin/owner/non-owner expected access.
3. Verify auth middleware, role and resource ownership in the route/service.
4. Add integration tests for allowed and denied cases.
5. Do not rely on hidden UI controls for security.

**G-02 — Input, session and transport security**
1. Inspect Zod schemas and reject unknown/invalid fields according to existing conventions.
2. Test cookie + CSRF/origin flow separately from bearer-token native flow.
3. Verify CORS allowlist, cookie flags and production config from actual files/environment docs.
4. Verify errors/logs do not expose tokens, secrets or sensitive records.
5. Tests: invalid payload, CSRF, origin, CORS, expired token and safe error response.

**G-03 — Database and migration safety**
1. Inspect migration history and schema drift.
2. Apply migrations to a clean disposable PostgreSQL database.
3. Verify indexes, foreign keys, uniqueness and expected seed/bootstrap behavior.
4. Test backup/restore on disposable non-production data.
5. Never run destructive operations against production or user data.
6. Record exact commands and database version.

**G-04 — Web/mobile/desktop release checks**
1. Web: production build + staging auth and core workflow smoke test.
2. Mobile: typecheck/build, install on Android device, verify login, practice, exam, reconnect and notifications.
3. Desktop: package build/install and core supported workflow smoke test.
4. iOS: mark blocked if Apple toolchain/device is unavailable.
5. Separate CI evidence from staging/device evidence in release report.

**G acceptance:** No unresolved critical/high security defect without documented mitigation; clean database migration and restore verified; platform claims match actual tests.

---

## 5. Efficient batching and parallel execution

### 5.1 What may run in parallel

After A-01 through A-04 establish ownership boundaries:
- Practice workflow (B) can run in parallel with intelligence audit (F), provided F consumes stable completed-attempt contracts and does not edit the same files.
- Communications (D) can run in parallel with practice (B) if shared `App.tsx` integration edits are isolated or assigned to one branch.
- Security route audit (G-01) can run in parallel as read-only investigation.
- UI accessibility audit (E-03) can run in parallel as read-only investigation.

### 5.2 What must not run in parallel

- Two branches editing `web/src/App.tsx` without an agreed integration owner.
- Two branches changing the same Prisma schema/migration chain.
- API contract changes and client integration without a declared dependency/compatibility plan.
- A second fix for a failing CI job before the first root cause is understood.
- Any task that depends on a not-yet-merged schema/API change unless the branch is explicitly based on that change.

### 5.3 Preferred batch size

A batch should normally include:
- one end-to-end behavior or one backend invariant,
- implementation and regression tests,
- docs update if behavior/contract changed,
- one PR.

Split only when a real dependency boundary exists. Combine adjacent low-risk fixes when they share the same files and test surface. Avoid tiny PR spam and avoid a single mega-PR.

### 5.4 Conflict avoidance

Before starting a new branch, compare its planned files with open implementation PRs. If overlapping:
- choose one owner branch for the shared integration file,
- make other work branch independent service/component files,
- or serialize the changes.
Do not merge conflicting branches by guessing.

---

## 6. Progress tracking format

Maintain this table in the parent execution plan and add detailed task rows here as audit proceeds.

| Task ID | Workstream | Status | Source evidence | Test evidence | PR / commit | Blocker |
|---|---|---|---|---|---|---|
| A-01 | Baseline | NOT STARTED | — | — | — | — |
| A-02 | API inventory | NOT STARTED | — | — | — | — |
| A-03 | UI navigation | NOT STARTED | — | — | — | — |
| A-04 | Data ownership | NOT STARTED | — | — | — | — |
| A-05 | Existing work/debt | NOT STARTED | — | — | — | — |
| B-01…B-04 | Practice | NOT STARTED | — | — | — | Audit required |
| C-01…C-04 | Formal exams | NOT STARTED | — | — | — | Audit required |
| D-01…D-03 | Communications | NOT STARTED | — | — | — | Audit required |
| E-01…E-04 | UX | NOT STARTED | — | — | — | Audit required |
| F-01…F-04 | Intelligence | NOT STARTED | — | — | — | Audit required |
| G-01…G-04 | Security/release | NOT STARTED | — | — | — | Audit required |

Status meanings:
- **NOT STARTED:** no investigation.
- **INVESTIGATING:** source/test tracing in progress.
- **ALREADY COVERED:** source and adequate tests prove requirement.
- **CONFIRMED GAP:** reproducible defect or missing acceptance criterion recorded.
- **IMPLEMENTING:** code/test changes in progress.
- **LOCAL PASS:** required local checks pass on stated SHA.
- **PR OPEN:** PR exists; checks may still be running.
- **CI PASS:** all required checks pass on exact PR head SHA.
- **MERGED:** merge commit verified on target branch.
- **BLOCKED:** missing external dependency/environment/approval; explain exactly.

Never mark a task complete because its PR was opened or because a neighboring task passed.

---

## 7. Final release acceptance matrix

The product must not be declared complete until every applicable row has one of: PASS with evidence, BLOCKED with owner/mitigation, or NOT APPLICABLE with reason.

| Area | Required proof |
|---|---|
| Authentication/roles | API authorization matrix and cookie/native auth tests |
| Question bank | Admin create/edit/publish and student-safe read behavior |
| Practice | Configure, start, persist, recover, submit, score and review |
| Formal exam | Eligibility, start/resume, deadline, heartbeat, autosave, pause/resume, submit and attendance |
| Announcements | Admin lifecycle, expiry, per-user acknowledgement and inbox |
| Notifications | Correct recipients, idempotent event creation, read/unread consistency |
| Student UX | Navigation, dashboard, history, results and all primary controls |
| Admin UX | Question/assignment/exam/announcement management and audit |
| Intelligence | Data provenance, privacy, evaluation, fallback and user isolation |
| Web | Production build and staging smoke test |
| Android | Build/install and real-device core workflow |
| Desktop | Package/install and supported workflow |
| Database | Clean PostgreSQL migration and non-production backup/restore |
| CI | All required checks green on exact merged commits |
| Documentation | Setup, environment, deployment, limitations and release notes match reality |

A row that cannot be physically tested must remain BLOCKED; it must not be silently converted to PASS.

---

## 8. Required final implementation report

At the end of each execution session, report only:

1. **Completed this session:** task IDs, code behavior delivered, PR/commit links.
2. **Verification:** exact commands, pass/fail, Actions run and exact SHA.
3. **Remaining:** next highest-priority task IDs.
4. **Blocked:** only real blockers and what access/environment is missing.
5. **Risk:** any data migration, API compatibility or release risk.

Do not provide a long narrative of routine tool calls. Do not claim project completion while any P0 task is unverified or any release matrix row is falsely marked as passed.

---

## 9. Immediate next execution

1. Run A-01 through A-05 against current remote `main`.
2. Record current SHA and compare all open PR heads to avoid overlapping work.
3. Build the route/test, navigation and Prisma ownership matrices.
4. Reconcile findings with the master roadmap and existing merged PRs.
5. Pick the highest-severity confirmed gap that can be delivered as one complete, testable slice.
6. Implement it with tests, open a PR, inspect Actions, then continue with the next non-conflicting slice.
7. Keep this document and the parent plan updated with actual evidence after each batch.

**Do not ask the user to re-approve ordinary implementation choices already covered by the product requirements. Ask only when a destructive action, product-policy decision, secret/configuration, or genuinely ambiguous behavior requires owner input.**
