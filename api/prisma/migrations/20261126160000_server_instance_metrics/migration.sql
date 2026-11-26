-- Per-instance operational snapshots shared through PostgreSQL for the admin fleet monitor.
-- Metrics contain process aggregates only; no student identifiers, request paths, tokens, or IP addresses.
CREATE TABLE "server_instance_metrics" (
  "instance_id" TEXT NOT NULL,
  "hostname" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "build_sha" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL,
  "cpu_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rss_bytes" BIGINT NOT NULL DEFAULT 0,
  "heap_used_bytes" BIGINT NOT NULL DEFAULT 0,
  "uptime_seconds" INTEGER NOT NULL DEFAULT 0,
  "active_requests" INTEGER NOT NULL DEFAULT 0,
  "requests_total" BIGINT NOT NULL DEFAULT 0,
  "errors_total" BIGINT NOT NULL DEFAULT 0,
  "request_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "p50_latency_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "p95_latency_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "db_latency_ms" DOUBLE PRECISION,
  CONSTRAINT "server_instance_metrics_pkey" PRIMARY KEY ("instance_id"),
  CONSTRAINT "server_instance_metrics_nonnegative_check" CHECK (
    "cpu_percent" >= 0 AND "rss_bytes" >= 0 AND "heap_used_bytes" >= 0 AND
    "uptime_seconds" >= 0 AND "active_requests" >= 0 AND "requests_total" >= 0 AND
    "errors_total" >= 0 AND "request_rate" >= 0 AND "p50_latency_ms" >= 0 AND
    "p95_latency_ms" >= 0 AND ("db_latency_ms" IS NULL OR "db_latency_ms" >= 0)
  )
);
CREATE INDEX "server_instance_metrics_last_seen_at_idx" ON "server_instance_metrics"("last_seen_at");
