# Phase 6 Part 3 — Retryable unit test

## Scope
- Add the mobile unit-checkpoint flow using the existing learning-path endpoints.
- Keep the checkpoint locked until all lessons in its unit are completed.
- Present the server-selected 10 approved questions and save each response through the authenticated API.
- Require all 10 saved answers; pass threshold remains the server's existing 70%.
- Show pass/fail, attempt count, best score and a retry/review action.

## Retry and integrity
- Each launch receives a server-generated UUID attempt key and its own answer namespace.
- A retry cannot score or count stale answers from a previous attempt.
- Completion, progress increment and first-pass XP award execute in one database transaction.
- A unique completion marker makes repeated completion of the same attempt idempotent.
- XP continues to use the existing unique ledger event key; no duplicate XP on retry.
- No database migration, client-side scoring or answer-key exposure.

## Verification
- Automated checks are pending on the exact PR head.
- NOT VERIFIED on a physical device: failed-attempt retry, app background/restore behavior, accessibility/TalkBack, large-font layout and low-end Android performance.
