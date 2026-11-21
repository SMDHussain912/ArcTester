# ArcTester Roadmap

**Goal:** a lightweight, mobile-first AP ECET CSE learning app with bite-sized lessons, instant feedback, visible progress, original mascot/art/audio, and no copied Duolingo assets.

**Global rules:** PRs only (never push to main); verify the exact PR head in GitHub Actions before merge; never weaken tests; remove tests only with the feature they cover; keep low-end Android performance, FOSS/free hosting, reduced-motion, sound/haptics controls, and human approval of question content. Complete phases sequentially and report evidence, NOT VERIFIED items, and user-only manual steps.

| Phase | Scope | Status |
|---|---|---|
| 0 | Read baseline docs; establish this roadmap | Complete |
| 1 | Remove ML/desktop scope and student exam-hall UI; retain practice + timed Full Mock Test; convert materials to links | Complete |
| 2 | Admin question review, import validation, human-reviewed content quota, additive question types | Implemented; human review of imported drafts remains a manual content task |
| 3 | Rule-based path/lesson engine, XP, levels, goals, streaks, mastery, spaced review, quests/badges | Complete on main via PR #150 |
| 4 | Shared design system, original mascot/assets, motion/audio/haptics foundation and gallery | In progress (Part 3) |
| 5 | Mobile home/path, lesson player, feedback/results/profile, offline progress sync | Not started |
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
- **Part 4 — Asset and interaction gallery:** documented previews and verification of responsive, dark-mode, and reduced-motion states.

Phase 4 stays in progress until all slices are merged and verified. Phase 4 work is stacked on the Phase 3/Part 1 integration branch; after the slices pass exact-head CI, create a focused integration PR to main.
