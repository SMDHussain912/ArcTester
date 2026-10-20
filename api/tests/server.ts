import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AddressInfo } from "node:net";
import type { Express } from "express";

/**
 * Isolated API + SQLite per test FILE: spins a temp DB, pushes the schema,
 * builds the app against it, and serves on a random port. Tests use plain
 * global fetch — no new libraries (no supertest).
 */

export interface TestServer {
  baseUrl: string;
  db: PrismaClient;
  close: () => Promise<void>;
}

export async function startTestServer(
  buildApp: (db: PrismaClient) => Express
): Promise<TestServer> {
  const { execFileSync } = await import("node:child_process");
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const apiDir = dirname(dirname(fileURLToPath(import.meta.url)));

  const dir = mkdtempSync(join(tmpdir(), "ecet-api-test-"));
  const url = `file:${join(dir, "test.db")}`;
  execFileSync(
    "npx",
    ["prisma", "db", "push", "--skip-generate", "--schema", join(apiDir, "prisma/schema.prisma")],
    { cwd: apiDir, stdio: "pipe", env: { ...process.env, DATABASE_URL: url } }
  );
  const db = new PrismaClient({ datasources: { db: { url } } });

  const app = buildApp(db);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;

  const close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  };

  return { baseUrl: `http://127.0.0.1:${port}`, db, close };
}

export async function postJson(
  url: string,
  body: unknown
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

export async function getJson(url: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url);
  return { status: res.status, json: await res.json() };
}

afterEach(async () => {
  // Per-file servers clean up in afterAll of each test file.
});
