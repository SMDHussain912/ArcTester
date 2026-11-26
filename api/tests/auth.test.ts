import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import {
  signJwt,
  validateJwtSecret,
  verifyJwt,
} from "../src/auth.js";
import { importFromJson } from "../src/importService.js";
import { totpAt } from "../src/totp.js";
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

const STUDENT_PROFILE = {
  fullName: "Test Student",
  collegeName: "Test Polytechnic",
  collegeCode: "999",
  registrationNumber: "24999-CM-053",
  postalPin: "",
  branchName: "Computer Engineering (CME)",
  branchCode: "CM",
};

function fixtureRegistrationNumber(email: string): string {
  if (email === "alice@example.com") return "24999-CM-053";
  let hash = 0;
  for (const character of email.trim().toLowerCase()) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return "24999-CM-" + String(hash % 1000).padStart(3, "0");
}

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
  let payload = body;
  if (url.endsWith("/auth/register") && body && typeof body === "object" && !Array.isArray(body)) {
    const input = body as Record<string, unknown>;
    if (input.registrationNumber === "24999-CM-053" && typeof input.email === "string") payload = { ...input, registrationNumber: fixtureRegistrationNumber(input.email) };
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
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


  it("requires the supported HS256 header and a valid expiry claim", () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const signed = (header: unknown, payload: unknown) => {
      const message = encode(header) + "." + encode(payload);
      const signature = createHmac("sha256", "dev-secret-change-me-in-production").update(message).digest("base64url");
      return message + "." + signature;
    };
    const now = Math.floor(Date.now() / 1000);
    expect(() => verifyJwt(signJwt({ sub: "1" }, -1))).toThrow(/expired token/i);
    expect(() => verifyJwt(signed({ alg: "none", typ: "JWT" }, { sub: "1", exp: now + 60 }))).toThrow(/unsupported jwt header/i);
    expect(() => verifyJwt(signed({ alg: "HS256", typ: "JWT" }, { sub: "1" }))).toThrow(/missing or invalid token expiry/i);
    expect(() => verifyJwt(signed({ alg: "HS256", typ: "JWT" }, { sub: "1", exp: now + 60 }))).not.toThrow();
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
    await server.db.question.updateMany({ data: { reviewStatus: "APPROVED" } });
    await server.db.question.updateMany({ data: { reviewStatus: "APPROVED" } });
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it("registers a student without an invitation and leaves approval pending", async () => {
    const res = await postJsonWithCookie(`${server.baseUrl}/auth/register`, {
      ...STUDENT_PROFILE,
      email: "alice@example.com",
      password: "secret1234",
    });
    expect(res.status).toBe(201);
    expect((res.json as { ok: boolean; user: { accessStatus: string } }).ok).toBe(true);
    expect((res.json as { user: { accessStatus: string } }).user.accessStatus).toBe("PENDING");
    expect((res.json as { user: { registrationNumber: string } }).user.registrationNumber).toBe("24999-CM-053");
  });

  it("rejects a registration number with an unsupported branch code", async () => {
    const res = await postJsonWithCookie(`${server.baseUrl}/auth/register`, { ...STUDENT_PROFILE, registrationNumber: "24999-XX-053", email: "wrong-branch@example.com", password: "secret1234" });
    expect(res.status).toBe(400);
  });

  it("requires academic identity fields for new student registration", async () => {
    const res = await postJsonWithCookie(`${server.baseUrl}/auth/register`, {
      email: "missing-profile@example.com",
      password: "secret1234",
    });
    expect(res.status).toBe(400);
  });

  it("updates and returns the student's academic profile", async () => {
    const email = "profile-update@example.com";
    await postJsonWithCookie(`${server.baseUrl}/auth/register`, {
      ...STUDENT_PROFILE,
      email,
      password: "profile-password-123",
    });
    await server.db.user.update({ where: { email }, data: { accessStatus: "APPROVED" } });
    const login = await postJsonWithCookie(`${server.baseUrl}/auth/login`, { email, password: "profile-password-123" });
    expect(login.status).toBe(200);
    const updatedProfile = {
      fullName: "Updated Test Student",
      collegeName: "New Polytechnic",
      collegeCode: "321",
      postalPin: "522001",
      branchName: "Diploma in Electrical and Electronics Engineering",
      branchCode: "DEEE",
    };
    const patch = await fetch(`${server.baseUrl}/auth/profile`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: `ecet_session=${cookieJar.get("ecet_session")}` },
      body: JSON.stringify(updatedProfile),
    });
    expect(patch.status).toBe(200);
    const me = await getJsonWithCookie(`${server.baseUrl}/auth/me`);
    expect((me.json as { user: typeof updatedProfile }).user).toMatchObject(updatedProfile);
  });

  it("rejects duplicate email", async () => {
    const invitationToken = await issueTestInvitation(server.db, "alice@example.com");
    const res = await postJsonWithCookie(`${server.baseUrl}/auth/register`, {
      ...STUDENT_PROFILE,
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
      ...STUDENT_PROFILE,
      email: "bob@example.com",
      password: "short",
      invitationToken,
    });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toBe("That request was invalid.");
  });

  it("blocks pending students until an administrator approves them", async () => {
    const pending = await postJsonWithCookie(`${server.baseUrl}/auth/login`, { email: "alice@example.com", password: "secret1234" });
    expect(pending.status).toBe(403);
    expect((pending.json as { error: string }).error).toContain("waiting for administrator approval");
    await server.db.user.update({ where: { email: "alice@example.com" }, data: { accessStatus: "APPROVED" } });
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
      ...STUDENT_PROFILE,
      email: "bob@example.com",
      password: "secret1234",
      invitationToken: bobToken,
    });
    await server.db.user.update({ where: { email: "bob@example.com" }, data: { accessStatus: "APPROVED" } });

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
      email: "bob@example.com",
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
      "bob@example.com"
    );
  });

  it("changes password, rotates the current session and revokes the previous session", async () => {
    const email = "password-change@example.com";
    await postJsonWithCookie(`${server.baseUrl}/auth/register`, { ...STUDENT_PROFILE, email, password: "old-password-123" });
    await server.db.user.update({ where: { email }, data: { accessStatus: "APPROVED" } });
    const login = await postJsonWithCookie(`${server.baseUrl}/auth/login`, { email, password: "old-password-123" });
    expect(login.status).toBe(200);
    const oldToken = cookieJar.get("ecet_session");
    expect(oldToken).toBeTruthy();

    const changed = await postJsonWithCookie(`${server.baseUrl}/auth/change-password`, {
      currentPassword: "old-password-123",
      newPassword: "new-password-12345",
    });
    expect(changed.status).toBe(200);
    expect((changed.json as { ok: boolean }).ok).toBe(true);
    const rotatedToken = cookieJar.get("ecet_session");
    expect(rotatedToken).toBeTruthy();
    expect(rotatedToken).not.toBe(oldToken);

    const oldSession = await fetch(`${server.baseUrl}/auth/me`, {
      headers: { cookie: `ecet_session=${oldToken}` },
    });
    expect(oldSession.status).toBe(403);
    const newSession = await getJsonWithCookie(`${server.baseUrl}/auth/me`);
    expect(newSession.status).toBe(200);

    const newLogin = await postJsonWithCookie(`${server.baseUrl}/auth/login`, { email, password: "new-password-12345" });
    expect(newLogin.status).toBe(200);
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
      ...STUDENT_PROFILE,
      email: "mobile@example.com",
      password: "secret1234",
      invitationToken,
    });
    await server.db.user.update({ where: { email: "mobile@example.com" }, data: { accessStatus: "APPROVED" } });
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
    const res = await fetch(`${server.baseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { user: { email: string } };
    expect(body.user.email).toBe("mobile@example.com");
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

  it("tracks active sessions and previous login activity", async () => {
    const email = "security-sessions@example.com";
    await postJsonWithCookie(`${server.baseUrl}/auth/register`, { ...STUDENT_PROFILE, email, password: "session-test-password" });
    await server.db.user.update({ where: { email }, data: { accessStatus: "APPROVED" } });
    cookieJar.delete("ecet_session");
    const login = await postJsonWithCookie(`${server.baseUrl}/auth/login`, { email, password: "session-test-password" });
    expect(login.status).toBe(200);
    const sessions = await getJsonWithCookie(`${server.baseUrl}/auth/sessions`);
    const sessionRows = (sessions.json as { sessions: { id: string; current: boolean; loginMethod: string }[] }).sessions;
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]?.current).toBe(true);
    expect(sessionRows[0]?.loginMethod).toBe("password");
    const history = await getJsonWithCookie(`${server.baseUrl}/auth/login-history`);
    expect((history.json as { events: { result: string }[] }).events[0]?.result).toBe("success");
    const revoked = await fetch(`${server.baseUrl}/auth/sessions/${sessionRows[0]!.id}`, { method: "DELETE", headers: { cookie: `ecet_session=${cookieJar.get("ecet_session")}` } });
    expect(revoked.status).toBe(200);
    expect((await getJsonWithCookie(`${server.baseUrl}/auth/sessions`)).status).toBe(403);
  });

  it("requires TOTP after password sign-in and accepts a one-time recovery code", async () => {
    process.env.TOTP_ENCRYPTION_KEY = "ab".repeat(32);
    const email = "security-totp@example.com";
    await postJsonWithCookie(`${server.baseUrl}/auth/register`, { ...STUDENT_PROFILE, email, password: "totp-test-password" });
    await server.db.user.update({ where: { email }, data: { accessStatus: "APPROVED" } });
    cookieJar.delete("ecet_session");
    await postJsonWithCookie(`${server.baseUrl}/auth/login`, { email, password: "totp-test-password" });
    const setup = await postJsonWithCookie(`${server.baseUrl}/auth/2fa/totp/setup`, {});
    expect(setup.status).toBe(200);
    const secret = (setup.json as { secret: string }).secret;
    const counter = Math.floor(Date.now() / 30_000);
    const enabled = await postJsonWithCookie(`${server.baseUrl}/auth/2fa/totp/verify-setup`, { code: totpAt(secret, counter) });
    expect(enabled.status).toBe(200);
    const recovery = (enabled.json as { recoveryCodes: string[] }).recoveryCodes[0]!;
    cookieJar.delete("ecet_session");
    const login = await postJsonWithCookie(`${server.baseUrl}/auth/login`, { email, password: "totp-test-password" });
    const challenge = (login.json as { twoFactorRequired: boolean; challengeId: string });
    expect(challenge.twoFactorRequired).toBe(true);
    const verified = await postJsonWithCookie(`${server.baseUrl}/auth/login/2fa`, { challengeId: challenge.challengeId, code: recovery });
    expect(verified.status).toBe(200);
    expect((verified.json as { user: { email: string } }).user.email).toBe(email);
  });
  it("lists and revokes a legacy session issued before session tracking", async () => {
    const user = await server.db.user.findUnique({ where: { email: "mobile@example.com" }, select: { id: true, email: true, sessionVersion: true } });
    expect(user).toBeTruthy();
    const legacyToken = signJwt({ sub: String(user!.id), email: user!.email, sv: user!.sessionVersion });
    cookieJar.set("ecet_session", legacyToken);
    const sessions = await getJsonWithCookie(`${server.baseUrl}/auth/sessions`);
    expect(sessions.status).toBe(200);
    const rows = (sessions.json as { sessions: { id: string; current: boolean; loginMethod: string }[] }).sessions;
    expect(rows.some(row => row.current && row.loginMethod === "legacy-session")).toBe(true);
    const legacy = rows.find(row => row.current)!;
    const revoke = await fetch(`${server.baseUrl}/auth/sessions/${legacy.id}`, { method: "DELETE", headers: { cookie: `ecet_session=${legacyToken}` } });
    expect(revoke.status).toBe(200);
    expect((await getJsonWithCookie(`${server.baseUrl}/auth/me`)).status).toBe(403);
  });

});
