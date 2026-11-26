-- Shared, atomic login throttling across API instances. Bucket keys are SHA-256 hashes;
-- no raw email or IP address is stored. Stale rows are removed opportunistically.
CREATE TABLE "auth_rate_limit_buckets" (
  "bucket_key" TEXT NOT NULL,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "window_started_at" TIMESTAMP(3) NOT NULL,
  "blocked_until" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_rate_limit_buckets_pkey" PRIMARY KEY ("bucket_key"),
  CONSTRAINT "auth_rate_limit_buckets_failure_count_check" CHECK ("failure_count" >= 0)
);
CREATE INDEX "auth_rate_limit_buckets_updated_at_idx" ON "auth_rate_limit_buckets"("updated_at");
