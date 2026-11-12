import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { validateJwtSecret } from "../src/auth.js";
import { importFromJson } from "../src/importService.js";
import {
  issueTestInvitation,
  postJson,
  sessionCookie,
  startTestServer,
  type TestServer,
} from "./server.js";

let server: TestServer;

const BANK: unknown[] = [
  ["Maths", "Maths Q1?", ["a1", "b1", "c1", "d1"], 0, "exp-m1"],
  ["Maths", "Maths Q2?", ["a2", "b2", "c2", "d2"], 1, "exp-m2"],
];

const cookieJar = new Map<string, string>();

function setCookieFromResponse(res: Response): void {
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) {
    const match = cookie.match(/^([^=]+)=([^;]*)/);
    if (match) cookieJar.set(match[1], match[2]);
  }
}

async function postJsonWithCookie(
  url: string,
  body: unknown
): Promise<{ status: number; json: unknown; headers: Headers }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const session = cookieJar.get("ecet_session");
  if (session) headers.cookie = `ecet_session=${session}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  setCookieFromResponse(res);
  return { status: res.status, json: await res.json(), headers: res.headers };
}

async function getJsonWithCookie(
  url: string
): Promise<{ status: number; json: unknown; headers: Headers }> {
  const headers: Record<string, string> = {};
  const session = cookieJar.get("ecet_session");
  if (session) headers.cookie = `ecet_session=${session}`;
  const res = await fetch(url, { headers });
  setCookieFromResponse(res);
  return { status: res.status, json: await res.json(), headers: res.headers };
}

describe("JWT secret configuration", () => {
  it("rejects missing, weak and placeholder production secrets", () => {
    expect(() => validateJwtSecret("", true)).toThrow(/at least 32 bytes/);
    expect(() => validateJwtSecret("dev-secret-change-me-in-production", true)).toThrow(/at least 32 bytes/);
    expect(() => validateJwtSecret("short-secret", true)).toThrow(/at least 32 bytes/);
  });

  it("accepts a sufficiently strong production secret", () => {
    expect(() => validateJwtSecret("a".repeat(64), true)).not.toThrow();
  });

  it("does not require production-strength secrets in development or tests", () => {
    expect(() => validateJwtSecret("", false)).not.toThrow();
  });
});

describe("auth", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    // Seed a small bank so protected test routes have questions to serve.
    const report = await importFromJson(server.db, BANK);
    expect(report.added).toBe(2);
  });

  afterAll(async () => {
    await server.close();
  });

  it("registers a new user with an invitation", async () => {
    const invitationToken = await issueTestInvitation(server.db, "alice@example.com");
    const res = await postJsonWithCookie(`${server.baseUrl}/auth/register`, {
      email: "alice@example.com",
      password: "secret1234",
      invitationToken,
    });
    expect(res.status).toBe(201);
    expect((res.json as { ok: boolean }).ok).toBe(true);
  });

  it("rejects duplicate email", async () => {
    const invitationToken = await issueTestInvitation(server.db, "alice@example.com");
    const res = await postJsonWithCookie(`${server.baseUrl}/auth/register`, {
      email: "alice@example.com",
      password: "secret1234",
      invitationToken,
    });
    expect(res.status).toBe(409);
    expect((res.json as { error: string }).error).toContain("already exists");
  });

  it("rejects weak password", async () => {
    const invitationToken = await issueTestInvitation(server.db, "bob@example.com");
    const res = await postJsonWithCookie(`${server.baseUrl}/auth/register`, {
      email: "bob@example.com",
      password: "short",
      invitationToken,
    });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toBe("That request was invalid.");
  });

  it("logs in and sets a session cookie", async () => {
    const res = await postJsonWithCookie(`${server.baseUrl}/auth/login`, {
      email: "alice@example.com",
      password: "secret1234",
    });
    expect(res.status).toBe(200);
    expect((res.json as { ok: boolean; user: { id: number; email: string } }).ok).toBe(true);
    expect(cookieJar.get("ecet_session")).toBeTruthy();
  });

  it("rejects wrong password", async () => {
    const res = await postJsonWithCookie(`${server.baseUrl}/auth/login`, {
      email: "alice@example.com",
      password: "wrongpassword",
    });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toBe("Invalid email or password.");
  });

  it("throttles failures per account: one account's failures do not lock out another", async () => {
    const bobToken = await issueTestInvitation(server.db, "bob@example.com");
    await postJsonWithCookie(`${server.baseUrl}/auth/register`, {
      email: "bob@example.com",
      password: "secret1234",
      invitationToken: bobToken,
    });

    // 8 failed attempts against alice lock alice's account.
    for (let i = 0; i < 8; i += 1) {
      await postJsonWithCookie(`${server.baseUrl}/auth/login`, {
        email: "alice@example.com",
        password: "wrongpassword",
      });
    }
    const aliceBlocked = await postJsonWithCookie(`${server.baseUrl}/auth/login`, {
      email: "alice@example.com",
      password: "wrongpassword",
    });
    expect(aliceBlocked.status).toBe(429);
    expect((aliceBlocked.json as { error: string }).error).toContain("Too many failed sign-in attempts");

    // bob, a different account, can still sign in (not locked out by alice).
    const bobLogin = await postJsonWithCookie(`${server.baseUrl}/auth/login`, {
      email: "bob@example.com",
      password: "secret1234",
    });
    expect(bobLogin.status).toBe(200);
    expect((bobLogin.json as { ok: boolean }).ok).toBe(true);
  });

  it("requires auth for protected test routes (403 without cookie)", async () => {
    // Clear cookie to simulate signed-out client
    cookieJar.delete("ecet_session");
    const res = await postJson(`${server.baseUrl}/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 2,
    });
    expect(res.status).toBe(403);
    cookieJar.set("ecet_session", ""); // restore nothing; login again below
  });

  it("allows protected test routes with a valid session", async () => {
    await postJsonWithCookie(`${server.baseUrl}/auth/login`, {
      email: "alice@example.com",
      password: "secret1234",
    });
    const res = await postJsonWithCookie(`${server.baseUrl}/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    });
    expect(res.status).toBe(201);
  });

  it("/me returns the signed-in user", async () => {
    const res = await getJsonWithCookie(`${server.baseUrl}/auth/me`);
    expect(res.status).toBe(200);
    expect((res.json as { ok: boolean; user: { email: string } }).user.email).toBe(
      "alice@example.com"
    );
  });

  it("logs out, clears the cookie, and revokes the previously issued JWT", async () => {
    const oldToken = cookieJar.get("ecet_session");
    expect(oldToken).toBeTruthy();
    const res = await postJsonWithCookie(`${server.baseUrl}/auth/logout`, {});
    expect(res.status).toBe(200);
    const cleared = res.headers.get("set-cookie") ?? "";
    expect(cleared).toContain("Max-Age=0");
    cookieJar.delete("ecet_session");

    const replay = await fetch(`${server.baseUrl}/tests`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `ecet_session=${oldToken}` },
      body: JSON.stringify({ mode: "practice", subject: "Maths", count: 1 }),
    });
    expect(replay.status).toBe(403);
    const me = await getJsonWithCookie(`${server.baseUrl}/auth/me`);
    expect(me.status).toBe(403);
  });
});

describe("auth — bearer token (native/mobile clients)", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const report = await importFromJson(server.db, BANK);
    expect(report.added).toBe(2);
  });

  afterAll(async () => {
    await server.close();
  });

  async function signInForToken(email: string, password: string): Promise<string> {
    const res = await fetch(`${server.baseUrl}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; tokenType: string; expiresIn: number };
    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBeGreaterThan(0);
    return body.token;
  }

  it("/auth/token returns a JWT without setting a cookie", async () => {
    const invitationToken = await issueTestInvitation(server.db, "mobile@example.com");
    await postJson(`${server.baseUrl}/auth/register`, {
      email: "mobile@example.com",
      password: "secret1234",
      invitationToken,
    });
    const res = await fetch(`${server.baseUrl}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "mobile@example.com", password: "secret1234" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { email: string } };
    expect(body.token.split(".")).toHaveLength(3);
    expect(body.user.email).toBe("mobile@example.com");
    // A bearer client must not be handed a cookie it cannot use.
    expect(res.headers.getSetCookie?.() ?? []).toHaveLength(0);
  });

  it("rejects a wrong password on /auth/token", async () => {
    const res = await fetch(`${server.baseUrl}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "mobile@example.com", password: "nope-nope-nope" }),
    });
    expect(res.status).toBe(400);
  });

  it("authorizes protected routes with a bearer token and no cookie", async () => {
    const token = await signInForToken("mobile@example.com", "secret1234");
    const res = await fetch(`${server.baseUrl}/tests`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "practice", subject: "Maths", count: 1 }),
    });
    expect(res.status).toBe(201);
  });

  it("revokes a bearer token when its owner signs out", async () => {
    const token = await signInForToken("mobile@example.com", "secret1234");
    const logout = await fetch(`${server.baseUrl}/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.status).toBe(200);
    const replay = await fetch(`${server.baseUrl}/tests`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "practice", subject: "Maths", count: 1 }),
    });
    expect(replay.status).toBe(403);
  });

  it("rejects a missing bearer token on protected routes", async () => {
    const res = await fetch(`${server.baseUrl}/tests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "practice", subject: "Maths", count: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a garbage bearer token", async () => {
    const res = await fetch(`${server.baseUrl}/tests`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer not-a-real-token" },
      body: JSON.stringify({ mode: "practice", subject: "Maths", count: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("/auth/me works with a bearer token", async () => {
    const token = await signInForToken("mobile@example.com", "secret1234");
    const res = await fetch(`${server.baseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe("mobile@example.com");
  });

  it("bearer token and cookie sessions reach the same account", async () => {
    const token = await signInForToken("mobile@example.com", "secret1234");
    const withToken = await fetch(`${server.baseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const tokenBody = (await withToken.json()) as { user: { id: number } };

    const login = await fetch(`${server.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "mobile@example.com", password: "secret1234" }),
    });
    const cookie = sessionCookie(login);
    const withCookie = await fetch(`${server.baseUrl}/auth/me`, { headers: { cookie } });
    const cookieBody = (await withCookie.json()) as { user: { id: number } };

    expect(tokenBody.user.id).toBe(cookieBody.user.id);
  });

  it("throttles repeated failed sign-in attempts across cookie and bearer endpoints", async () => {
    const email = "rate-limit-probe@example.com";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const endpoint = attempt < 4 ? "/auth/login" : "/auth/token";
      const response = await fetch(`${server.baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "wrong-password" }),
      });
      expect(response.status).toBe(attempt === 7 ? 429 : 400);
    }
    const blocked = await fetch(`${server.baseUrl}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery" }),
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
