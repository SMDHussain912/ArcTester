# Phase 8 — Part 3: Full-mock subject and topic analytics

## Implemented
- Adds authenticated `GET /analytics/full-mock-performance`.
- Includes only the current student's finished mock attempts with exactly 200 persisted answer rows; partial mocks and practice attempts are excluded.
- Aggregates each completed full mock using immutable subject/topic answer snapshots, so later question-bank edits do not rewrite historical classification.
- Returns overall, subject and topic totals with question count, answered count, correct, incorrect, unanswered and accuracy.
- Accuracy is `correct / (correct + incorrect)`; unanswered questions remain in the paper/question count but are not treated as incorrect.
- Study Analytics adds a full-mock summary, subject breakdown, and expandable per-subject topic table. Empty history prompts the student to complete a full mock.
- Adds API integration coverage for exact 200-answer eligibility, partial/practice exclusion, snapshots, and unanswered denominator, plus web rendering coverage.
- No database migration; no client-side grading or answer-key exposure.

## Verification
- Exact-head CI #44965912692 passed all 5 jobs: https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/44965912692
- Merged directly to main after exact-head CI passed.
- Production approved-bank check, real student account, refresh/reconnect on a physical device, and accessibility review: not verified.

## Manual verification after merge
1. Complete a production-approved 200-question mock.
2. Open Study Analytics and verify subject/topic totals match the submitted result.
3. Confirm unanswered answers appear separately and are excluded from accuracy.
4. Complete a second mock and verify totals aggregate across both completed papers.
5. Confirm a partial mock and practice session do not appear in full-mock analytics.
