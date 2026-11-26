# Phase 5 Part 2 — Mobile lesson player and immediate feedback

## Implemented on this branch
- Add a mobile Quick lesson launcher on the home screen.
- Let the learner choose a subject and optionally a topic, limited to practice-available catalogue entries.
- Start a one-question server-created practice attempt for the chosen subject/topic.
- Reuse the existing answer selection and saved-attempt recovery path.
- Add a dedicated “Check answer” action for lessons. It submits the selected answer to the server and loads the authoritative result, including correctness and explanation, for immediate feedback.
- Keep lesson answers and answer keys out of client-side catalogue/lesson selector logic.
- Add pure lesson-catalogue selectors and unit tests.

## Safety and scope
- No API/database changes.
- No client-side correct-answer inference; correctness and explanation come from the existing server result endpoint.
- Lesson mode does not create local XP, streaks, mastery, or completion records.
- Existing full practice flow remains unchanged when lesson mode is not active.

## Verification
- CI and Android APK build must pass on the exact PR head before merge.
- NOT VERIFIED until CI completes: device layout, screen-reader/TalkBack behavior, and dynamic font scaling.
- Manual check: choose a subject/topic, start one-question lesson, select an answer, tap Check answer, verify result/explanation, then return home and start normal practice.
