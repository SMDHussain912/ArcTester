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
  body: unknown,
  cookie?: string
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

export async function getJson(
  url: string,
  cookie?: string
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, cookie ? { headers: { cookie } } : undefined);
  return { status: res.status, json: await res.json() };
}

/** Read the `ecet_session` cookie out of a response's Set-Cookie headers. */
export function sessionCookie(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  const found = raw.find((c) => c.startsWith("ecet_session="));
  if (!found) throw new Error("No session cookie in response.");
  return found.split(";")[0];
}

/**
 * Register a brand-new account and sign it in. Returns the session cookie
 * plus the new user's id, so tests can scope expectations to one account.
 */
export async function signUp(
  baseUrl: string,
  email: string,
  password = "correct-horse-battery"
): Promise<{ cookie: string; userId: number }> {
  const reg = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (reg.status !== 201) {
    throw new Error(`Register failed (${reg.status}): ${await reg.text()}`);
  }
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) {
    throw new Error(`Login failed (${login.status}): ${await login.text()}`);
  }
  const body = (await login.json()) as { user: { id: number } };
  return { cookie: sessionCookie(login), userId: body.user.id };
}

/** Sign in an existing account and return its session cookie. */
export async function signIn(
  baseUrl: string,
  email: string,
  password = "correct-horse-battery"
): Promise<{ cookie: string; userId: number }> {
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) {
    throw new Error(`Login failed (${login.status}): ${await login.text()}`);
  }
  const body = (await login.json()) as { user: { id: number } };
  return { cookie: sessionCookie(login), userId: body.user.id };
}

/**
 * Bind a session cookie to a base URL so tests can call `api.get("/tests/1")`
 * without repeating the cookie on every request.
 */
export function bindSession(baseUrl: string, cookie: string) {
  return {
    baseUrl,
    post: (path: string, body: unknown) => postJson(`${baseUrl}${path}`, body, cookie),
    get: (path: string) => getJson(`${baseUrl}${path}`, cookie),
  };
}

afterEach(async () => {
  // Per-file servers clean up in afterAll of each test file.
});
