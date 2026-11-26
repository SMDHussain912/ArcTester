# Part 4 — Security and compliance hardening

**Status:** Part 4 engineering implementation is complete on PR #198 (ready for review). Exact-head ArcTester CI run #3373 passed on `d6415a26d7131c7a803193cf3052389e89939ad8`. Production rollout remains blocked until the automated preflight passes in the target environment and the remaining hosting/privacy/legal sign-offs are completed. No merge or production deployment has been performed.

## Delivery rules
- Keep the work on this feature branch and open one reviewable PR for Part 4.
- No production deployment before merge and required environment configuration.
- Run focused tests after each security change, then full CI on the final head.
- Security controls must be enforced server-side. UI visibility is not authorization.
- Do not log passwords, tokens, cookies, OTPs, recovery codes, private keys, or raw request bodies.

## Workstreams and acceptance criteria

### 4.1 Token/session verification
- [x] Explicit HS256 algorithm/type allowlist and constant-time signature comparison.
- [x] Require JWT issuer and audience; validate issued-at, expiry, optional not-before, and maximum seven-day lifetime.
- [x] Keep session-version and database-backed session revocation checks.
- [x] Add coverage for invalid/expired JWTs, wrong issuer/audience, future issued-at, excessive lifetime, and revoked sessions in auth tests.
- [x] Add protected-route tests for malformed tokens, missing bearer, signed tokens missing required identity claims, expired tokens, and revoked sessions.
- [x] Document production issuer/audience configuration and forced re-login impact.

### 4.2 Authorization and tenant/resource boundaries
- [x] Create the router-level authorization inventory in docs/security/API_AUTHORIZATION_INVENTORY.md.
- [x] Review router/handler boundaries and ownership predicates across student-owned resources; route inventory and regression tests document the checks.
- [x] Document and test student MCP owner-only reads/edits, per-key scopes, role re-check, and immediate key revocation.
- [x] Verify privileged paths require authenticated approved accounts and current database-backed admin role; admin MCP re-checks current role and key revocation.
- [x] Admin MCP tests verify missing tool scopes, current administrator role, and key revocation.
- [x] Add static regression tests requiring auth/admin/MCP key middleware on all non-public API route registrations and admin route registrations.
- [x] Verify owner-scoped reads/updates/deletes for exams/sessions/submissions, learning progress, notifications, materials, and student MCP resources; regression coverage exists for cross-user attempts.
- [x] Verify college/branch/selected-student eligibility is enforced server-side for questions, lessons, and study materials.
- [x] Add IDOR regression test proving a student MCP key cannot read or edit another student's private question.
- [x] Add/confirm IDOR and privilege tests across admin MCP, exams/sessions/submissions, analytics ownership, materials, academic content audience, and student MCP.

### 4.3 Authentication lifecycle and MFA
- [x] Pin scrypt N=16384/r=8/p=1 for password hash/verify, validate stored hash format, and review password change, logout, session revocation, and admin protection. No password-reset endpoint currently exists; review any future recovery flow before adding it.
- [x] Review TOTP replay/attempt limits, recovery-code single use (compare-and-swap), passkey challenge attempts/origin/RP validation, and credential removal.
- [x] MFA removal revokes all sessions; passkey removal revokes all sessions. Password change already increments session version.
- [x] Require a session issued within five minutes for TOTP enrollment and passkey enrollment/removal; TOTP disable verifies password and current factor.
- [x] Verify account-security UI surfaces the explicit re-authentication-required API message; users can sign in again to confirm sensitive changes.
- [x] Add recent-auth, concurrent one-time recovery-code use, MFA-removal and passkey-removal session-revocation tests.
- [x] Add TOTP/passkey expired-challenge and attempt-limit tests, passkey consumed-challenge replay and concurrent counterless assertion tests, authenticator-counter replay, and concurrent TOTP counter tests.

### 4.4 Abuse protection and perimeter
- [x] Replace process-local password-login/token failure counters with atomic PostgreSQL buckets shared across API instances; bucket keys are hashed and raw email/IP are not stored.
- [x] Replace the global API request limiter with a shared PostgreSQL atomic counter; liveness/readiness probes bypass the limiter database dependency.
- [x] Preserve per-IP+account and per-IP failure ceilings; success clears the corresponding hashed buckets. Failed/throttled sign-ins are recorded; new device/network sign-ins generate an in-app security notification.
- [x] Review lockout tradeoff: no global per-account lockout; account failures are scoped to IP+account and an IP-only ceiling limits one source, so another network is not locked out.
- [x] Review CORS allowlist, cookie flags, CSRF behavior, HTTPS enforcement, Helmet/security headers, body limits, schema validation, upload handling, and safe errors at middleware/config level; Helmet CSP defaults are enabled.
- [x] Production browser registration fails closed if Turnstile secret is missing; TRUST_PROXY_HOPS is validated and documented.
- [ ] Confirm production CORS origins, TRUST_PROXY_HOPS, upload/storage permissions, and host-level log retention/residency before rollout.
- [x] Add login throttle tests and assert hashed PostgreSQL bucket identifiers.
- [x] Add exact 300-request API limiter boundary test and hashed bucket check.
- [x] Add trusted/untrusted cookie mutation-origin tests (unit coverage in api/tests/csrf.test.ts).

### 4.5 Secrets, data, admin MCP/model controls
- [x] Verify JWT/TOTP secret validation and document production environment checklist in docs/security/PRODUCTION_SECURITY_CONFIGURATION.md.
- [x] Add fail-closed production CORS/cookie validation and a deployment security preflight for JWT/TOTP/Turnstile/contact configuration and PostgreSQL runtime-role privileges; document host-only checks that require operator sign-off.
- [ ] Set/verify production secrets, database least-privilege, object-storage policies, and host configuration in the secret manager before rollout.
- [ ] Confirm production database least-privilege/backup access and host-side sensitive-field protections with the hosting operator.
- [x] Review admin MCP per-tool scope gates and current-admin/key revocation checks; student MCP is owner- and scope-bound (regression tests added).
- [x] Add tests for missing admin MCP scopes, revoked/demoted admin keys, and student MCP cross-user access/role/revocation.

### 4.6 Privacy and incident readiness (India)
- [x] Draft privacy/data-purpose/minimization, retention/deletion, data-request and incident-response runbook in docs/security/PRIVACY_AND_INCIDENT_RESPONSE.md.
- [x] Extend the scheduled retention command to prune old login-history metadata and stale session records.
- [ ] Publish the student-facing privacy notice and establish the actual request/grievance contact before production.
- [x] Record the current official DPDP phased commencement and CERT-In 6-hour incident reporting / 180-day log requirements with official links.
- [ ] Obtain qualified legal/security review and confirm DPDP/CERT-In applicability, hosting jurisdiction, required log retention, reporting point of contact, and incident owner.
- [x] State that engineering checklist completion is not legal certification.

## Current implementation notes
- JWTs now carry `iss=arctester-api` and `aud=arctester-client` by default. Override with `JWT_ISSUER` and `JWT_AUDIENCE` consistently across all API instances/environments.
- Verifier rejects missing/wrong issuer or audience, missing/future `iat`, expired tokens, invalid `nbf`, and lifetimes over seven days.
- Existing tokens minted before this change do not contain the required claims and will be rejected after deployment. Users will need to sign in again. This is intentional; schedule deployment with a user-facing re-login notice.
- Password login, bearer-token endpoint, and general API throttling use atomic PostgreSQL upserts in `auth_rate_limit_buckets`, shared across instances. The migration is `20261126070000_add_shared_auth_rate_limits`; the table is modeled in Prisma and account/IP bucket keys are SHA-256 digests. `/health`, `/ready`, and CORS preflight bypass the limiter.
- Production browser registration fails closed without Turnstile secret configuration. Helmet CSP/SAMEORIGIN defaults are enabled. `TRUST_PROXY_HOPS` is validated. Failed/throttled password and bearer sign-ins are recorded; new device/network sign-ins produce an in-app security notification. The retention command prunes old login history at configured retention and expired/revoked sessions after 90 days.
