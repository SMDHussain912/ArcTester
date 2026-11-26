# ArcTester Roadmap

**Goal:** a lightweight, mobile-first AP ECET CSE learning app with bite-sized lessons, instant feedback, visible progress, original mascot/art/audio, and no copied Duolingo assets.

**Global rules:** PRs are the default; direct-to-main is allowed only when the user explicitly authorizes it for that task. Verify the exact head in GitHub Actions; never weaken tests; remove tests only with the feature they cover; keep low-end Android performance, FOSS/free hosting, reduced-motion, sound/haptics controls, and human approval of question content. Complete phases sequentially and report evidence, NOT VERIFIED items, and user-only manual steps.

| Phase | Scope | Status |
|---|---|---|
| 0 | Read baseline docs; establish this roadmap | Complete |
| 1 | Remove ML/desktop scope and student exam-hall UI; retain practice + timed Full Mock Test; convert materials to links | Complete |
| 2 | Admin question review, import validation, human-reviewed content quota, additive question types | Implemented; human review of imported drafts remains a manual content task |
| 3 | Rule-based path/lesson engine, XP, levels, goals, streaks, mastery, spaced review, quests/badges | Complete on main via PR #150 |
| 4 | Shared design system, original mascot/assets, motion/audio/haptics foundation and gallery | Complete on main via PR #155 |
| 5 | Mobile home/path, lesson player, feedback/results/profile, offline progress sync | Complete on main via PRs #156–#159 |
| 6 | Question variety, speed round, retryable unit test, mistakes, daily challenge, rewards, optional leaderboard/settings | Complete on main via PRs #160–#167; offline/reconnect and device/account-isolation checks remain NOT VERIFIED |
| 7 | Responsive web learning-path/player/progress parity; simple admin | Complete on main via PRs #168–#170; keyboard/screen-reader and real-account lesson publish checks remain NOT VERIFIED |
| 8 | Timed 200-question AP ECET mock, review, subject/topic analytics and rule-based recommendations | Complete on main via PRs #171–#174; approved-bank readiness and physical-device verification remain NOT VERIFIED |
| 9 | APK CI artifact, hosted smoke tests, accessibility and low-end performance verification | Implemented and merged via PR #175 (merge commit c45c2c21); exact-head CI #44967911502 and Android build #44967911493 passed on 3bd15ab2. Hosted smoke remains NOT VERIFIED (run #45017484276 failed because required Actions URL variables were unset); physical-device acceptance remains NOT VERIFIED |
| 10 | Final audit and honest completion/manual verification report | Static lesson import and audit remediation merged via PR #176 (merge commit e13e5d42); Phase 10 exact-head CI #44969600169 and Android build #44969600269 passed. Audit remains IN PROGRESS until hosted smoke and manual acceptance evidence are recorded. Current audit-fix code commit c28d21d7 passed CI run #45070131635 |

A phase is complete only when its full scope is implemented, exact-head CI is green, the PR is merged, and its Phase Report is posted. Reports must include PR links, CI links, NOT VERIFIED items, and manual steps. Never report estimates as verified completion.


## Phase 4 delivery slices

- **Part 1 — Design-system foundation:** shared token source, web token mapping, React Native token adapter, accessible web primitives, keyboard focus and reduced-motion baseline. Implemented and merged into the Phase 4 integration branch; integration to main remains a release step.
- **Part 2 — Original brand assets:** original Aster study-owl mascot and compact mark integrated across web and mobile; PR #152 merged into the integration branch after exact-head CI #2481 passed. Main integration remains a later release step.
- **Part 3 — Motion, sound and haptics:** lightweight feedback utilities and user/system preference handling; never make feedback essential to task completion.
- **Part 4 — Asset and interaction gallery:** interactive gallery at `/design-system-gallery.html` with responsive layout, light/dark theme, reduced-motion toggle, and Playwright coverage. PR #154 merged after exact-head CI #2507 passed.

Phase 4 is complete on `main` via integration PR #155. Its required GitHub Actions checks passed on the exact PR head; physical-device and accessibility checks remain manual.


## Phase 5 delivery slices

- **Part 1 — Mobile learning home and subject path:** guided path using existing bank and practice analytics; subject/topic progress and practice launch preset. PR #156 merged.
- **Part 2 — Quick lesson and immediate feedback:** one-question lesson launcher backed by a server-created practice attempt and server submission/result. PR #157 merged.
- **Part 3 — Results, review and profile learning summary:** result counts, All/Mistakes review filters, and server-backed profile metrics. PR #158 merged as `c8410f0f`.
- **Part 4 — Offline progress queue and safe synchronization (final Phase 5 slice):** persist answer snapshots for an already server-created practice attempt in account-scoped SQLite; replay snapshots through the existing idempotent `PUT /tests/:id/answers` endpoint when connectivity returns; retain newer local revisions during in-flight sync; queue a user-confirmed submit and recover a result if the server accepted it but the response was lost. No offline scoring or answer-key storage.

**Phase 5 complete on main:** PR #159 merged as `dbc23c7e`; Android build on the PR head passed. Device-level offline/reconnect and account-isolation checks remain manual and NOT VERIFIED.

## Phase 6 delivery slices

- **Part 1 — Mobile multi-select practice:** render multi-select choices from the existing approved-question payload; persist response arrays through local recovery and account-scoped offline queue; submit through the existing server-owned grader; show correct and selected options in authoritative result review. No API/schema change. Complete on main via PR #160.
- **Part 2 — Speed round:** dedicated server-created 10-question attempt with a server-enforced five-minute deadline; distinct mobile flow and automatic submit on expiry; reuse server grading and offline submit recovery. No local scoring or new schema. Complete on main via PR #165; exact-head CI and Android build passed.
- **Part 3 — Retryable unit test:** unit-end checkpoint using existing question selection and authoritative results; isolate each retry's answer scope and make completion/progress/XP idempotent. Complete on main via PR #166; exact-head CI #2565 and Android build #219 passed.
- **Part 4 — Mistakes and daily challenge:** mobile mistake-practice entry backed by the existing user-wrong-question selector; a server date-seeded 10-question challenge shared across users per UTC day, with a 10-minute deadline and once-per-UTC-day idempotent XP. Implemented together with Part 5 in `feature/phase-6-parts-4-5-daily-rewards`; PR verification pending.
- **Part 5 — Rewards and optional social/settings polish:** surface server-backed XP/level/streak/week, editable daily XP goal, and streak-freeze purchase; reuse existing reduce-motion/haptics settings. No leaderboard added: there is no current privacy-safe leaderboard endpoint/opt-in contract, so social ranking is deferred rather than exposing account data.

Phase 6 slices must remain additive and use existing server-owned scoring/progress. Do not invent XP or completion data from local UI state.


## Phase 7 delivery slices

- **Part 1 — Responsive web learning path:** add a dedicated student web path page matching the mobile subject journey; use existing `/bank` and `/analytics/overview` data for question availability and explored counts; show overall/subject/topic progress; expose subject and topic practice presets through the existing practice builder. No new API, schema, local scoring, or progress writes. Merged on main via PR #168; exact-head CI #2583 passed. Keyboard/screen-reader and real-account checks remain manual.
- **Part 2 — Web lesson player parity:** reuse published lesson feed and safe scene data; responsive browser lesson timeline/player. Merged via PR #169; exact-head CI #2587 passed. Keyboard/screen-reader and real-account checks remain manual.
- **Part 3 — Web progress and learning summary parity:** consolidated practice, official exam summary, server mastery, XP/streak and recent activity into a student Learning summary using /analytics/overview, /gamification and /learning/mastery; no browser scoring or reward writes. Implemented in the Phase 7 final slice; exact-head CI #2590 passed, PR #170 merge pending.
- **Part 4 — Simple web admin parity:** added review-confirmed publishing to the existing admin Lesson Studio; server validates script/storyboard and conditionally publishes only the exact reviewed DRAFT snapshot. Draft edits/deletes are status-conditioned; published lessons are read-only and student feed remains published-only. Implemented in the Phase 7 final slice; exact-head CI pending.

Phase 7 slices must remain additive and reuse existing authenticated APIs. Do not create duplicate progress/scoring logic in the browser. Final slice report: docs/PHASE_7_FINAL_REPORT.md. Phase 7 is not complete until the final slice exact-head CI passes, its PR is merged, and manual verification items are reported.


## Phase 8 delivery slices

- **Part 1 — Full-length mock readiness and authoritative duration:** enforce the official 200-question CSE blueprint at attempt creation; if any subject quota is short, reject the start with a subject-by-subject approved-bank shortage instead of silently creating a partial paper. Keep the server-owned 180-minute deadline. Add unit tests for exact readiness and duration. Merged on main via PR #171; exact-head CI #2596 passed.
- **Part 2 — Timed mock experience and answer review:** distinct full-mock session header with 180-minute duration; explicit final-submit confirmation with answered/unanswered counts; distinct mock result/review labels. Reuses server deadline, saved-answer restore, snapshots and server grading. Merged via PR #172; exact-head CI #44964173273 passed all 5 jobs.
- **Part 3 — Subject/topic performance analytics:** merged directly to main after exact-head CI #44965912692 passed all 5 jobs; authenticated full-mock aggregation, immutable subject/topic snapshots, and explicit answered/incorrect/unanswered denominators. Report: docs/PHASE_8_PART_3_REPORT.md.
- **Part 4 — Rule-based next-step recommendations:** merged via PR #173; exact 200-question completed mock evidence, minimum answered sample, topic/subject focus, and one-click server-backed targeted practice. Exact-head CI #44964902968 passed all 5 jobs.

Phase 8 parts must not expose answer keys before submission, calculate official scores in the browser, or begin a full mock with fewer than 200 questions. Full phase completion requires exact-head CI, merge, report and explicit manual verification status.

## Phase 10 audit and lesson-content cost remediation

- Audit merged Phases 6–10 and current main; distinguish code/CI verification from hosted deployment and physical-device checks.
- Lesson scripts/storyboards are persisted in PostgreSQL `LessonDraft`. Current authoring is local static-package generation/import; there is no hosted `/admin/lesson-drafts/generate` route or student-time lesson-writing call.
- Narration is pre-uploaded to private Supabase Storage and served through authenticated API routes using `LessonAudioAsset`; no student-time TTS synthesis is wired into current lesson routes. The legacy `lessonTts.ts` helper remains unused by the lesson router and should be reviewed separately.
- Phase 10 is complete only after hosted smoke and manual acceptance evidence are recorded honestly.

## Phase 9 delivery — Release verification

- Android Build workflow now produces a standalone release APK artifact with a SHA-256 checksum and build metadata, so the artifact can be verified against its source commit and workflow run.
- Hosted smoke checks validate the deployed HTTPS web shell and API liveness endpoint. The workflow is scheduled daily and supports manual dispatch; configure repository Actions variables `ARCTESTER_WEB_URL` and `ARCTESTER_API_URL`.
- Playwright release checks cover accessible button names, declared image alt text, main landmark and heading, 320px horizontal overflow, and a student-facing gallery load under throttled 3G/4x CPU conditions.
- Report: `docs/PHASE_9_RELEASE_VERIFICATION_REPORT.md`.

Phase 9 implementation is merged and its exact-head CI/Android artifact passed. Phase acceptance remains incomplete until hosted smoke passes against configured deployment URLs and physical-device accessibility/performance checks are recorded. Do not claim TalkBack, device startup, cold-start, memory, or frame-rate results from browser CI.
