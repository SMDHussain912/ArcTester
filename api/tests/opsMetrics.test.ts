import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { signIn, signUp, startTestServer, type TestServer } from "./server.js";

describe("admin API instance monitoring", () => {
  let server: TestServer;
  let secondServer: import("node:http").Server;
  let secondBaseUrl: string;
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const secondApp = buildApp(server.db);
    secondServer = await new Promise<import("node:http").Server>((resolve) => {
      const listener = secondApp.listen(0, () => resolve(listener));
    });
    const address = secondServer.address();
    if (!address || typeof address === "string") throw new Error("Second API instance did not bind a TCP port.");
    secondBaseUrl = "http://127.0.0.1:" + address.port;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => secondServer.close((error) => error ? reject(error) : resolve()));
    await server.close();
  });

  it("requires an authenticated administrator", async () => {
    const response = await fetch(server.baseUrl + "/admin/ops/servers");
    expect(response.status).not.toBe(200);
  });

  it("reports shared instance snapshots and marks stale heartbeats offline", async () => {
    const email = "ops-admin@example.test";
    const registered = await signUp(server.baseUrl, email);
    await server.db.user.update({ where: { id: registered.userId }, data: { role: "ADMIN" } });
    const admin = await signIn(server.baseUrl, email);
    const crossInstance = await fetch(secondBaseUrl + "/auth/me", { headers: { cookie: admin.cookie } });
    expect(crossInstance.status).toBe(200);
    const crossInstanceBody = await crossInstance.json() as { user: { email: string; role: string } };
    expect(crossInstanceBody.user).toMatchObject({ email, role: "ADMIN" });
    const oldSeen = new Date(Date.now() - 180_000);
    await server.db.$executeRaw`
      INSERT INTO server_instance_metrics
        (instance_id, hostname, version, build_sha, started_at, last_seen_at, cpu_percent,
         rss_bytes, heap_used_bytes, uptime_seconds, active_requests, requests_total,
         errors_total, request_rate, p50_latency_ms, p95_latency_ms, db_latency_ms)
      VALUES
        ('test-remote-instance', 'remote-api', '0.1.0', 'test-build',
         ${new Date(Date.now() - 3600_000)}, ${oldSeen}, 7.5, 1048576, 524288,
         3600, 0, 1000, 3, 8.0, 10.0, 40.0, 5.0)
      ON CONFLICT (instance_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
    `;

    const response = await fetch(server.baseUrl + "/admin/ops/servers", { headers: { cookie: admin.cookie } });
    expect(response.status).toBe(200);
    const body = await response.json() as { databaseStatus: string; servers: Array<Record<string, unknown>> };
    expect(body.databaseStatus).toBe("ready");
    expect(body.servers.length).toBeGreaterThanOrEqual(2);
    const remote = body.servers.find((row) => row.instanceId === "test-remote-instance");
    expect(remote).toMatchObject({ hostname: "remote-api", status: "offline", ageSeconds: expect.any(Number), p95LatencyMs: 40 });
    expect(remote).not.toHaveProperty("databaseUrl");
    expect(remote).not.toHaveProperty("ip");
    expect(remote).not.toHaveProperty("studentId");
  });
});
