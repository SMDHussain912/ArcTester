# ArcTester implementation roadmap

> **Archived — superseded by the 16-phase master roadmap.** This document is retained as historical implementation planning context. The active product plan and phase status are maintained in [`ARC_TESTER_16_PHASE_MASTER_ROADMAP.md`](./ARC_TESTER_16_PHASE_MASTER_ROADMAP.md).

The approved delivery plan contains six phases. Each phase must ship with tests and a demonstrable end-to-end workflow before the next phase is treated as complete.

## Phase 1 — Backend foundation

- PostgreSQL production database and migration path.
- Administrator/student roles and authorization.
- Invitation-only student registration.
- Multi-device registration and revocation.
- Exam, immutable exam-version, question, and assignment models.
- Subject/topic catalog and learning-material metadata.
- Admin publishing APIs and integration tests.

## Phase 2 — Exam and learning content engine

- Signed, versioned exam package format.
- Offline exam conductor, local persistence, timer, autosave, and crash recovery.
- Shared structured explanation schema and local Explanation Engine.
- Server-side AI explanation generation, validation, review, and publishing.
- Downloadable learning packages, offline reader, and topic practice.

## Phase 3 — Synchronization

- Persistent local outbox and retry-safe submission protocol.
- Idempotent server submission processing and authoritative scoring.
- Download assignments, exam versions, explanations, and materials.
- Synchronize learning progress, results, and notifications.
- Reconnection progress sequence and interrupted-sync tests.

## Phase 4 — Results and intelligent analytics

- Admin/student result dashboards.
- Question-level and topic-level performance.
- Weak-topic detection, practice history, and rankings.
- Learning recommendations and report exports.

## Phase 5 — Notifications and AI learning

- Admin announcements, inbox, and push notifications.
- Explanation review workflow and AI content quality controls.
- Study-plan generation and personalized revision recommendations.
- Notification delivery and recommendation history.

## Phase 6 — Platform completion and release

- Complete web/PWA, Android, and Windows applications.
- Cross-platform offline and synchronization tests.
- Security, accessibility, and performance testing.
- Production deployment, backups, monitoring, and release process.

## Release acceptance gates

- An invitation can be redeemed only once and only by its intended email address.
- Students cannot access administrator operations.
- Multiple devices can be registered and revoked independently.
- A published exam version cannot be mutated in place.
- An offline attempt survives application termination.
- A retried submission produces exactly one official result.
- AI explanations are schema-validated and never expose answer keys in pre-exam packages.
- Learning materials and explanations remain readable offline after download.
