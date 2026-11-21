# ArcTester — Product Roadmap

**Repository:** `smdgamekingindo-TN/ArcTester`  
**Product:** AP ECET CSE learning and practice app  
**Primary experience:** Android mobile (`/mobile`)  
**Web:** `/web` follows mobile; administration remains web  
**Backend:** `/api` — Node.js, Express, Prisma, PostgreSQL

## Product goal

Make AP ECET CSE preparation feel like a fun, short, rewarding learning journey: bite-sized lessons, instant feedback, kind retries, visible progress, and a compelling “one more lesson” loop. Use an original friendly mascot and original visual/audio assets. Do not copy Duolingo branding, mascot, artwork, or sounds.

## Global delivery rules

- Work phases sequentially. Do not begin a later phase until the current phase is complete, merged with green CI on the exact PR head, and reported.
- PRs only; never push directly to `main`.
- GitHub Actions is the verifier. Do not weaken or remove tests to pass CI; remove tests only when their tested code is deliberately removed.
- Keep the app lightweight for low-end Android and free hosting; use free/open-source tools and avoid heavy dependencies.
- Respect system reduce-motion settings. Include sound and haptics controls. Motion must be brief, smooth, non-blocking, and target 60 FPS.
- Never approve questions on the user's behalf or invent sources. New content remains unapproved until human review.
- Do not add features outside the approved phases.
- After each phase, publish a Phase Report with: completed work and PR links; exact-head CI links; NOT VERIFIED items; and any manual steps for the user.
- If work is interrupted, stop at a clean point and report the phase to resume. Never report an incomplete phase as done.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Baseline: read README/docs and establish this single roadmap | In progress |
| 1 | Cleanup: remove ML/AI and desktop scope, simplify exam-hall UI, link-based materials, reduce repo weight | Not started |
| 2 | Content engine: admin question review, validation, human-reviewed content quota, additive question types | Not started |
| 3 | Learning/game backend: path, lessons, XP, levels, goals, streaks, mastery, spaced repetition, quests and badges | Not started |
| 4 | Design system and motion foundation: tokens, reusable components, original mascot/assets, gallery and performance approach | Not started |
| 5 | Mobile learning experience: path, lesson player, results, profile, offline progress and sync | Not started |
| 6 | Fun features: question variety, speed rounds, unit tests, mistakes, daily challenge, rewards, motivation, opt-in leaderboard and settings | Not started |
| 7 | Web parity: responsive learning path/player/progress with shared design system; simple admin | Not started |
| 8 | Full mock test and analytics: timed 200-question ECET mock, review, subject/topic results and rule-based weak-topic recommendations | Not started |
| 9 | Release readiness: APK artifact, hosted configuration verification, user checklists, accessibility and low-end performance | Not started |
| 10 | Final audit: update README/roadmap to verified reality and provide honest completion and manual verification report | Not started |

## Phase acceptance gates

### Phase 0 — Baseline
Read the repository README and existing docs; create and merge this roadmap with the ordered phase list and status table. No implementation work from later phases.

### Phase 1 — Cleanup
Remove the specified ML/AI stack and desktop scope after tracing imports; remove corresponding dependencies, scripts, datasets, workflows, and obsolete planning docs; add a safe Prisma migration dropping unused ML tables; hide exam-hall student features while retaining one timed Full Mock Test; migrate study materials to links; preserve practice. CI must pass, app builds, practice works, and before/after dependency/install and bundle sizes are reported.

### Phase 2 — Content engine
Provide admin question review by subject/status, single/bulk edit/approve/reject with required source, and per-subject progress against 3x quota. Validate CSV (four options, valid correct index, no duplicates). Expand drafts toward 3x quota with accurate, clear teaching explanations; all additions stay DRAFT / NEEDS HUMAN REVIEW. Add backwards-compatible single-choice, true/false, numeric fill-in, and match-the-following types. Students receive approved questions only.

### Phase 3 — Learning path and game engine (backend)
Implement Subject → Unit → 10-question Lesson, locked/unlocked states and unit tests; answer/lesson XP, accuracy/combo bonuses, levels, selectable 5/10/20-minute daily goal, streak and streak-freeze item; topic mastery and rule-based spaced repetition; Practice Mistakes; daily quests, badges and gentle weekly goal. Rule-based only. Full API tests required.

### Phase 4 — Design system and animation foundation
Add shared design tokens and small reusable components; required lightweight motion/audio/haptics libraries for web and mobile; reusable answer, progress, streak, celebration and transition motion; original four-mood vector/Lottie mascot and original optional quiet sounds. Respect reduce motion and report performance/FPS approach and asset sizes. Include a component gallery.

### Phase 5 — Mobile learning experience (primary)
Build mobile home/path, one-question lesson player with instant feedback and kind retries, explanations, mascot/combo/progress, save-on-exit, lesson results and next lesson, profile with level/XP/streak/badges/mastery, and offline progress with later sync. A full lesson must work start to finish with component tests and CI.

### Phase 6 — Keep it fun
Mix question types; add 30-second speed round and retryable boss/unit test; Practice Mistakes, Daily Challenge, occasional bonus XP chest; gentle reminders, encouragement and milestones; optional privacy-safe invited-friends/class leaderboard; settings for goal, sound, haptics, reduce motion and theme. Tests must cover features and reduced-motion behavior.

### Phase 7 — Web parity
Bring learning path, lesson player, streak and XP to responsive mobile-first web using the same design system and animations. Keep web administration functional and simple.

### Phase 8 — Full Mock Test and analytics
Implement timed AP ECET full mock: 200 questions, correct subject split, timer, review, subject/topic results. Add simple visual analytics and rule-based weak-topic recommendations feeding the learning path.

### Phase 9 — Release readiness
Build an installable Android APK artifact in CI on every merge to main. Verify Vercel/Render/Docker/environment/CORS/cookie configuration. Add short Android and hosted smoke-test checklists. Complete accessibility (contrast, labels, focus, text scaling, reduce motion) and low-end device performance pass.

### Phase 10 — Final audit
Update this roadmap and README to match verified reality only. Report a defensible completion percentage, NOT VERIFIED items, and exact user-only actions: question approval, APK installation, deployment, and playing a lesson on a phone.

## Phase reporting

A phase is complete only after its entire scope and acceptance gate are satisfied, its PR is merged after exact-head CI is green, and the Phase Report is posted. Report evidence, not estimates.