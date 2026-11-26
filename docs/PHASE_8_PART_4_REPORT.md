# Phase 8 Part 4 — Rule-based next-step recommendations

## Implemented
- Adds a deterministic recommendation builder based on the latest completed full mock with exactly 200 stored answer rows.
- Aggregates mock answers by subject and topic snapshot; prioritizes areas below 60% accuracy with at least five answered questions.
- Excludes unanswered questions from the accuracy denominator and sample threshold.
- Uses subject-level fallback only when no topic in that subject has enough sampled answers.
- Caps recommendations at three focus areas; high priority is reserved for accuracy at or below 30%.
- Adds transparent evidence fields (answered count, incorrect count, accuracy, threshold and source).
- Keeps existing practice/statistics recommendations and avoids duplicating the same subject/topic action.
- Study Analytics shows the source/date and exposes a Start focused practice action that creates a server-backed practice attempt filtered to the recommended subject/topic. Question selection still prioritizes existing missed-question stats.
- Adds unit tests for sample size, unanswered handling, partial mock rejection, subject fallback and healthy evidence, plus a web test for the action.

## Safety and integrity
- No model training or inference.
- No fabricated readiness score or prediction.
- No client-side grading.
- Only completed 200-question mock attempts are used for mock-specific recommendations.
- The recommendation uses answer snapshots from the completed attempt and the existing approved question bank for follow-up practice.

## Verification
- PR #173 merged to main.
- Exact-head CI #44964902968 passed all 5 jobs: https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/44964902968
- The full Phase 8 integration CI run #44965912692 also passed all 5 jobs after Part 3 landed.
- NOT VERIFIED: live-account recommendation against a populated 200-question bank, device-level UI/keyboard accessibility, and production deployment.

## Manual check after merge
1. Complete a full 200-question mock with a weak topic and at least five answered questions in that topic.
2. Open Study Analytics and confirm the recommendation cites the mock date and answered-question accuracy.
3. Select Start focused practice; verify the created practice paper is restricted to the recommended subject/topic.
4. Confirm a topic with fewer than five answered mock questions does not trigger a weak-area recommendation, and unanswered questions are not treated as incorrect.