import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth.js";
import { buildApp } from "../src/index.js";
import { getJson, postJson, signIn, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let adminCookie = "";
let firstStudentCookie = "";
let secondStudentCookie = "";
let firstStudentEmail = "";

describe("invitation and device administration routes", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const admin = await server.db.user.create({
      data: { email: "auth-route-admin@arctester.test", passwordHash: hashPassword("auth-route-admin-password"), role: "ADMIN" },
    });
    const firstStudent = await server.db.user.create({
      data: { email: "auth-route-first@arctester.test", passwordHash: hashPassword("auth-route-student-password"), role: "STUDENT" },
    });
    const secondStudent = await server.db.user.create({
      data: { email: "auth-route-second@arctester.test", passwordHash: hashPassword("auth-route-student-password"), role: "STUDENT" },
    });
    firstStudentEmail = firstStudent.email;
    adminCookie = (await signIn(server.baseUrl, admin.email, "auth-route-admin-password")).cookie;
    firstStudentCookie = (await signIn(server.baseUrl, firstStudent.email, "auth-route-student-password")).cookie;
    secondStudentCookie = (await signIn(server.baseUrl, secondStudent.email, "auth-route-student-password")).cookie;
  });

  afterAll(async () => {
    await server.close();
  });

  it("creates, lists and revokes invitations without exposing stored token hashes", async () => {
    const created = await postJson(`${server.baseUrl}/auth/invitations`, { email: "invited-route-user@arctester.test" }, adminCookie);
    expect(created.status).toBe(201);
    const invitation = (created.json as { invitation: { id: string; email: string; token: string; expiresAt: string } }).invitation;
    expect(invitation.email).toBe("invited-route-user@arctester.test");
    expect(invitation.token).toHaveLength(43);

    const stored = await server.db.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
      select: { tokenHash: true, usedAt: true, revokedAt: true },
    });
    expect(stored.tokenHash).not.toBe(invitation.token);
    expect(stored.usedAt).toBeNull();
    expect(stored.revokedAt).toBeNull();

    const list = await getJson(`${server.baseUrl}/auth/invitations`, adminCookie);
    expect(list.status).toBe(200);
    const listed = (list.json as { invitations: Array<{ id: string; status: string; token?: string; tokenHash?: string }> }).invitations
      .find((item) => item.id === invitation.id);
    expect(listed).toMatchObject({ id: invitation.id, status: "PENDING" });
    expect(listed).not.toHaveProperty("token");
    expect(listed).not.toHaveProperty("tokenHash");

    expect((await getJson(`${server.baseUrl}/auth/invitations`, firstStudentCookie)).status).toBe(403);
    expect((await postJson(`${server.baseUrl}/auth/invitations`, { email: "student-cannot-invite@arctester.test" }, firstStudentCookie)).status).toBe(403);
    expect((await postJson(`${server.baseUrl}/auth/invitations/${invitation.id}/revoke`, {}, firstStudentCookie)).status).toBe(403);

    const revoked = await postJson(`${server.baseUrl}/auth/invitations/${invitation.id}/revoke`, {}, adminCookie);
    expect(revoked.status).toBe(200);
    const afterRevoke = await getJson(`${server.baseUrl}/auth/invitations`, adminCookie);
    expect((afterRevoke.json as { invitations: Array<{ id: string; status: string }> }).invitations)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: invitation.id, status: "REVOKED" })]));
    expect((await postJson(`${server.baseUrl}/auth/invitations/${invitation.id}/revoke`, {}, adminCookie)).status).toBe(404);

    expect((await postJson(`${server.baseUrl}/auth/invitations`, { email: firstStudentEmail }, adminCookie)).status).toBe(409);
  });

  it("registers devices idempotently and isolates list/revoke operations by account", async () => {
    const fingerprint = "auth-route-device-fingerprint-001";
    const registered = await postJson(`${server.baseUrl}/auth/devices/register`, {
      deviceName: "Arc Android",
      platform: "android",
      fingerprint,
    }, firstStudentCookie);
    expect(registered.status).toBe(200);
    const device = (registered.json as { device: { id: string; deviceName: string; platform: string } }).device;
    expect(device).toMatchObject({ deviceName: "Arc Android", platform: "android" });

    const repeated = await postJson(`${server.baseUrl}/auth/devices/register`, {
      deviceName: "Arc Android Updated",
      platform: "android",
      fingerprint,
    }, firstStudentCookie);
    expect(repeated.status).toBe(200);
    expect((repeated.json as { device: { id: string; deviceName: string } }).device)
      .toMatchObject({ id: device.id, deviceName: "Arc Android Updated" });
    expect(await server.db.device.count({ where: { userId: (await server.db.user.findUniqueOrThrow({ where: { email: firstStudentEmail } })).id } })).toBe(1);

    const firstDevices = await getJson(`${server.baseUrl}/auth/devices`, firstStudentCookie);
    expect(firstDevices.status).toBe(200);
    expect((firstDevices.json as { devices: Array<{ id: string }> }).devices).toEqual([{ id: device.id, deviceName: "Arc Android Updated", platform: "android", createdAt: expect.any(String), lastSeenAt: expect.any(String) }]);
    const secondDevices = await getJson(`${server.baseUrl}/auth/devices`, secondStudentCookie);
    expect(secondDevices.status).toBe(200);
    expect((secondDevices.json as { devices: unknown[] }).devices).toEqual([]);

    const otherAccountRevoke = await fetch(`${server.baseUrl}/auth/devices/${device.id}`, {
      method: "DELETE",
      headers: { cookie: secondStudentCookie },
    });
    expect(otherAccountRevoke.status).toBe(404);

    const revoked = await fetch(`${server.baseUrl}/auth/devices/${device.id}`, {
      method: "DELETE",
      headers: { cookie: firstStudentCookie },
    });
    expect(revoked.status).toBe(200);
    expect((await getJson(`${server.baseUrl}/auth/devices`, firstStudentCookie)).json).toMatchObject({ devices: [] });
    const repeatedRevoke = await fetch(`${server.baseUrl}/auth/devices/${device.id}`, {
      method: "DELETE",
      headers: { cookie: firstStudentCookie },
    });
    expect(repeatedRevoke.status).toBe(404);
  });
});
