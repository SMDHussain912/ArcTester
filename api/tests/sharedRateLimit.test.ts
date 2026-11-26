import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { startTestServer, type TestServer } from "./server.js";

let server: TestServer;

describe("shared API rate limiter", () => {
  beforeAll(async () => { server = await startTestServer(buildApp); });
  afterAll(async () => { await server.close(); });

  it("keeps Helmet's default security headers enabled", async () => {
    const response = await fetch(server.baseUrl + "/health");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("allows exactly 300 requests in the window, then returns 429 with retry headers", async () => {
    for (let request = 0; request < 300; request += 1) {
      const response = await fetch(server.baseUrl + "/auth/me");
      expect(response.status).toBe(403);
      if (request === 299) {
        expect(response.headers.get("ratelimit-limit")).toBe("300");
        expect(response.headers.get("ratelimit-remaining")).toBe("0");
      }
    }
    const blocked = await fetch(server.baseUrl + "/auth/me");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    const buckets = await server.db.$queryRaw<Array<{ bucket_key: string }>>`
      SELECT bucket_key FROM auth_rate_limit_buckets WHERE bucket_key LIKE 'api:%'
    `;
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.bucket_key).toMatch(/^api:[a-f0-9]{64}$/);
  });
});
