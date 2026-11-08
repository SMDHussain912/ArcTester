# ArcTester Phase 1 foundation

## Product decisions

- Student accounts are created only through administrator-issued invitations.
- Students may register multiple devices under one account.
- Published exams are versioned and immutable.
- Exams are downloaded before they can be conducted offline.
- Official scores are calculated by the server after submission synchronization.
- Results become visible immediately after server evaluation.
- AI-generated explanations and learning materials are downloaded as structured content; student devices do not run an LLM.

## Account and device foundation

The Prisma schema adds:

- `User.role`: `ADMIN` or `STUDENT`, represented as a string because the current SQLite provider does not support Prisma enums.
- `Invitation`: email-bound, hashed, expiring, single-use invitation tokens, with creator and lifecycle timestamps.
- `Device`: per-user device registry with platform, display name, stable client fingerprint, last-seen timestamp, and revocation timestamp.

The API must never store raw invitation tokens. It should return the raw token only when the administrator creates the invitation, persist only its SHA-256 hash, and compare the hash during registration. Registration must consume the invitation and create the student in one database transaction.

Device fingerprints are identifiers supplied by clients, not proof of device integrity. They support device management and audit history; they must not be treated as an anti-cheat guarantee.

## Bootstrap administrator

The first administrator must be provisioned through a one-time deployment/CLI bootstrap operation, not public self-registration. Normal student registration must require a valid invitation. The bootstrap operation must be disabled or unavailable after the initial administrator exists.

## Database migration note

The repository currently uses SQLite for its local/test database and its existing CI test harness creates temporary SQLite databases. The schema foundation therefore remains SQLite-compatible in this first commit. Moving the hosted production database to PostgreSQL is a deliberate Phase 1 task and must include a PostgreSQL-backed CI test job and a reviewed data migration; changing only the Prisma provider would break the current tests and local workflow.

## Security requirements for the API implementation

1. Add an authorization middleware that loads the user's current role from the database; do not trust a role claim alone for privileged actions.
2. Protect invitation creation and revocation with administrator authorization.
3. Bind invitations to a normalized email address, expire them, allow one use, and support revocation.
4. Reject registration without a valid invitation.
5. Create or reactivate a device record after successful authentication.
6. Revoke devices independently; do not invalidate other devices belonging to the same student.
7. Keep secrets and invitation tokens out of logs and API error messages.

## Implemented identity API slice

The Phase 1 identity API now provides:

- `POST /auth/invitations`: administrator-only invitation creation. The raw token is returned once; only its SHA-256 hash is stored.
- `POST /auth/invitations/:id/revoke`: administrator-only revocation of unused invitations.
- `POST /auth/register`: requires a valid, unexpired, unused invitation bound to the same normalized email. Invitation consumption and student creation run in one transaction.
- `POST /auth/devices/register`, `GET /auth/devices`, and `DELETE /auth/devices/:id`: per-account device registration, listing, reactivation, and independent revocation.

The first administrator is provisioned with `npm run admin:bootstrap --workspace=api` after setting `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`. Bootstrap refuses to run when an administrator already exists.

Device revocation currently updates the device registry. Binding access/refresh sessions to device IDs so revocation also terminates that device's sessions is a remaining authentication-hardening task.

## Exam management foundation

The exam schema and API now support a generic exam workflow:

- Admins create a draft exam from selected question-bank entries.
- Creating a draft snapshots question text, options, answer key, explanation, subject/topic, and per-question positive/negative marks into an immutable version record.
- Admins publish the current version and assign it to student accounts with optional availability and due dates.
- Students can list their assignments and download a versioned exam package.
- The student package deliberately excludes answer keys and explanations. The API returns a SHA-256 digest for package integrity checks.
- Assignment creation is idempotent for the same student and published exam version.

API endpoints:

- `GET /admin/exams`
- `POST /admin/exams`
- `POST /admin/exams/:id/publish`
- `POST /admin/exams/:id/assign`
- `GET /exams/assigned`
- `GET /exams/assignments/:id/package`

Offline attempt submission, server-side scoring, and durable sync outbox processing are still upcoming. The package digest detects accidental corruption; it is not a guarantee against a modified client or a malicious student device.

## Offline submission and scoring

The first offline submission API slice now supports:

- Downloading a published package before its `availableFrom` time. The package includes the availability window and server timestamp so clients can enforce the local start gate while offline.
- Posting an attempt UUID, claimed start/submit timestamps, and one selected answer per snapshot question.
- Server-side score calculation from the immutable snapshot answer key and per-question positive/negative marks. The client never supplies its own score.
- Idempotent retry behavior: the same assignment and attempt UUID return the existing submission; a different attempt UUID cannot replace a submitted attempt.
- Immediate student result retrieval with answer review and explanations.
- Suspicious client timing is marked `REVIEW_REQUIRED` rather than treated as trusted evidence. Offline client timestamps are claims, not cryptographic proof.

Endpoints:

- `POST /exams/assignments/:id/submission`
- `GET /exams/assignments/:id/result`

The local client outbox, persistent autosave, sync retry scheduler, and background notification flow remain upcoming.
