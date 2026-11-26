import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { getJson, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let adminCookie = "";
let pendingStudentId = 0;
let secondPendingStudentId = 0;
let approvedStudentId = 0;

async function patch(path: string, body: unknown, cookie = adminCookie) {
  const response = await fetch(server.baseUrl + path, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}

describe("administrator student management", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const admin = await signUp(server.baseUrl, "student-admin-workspace@example.test");
    adminCookie = admin.cookie;
    await server.db.user.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });

    const pending = await signUp(server.baseUrl, "student-pending-one@example.test");
    pendingStudentId = pending.userId;
    await server.db.user.update({ where: { id: pendingStudentId }, data: { accessStatus: "PENDING" } });

    const second = await signUp(server.baseUrl, "student-pending-two@example.test");
    secondPendingStudentId = second.userId;
    await server.db.user.update({ where: { id: secondPendingStudentId }, data: { accessStatus: "PENDING" } });

    const approved = await signUp(server.baseUrl, "student-approved@example.test");
    approvedStudentId = approved.userId;
  });

  afterAll(async () => { await server.close(); });

  it("searches student profiles and returns status counts for the filtered view", async () => {
    const response = await getJson(server.baseUrl + "/admin/students?status=PENDING&limit=100", adminCookie);
    expect(response.status).toBe(200);
    const body = response.json as { students: Array<{ id: number; registrationNumber: string; accessStatus: string }>; statusCounts: Record<string, number> };
    expect(body.students.map((student) => student.id)).toEqual(expect.arrayContaining([pendingStudentId, secondPendingStudentId]));
    expect(body.statusCounts.PENDING).toBe(2);
    const search = await getJson(server.baseUrl + "/admin/students?q=student-approved&status=APPROVED", adminCookie);
    expect(search.status).toBe(200);
    expect((search.json as { students: Array<{ id: number }> }).students.map((student) => student.id)).toContain(approvedStudentId);
  });

  it("approves one student, bulk-approves pending accounts, and rejects duplicate IDs", async () => {
    const single = await patch("/admin/students/" + pendingStudentId + "/access", { accessStatus: "APPROVED" });
    expect(single.status).toBe(200);
    expect(single.json).toMatchObject({ ok: true, student: { id: pendingStudentId, accessStatus: "APPROVED" } });

    const bulk = await patch("/admin/students/access/bulk", { ids: [secondPendingStudentId] });
    expect(bulk.status).toBe(200);
    expect(bulk.json).toMatchObject({ ok: true, approvedCount: 1 });
    expect((await patch("/admin/students/access/bulk", { ids: [secondPendingStudentId, secondPendingStudentId] })).status).toBe(400);
  });

  it("updates academic profile fields and allows administrators to reset or reject access", async () => {
    const updated = await patch("/admin/students/" + approvedStudentId, {
      fullName: "Updated Student",
      registrationNumber: "24999-CM-901",
      collegeName: "Updated Polytechnic",
      collegeCode: "901",
      postalPin: "533001",
      branchName: "Computer Engineering",
      branchCode: "CM",
    });
    expect(updated.status).toBe(200);
    expect(updated.json).toMatchObject({ ok: true, student: { id: approvedStudentId, fullName: "Updated Student", registrationNumber: "24999-CM-901", collegeCode: "901" } });

    const rejected = await patch("/admin/students/" + approvedStudentId + "/access", { accessStatus: "REJECTED" });
    expect(rejected.status).toBe(200);
    expect(rejected.json).toMatchObject({ student: { accessStatus: "REJECTED" } });
    const reset = await patch("/admin/students/" + approvedStudentId + "/access", { accessStatus: "PENDING" });
    expect(reset.status).toBe(200);
    expect(reset.json).toMatchObject({ student: { accessStatus: "PENDING" } });
  });

  it("denies student accounts access to the administrator list", async () => {
    const student = await signUp(server.baseUrl, "student-no-admin-access@example.test");
    const response = await getJson(server.baseUrl + "/admin/students", student.cookie);
    expect(response.status).toBe(403);
  });
});
