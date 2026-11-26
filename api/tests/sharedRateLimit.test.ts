import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let secondServer: import("node:http").Server;
let secondBaseUrl: string;

describe("shared API rate limiter", () => {
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

  it("keeps Helmet's default security headers enabled", async () => {
    const response = await fetch(server.baseUrl + "/health");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("allows exactly 300 requests in the window, then returns 429 with retry headers", async () => {
    for (let request = 0; request < 300; request += 1) {
      const target = request % 2 === 0 ? server.baseUrl : secondBaseUrl;
      const response = await fetch(target + "/auth/me");
      expect(response.status).toBe(403);
      if (request === 299) {
        expect(response.headers.get("ratelimit-limit")).toBe("300");
        expect(response.headers.get("ratelimit-remaining")).toBe("0");
      }
    }
    const blocked = await fetch(secondBaseUrl + "/auth/me");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    const buckets = await server.db.$queryRaw<Array<{ bucket_key: string }>>`
      SELECT bucket_key FROM auth_rate_limit_buckets WHERE bucket_key LIKE 'api:%'
    `;
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.bucket_key).toMatch(/^api:[a-f0-9]{64}$/);
  });
});
