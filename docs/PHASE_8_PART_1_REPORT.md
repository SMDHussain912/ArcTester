# Phase 8 — Part 1: Full-length AP ECET mock readiness

## Changes
- Full mock selection continues to use the AP ECET CSE subject blueprint (200 questions total).
- Attempt creation now validates that all 200 questions were selected and that no subject quota has a shortfall.
- If the approved bank is incomplete, the API rejects the start with a subject-by-subject available/requested count and tells the admin/content team to add and approve missing questions.
- A partial mock is no longer silently started.
- The existing server-owned deadline remains 180 minutes.
- Added unit coverage for complete readiness, subject shortfalls, count mismatch and duration.

## Safety / architecture
- No database migration.
- No answer key or grading logic moved to the client.
- No scoring or progress writes were added.
- Practice, speed-round, daily-challenge and mistakes modes are unchanged.

## Verification
- Exact-head GitHub Actions CI: PENDING.
- PR merge: PENDING.
- Real approved-bank readiness check with student account: NOT VERIFIED.
- Manual mock start, timeout and answer restore on production: NOT VERIFIED.

## Manual follow-up
1. Ensure the approved AP ECET CSE question bank has the full quota for every blueprint subject.
2. Start a full mock as a student and confirm 200 questions and a 180-minute deadline.
3. Confirm a shortage blocks the start and identifies the affected subject counts.
