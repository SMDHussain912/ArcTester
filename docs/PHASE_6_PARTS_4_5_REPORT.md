# Phase 6 Parts 4+5 — Mistakes, daily challenge and rewards

## Part 4: Mistakes and daily challenge
- Added a mobile mistakes-practice entry using the existing `mistakes` test mode. The server only selects approved questions this signed-in user has previously answered incorrectly.
- Added a server-selected 10-question daily challenge from the approved practice pool.
- The daily question set is deterministic for a UTC date and shared across users; it is not selected or scored on the client.
- Daily challenge uses a 10-minute server deadline and the existing answer snapshot, grading, submit and result-review pipeline.
- Daily challenge completion uses the existing 10-XP practice reward, with a UTC-day ledger event key so multiple retries do not duplicate that challenge reward.

## Part 5: Rewards and settings
- Home shows server-backed level, total XP, streak, today's XP/goal and level progress.
- Profile shows level, total XP, streak, longest streak and seven-day XP history.
- Settings can update the server daily XP goal (20–200) and buy a streak freeze using the existing 100-XP purchase API; freeze inventory is capped at two by the server.
- Reuses existing reduce-motion and haptics toggles.
- No leaderboard was added: the API currently has no privacy-safe opt-in leaderboard contract. Avoid exposing account identity or XP publicly until that exists.

## Integrity
- No schema migration.
- No local answer scoring or answer-key exposure.
- Mistake selection, question approval, challenge selection, deadline, grading and XP ledger are server-owned.
- Daily challenge XP is idempotent per UTC date; ordinary practice XP keeps its existing per-attempt event key.

## Verification
- Exact PR-head CI and Android build pending.
- Physical-device challenge deadline/background handling, daily rollover, mistakes pool behavior, TalkBack, large text and low-end performance remain NOT VERIFIED.
