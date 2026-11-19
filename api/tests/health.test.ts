import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/index.js";
import { startTestServer, type TestServer } from "./server.js";

describe("API health and readiness", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer(buildApp);
  });

  afterAll(async () => {
    await server.close();
  });

  it("keeps liveness independent from database readiness", async () => {
    const response = await fetch(server.baseUrl + "/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, service: "ecet-api" });
  });

  it("reports ready only when the database query succeeds", async () => {
    const response = await fetch(server.baseUrl + "/ready");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, database: "ready" });
  });

  it("returns 503 without leaking database errors when readiness fails", async () => {
    const unavailable = {
      $queryRaw: async () => { throw new Error("private database connection string"); },
    } as unknown as PrismaClient;
    const app = buildApp(unavailable);
    const httpServer = await new Promise<import("node:http").Server>((resolve) => {
      const listener = app.listen(0, () => resolve(listener));
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port.");
    try {
      const response = await fetch("http://127.0.0.1:" + address.port + "/ready");
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false, service: "ecet-api", database: "unavailable" });
    } finally {
      await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    }
  });
});
