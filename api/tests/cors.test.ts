import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { startTestServer, type TestServer } from "./server.js";

let server: TestServer;
const previousCorsOrigins = process.env.CORS_ORIGINS;

beforeAll(async () => {
  process.env.CORS_ORIGINS = "http://192.168.1.20:3000, https://study.example.com";
  server = await startTestServer(buildApp);
});

afterAll(async () => {
  await server.close();
  if (previousCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = previousCorsOrigins;
});

describe("CORS origin allowlist", () => {
  it("allows localhost development origins by default", async () => {
    const response = await fetch(`${server.baseUrl}/health`, {
      headers: { origin: "http://localhost:3000" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("allows an explicitly configured LAN origin", async () => {
    const response = await fetch(`${server.baseUrl}/health`, {
      headers: { origin: "http://192.168.1.20:3000" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("http://192.168.1.20:3000");
  });

  it("does not reflect an unconfigured origin", async () => {
    const response = await fetch(`${server.baseUrl}/health`, {
      headers: { origin: "http://192.168.1.99:3000" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers preflight requests for configured origins", async () => {
    const response = await fetch(`${server.baseUrl}/tests`, {
      method: "OPTIONS",
      headers: {
        origin: "https://study.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,authorization",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://study.example.com");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  });
});
