# ArcTester Multi-Instance Operations Runbook

## Health endpoints

- `GET /health` is **liveness**: the process can answer HTTP. It deliberately does not depend on PostgreSQL.
- `GET /ready` is **readiness**: PostgreSQL must execute `SELECT 1`. Route user traffic only to ready instances.
- Do not configure the load balancer to use the admin monitor endpoint as a health check.

## Instance identity and monitoring

The API reports a per-process snapshot to the shared `server_instance_metrics` PostgreSQL table every 15 seconds and after completed requests. Instance identity uses `INSTANCE_ID`, then `RENDER_INSTANCE_ID`, then the container hostname plus process ID. Set `INSTANCE_ID` only when the value is unique per running process.

Build identity uses `RENDER_GIT_COMMIT`, `GIT_SHA`, or `SOURCE_VERSION`; otherwise the dashboard correctly shows that a build identifier is not configured.

Admin → System → Server monitor is administrator-only. A heartbeat up to 30 seconds old is healthy; 31–120 seconds is stale; over 120 seconds is offline. A heartbeat means the process has reported a snapshot, not that every downstream dependency is healthy. Database readiness and probe latency are shown separately.

The monitor stores aggregate metrics only: no request paths, student IDs, raw client IP addresses, credentials, or environment values. Inactive instance records are pruned after 30 days.

## Safe scale-out procedure

Do not add a second production instance until Part 5 validation and a deployment operator review are complete.

1. Confirm the latest code and database migration are deployed; verify `server_instance_metrics` exists.
2. Confirm every instance uses the same PostgreSQL database and compatible session/JWT configuration.
3. Confirm shared request throttling remains enabled and its table is migrated. Do not switch it to process-local memory.
4. Check database connection budget before increasing instance count. Account for each API pool, the model worker, migrations, admin tools, and operational headroom; keep the combined maximum below the database provider's connection limit.
5. Add one additional instance in a staging environment behind the provider's load balancer. Configure readiness with `/ready` and liveness with `/health`.
6. Verify both instance IDs appear in the monitor and their heartbeats refresh independently.
7. Exercise login, session refresh/revocation, a student read, and an exam submission through load-balanced traffic. Confirm a shared rate limit applies regardless of which instance receives the request.
8. Observe request rate, p95 latency, 5xx totals, CPU, memory, and database probe latency during a controlled load test. Check for connection exhaustion and duplicate writes.
9. If errors or latency rise, remove the added instance and return to the last known-good configuration. Do not blindly retry non-idempotent POST/submit operations.

## Proxy and drain settings

- Set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops in the deployment path; never use an arbitrary broad trust setting.
- Keep connection pooling configured for the actual PostgreSQL provider. Avoid multiplying an oversized per-instance pool by the instance count.
- On SIGTERM the API stops its heartbeat and closes the listener to drain in-flight requests before disconnecting Prisma.
- Use bounded timeouts and retries in clients/gateways. Retry only idempotent operations or requests protected by a verified idempotency key.

## Rollback

Scale back to the previous instance count, confirm the remaining instance is healthy/ready, and check database connections and error rates. Preserve the deployment/build identifier and incident timestamps for diagnosis. Do not delete the shared metrics table as part of a rollback.
