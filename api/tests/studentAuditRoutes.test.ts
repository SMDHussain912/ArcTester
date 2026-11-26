import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { getJson, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let adminCookie = "";
let adminId = 0;
let studentId = 0;

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
    const admin = await signUp(server.baseUrl, "audit-admin@example.test");
    adminCookie = admin.cookie;
    adminId = admin.userId;
    await server.db.user.update({ where: { id: adminId }, data: { role: "ADMIN" } });
    const student = await signUp(server.baseUrl, "audit-student@example.test");
    studentId = student.userId;
    await server.db.user.update({ where: { id: studentId }, data: { fullName: "Audit Student", collegeCode: "901", branchCode: "CM" } });
  });
  afterAll(async () => { await server.close(); });

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

  it("rejects student access and invalid date ranges", async () => {
    const student = await signUp(server.baseUrl, "audit-denied-student@example.test");
    const denied = await getJson(server.baseUrl + "/admin/students/" + studentId + "/audit", student.cookie);
    expect(denied.status).toBe(403);
    const invalid = await getJson(server.baseUrl + "/admin/students/" + studentId + "/audit?from=2026-12-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z", adminCookie);
    expect(invalid.status).toBe(400);
  });
});
