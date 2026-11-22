import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { startTestServer, type TestServer } from "./server.js";

describe("lesson audio upload JSON body parsing", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer(buildApp);
  });

  afterAll(async () => {
    await server.close();
  });

  it("parses audio upload JSON above the default 1 MiB limit before authentication", async () => {
    // Intentionally malformed JSON: a correctly installed 18 MiB parser
    // reports 400. A bypassed parser reaches requireAuth (401), while the
    // ordinary 1 MiB parser rejects this payload with 413.
    const body = `{"base64":"${"x".repeat(1_100_000)}"`;
    const response = await fetch(
      `${server.baseUrl}/admin/lesson-drafts/body-parser-test/scenes/0/audio`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      },
    );

    expect(response.status).toBe(400);
  });
});
