import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Integration suites create isolated PostgreSQL schemas and replay the
    // migration history before starting their HTTP server.
    hookTimeout: 120_000,
    // Model training and database-backed integration tests need more than the
    // five-second unit-test default on constrained development machines.
    testTimeout: 20_000,
    // Keep the worker range valid and avoid overwhelming PostgreSQL with
    // simultaneous schema migrations on machines with few CPU cores.
    minWorkers: 1,
    maxWorkers: 2,
  },
});
