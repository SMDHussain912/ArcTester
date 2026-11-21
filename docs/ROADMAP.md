# ArcTester Roadmap

**Goal:** a lightweight, mobile-first AP ECET CSE learning app with bite-sized lessons, instant feedback, visible progress, original mascot/art/audio, and no copied Duolingo assets.

**Global rules:** PRs only (never push to main); verify the exact PR head in GitHub Actions before merge; never weaken tests; remove tests only with the feature they cover; keep low-end Android performance, FOSS/free hosting, reduced-motion, sound/haptics controls, and human approval of question content. Complete phases sequentially and report evidence, NOT VERIFIED items, and user-only manual steps.

| Phase | Scope | Status |
|---|---|---|
| 0 | Read baseline docs; establish this roadmap | Complete |
| 1 | Remove ML/desktop scope and student exam-hall UI; retain practice + timed Full Mock Test; convert materials to links | Complete |
| 2 | Admin question review, import validation, human-reviewed content quota, additive question types | In progress (PR 2a) |
| 3 | Rule-based path/lesson engine, XP, levels, goals, streaks, mastery, spaced review, quests/badges | Implemented in stacked PRs #147–#149; main integration pending |
| 4 | Shared design system, original mascot/assets, motion/audio/haptics foundation and gallery | In progress (Part 1) |
| 5 | Mobile home/path, lesson player, feedback/results/profile, offline progress sync | Not started |
| 6 | Question variety, speed round, retryable unit test, mistakes, daily challenge, rewards, optional leaderboard/settings | Not started |
| 7 | Responsive web learning-path/player/progress parity; simple admin | Not started |
| 8 | Timed 200-question AP ECET mock, review, subject/topic analytics and rule-based recommendations | Not started |
| 9 | APK CI artifact, hosted smoke tests, accessibility and low-end performance verification | Not started |
| 10 | Final audit and honest completion/manual verification report | Not started |

A phase is complete only when its full scope is implemented, exact-head CI is green, the PR is merged, and its Phase Report is posted. Reports must include PR links, CI links, NOT VERIFIED items, and manual steps. Never report estimates as verified completion.


## Phase 4 delivery slices

- **Part 1 — Design-system foundation:** shared token source, web token mapping, React Native token adapter, accessible web primitives, keyboard focus and reduced-motion baseline. This is the current PR.
- **Part 2 — Original brand assets:** create and integrate ArcTester-owned mascot/illustration assets; no copied third-party game/app branding.
- **Part 3 — Motion, sound and haptics:** lightweight feedback utilities and user/system preference handling; never make feedback essential to task completion.
- **Part 4 — Asset and interaction gallery:** documented previews and verification of responsive, dark-mode, and reduced-motion states.

Phase 4 stays in progress until all slices are merged and verified.
