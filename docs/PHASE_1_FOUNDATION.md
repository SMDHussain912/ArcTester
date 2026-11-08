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
