import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { bootstrapAdmin } from "../src/bootstrapAdmin.js";
import { startTestServer, type TestServer } from "./server.js";

describe("one-time administrator bootstrap", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer(buildApp);
  });

  afterAll(async () => {
    await server.close();
  });

  it("serializes concurrent bootstrap attempts so only one administrator is created", async () => {
    const results = await Promise.allSettled([
      bootstrapAdmin(server.db, "first-admin@example.com", "FirstAdminPassword123!"),
      bootstrapAdmin(server.db, "second-admin@example.com", "SecondAdminPassword123!"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const admins = await server.db.user.findMany({
      where: { role: "ADMIN" },
      select: { email: true },
    });
    expect(admins).toHaveLength(1);
    expect(["first-admin@example.com", "second-admin@example.com"]).toContain(admins[0].email);

    await expect(
      bootstrapAdmin(server.db, "third-admin@example.com", "ThirdAdminPassword123!"),
    ).rejects.toThrow(/one-time only/);
    expect(await server.db.user.count({ where: { role: "ADMIN" } })).toBe(1);
  });
});
