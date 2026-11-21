# Phase 5 Part 3 — Results, review and profile learning summary

## Implemented on this branch
- Improve the result screen with a clear score header and correct/incorrect/skipped counts.
- Add answer-review filters for all questions or incorrect answers only, including an empty state when there are no mistakes.
- Keep question correctness, explanation, and result metrics sourced from the existing server result response.
- Expand Profile with account learning summary: completed practice attempts, overall accuracy, answered/correct/incorrect totals, and subject accuracy.
- Add a pure result-review selector and unit tests for all/mistakes filters, immutability, and the no-mistakes case.

## Scope and integrity
- No new API or database fields; use the existing authenticated learning overview and result payload.
- No local XP, streak, mastery, or completion calculations.
- Phase 5 Part 4 (offline progress queue and safe synchronization) remains planned; Part 3 is not the final Phase 5 slice according to the roadmap.

## Verification
- Mobile unit tests and typecheck are expected in required CI on the exact PR head.
- Android build must pass on the exact PR head.
- NOT VERIFIED until CI completes: physical-device layout, TalkBack behavior, and dynamic font scaling.
- Manual review: complete a practice attempt; switch All/Mistakes; confirm correct options and explanation match server review; open Profile and confirm metrics reflect the signed-in account.
