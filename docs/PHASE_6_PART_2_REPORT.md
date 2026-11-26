# Phase 6 Part 2 — Speed round

## Implemented on this branch
- Add a dedicated Speed Round attempt mode to the existing server-owned practice attempt flow.
- Server caps speed rounds at 10 questions and sets an authoritative five-minute deadline.
- Use approved practice questions across available subjects; the mobile app does not score locally.
- Add a mobile home card and distinct round/result labels.
- Auto-submit when the server deadline expires, using the existing durable offline-submit queue and result recovery.
- Add schema and duration tests; update the roadmap status.

## Integrity
- No new database schema or separate scoring system.
- Existing authenticated attempt creation, answer persistence, server grading, XP idempotency, and result APIs are reused.
- Speed round questions remain server-selected and approved; client never receives answer keys before submission.

## Verification
- Required CI, API tests, mobile typecheck/unit tests, and Android build must pass on the exact PR head before merge.
- Physical-device checks NOT VERIFIED: five-minute expiry/auto-submit, app background/resume timer, offline submit recovery, TalkBack and large font scaling.
