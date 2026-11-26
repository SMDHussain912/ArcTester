# ArcTester Part 5 — Server Operations and Android Parity

**Status:** In progress on `part-5-server-ops-monitoring`, PR #199. The first fleet-monitor slice and mobile account-security screen are implemented; CI is still required on the final head. No production deployment or hosting changes are included in this implementation branch.

## Verified starting point

- `GET /health` is liveness-only and remains independent of database availability.
- `GET /ready` probes the active database and returns 503 on failure without exposing connection errors.
- API request throttling already uses PostgreSQL shared buckets, so limits are not process-local.
- `AdminLiveMonitor` is exam-session invigilation; it is not infrastructure/server monitoring.
- The API already closes its HTTP listener gracefully on SIGTERM and disconnects Prisma after the listener drains.

## Delivery slices

### 5.1 API instance metrics and admin fleet monitor
- Capture per-process request totals, in-flight requests, 5xx count, bounded latency samples (p50/p95), process CPU and memory, uptime, version/build identifier, and database probe latency.
- Persist a privacy-safe instance heartbeat/metrics snapshot every 15 seconds in shared PostgreSQL so multiple API instances can report to one admin view; request samples update in memory and are not written per request.
- Mark stale instances explicitly; never present a stale snapshot as healthy or a placeholder metric as live.
- Add an authenticated, administrator-only endpoint and a responsive admin System Monitor page with manual refresh and periodic polling.
- Do not expose hostnames, process identifiers, database URLs, environment values, or raw IP addresses to students or unauthenticated callers.

### 5.2 Multi-instance resilience
- Validate that sessions, revocation, shared rate limits, and API state are database/shared-store backed and do not depend on process memory.
- Add integration coverage for two app instances sharing the same test database, including shared rate-limit state and an authenticated session created on one instance and used on the other. The admin fleet test also verifies a second-instance snapshot and stale/offline classification.
- Document deployment health-check paths, proxy hop configuration, readiness vs liveness, connection pooling, and drain behavior.
- Add safe timeout/retry guidance; retries must not automatically replay non-idempotent writes.

### 5.3 Android parity
- Reconcile the student mobile client with the current profile-change forced-logout, academic content scope, approval, and session security behavior. Existing profile-change forced logout and student-role-only mobile access remain enforced.
- Add a mobile Account Security center for active sessions, revoking another session/current device/all sessions, recent sign-in history, and authenticator/passkey/recovery-code status.
- Keep the admin console web-only on Android: the existing mobile login explicitly rejects ADMIN accounts and directs them to ArcTester Web. Do not weaken this boundary or expose admin endpoints to student navigation.
- Add Android tests for session invalidation and navigation/auth behavior affected by Part 5.

### 5.4 Rollout readiness
- Add a runbook for scaling from one to multiple API instances behind the hosting platform's load balancer.
- Keep instance count at one until shared-state, health checks, database pool limits, and monitoring are verified in the target hosting environment.
- Production instance scaling, environment changes, and deployment are operator actions and are not performed by this code PR.

## Acceptance checklist

- [ ] Admin-only fleet endpoint reports real instance snapshots from shared PostgreSQL (implemented in PR #199; pending final CI).
- [ ] Current, stale, and failed instances are visually distinct and timestamped.
- [ ] Metrics are bounded, aggregated, and contain no secrets or raw student identifiers.
- [ ] Tests prove shared rate limits and session auth across two app instances, fleet aggregation, and admin authorization (implemented in PR #199; pending final CI).
- [ ] Health/readiness semantics and graceful shutdown remain intact.
- [ ] Android security center supports session review/revocation and the student-only admin boundary remains enforced (screen and unit test implemented in PR #199; pending final CI).
- [ ] CI passes on the latest PR head; no production deployment occurs before merge and operator approval.
