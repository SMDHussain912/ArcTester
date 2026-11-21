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
| 5 | Mobile home/path, lesson player, feedback/results/profile, offline progress sync | Part 1 complete via PR #156; Part 2 in progress |
| 6 | Question variety, speed round, retryable unit test, mistakes, daily challenge, rewards, optional leaderboard/settings | Not started |
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

- **Part 1 — Mobile learning home and subject path:** add a guided path to the mobile home using existing bank and practice analytics; show overall explored-question progress, next subject, topic/question counts, per-subject progress and accuracy; launch practice with the chosen subject preselected. Keep this client-only and preserve existing auth, practice recovery, announcements, results, and account flows.
- Part 2 — Lesson player and immediate feedback.
- **Part 3 — Results, review and profile learning summary:** add a result score summary, answer-review filters (all/mistakes), and account-scoped learning metrics on profile using the existing server overview. Keep the review backed by authoritative result data; do not create local progress claims.
- **Part 4 — Offline progress queue and safe synchronization:** remains the final Phase 5 slice after Part 3.

**Part 1 complete:** PR #156 merged; exact-head CI #44945658948 and Android build #44945658979 passed.

**Part 2 complete:** PR #157 merged as `5324c45a`; mobile quick lesson starts a server-created one-question attempt and uses server submission/result feedback.

**Part 3 in progress:** Results, answer-review filtering, and server-backed profile learning summary are being implemented on `feature/phase-5-part-3-results-profile`.

**Part 4 planned:** Offline progress queue and safe synchronization.

Phase 5 slices must remain additive and use existing server-owned scoring/progress. Do not invent XP or completion data from local UI state.
