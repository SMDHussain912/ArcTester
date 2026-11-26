# ArcTester Platform Consolidation, Security and Scale Plan

**Status:** Parts 1–3 merged and verified. Part 4 engineering implementation is complete in PR #198 (ready for review); exact-head CI run #3373 passed. Production configuration, privacy notice, hosting retention/scheduler, and qualified legal/security review remain rollout gates; no merge or production deployment has been performed.  
**Implementation rule:** Deliver one part at a time on a feature branch/PR. Keep CI green before merge; do not deploy unmerged changes to production.

This roadmap consolidates the requested admin UX, academic content targeting, account security, auditability, infrastructure monitoring, and Android parity.

## Part 1 — Admin workspace and student/content organization

### Admin navigation and student management
- Combine **Student Approval** and **Student Management** into one Students workspace with pending approval and approved/disabled student views.
- Provide search, filters, pagination, student detail, approval/rejection, profile management, and account actions in the same tab.
- Remove the standalone **Institutions & Branches** admin tab. College and branch remain profile metadata used for validation and content targeting.
- Locate and restore the **Model Lab** entry in the admin navigation; organize admin pages into a small number of clear groups.
- Redesign the admin navigation for mobile: responsive drawer/compact navigation, accessible focus states, no overflow, and touch-friendly controls.
- Audit existing tabs and remove redundant or unused navigation entries without deleting their underlying functionality.

### Academic content ownership and visibility
- Define explicit content scope for lessons and questions: global, branch, college, or selected students.
- Store ownership/creator, approval status, branch/college scope, subject/topic, and assignment metadata.
- Show admins where each lesson/question belongs and which students can access it.
- Enforce content eligibility in API/database queries using the student's verified, approved academic profile. Frontend-only hiding is not authorization.
- Keep content administration and student learning APIs consistent across web and Android.

### UI quality
- Improve responsive layouts, spacing, typography, forms, search/filter controls, tables/cards, confirmation dialogs, loading/empty/error states, and accessibility.
- Use shared UI patterns rather than one-off styles; verify desktop, mobile web, and Android.

**Acceptance checks**
- Approval and management are reachable from one Students tab.
- Institutions & Branches is absent from admin navigation but profile metadata remains available.
- Model Lab is reachable from admin navigation.
- Lesson/question scope is visible and correctly enforced for students from different branches/colleges.
- Admin navigation works at narrow mobile widths without clipping or overlapping controls.

## Part 2 — Student profile changes and forced re-authentication

- Allow students to edit permitted profile fields: name, diploma registration number/PIN, college, and branch.
- Validate registration number structure, college code, branch code, and profile consistency server-side.
- Treat academic identity changes as security-sensitive: update profile, increment session version/revoke sessions, and invalidate refresh credentials.
- Clear access/refresh tokens and persisted credentials on web and Android; clear auth state and cached identity data.
- Show a success dialog: **“Settings changed successfully. Please log in again.”** Then redirect to login.
- Keep email/password changes on separately verified flows.
- Ensure profile changes cannot be used to switch into another student's content or bypass approval.

**Acceptance checks**
- Old access and refresh tokens fail after a protected profile change.
- Web storage/cookies and Android secure storage are cleared as appropriate.
- The user sees the success dialog before being returned to login.

## Part 3 — Student-by-student audit logs and export

- Add structured, server-generated audit events for relevant student/admin actions: login, 2FA/passkey changes, session revocation, approval, profile change, lesson access/completion, question activity, exam start/submit, content edits, and admin operations.
- Include event ID/request ID, actor ID and role, action, outcome, server timestamp, route/resource identifier, and relevant academic context.
- Build an admin student timeline with filters for event type, date range, branch, and outcome.
- Add authorized CSV and JSON export for filtered logs; audit every export.
- Use stable internal IDs in general activity logs. Keep IP/device/security details in a restricted security log with limited access and retention.
- Never log passwords, JWTs, cookies, OTPs, recovery codes, private keys, or unfiltered request bodies.
- Derive identity from the authenticated server-side session/token and database. Do not trust client-supplied name, college, registration number, or role as log identity.
- Restrict timeline and export routes to administrators; audit timeline views, exports, and integrity checks.
- Chain events with SHA-256 hashes under a PostgreSQL advisory lock; verify the retained chain and retention checkpoints.
- Provide a configurable retention prune command (`AUDIT_RETENTION_DAYS`, default 365; allowed 30–3650 days) that checkpoints the chain before deleting expired records. Schedule it as a managed cron job and export data before expiry when longer retention is required.
- Keep IP/device security details out of the general activity log; do not persist secrets or request bodies.

**Acceptance checks**
- Admin can inspect a student's timeline and download filtered logs.
- Logs are attributable to server-resolved users and cannot be forged by changing request fields.
- Hash-chain integrity checks detect altered retained records and missing links; retention checkpoints preserve continuity after scheduled pruning.
- Sensitive authentication material never appears in logs.
- Admin-only CSV/JSON exports are filtered, capped, formula-safe, and themselves audited.

## Part 4 — Complete security and compliance hardening

**Implementation status:** Code and regression tests are implemented in PR #198. CI run #3352 passed on the exact head. Operational/legal acceptance checks below remain owned by the deployment operator and qualified reviewer.

- Verify JWT/session credentials on every protected request: signature, algorithm allowlist, expiry, issuer, audience, session version/revocation, and role.
- Enforce role, ownership, and academic-scope checks at every API route; test IDOR and privilege escalation.
- Review password hashing, password reset, refresh rotation, logout, session invalidation, account recovery, and admin protections.
- Complete authenticator TOTP, passkeys/WebAuthn, recovery codes, replay protection, device/session management, and secure enrollment/removal.
- Add shared IP/account throttling, lockout/backoff protections, suspicious sign-in detection, and security alerts.
- Review CORS, CSRF, cookie flags, HTTPS, security headers, input/schema validation, file uploads, secrets, database permissions, and error handling.
- Review admin MCP/model operations and ensure students cannot access admin tools or another user's data.
- Add automated security tests for missing/invalid/expired/revoked tokens, role mismatch, resource ownership, branch scope, rate limits, and session revocation.
- Prepare privacy notice, purpose limitation, data minimization, retention/deletion, data-subject request, and incident-response procedures.

### Regulatory readiness (India)
- Assess applicability and timelines under the Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025; design for notice, purpose limitation, data minimization, appropriate security safeguards, rights/request handling, retention, and breach response.
- Assess CERT-In Directions 2022 applicability, including secure log retention and incident reporting obligations, against ArcTester’s organization and hosting arrangement.
- Confirm legal obligations and policy wording with a qualified reviewer before production launch; this roadmap is engineering preparation, not legal certification.

**Acceptance checks**
- All protected API routes have explicit authentication and authorization coverage.
- Security tests cover token/session/role/ownership failures.
- No production secrets are committed; deployment configuration and incident procedures are documented.

## Part 5 — Multi-server operations, monitoring, and Android parity

### Multi-server architecture
- Add a second API instance only after the app is safe for multi-instance operation.
- Keep API instances stateless; use shared database and shared session/revocation/rate-limit storage.
- Route traffic through a load balancer/gateway with health checks and healthy-instance selection.
- Use a shared limiter (for example, Redis-backed) so limits apply across all servers.
- Add timeouts, bounded retries, circuit breakers, idempotency where needed, and safe behavior during partial outages.
- Route new requests away from unhealthy or overloaded instances; do not retry non-idempotent writes blindly.

### Admin server monitor
- Show real per-server health, uptime, deployment/version, CPU, memory, disk, network, and request volume.
- Show request rate, latency percentiles, error rates, active requests, throttling, and traffic distribution.
- Show database connection/latency/error metrics and recent incidents.
- Add thresholds/alerts for unhealthy, overloaded, or erroring services.
- Secure monitoring endpoints and avoid exposing infrastructure secrets or sensitive data to ordinary students.

### Android parity
- Match the new mobile web navigation and responsive layout on Android.
- Add student activity/security/session views and the combined admin Students workspace where supported by role.
- Implement profile-change forced logout and secure token clearing in Android.
- Ensure branch/college content filtering, approval state, lesson/question access, and admin security controls behave consistently.
- Test on real Android builds and narrow web mobile layouts.

**Acceptance checks**
- Traffic is balanced across healthy instances and moves away from failed instances.
- Rate limits are shared across instances.
- Admin monitor displays live/provider-backed metrics, not placeholder values.
- Android passes navigation, auth, profile, content-scope, and session-revocation tests.

## Delivery sequence

1. Part 1: admin navigation, student workspace, content scope.
2. Part 2: profile editing and forced logout.
3. Part 3: audit logs, student timelines, exports.
4. Part 4: security hardening and regulatory readiness.
5. Part 5: multi-server monitoring, load balancing, Android parity.

Each part should have focused tests, CI green on the latest commit, a reviewable PR, and no production deployment before merge and required configuration.
