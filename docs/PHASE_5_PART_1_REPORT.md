# ArcTester Phase 5 — Part 1 report

**Scope:** Mobile learning home and subject path.

## Implemented
- Added a dedicated mobile learning-path component using the shared Phase 4 design tokens.
- Displays overall explored-question progress, the next incomplete subject, and each available subject's topic/question count.
- Subject rows show progress, reviewed/in-progress/ready status, and available practice accuracy.
- Home actions open the existing practice builder with the selected subject preselected.
- Added pure learning-path selectors with tests for progress clamping, subject selection, fully reviewed catalogues, and empty catalogues.
- No API, database schema, scoring, or question-answer visibility changes.

## Preserved
- Existing sign-in/session handling, active practice recovery, practice submission, announcements, notifications, settings, and profile navigation.
- Server remains the source of truth for attempt scoring and progress.

## Verification
- CI is required on the exact pull-request head before merge. Results will be recorded after the workflow completes.

## NOT VERIFIED / manual steps
- Visual inspection on physical Android devices and small screens.
- TalkBack traversal and dynamic font scaling.
- Confirm that practice analytics reflect the expected progress semantics for real student accounts.
