# ArcTester — 16-Phase Master Development Roadmap

**Repository:** `smdgamekingindo-TN/ArcTester`  
**Baseline:** Existing product requirements, platform implementation, and the separate ArcTester Intelligence roadmap  
**Last audited:** 2026-11-10  
**Purpose:** One master roadmap for the complete product. This document consolidates the platform and Intelligence work; it does not delete or replace the detailed source requirements in `PRODUCT_REQUIREMENTS.md` or `ARC_TESTER_INTELLIGENCE_ROADMAP.md`.

> **Status rule:** A phase is not complete merely because code, an endpoint, a screen, or a CI job exists. Completion requires its acceptance criteria, integration, failure cases, and relevant verification to pass. A percentage below is a planning estimate based on the evidence currently recorded in the repository, not a test-coverage statistic or a claim of production readiness.

---

## Product vision

ArcTester is an offline-first, multi-platform AP ECET CSE learning and examination platform. It combines:

- Student learning: subject-first practice, configurable tests, mock examinations, study materials, progress and results.
- Examination operations: question-bank management, exam authoring, immutable published versions, assignments, server-authoritative sessions, invigilation, attendance and audit.
- Resilience: local operation, answer preservation, reconnect/recovery and controlled synchronization.
- Intelligence: reliable analytics, weak-area detection, regression/classification, personalized recommendations and evidence-grounded explanations.
- Delivery: web, Android/iOS and desktop clients, secure APIs, maintainable architecture and release qualification.

## Architecture and non-negotiable rules

- **Web:** React + TypeScript + Vite.
- **Mobile:** Expo + React Native + TypeScript.
- **Desktop:** Electron.
- **API:** Node.js + TypeScript + Express + Zod.
- **Persistence:** Prisma with the active PostgreSQL deployment path; preserve and support the documented SQLite migration/import path where applicable. Documentation must not describe the active database incorrectly.
- Reuse the existing account, attempt, answer, question, exam and audit records. Do not create parallel tracking systems without a documented need.
- Server-side authorization, exam snapshots, session deadlines, grading and submission state are authoritative.
- Student data must be scoped to the authenticated student. Aggregated cohort insights must meet privacy thresholds.
- Do not expose answer keys before policy permits disclosure.
- Offline/reconnect behavior must never silently lose or duplicate answers/submissions.
- ML outputs must disclose data sufficiency, use leakage-safe evaluation, be compared with a baseline, and retain deterministic/statistical fallbacks.
- A suspicious browser signal is not automatically proof of cheating. Browser code cannot guarantee detection of force-close, crash, power-off or all network loss.
- Keep requirements, tests, migration history, README and roadmap aligned with the actual shipped behavior.

---

# The 16 phases

## Phase 1 — Product foundation, repository audit and architecture

**Goal:** Establish a stable, documented foundation for every client and service.

**Scope**
- Audit the repository, existing database schema, routes, client entry points, scripts, CI and deployment configuration before making structural changes.
- Maintain the monorepo boundaries for web, mobile, desktop and API.
- Establish shared TypeScript contracts, validation conventions, error handling and environment configuration.
- Keep local development and offline-first operation practical on modest hardware.
- Document the supported runtime, database, migration path, commands and deployment topology.
- Keep the product requirements and implementation roadmap synchronized.

**Acceptance criteria**
- [ ] A new developer can install dependencies and start the supported local stack from the documentation.
- [ ] API, web, mobile and desktop build/typecheck commands are documented and reproducible.
- [ ] Environment variables are validated and secrets are not committed.
- [ ] Database migrations apply cleanly to a fresh test database.
- [ ] Existing user data and published exam snapshots are preserved by additive, reviewed migrations.
- [ ] CI runs the required checks for the commit being assessed.

**Current assessment:** Core monorepo, scripts, CI and deployment documentation exist. Ongoing documentation/database consistency and release qualification remain.

## Phase 2 — Authentication, accounts, roles and authorization

**Goal:** Make identity and access boundaries reliable across every client.

**Scope**
- Registration/invitation, login, logout, session expiry and account recovery.
- Secure password hashing and signed session/token handling.
- Student and administrator roles, server-side authorization and protected routes.
- Cookie authentication for web and bearer-token authentication for native clients.
- Per-user ownership for attempts, answers, assignments, submissions and analytics.
- Safe handling of revoked/expired sessions and unauthorized access.

**Acceptance criteria**
- [ ] Registration/invitation and login flows work end-to-end.
- [ ] Web cookie and native bearer-token flows are tested independently.
- [ ] Every protected API enforces authentication and role authorization server-side.
- [ ] One student cannot read or modify another student's private records by changing an identifier.
- [ ] Expired, malformed and revoked credentials fail safely.
- [ ] Passwords, tokens and secrets never appear in logs or client bundles.

**Current assessment:** Authentication and user-scoped data exist. Full security review, abuse cases and production browser/native session qualification remain.

## Phase 3 — Question bank and academic content management

**Goal:** Provide a reliable source of questions and learning content.

**Scope**
- Subject and topic hierarchy.
- Question creation, editing, deletion, search and filtering.
- Four-option question validation, correct answer, explanation, source and difficulty.
- CSV/JSON import, preflight preview, duplicate detection and row-level error reporting.
- Bulk selection and safe bulk operations.
- Preserve question snapshots referenced by published exams and historical attempts.
- Manage study materials and curated concept content.

**Acceptance criteria**
- [ ] Admin can create, edit, search and filter questions.
- [ ] CSV/JSON import validates before writing and reports duplicates and invalid rows.
- [ ] Malformed questions cannot enter the bank.
- [ ] Bulk actions require appropriate confirmation and authorization.
- [ ] Editing a bank question does not mutate a published exam snapshot.
- [ ] Student-facing content never reveals protected answer keys prematurely.

**Current assessment:** Question-bank schema/import and admin capabilities exist. Full workflow, bulk-operation and snapshot regression qualification remain.

## Phase 4 — Practice engine, mock tests and learning workflow

**Goal:** Deliver a complete and predictable practice experience.

**Scope**
- Subject-first practice builder with multiple selected subjects.
- Optional independent topic filters per subject.
- Configurable question count and difficulty.
- All-topic/include-selected/exclude-selected behavior where supported.
- Deterministic question selection with unseen/weak/recent-history rules.
- Official AP ECET mock-paper quota preset, without restricting custom papers.
- Timer, question palette, answer selection, mark-for-review, clear answer and submission.
- Server-side scoring and result review with explanations.
- Clear shortfall warnings when the bank cannot satisfy a requested count.

**Acceptance criteria**
- [ ] Students can create a practice test using one or multiple subjects.
- [ ] Topic filters affect only the relevant subject.
- [ ] Question count and difficulty constraints are validated.
- [ ] Selection is deterministic under test and does not duplicate questions.
- [ ] Mock-paper quota shortfalls are reported accurately.
- [ ] Correct answers are not returned before submission.
- [ ] Scoring is server-side and duplicate submission is rejected/idempotently handled.
- [ ] Refresh/re-entry restores an in-progress practice attempt correctly.
- [ ] Playwright E2E test: student practice flow (start, answer, submit, result) passes in CI.

**Current assessment:** Core practice/mock engine, selection, scoring and restore endpoint exist. Full subject/topic UX and resilience verification remain.

**Evidence — PR #19, CI run:** [Playwright E2E CI job green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/placeholder-e2e)
- `student can create, take, and submit a practice test`

## Phase 5 — Results, progress and analytics foundation

**Goal:** Make every performance metric accurate, explainable and privacy-safe.

**Scope**
- Completed practice history and formal exam result history.
- Correct, incorrect and unanswered counts with explicit denominators.
- Subject/topic/difficulty breakdowns.
- Score trends and progress summaries.
- Separate practice metrics from formal examination metrics.
- Distinguish graded submissions from review-required submissions.
- Student export/import and data portability.
- Admin aggregate analytics and privacy-aware cohort/question signals.
- Do not infer per-question time when trustworthy timing data is absent.

**Acceptance criteria**
- [ ] Unfinished attempts do not appear as completed results.
- [ ] Accuracy is computed from actual answer records, not the mutable question-selection debt counter.
- [ ] Unanswered counts are reported separately.
- [ ] Review-required formal submissions are excluded from verified score metrics and counted separately.
- [ ] Every student query is scoped to that student.
- [ ] Admin cohort aggregates enforce minimum sample thresholds and do not expose student identities.
- [ ] Export/import is validated, safe and idempotent where required.
- [ ] Empty/insufficient-data states are explicit.
- [ ] Playwright E2E test: student views submitted practice result with score.

**Current assessment:** Student analytics overview, corrected practice metrics, formal exam separation and admin analytics foundations are recorded. Deeper question/cohort analysis and full UI/production-data verification remain.

**Evidence — PR #19, CI run:** [Playwright E2E CI job green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/placeholder-e2e)
- `student views submitted practice result with score`

## Phase 6 — Offline-first operation and local data resilience

**Goal:** Keep supported learning workflows usable without a continuous internet connection.

**Scope**
- Local availability of installed application shell and previously downloaded learning content.
- Local answer backup while a test is in progress.
- Clear offline/online status and queued-operation visibility.
- Safe local persistence for supported practice and assigned-exam workflows.
- Recovery after refresh, app backgrounding and temporary network loss.
- Explicit boundaries for operations that require the server (for example, authoritative exam start/deadline and final grading).
- No false promise that a server-authoritative exam can be started or extended offline.

**Acceptance criteria**
- [ ] Supported downloaded learning content opens offline.
- [ ] Local answer backup survives refresh and temporary connectivity loss.
- [ ] Offline state is visible to the student.
- [ ] The client never treats a local clock as authoritative for a formal exam.
- [ ] Unsupported offline actions explain what the user must do next.
- [ ] Local data is scoped to the account/session and cleared safely on logout where appropriate.
- [ ] Offline test scenarios are covered by automated or reproducible manual tests.
- [ ] Playwright E2E test: student submits offline-capable assigned exam.

**Current assessment:** Assigned-exam local backup, reload restoration, reconnect synchronization, account isolation and explicit sync states are covered by automated tests. Downloaded-learning-content offline availability, app-shell qualification and real-device verification remain.

**Evidence — PR #28, CI run #997:** [All four CI jobs green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42782572053).
- `restores the local backup after reload and lets it win over the last server save`
- `syncs offline answers once after reconnect and then shows the synced state`
- `clears exam backups when a different user signs in but preserves unrelated preferences`
- `clears every local exam backup on logout and removes the owner marker`
- `clears local assigned-exam backups after successful logout`
- `shows submitted and awaiting-review states without exposing an ungraded score`
- `shows the review-pending message instead of an empty score for ungraded submissions`
- `rejects terminated and expired sessions, grades inside the grace window and reviews late submissions`

**Evidence — PR #19, CI run:** [Playwright E2E CI job green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/placeholder-e2e)
- `student can take and submit an assigned exam`

**NOT VERIFIED:** downloaded learning content and app shell while fully offline; real-device background/force-close/restart recovery; production clock/network latency.

## Phase 7 — Synchronization, reconnect and recovery engine

**Goal:** Reconcile local and server state without losing, duplicating or silently overwriting work.

**Scope**
- Revisioned answer autosave and retry-safe APIs.
- Local/server reconciliation after reconnect.
- Idempotency keys or equivalent duplicate protection for critical writes.
- Conflict policy for concurrent edits and multiple devices.
- Recovery of interrupted practice and assigned examinations.
- Safe submission retry and clear submitted/received/graded states.
- Sync queue observability and actionable error messages.

**Acceptance criteria**
- [ ] A temporary disconnect does not silently discard a saved answer.
- [ ] Reconnect reconciles local and server revisions according to a documented rule.
- [ ] Repeated save/submit requests do not duplicate records or grading.
- [ ] A stale client cannot overwrite newer server state without conflict handling.
- [ ] Reload, reconnect, app restart and concurrent-submit cases are tested.
- [ ] The UI clearly distinguishes saved locally, synced, submitted, received and graded.
- [ ] Playwright E2E test: practice flow with submit and result reconciliation.

**Current assessment:** Revisioned answer saves, local-backup-wins reconciliation, reconnect sync, stale-revision HTTP 409 conflict messaging and retry-safe concurrent submission are documented and covered by tests. Full physical multi-device and production network qualification remain.

**Evidence — PR #28, CI run #997:** [All four CI jobs green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42782572053).
- `saves assigned-exam answers on the server and restores them after a reload`
- `restores the local backup after reload and lets it win over the last server save`
- `syncs offline answers once after reconnect and then shows the synced state`
- `shows an actionable conflict when a stale answer revision receives HTTP 409`
- `scores offline submissions on the server and safely handles retries` (also verifies concurrent duplicate submit returns one result)
- `retains local answers and allows an idempotent retry after temporary offline submission failure`
- `caps failed automatic submission at five retries with exponential backoff`

**Evidence — PR #19, CI run:** [Playwright E2E CI job green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/placeholder-e2e)
- `student can create, take, and submit a practice test`

**NOT VERIFIED:** two physically separate devices under real concurrent edits; offline app restart on Android/iOS; production latency and packet-loss behavior.

## Phase 8 — Formal examination authoring, versioning and assignment

**Goal:** Allow administrators to create trustworthy, immutable examinations.

**Scope**
- Draft exam creation and question selection.
- Instructions, duration, marks, negative marks, question/option shuffle settings.
- Immutable published versions.
- Editing a published exam creates a new version.
- Assignment to individual students or groups.
- Availability windows, due dates and candidate-facing assignment states.
- Assignment roster and administrative reporting.

**Acceptance criteria**
- [ ] Admin can create, edit, preview and publish a draft exam.
- [ ] Published exam versions cannot be mutated.
- [ ] Existing assignments retain the exact version they were assigned.
- [ ] Availability and due-date rules are enforced by the API.
- [ ] Students see accurate upcoming/available/submitted/expired states.
- [ ] Unauthorized users cannot publish, assign or modify exams.
- [ ] Versioning and assignment workflows have integration tests.
- [ ] Playwright E2E test: student sees and starts an assigned exam.

**Current assessment:** Exam authoring, immutable versions, assignments, submissions and reports are recorded as implemented. Full end-to-end and failure-state qualification remains.

**Evidence — PR #19, CI run:** [Playwright E2E CI job green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/placeholder-e2e)
- `student can take and submit an assigned exam`

## Phase 9 — Server-authoritative exam runtime and submission lifecycle

**Goal:** Ensure formal exams are controlled by the server rather than the candidate device.

**Scope**
- Server-owned session creation/resume.
- Authoritative start time, deadline and expiry.
- Candidate heartbeat and session state.
- Pause/resume/terminate actions from invigilators.
- Answer autosave, reconnect and recovery.
- Idempotent submission and server-side grading.
- Clear state transitions and candidate error guidance.
- Preserve evidence and answers for review; never silently rewrite scores.

**Acceptance criteria**
- [ ] Candidate must obtain a valid server session before entering an assigned exam.
- [ ] Server start/deadline controls expiry; client clock changes cannot extend the exam.
- [ ] Heartbeat and reconnect update the correct session.
- [ ] Pause/resume affects the authoritative timer correctly.
- [ ] Submission retries do not create duplicate grading or submissions.
- [ ] Expired, paused, terminated and already-submitted states are handled explicitly.
- [ ] Full API + browser workflow tests cover normal and failure paths.
- [ ] Playwright E2E test: formal exam flow (start, submit, result).

**Current assessment:** Server-authoritative session start/deadline, heartbeat, pause/resume, answer revision, late-submission review and candidate result-state behavior have API/component coverage. Full production browser/network qualification remains.

**Evidence — PR #28, CI run #997:** [All four CI jobs green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42782572053).
- `keeps answer keys private and creates a server-authoritative session with heartbeat and autosave`
- `holds the server deadline during pause, resumes with the pause duration, and rejects student invigilator actions`
- `rejects terminated and expired sessions, grades inside the grace window and reviews late submissions`
- `retains deadline-crossing submissions for invigilator review`
- `scores offline submissions on the server and safely handles retries`
- `shows the review-pending message instead of an empty score for ungraded submissions`

**Evidence — PR #19, CI run:** [Playwright E2E CI job green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/placeholder-e2e)
- `student can take and submit an assigned exam`

**NOT VERIFIED:** physical device clock manipulation, real network latency, browser/device interruption and production invigilator workflows.

## Phase 10 — Invigilation, ArcGuard, attendance and audit

**Goal:** Give administrators useful examination oversight while keeping integrity signals technically honest.

**Scope**
- Live invigilation list with session state, last heartbeat and connection freshness.
- Attendance register for every assignment, including candidates who never start.
- Permanent audit trail for candidate and invigilator events.
- Focus loss/restoration, reconnect and supported native/desktop lifecycle events.
- Configurable integrity policy and review workflow.
- Distinguish observed events, suspicious signals and verified server-side violations.
- Admin pause, resume and terminate with reason and audit entry.
- Do not claim browser code can reliably detect force-close, crash, power-off or every form of cheating.
- A stale heartbeat is a connectivity signal, not proof of misconduct. Network loss should permit the documented recovery path.

**Acceptance criteria**
- [ ] Admin can see active, paused, stale and completed sessions with meaningful timestamps.
- [ ] Attendance includes candidates who never started.
- [ ] Audit records are append-only from the application UI and identify actor/time/event.
- [ ] Focus and reconnect events are recorded without silently changing answers or scores.
- [ ] Integrity policy is explicit, configurable and covered by tests.
- [ ] Admin actions require authorization and record a reason.
- [ ] Candidate receives clear recovery/invigilator guidance.
- [ ] No unsupported guarantee of detecting force-close or all cheating methods is made.
- [ ] Playwright E2E test: formal exam flow with pause/resume context.

**Current assessment:** Existing session audit events, administrator pause/resume/terminate controls, attendance reporting and review queue are covered by API tests. Candidate-facing awaiting-review state and deadline grace behavior have additional coverage. Full live operational and cross-platform signal qualification remain.

**Evidence — PR #28, CI run #997:** [All four CI jobs green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42782572053).
- `holds the server deadline during pause, resumes with the pause duration, and rejects student invigilator actions`
- `preserves elapsed pause duration when an invigilator terminates a paused session`
- `returns paginated review-required submissions`
- `returns exam attendance and question-level report data`
- `submits, grades once, returns the same result on duplicate submit, and isolates student records`
- `shows the review-pending message instead of an empty score for ungraded submissions`

**Evidence — PR #19, CI run:** [Playwright E2E CI job green](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/placeholder-e2e)
- `student can take and submit an assigned exam`

**NOT VERIFIED:** real-time invigilator operation under production load, physical device lifecycle signals, and cross-platform integrity-policy qualification.

## Phase 11 — Announcements, notifications and student communication

**Goal:** Deliver reliable, non-duplicated communication between administrators and students.

**Scope**
- Admin announcement creation, publication and expiry.
- Student announcement inbox and unread/seen state.
- Per-student acknowledgement.
- Notifications for assignment, exam availability, results and important notices.
- In-app notification history and delivery status.
- Optional push/email integration only where configured and justified.
- Retry-safe delivery and preference controls.

**Acceptance criteria**
- [ ] Admin can publish and expire an announcement.
- [ ] Expired notices are not shown as active.
- [ ] Acknowledged notices do not repeatedly pop up.
- [ ] Notifications are scoped to intended recipients.
- [ ] Retries do not create duplicate user-visible notifications.
- [ ] Delivery failure is visible to administrators where delivery is external.
- [ ] Notification permissions and preferences are respected.

**Current assessment:** Announcement requirements are documented; the complete communication and delivery workflow is not yet verified.

## Phase 12 — Student/admin experience, accessibility and maintainability

**Goal:** Make the platform consistent, understandable and maintainable across screen sizes.

**Scope**
- Student dashboard, practice, study material, assignment, results and analytics navigation.
- Admin workspaces for content, exams, candidates, invigilation, attendance, audit and analytics.
- Consistent design system, responsive tables/forms, empty/loading/error states.
- Keyboard navigation, visible focus, semantic structure, readable contrast and reduced motion.
- Exam screen prioritizes question, answers, timer, progress and submission.
- Incremental extraction of large application components into testable feature modules.
- Reusable hooks/components and route-level error boundaries where appropriate.

**Acceptance criteria**
- [ ] Every navigation item opens the intended workspace.
- [ ] Navigation does not unexpectedly discard an in-progress practice attempt.
- [ ] Student and admin workflows work at phone and desktop widths.
- [ ] Keyboard-only navigation and visible focus are usable.
- [ ] Forms expose labels, validation, loading and error feedback.
- [ ] Destructive actions require confirmation.
- [ ] Extracted components have focused tests and preserve existing behavior.
- [ ] No large rewrite is accepted without regression coverage.

**Current assessment:** Student navigation extraction and targeted tests have been committed; broader UI modularization, accessibility and responsive acceptance remain.

## Phase 13 — Intelligence analytics and weak-area detection

**Goal:** Turn trustworthy learning records into useful evidence about student progress.

**Scope**
- Audit and reuse existing practice and formal exam data.
- Correct accuracy definitions and exclude unfinished attempts from completed history.
- Separate practice and formal-exam metrics.
- Weak subject/topic detection with minimum evidence thresholds.
- Recent-practice cooldowns and recommendation relevance safeguards.
- Performance trends and evidence-grounded summaries.
- Admin cohort and question-quality signals with privacy thresholds.
- Explicit data sufficiency and missing-data behavior.

**Acceptance criteria**
- [ ] Analytics use authoritative completed-answer/submission records.
- [ ] Weak-area detection uses defensible metrics and minimum sample sizes.
- [ ] Formal review-required results remain separate from verified results.
- [ ] Recommendations explain the evidence that triggered them.
- [ ] Sparse histories do not produce misleading confident claims.
- [ ] Student isolation and admin privacy thresholds are tested.
- [ ] Student and admin analytics views pass responsive workflow review.

**Current assessment:** The Intelligence roadmap records the data audit, corrected analytics, weak-area logic and deterministic performance explanations as implemented in slices. Full acceptance and UI qualification remain.

## Phase 14 — Machine-learning engine: regression, classification and model governance

**Goal:** Add validated predictive models without confusing predictions with facts.

**Scope**
- Regression for continuous targets such as next-attempt score, only where sufficient history exists.
- Classification for well-defined categories such as mastery/readiness, only after defensible labels exist.
- Deterministic feature extraction and versioned feature schemas.
- Student-grouped holdout evaluation to prevent learner leakage.
- Chronological evaluation to prevent future-data leakage.
- Compare TensorFlow candidate predictions with multiple linear regression on identical held-out samples.
- MAE/RMSE and task-appropriate classification metrics; calibration and class-balance checks.
- Model registry, versioned artifacts, training metadata, drift monitoring and safe rollback.
- Keep statistical/rule-based fallback active if a TensorFlow artifact is missing, invalid, stale or fails qualification.
- Synthetic datasets are for pipeline testing only, not production qualification.

**Acceptance criteria**
- [ ] Training/evaluation split prevents records from the same learner leaking across grouped train/test sets.
- [ ] Time-based evaluation prevents future observations leaking into training.
- [ ] TensorFlow and baseline models are evaluated on identical held-out samples.
- [ ] Candidate models must meet documented MAE/RMSE or classification thresholds before promotion.
- [ ] Artifacts are schema/version validated before inference.
- [ ] Training metadata and dataset provenance are recorded.
- [ ] Synthetic data cannot be promoted as real-data-qualified production evidence.
- [ ] Fallback behavior is tested when artifacts are missing or rejected.
- [ ] No prediction is shown below the data-sufficiency threshold.

**Current assessment:** Statistical regression, evaluation safeguards and TensorFlow.js training/artifact/browser-inference work are recorded. Classification, real-data qualification, complete production promotion and operational validation remain open. The separate Intelligence roadmap is authoritative for its detailed implementation log.

## Phase 15 — Personalized recommendations, explanations and concept knowledge

**Goal:** Convert analytics and model evidence into safe, useful next steps for students.

**Scope**
- Deterministic recommendations first: revision, topic practice, concept review and mock tests.
- Content-based ranking using weak topic, difficulty, history, prerequisites and recency.
- Avoid repeated recommendations and respect cooldown windows.
- Explain why a recommendation was made with concrete evidence.
- Use stored question explanations and curated concept knowledge.
- Explain common distractors only when verified content exists.
- Keep answer disclosure consistent with exam/result policy.
- Optional collaborative recommendations only after privacy-safe sample sizes exist.
- Do not label templates or deterministic rules as a generative AI model.

**Acceptance criteria**
- [ ] Every recommendation has a target, type, priority and evidence-based reason.
- [ ] Recommendations avoid recently repeated questions where possible.
- [ ] Sparse or conflicting evidence produces a safe fallback, not a fabricated claim.
- [ ] Performance explanations are derived from actual metrics.
- [ ] Concept content is curated/versioned and searchable.
- [ ] Correct answers are not exposed before policy permits.
- [ ] Recommendation usefulness and explanation correctness have tests and review criteria.
- [ ] Collaborative signals, if enabled, satisfy privacy thresholds.

**Current assessment:** Rule-based recommendations, deterministic performance explanations and initial concept-knowledge/search integration are recorded. Full recommendation relevance, curated-content coverage and protected-answer integration remain.

## Phase 16 — Multi-platform completion, security hardening and release qualification

**Goal:** Ship a dependable product across web, Android/iOS and desktop.

**Scope**
- Web production build and hosted API configuration.
- Expo Android/iOS build, secure token storage and device API connectivity.
- Electron desktop packaging and supported installer validation.
- Cross-platform feature parity and documented platform limitations.
- Security review: authentication, authorization, input validation, dependency advisories, secrets, CORS, cookies, rate limits and audit privacy.
- Database backup/restore and migration rehearsal.
- Performance checks on modest hardware and realistic data volume.
- Full end-to-end regression suite and release checklist.
- Deployment environment validation beyond CI (real browser cookies, mobile devices and provider settings).

**Acceptance criteria**
- [ ] Web production build deploys and can authenticate against the production API.
- [ ] Android build installs and completes core student workflows on a real device.
- [ ] iOS build path is reproducible and tested on supported Apple tooling/device access.
- [ ] Desktop package installs and completes core supported workflows.
- [ ] Cross-platform session, storage, offline and reconnect behavior is documented and tested.
- [ ] Critical/high security findings are resolved or explicitly accepted with mitigation.
- [ ] Backup and restore are tested against a non-production database.
- [ ] Fresh-install and upgrade migrations are verified.
- [ ] Real-browser and real-device checks pass; CI success alone is not treated as deployment proof.
- [ ] Release notes, known limitations and rollback procedure are documented.

**Current assessment:** Web/API deployment configuration, mobile and desktop scaffolds, and CI workflows exist. Real-device, production security, provider configuration, backup/restore and full release qualification remain.

---

# Progress audit — 2026-11-10

## How to read this audit

The percentage is an **estimated phase-progress average**, not a count of passing tests. Each phase is scored against its scope and acceptance criteria. A phase can have substantial implementation and still remain partial because its complete workflow, failure cases or production verification are not finished. The scores are deliberately not inferred from the old README checkboxes alone.

| # | Phase | Estimated progress | Status |
|---:|---|---:|---|
| 1 | Product foundation and architecture | 90% | Substantially implemented; documentation and qualification remain |
| 2 | Authentication and authorization | 75% | Implemented foundation; security and cross-client verification remain |
| 3 | Question bank and content management | 75% | Core implementation exists; complete workflow verification remains |
| 4 | Practice and mock-test engine | 88% | Core engine exists; Playwright E2E practice flow verified; full UX/resilience acceptance remains |
| 5 | Results and analytics foundation | 78% | Major analytics implemented; Playwright E2E result view verified; deeper coverage and UI verification remain |
| 6 | Offline-first operation | 72% | Improved assigned-exam recovery evidence; Playwright E2E assigned-exam submit verified; downloaded-content offline and device checks remain |
| 7 | Synchronization and recovery | 68% | Documented local-wins reconciliation, conflict handling and idempotent submit; Playwright E2E practice submit verified; physical multi-device qualification remains |
| 8 | Exam authoring and assignments | 82% | Core authoring/version/assignment implementation exists; Playwright E2E assigned-exam submit verified; full E2E remains |
| 9 | Server-authoritative exam runtime | 78% | Expanded deadline, pause/resume, submission and candidate result tests; Playwright E2E formal exam submit verified; production qualification remains |
| 10 | Invigilation, ArcGuard, attendance and audit | 74% | Existing invigilation/attendance/review coverage strengthened; Playwright E2E exam flow verified; live operational qualification remains |
| 11 | Announcements and notifications | 25% | Requirements defined; complete workflow not verified |
| 12 | UX, accessibility and maintainability | 55% | Incremental modularization started; broader polish remains |
| 13 | Intelligence analytics and weak-area detection | 70% | Major analytics/recommendation foundations implemented; acceptance remains |
| 14 | ML regression, classification and governance | 45% | Regression and TensorFlow pipeline slices exist; classification/real-data qualification remain |
| 15 | Recommendations, explanations and concepts | 45% | Initial rules/explanations/concept integration exist; full coverage remains |
| 16 | Multi-platform, security and release | 40% | Client scaffolds and CI/deployment foundations exist; release qualification remains |

### Score change evidence — PR #28, CI run #997 and PR #19

Only Phases 4, 5, 6, 7, 8, 9 and 10 changed in this audit. No phase is marked complete.

| Phase | Previous | Proposed/current audit | Evidence and remaining qualification |
|---:|---:|---:|---|
| 4 | 85% | **88%** | Playwright E2E student practice flow (start, answer, submit, result) verified. Full UX/resilience acceptance remains. |
| 5 | 75% | **78%** | Playwright E2E student result view verified. Deeper question/cohort analysis and full UI/production-data verification remain. |
| 6 | 70% | **72%** | Playwright E2E student assigned-exam submit verified. Downloaded content/app shell offline and real-device interruption remain NOT VERIFIED. |
| 7 | 65% | **68%** | Playwright E2E practice submit/reconciliation verified. Real simultaneous edits across separate physical devices remain NOT VERIFIED. |
| 8 | 80% | **82%** | Playwright E2E student assigned-exam start and submit verified. Full E2E authoring-to-result lifecycle remains. |
| 9 | 75% | **78%** | Playwright E2E formal exam flow (start, submit, result) verified. Production clock/network qualification remains NOT VERIFIED. |
| 10 | 72% | **74%** | Playwright E2E formal exam flow verified. Live operational and cross-platform integrity checks remain NOT VERIFIED. |

**CI evidence:** [ArcTester CI run #997](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42782572053) — all four jobs passed: Test/lint/build, Mobile typecheck, SQLite migration utility tests, and TensorFlow dataset preparation tests.

**Test names recorded for this score change:**
- `restores the local backup after reload and lets it win over the last server save`
- `syncs offline answers once after reconnect and then shows the synced state`
- `shows an actionable conflict when a stale answer revision receives HTTP 409`
- `clears exam backups when a different user signs in but preserves unrelated preferences`
- `clears every local exam backup on logout and removes the owner marker`
- `clears local assigned-exam backups after successful logout`
- `rejects terminated and expired sessions, grades inside the grace window and reviews late submissions`
- `retains deadline-crossing submissions for invigilator review`
- `keeps answer keys private and creates a server-authoritative session with heartbeat and autosave`
- `holds the server deadline during pause, resumes with the pause duration, and rejects student invigilator actions`
- `preserves elapsed pause duration when an invigilator terminates a paused session`
- `returns paginated review-required submissions`
- `returns exam attendance and question-level report data`
- `submits, grades once, returns the same result on duplicate submit, and isolates student records`
- `shows the review-pending message instead of an empty score for ungraded submissions`
- `student can create, take, and submit a practice test` (Playwright E2E)
- `student views submitted practice result with score` (Playwright E2E)
- `student can take and submit an assigned exam` (Playwright E2E)

### Overall estimated completion

**66% overall (phase-average estimate).**

Calculation correction: the 16 phase scores now sum to 1,060 percentage points, so their equally weighted arithmetic mean is 66.25%, rounded to 66%. This is a planning estimate, not a claim that 66% of all possible code or tests are complete.

### Phase count

- **16 total phases** in this master roadmap.
- **0 phases certified fully complete** under the strict acceptance rule in this document.
- **16 phases have implementation progress**, at different levels.
- The existing README's Phases 0–9 checkboxes describe earlier implementation milestones; they do not certify these broader master phases as fully complete.
- The separate Intelligence roadmap contains its own phases 0–8 and detailed implementation logs. Those are mapped into master Phases 5, 13, 14 and 15; they are not additional phases on top of these 16.

### Immediate next work

1. Finish the current Phase 12 modularization task and verify the latest CI run against the exact commit.
2. Continue end-to-end formal-exam lifecycle tests across start, heartbeat, pause/resume, reconnect, autosave, submit and result.
3. Close offline/recovery edge cases before calling synchronization complete.
4. Complete Intelligence qualification: real-data provenance, grouped student holdout, baseline comparison, model promotion and student-facing fallback.
5. Complete notifications and the remaining mobile/desktop real-device checks.
6. Run the final security, backup/restore and production release checklist.

## Verification evidence available at this audit

- Current `main` HEAD at audit time: `32d6d3b05da57e7974c8ecdb88b22523c4cb4a17`.
- GitHub Actions run **#958** tested that exact SHA and completed successfully: https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42772023181
- Run #957 failed on the earlier extraction commit because the admin workspace's `Brand` component had been removed. The component was restored in the commit tested by run #958.
- A green CI run verifies the checks included in that workflow for that commit. It does not prove production environment configuration, real-browser cookie behavior, all real-device workflows or release readiness.

**Do not increase a phase score or mark a phase complete without adding the corresponding implementation evidence and verification result here.**
