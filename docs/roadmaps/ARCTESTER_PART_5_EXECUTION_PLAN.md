# ArcTester Part 5 — Server Operations and Android Parity

**Status:** Part 5 implementation merged in PR #199 at `1b4b62a34b98478a7180c4f9c824a35570986378`. CI run #45754209925 passed on exact PR head `7ef45d42dabba823286006d7ba075f8bf` (all five jobs). No production deployment or hosting instance-count change was performed.

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
- Add integration coverage for two API app instances sharing the same test database, including shared rate-limit state and an authenticated session created on one instance and used on the other. The admin fleet test also verifies a second-instance snapshot and stale/offline classification. These are two Express app instances in the test process; a separate-process test behind the real hosting load balancer remains an operator staging check.
- Document deployment health-check paths, proxy hop configuration, readiness vs liveness, connection pooling, and drain behavior.
- Add safe timeout/retry guidance; retries must not automatically replay non-idempotent writes.

### 5.3 Android parity
- Reconcile the student mobile client with the current profile-change forced-logout, academic content scope, approval, and session security behavior. Existing profile-change forced logout and student-role-only mobile access remain enforced.
- Add a mobile Account Security center for active sessions, revoking another session/current device/all sessions, recent sign-in history, and authenticator/passkey/recovery-code status.
- Keep the admin console web-only on Android: the existing mobile login explicitly rejects ADMIN accounts and directs them to ArcTester Web. Do not weaken this boundary or expose admin endpoints to student navigation.
- Mobile typecheck and unit tests passed; the security center action logic is covered, and existing app logic continues to force sign-out after academic profile changes and reject ADMIN accounts. The full mobile test suite passed on the merged PR head.

### 5.4 Rollout readiness
- Add a runbook for scaling from one to multiple API instances behind the hosting platform's load balancer.
- Keep instance count at one until shared-state, health checks, database pool limits, and monitoring are verified in the target hosting environment.
- Production instance scaling, environment changes, and deployment are operator actions and are not performed by this code PR.

## Acceptance checklist

- [x] Admin-only fleet endpoint reports real instance snapshots from shared PostgreSQL.
- [x] Current, stale, and failed instances are visually distinct and timestamped.
- [x] Metrics are bounded, aggregated, and contain no secrets or raw student identifiers.
- [x] Tests prove shared rate limits and session auth across two app instances, fleet aggregation, and admin authorization.
- [x] Health/readiness semantics and graceful shutdown remain intact.
- [x] Android security center supports session review/revocation and the student-only admin boundary remains enforced.
- [x] CI passed on the latest PR head; no production deployment occurred.


## Operator rollout gates (not performed by this code PR)

- [ ] Apply the merged migration in the target staging environment and verify `server_instance_metrics` is present.
- [ ] Run two separate Node.js processes behind the actual hosting load balancer; verify distinct instance IDs and independent heartbeats.
- [ ] Verify readiness/liveness routing, shared sessions/revocation, shared rate limits, database pool budget, and safe drain during a rolling restart.
- [ ] Obtain operator approval before increasing production instance count or changing hosting/environment settings.
- [ ] Complete Part 4 privacy/contact/retention and legal/security acceptance gates before production rollout.
