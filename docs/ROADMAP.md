# ArcTester Roadmap

**Goal:** a lightweight, mobile-first AP ECET CSE learning app with bite-sized lessons, instant feedback, visible progress, original mascot/art/audio, and no copied Duolingo assets.

**Global rules:** PRs only (never push to main); verify the exact PR head in GitHub Actions before merge; never weaken tests; remove tests only with the feature they cover; keep low-end Android performance, FOSS/free hosting, reduced-motion, sound/haptics controls, and human approval of question content. Complete phases sequentially and report evidence, NOT VERIFIED items, and user-only manual steps.

| Phase | Scope | Status |
|---|---|---|
| 0 | Read baseline docs; establish this roadmap | Complete |
| 1 | Remove ML/desktop scope and student exam-hall UI; retain practice + timed Full Mock Test; convert materials to links | Complete |
| 2 | Admin question review, import validation, human-reviewed content quota, additive question types | Implemented; human review of imported drafts remains a manual content task |
| 3 | Rule-based path/lesson engine, XP, levels, goals, streaks, mastery, spaced review, quests/badges | Complete on main via PR #150 |
| 4 | Shared design system, original mascot/assets, motion/audio/haptics foundation and gallery | Complete on main via PR #155 |
| 5 | Mobile home/path, lesson player, feedback/results/profile, offline progress sync | Complete on main via PRs #156–#159 |
| 6 | Question variety, speed round, retryable unit test, mistakes, daily challenge, rewards, optional leaderboard/settings | Parts 4+5 in progress together: mistakes, daily challenge and rewards/settings |
| 7 | Responsive web learning-path/player/progress parity; simple admin | Not started |
| 8 | Timed 200-question AP ECET mock, review, subject/topic analytics and rule-based recommendations | Not started |
| 9 | APK CI artifact, hosted smoke tests, accessibility and low-end performance verification | Not started |
| 10 | Final audit and honest completion/manual verification report | Not started |

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
