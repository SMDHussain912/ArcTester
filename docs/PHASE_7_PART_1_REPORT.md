# Phase 7 Part 1 — Responsive web learning path

## Included
- Add a dedicated Learning path entry to student web navigation.
- Display overall explored-question progress and a suggested next subject.
- Show available practice counts and progress per subject.
- Expand a subject to inspect topic-level explored counts and progress.
- Launch subject practice or a topic-filtered practice preset through the existing web practice builder.
- Add responsive layouts, progress-bar semantics, keyboard-operable controls, and reduced-motion-aware progress transitions.
- Add component tests for progress rendering, topic expansion, and practice preset callbacks.

## Integrity
- Uses authenticated existing \`GET /bank\`, \`GET /analytics/overview\`, and \`GET /analytics/weak-topics\` data. Subject totals come from overview; topic detail comes from the dedicated topic report.
- Progress is read-only and derived from server analytics; no local completion/scoring or new API/schema.
- Topic presets use the existing JSON-encoded \`[subject, topic]\` practice-filter contract.

## Verification
- CI on the exact PR head: pending.
- Web build, lint/typecheck, and component tests: pending CI.
- Browser/device viewport, screen-reader, keyboard-only, and real-account data verification: NOT VERIFIED until manually exercised.
