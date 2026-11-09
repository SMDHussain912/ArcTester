import { createHash, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AddressInfo } from "node:net";
import type { Express } from "express";

/**
 * Isolated API + PostgreSQL schema per test FILE: applies the real migration
 * history in a dedicated schema, builds the app against it, and serves on a
 * random port. Tests use plain global fetch — no supertest.
 */

const testDatabases = new Map<string, PrismaClient>();

export interface TestServer {
  baseUrl: string;
  db: PrismaClient;
  close: () => Promise<void>;
}

function schemaUrl(baseUrl: string, schema: string): string {
  const parsed = new URL(baseUrl);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

async function createSchema(baseUrl: string, schema: string): Promise<void> {
  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.$disconnect();
  }
}

async function dropSchema(baseUrl: string, schema: string): Promise<void> {
  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
}

export async function startTestServer(
  buildApp: (db: PrismaClient) => Express
): Promise<TestServer> {
  const { execFileSync } = await import("node:child_process");
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const apiDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("DATABASE_URL must point to the PostgreSQL test server.");
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const url = schemaUrl(baseUrl, schema);
  await createSchema(baseUrl, schema);

  try {
    execFileSync(
      "npx",
      ["prisma", "migrate", "deploy", "--schema", join(apiDir, "prisma/schema.prisma")],
      { cwd: apiDir, stdio: "pipe", env: { ...process.env, DATABASE_URL: url } }
    );
  } catch (error) {
    await dropSchema(baseUrl, schema);
    throw error;
  }
  const db = new PrismaClient({ datasources: { db: { url } } });

  const app = buildApp(db);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;

  const base = `http://127.0.0.1:${port}`;
  testDatabases.set(base, db);

  const close = async () => {
    testDatabases.delete(base);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
    await dropSchema(baseUrl, schema);
  };

  return { baseUrl: base, db, close };
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

/** Create an invitation directly in the isolated test database. */
export async function issueTestInvitation(db: PrismaClient, email: string): Promise<string> {
  const admin = await db.user.upsert({
    where: { email: "test-admin@arctester.invalid" },
    create: { email: "test-admin@arctester.invalid", passwordHash: "test-only", role: "ADMIN" },
    update: { role: "ADMIN" },
  });
  const token = randomBytes(32).toString("base64url");
  await db.invitation.create({
    data: {
      email: email.trim().toLowerCase(),
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdById: admin.id,
    },
  });
  return token;
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
  const db = testDatabases.get(baseUrl);
  if (!db) throw new Error("No test database is registered for this server.");
  const invitationToken = await issueTestInvitation(db, email);
  const reg = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, invitationToken }),
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
