import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Integration suites provision isolated PostgreSQL schemas and replay
    // Prisma migrations. Prisma's migration advisory lock is database-wide,
    // not schema-scoped, so parallel files contend even with unique schemas.
    hookTimeout: 180_000,
    // Allow slower database-backed integration tests on constrained machines.
    testTimeout: 30_000,
    // Keep migration and db-push provisioning deterministic. Running one
    // file at a time prevents cross-worker advisory-lock contention.
    minWorkers: 1,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
