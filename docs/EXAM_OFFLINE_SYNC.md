# Formal exam offline recovery and synchronization rules

This document defines the candidate-side recovery contract for assigned formal exams. The server remains authoritative for session start, pause state, deadlines, answer revisions, submission receipt and grading.

## Deadline and automatic-submit grace

The server allows a **10-second automatic-submit grace window** after the authoritative exam deadline. The authoritative deadline is the earlier of:

- the session start time plus the published exam duration plus accumulated paused duration; and
- the assignment due time, when one exists.

A submission received by the server at or before `authoritativeDeadline + 10,000 ms` is eligible for normal grading. A submission received later is retained as `REVIEW_REQUIRED` and is not given a released score. The comparison is inclusive at the 10-second boundary; anything later is outside the grace window.

The server uses its own request-received timestamp, not the browser's claimed `submittedAt`, to make this decision. The grace window only compensates for the client scheduling and delivering its deadline-triggered request; it does not extend the exam timer or permit additional answer edits. Other integrity signals (for example, an offline session reconciliation, a stale heartbeat or an invalid claimed start time) can still require invigilator review even when the request arrives within the grace window.

## Local backup and server reconciliation

1. While an assigned exam is active, the browser writes a local backup containing the attempt UUID, server-issued start time, current answers and local save timestamp.
2. On reload or reconnect, the client obtains the latest server answer set and revision, then overlays the local backup on top of the server answers. **The local backup wins for any answer present in both sources.** This is deliberate recovery behavior: the most recent local work must not be silently replaced by the last server autosave.
3. The client retains the revision returned by that server read and submits the merged answer set using that revision.
4. A successful save returns the next revision and changes the UI to **Synced with server**. Until then, the UI says **Saved locally** or explicitly says it is offline.

## Stale revision conflict (HTTP 409)

Every autosave includes the revision it read from the server. If another tab or device has already saved a newer revision, the API rejects the stale write with HTTP `409`; it does not overwrite the newer server state.

The client must:

- keep the local backup intact;
- stop retrying that stale revision automatically;
- show an actionable message that another tab/device saved newer answers and ask the candidate to reload the exam to reconcile;
- never describe a revision conflict as an invigilator pause.

After a deliberate reload, the client reads the new server revision, reapplies the local-backup-wins merge rule and attempts synchronization against that current revision. A conflict is therefore visible and recoverable rather than a silent last-write-wins overwrite.

## Submission idempotency and visible states

The attempt UUID identifies one submission. Repeating the same submit request returns the existing submission; concurrent duplicate requests must create one result only. A different attempt UUID after a submission is rejected.

The candidate UI distinguishes these states:

- **Saved locally** — answers are in the browser backup and are not yet confirmed by the server.
- **Synced with server** — the server accepted the current answer revision.
- **Submitted** — the server accepted the submission and returned a graded result.
- **Submitted - awaiting invigilator review** — the server received the submission but withheld the score because review is required.

The review-required state has no released score; the UI must not render an empty score fraction or a misleading zero-percent result.
