import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth.js";
import { buildApp } from "../src/index.js";
import { sessionCookie, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let adminCookie = "";
let studentCookie = "";
let invitationToken = "";
let invitationId = "";
let studentId = 0;

async function request(
  path: string,
  method: string,
  body?: unknown,
  cookie?: string
): Promise<{ status: number; json: Record<string, unknown>; headers: Headers }> {
  const response = await fetch(`${server.baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
  };
}

describe("identity foundation", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    await server.db.user.create({
      data: {
        email: "admin@arctester.test",
        passwordHash: hashPassword("admin-password-123"),
        role: "ADMIN",
      },
    });
    const login = await fetch(`${server.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@arctester.test", password: "admin-password-123" }),
    });
    adminCookie = sessionCookie(login);
  });

  afterAll(async () => {
    await server.close();
  });

  it("blocks registration without an invitation", async () => {
    const response = await request("/auth/register", "POST", {
      email: "student@arctester.test",
      password: "student-password-123",
    });
    expect(response.status).toBe(400);
  });

  it("requires an administrator to create invitations", async () => {
    const anonymous = await request("/auth/invitations", "POST", {
      email: "student@arctester.test",
    });
    expect(anonymous.status).toBe(403);
  });

  it("creates an email-bound invitation and stores only its hash", async () => {
    const response = await request(
      "/auth/invitations",
      "POST",
      { email: "student@arctester.test" },
      adminCookie
    );
    expect(response.status).toBe(201);
    const invitation = response.json.invitation as {
      id: string;
      email: string;
      token: string;
      expiresAt: string;
    };
    invitationId = invitation.id;
    invitationToken = invitation.token;
    expect(invitation.email).toBe("student@arctester.test");
    expect(invitation.token).toHaveLength(43);

    const stored = await server.db.invitation.findUniqueOrThrow({
      where: { id: invitationId },
    });
    expect(stored.tokenHash).not.toBe(invitationToken);
    expect(stored.tokenHash).toHaveLength(64);
  });

  it("binds an invitation to its email and permits only one registration", async () => {
    const mismatch = await request("/auth/register", "POST", {
      email: "someone-else@arctester.test",
      password: "student-password-123",
      invitationToken,
    });
    expect(mismatch.status).toBe(400);

    const registered = await request("/auth/register", "POST", {
      email: "student@arctester.test",
      password: "student-password-123",
      invitationToken,
    });
    expect(registered.status).toBe(201);
    const user = registered.json.user as { id: number; role: string };
    studentId = user.id;
    expect(user.role).toBe("STUDENT");

    const reused = await request("/auth/register", "POST", {
      email: "student@arctester.test",
      password: "another-password-123",
      invitationToken,
    });
    expect(reused.status).toBe(400);
  });

  it("does not allow a student to create invitations", async () => {
    const login = await fetch(`${server.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "student@arctester.test", password: "student-password-123" }),
    });
    studentCookie = sessionCookie(login);
    const response = await request(
      "/auth/invitations",
      "POST",
      { email: "another@arctester.test" },
      studentCookie
    );
    expect(response.status).toBe(403);
  });

  it("supports multiple devices and independent revocation", async () => {
    const first = await request(
      "/auth/devices/register",
      "POST",
      {
        deviceName: "Android phone",
        platform: "android",
        fingerprint: "android-device-fingerprint-001",
      },
      studentCookie
    );
    const second = await request(
      "/auth/devices/register",
      "POST",
      {
        deviceName: "Windows laptop",
        platform: "windows",
        fingerprint: "windows-device-fingerprint-002",
      },
      studentCookie
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const firstDevice = first.json.device as { id: string };
    const listed = await request("/auth/devices", "GET", undefined, studentCookie);
    expect((listed.json.devices as unknown[])).toHaveLength(2);

    const revoked = await request(
      `/auth/devices/${firstDevice.id}`,
      "DELETE",
      undefined,
      studentCookie
    );
    expect(revoked.status).toBe(200);

    const remaining = await request("/auth/devices", "GET", undefined, studentCookie);
    expect((remaining.json.devices as unknown[])).toHaveLength(1);

    const record = await server.db.device.findFirstOrThrow({
      where: { userId: studentId, id: firstDevice.id },
    });
    expect(record.revokedAt).toBeTruthy();
  });

  it("rejects revoking another user's device", async () => {
    const devices = await server.db.device.findMany({ where: { userId: studentId } });
    expect(devices).toHaveLength(2);
    const response = await request(
      `/auth/devices/${devices[1].id}`,
      "DELETE",
      undefined,
      adminCookie
    );
    // Admin does not own the student's device; device management is account-scoped.
    expect(response.status).toBe(404);
  });
});
