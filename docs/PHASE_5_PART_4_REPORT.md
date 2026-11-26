# Phase 5 Part 4 — Offline progress queue and safe synchronization

## Implemented on this branch
- Added an account-scoped SQLite queue for answer snapshots from an already server-created practice attempt.
- Queue revisions increase on every snapshot. A sync deletes only the exact revision it sent, so edits made during a network request remain queued for the next pass.
- On connectivity return, replay answer snapshots through the existing authenticated `PUT /tests/:id/answers` endpoint. This endpoint persists answers without grading and is safe to replay.
- A user-confirmed submit is stored as a durable submit request. When online, the app first syncs the latest answer snapshot, then calls the existing server submit endpoint and loads the authoritative result.
- If the submit response is lost or the server reports an already-submitted attempt, the app fetches the result and only clears the queue after result retrieval succeeds.
- Added account isolation, queue revision, submit-intent, exact-revision cleanup, and validation tests.
- Added connection and pending-sync status in Settings, plus a clear waiting state for a confirmed submit while offline.
- Updated Phase 5 roadmap; Part 4 is the final planned Phase 5 slice.

## Safety and limitations
- No new API or database schema; existing answer-save and submit endpoints are reused.
- No answer keys, correctness, score, XP, mastery, or completion are computed locally.
- The downloaded question bank remains practice-only and answer-key-free.
- A new practice attempt still needs an online server-created attempt. This implements offline continuation/progress and deferred submit, not offline attempt creation or offline grading.
- Queue and recovery data are isolated by signed-in user ID and retained on network/storage errors.

## Verification
- Exact-head GitHub CI (mobile typecheck/unit tests and repository verification) and Android build must pass before merge.
- Manual NOT VERIFIED until device testing: turn off network during an active practice, answer/navigate, force-close/reopen, reconnect, verify server saved answers, submit offline and reconnect, and confirm one server result with no duplicate XP/stat updates.
- Also verify sign-out/sign-in with a second account does not expose the first account's queued data.
