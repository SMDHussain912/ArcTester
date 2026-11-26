import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pruneAuditEvents, writeAuditEvent } from "../src/audit.js";
import { buildApp } from "../src/index.js";
import { getJson, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let adminCookie = "";
let adminId = 0;
let studentId = 0;
let expiredEventId = "";
let expiredLoginEventId = 0;
let expiredSessionId = "";

async function patch(path: string, body: unknown) {
  const response = await fetch(server.baseUrl + path, { method: "PATCH", headers: { cookie: adminCookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}
async function waitForAudit(action: string, subjectUserId: number) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const event = await server.db.auditEvent.findFirst({ where: { action, subjectUserId }, orderBy: { createdAt: "desc" } });
    if (event) return event;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Expected audit event was not persisted.");
}

describe("student audit timeline and exports", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const oldEvent = await writeAuditEvent(server.db, { actorId: null, actorRole: "SYSTEM", subjectUserId: null, action: "RETENTION_TEST_EVENT", outcome: "SUCCESS", resourceType: "SYSTEM", resourceId: "", requestId: randomUUID(), route: "/test/retention", collegeCode: "", branchCode: "", contextJson: "{}", createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) });
    expiredEventId = oldEvent.id;
    const admin = await signUp(server.baseUrl, "audit-admin@example.test");
    adminCookie = admin.cookie;
    adminId = admin.userId;
    await server.db.user.update({ where: { id: adminId }, data: { role: "ADMIN" } });
    const student = await signUp(server.baseUrl, "audit-student@example.test");
    studentId = student.userId;
    await server.db.user.update({ where: { id: studentId }, data: { fullName: "Audit Student", collegeCode: "901", branchCode: "CM" } });
    const oldLoginDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const oldLogin = await server.db.loginEvent.create({ data: {
      userId: studentId, email: "audit-student@example.test", result: "failed", method: "password",
      ipAddress: "192.0.2.0", userAgent: "retention-test-agent", createdAt: oldLoginDate,
    } });
    expiredLoginEventId = oldLogin.id;
    const oldSessionDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const oldSession = await server.db.authSession.create({ data: {
      userId: studentId, deviceName: "Expired fixture", platform: "web", userAgent: "retention-test-agent",
      ipAddress: "192.0.2.0", createdAt: oldSessionDate, lastSeenAt: oldSessionDate,
      expiresAt: oldSessionDate, revokedAt: oldSessionDate,
    } });
    expiredSessionId = oldSession.id;
  });
  afterAll(async () => { await server.close(); });

  it("records successful login with server-resolved account identity and no credentials", async () => {
    const event = await waitForAudit("LOGIN", studentId);
    expect(event.actorId).toBe(studentId);
    expect(event.subjectUserId).toBe(studentId);
    expect(event.actorRole).toBe("STUDENT");
    expect(event.contextJson).not.toContain("correct-horse-battery");
    expect(event.contextJson).not.toContain("token");
  });

  it("prunes expired rows into a checkpoint and preserves the retained chain", async () => {
    const result = await pruneAuditEvents(server.db, 30);
    expect(result.deletedCount).toBe(1);
    expect(result.loginEventsDeletedCount).toBe(1);
    expect(result.authSessionsDeletedCount).toBe(1);
    expect(await server.db.auditEvent.findUnique({ where: { id: expiredEventId } })).toBeNull();
    expect(await server.db.loginEvent.findUnique({ where: { id: expiredLoginEventId } })).toBeNull();
    expect(await server.db.authSession.findUnique({ where: { id: expiredSessionId } })).toBeNull();
    expect(await server.db.auditCheckpoint.count()).toBe(1);
    const verified = await getJson(server.baseUrl + "/admin/audit/integrity", adminCookie);
    expect(verified.status).toBe(200);
    expect(verified.json).toMatchObject({ ok: true, valid: true, checkedCheckpoints: 1 });
  });

  it("writes a server-derived profile event and returns a filtered student timeline", async () => {
    const response = await patch("/admin/students/" + studentId, { fullName: "Changed Audit Student" });
    expect(response.status).toBe(200);
    const event = await waitForAudit("STUDENT_PROFILE_CHANGE", studentId);
    expect(event.actorId).toBe(adminId);
    expect(event.actorRole).toBe("ADMIN");
    expect(event.collegeCode).toBe("901");
    expect(event.branchCode).toBe("CM");
    expect(event.outcome).toBe("SUCCESS");
    expect(event.requestId).toBeTruthy();
    expect(event.route).toBe("/admin/students/:id");
    expect(event.contextJson).not.toContain("Changed Audit Student");
    expect(event.contextJson).not.toContain("password");

    const timeline = await getJson(server.baseUrl + "/admin/students/" + studentId + "/audit?action=STUDENT_PROFILE_CHANGE&outcome=SUCCESS", adminCookie);
    expect(timeline.status).toBe(200);
    expect(timeline.json).toMatchObject({ ok: true, total: 1 });
    expect((timeline.json as { events: Array<{ action: string; actorId: number }> }).events[0]).toMatchObject({ action: "STUDENT_PROFILE_CHANGE", actorId: adminId });
  });

  it("exports filtered CSV and JSON and records each export", async () => {
    const csvResponse = await fetch(server.baseUrl + "/admin/students/" + studentId + "/audit/export?format=csv&action=STUDENT_PROFILE_CHANGE", { headers: { cookie: adminCookie } });
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get("content-type")).toContain("text/csv");
    const csv = await csvResponse.text();
    expect(csv).toContain("STUDENT_PROFILE_CHANGE");
    expect(csv).toContain("requestId");

    const jsonResponse = await fetch(server.baseUrl + "/admin/students/" + studentId + "/audit/export?format=json&action=STUDENT_PROFILE_CHANGE", { headers: { cookie: adminCookie } });
    expect(jsonResponse.status).toBe(200);
    const json = await jsonResponse.json() as { count: number; events: Array<{ action: string }> };
    expect(json.count).toBe(1);
    expect(json.events[0].action).toBe("STUDENT_PROFILE_CHANGE");

    const exports = await server.db.auditEvent.findMany({ where: { subjectUserId: studentId, action: "AUDIT_EXPORT" } });
    expect(exports).toHaveLength(2);
    expect(exports.every(event => event.actorId === adminId && event.outcome === "SUCCESS")).toBe(true);
  });

  it("verifies the event hash chain and detects a modified audit record", async () => {
    const valid = await getJson(server.baseUrl + "/admin/audit/integrity", adminCookie);
    expect(valid.status).toBe(200);
    expect(valid.json.valid, JSON.stringify(valid.json)).toBe(true);
    const first = await server.db.auditEvent.findFirst({ orderBy: { createdAt: "asc" } });
    expect(first).toBeTruthy();
    await server.db.auditEvent.update({ where: { id: first!.id }, data: { contextJson: '{"modified":true}' } });
    const invalid = await getJson(server.baseUrl + "/admin/audit/integrity", adminCookie);
    expect(invalid.status).toBe(200);
    expect(invalid.json).toMatchObject({ ok: true, valid: false, firstInvalidEventId: first!.id });
  });

  it("rejects student access and invalid date ranges", async () => {
    const student = await signUp(server.baseUrl, "audit-denied-student@example.test");
    const denied = await getJson(server.baseUrl + "/admin/students/" + studentId + "/audit", student.cookie);
    expect(denied.status).toBe(403);
    const invalid = await getJson(server.baseUrl + "/admin/students/" + studentId + "/audit?from=2026-12-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z", adminCookie);
    expect(invalid.status).toBe(400);
  });
});
