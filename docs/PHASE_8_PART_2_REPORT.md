# Phase 8 Part 2 — Timed full mock experience

## Scope
Deliver a clearer full-length AP ECET mock session and post-submit review while reusing the existing server-owned attempt workflow.

## Implemented on this branch
- Full mock session has a distinct AP ECET full mock label and states the 180-minute duration.
- The mock's final action opens a confirmation dialog showing answered and unanswered counts.
- Confirmation explains that unanswered questions remain unanswered and that answers cannot be changed after submission.
- Students can return to the paper from the confirmation; the server deadline continues to run.
- Ordinary practice submission remains unchanged.
- Full mock result and post-submit answer review have distinct labels.
- Component tests cover the confirmation flow and mock-specific result labels.

## Existing server behavior reused
- Server assigns and enforces the attempt deadline.
- Answers are saved to the authenticated attempt; browser recovery and server restore already exist.
- Grading and official result data remain server-owned.
- Correct answers and explanations are available only from the result endpoint after submission.

## Verification
- PR: https://github.com/smdgamekingindo-TN/ArcTester/pull/172
- Exact-head CI run: https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/44964173273
- Exact-head CI #44964173273 passed all 5 jobs; PR #172 is merged to main. The combined Phase 8 CI run #44965912692 also passed all 5 jobs after Part 3 landed.
- NOT VERIFIED: real-account end-to-end full mock completion (CI seed bank intentionally cannot produce 200 approved questions), refresh/reconnect on a physical device, accessibility review, and production deployment.

## Manual checks after merge
1. With a production-approved 200-question bank, start a full mock and confirm exactly 200 questions and a 180-minute deadline.
2. Answer some questions, refresh, and confirm server/local saved answers restore.
3. Open final confirmation; verify counts, cancel to edit, then submit.
4. Confirm score and answer explanations appear only after submission.
5. Confirm timeout submits automatically and marks the attempt expired.
