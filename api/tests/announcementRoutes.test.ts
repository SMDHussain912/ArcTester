import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth.js";
import { buildApp } from "../src/index.js";
import {
  getJson,
  postJson,
  signIn,
  startTestServer,
  type TestServer,
} from "./server.js";

let server: TestServer;

describe("announcement API", () => {
  let adminCookie = "";
  let studentCookie = "";

  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const admin = await server.db.user.create({
      data: {
        email: "announcement-admin@example.test",
        passwordHash: hashPassword("correct-horse-battery"),
        role: "ADMIN",
      },
    });
    const student = await server.db.user.create({
      data: {
        email: "announcement-student@example.test",
        passwordHash: hashPassword("correct-horse-battery"),
        role: "STUDENT",
      },
    });
    expect(admin.id).toBeGreaterThan(0);
    expect(student.id).toBeGreaterThan(0);
    adminCookie = (await signIn(server.baseUrl, admin.email)).cookie;
    studentCookie = (await signIn(server.baseUrl, student.email)).cookie;
  });

  afterAll(async () => {
    await server.close();
  });

  it("publishes, lists, acknowledges, and deletes announcements", async () => {
    const created = await postJson(
      `${server.baseUrl}/admin/announcements`,
      {
        title: "ECET mock exam schedule",
        message: "The mock test begins tomorrow.",
        expiresAt: null,
      },
      adminCookie,
    );
    expect(created.status).toBe(201);
    const announcementId = (created.json as { announcement: { id: string } }).announcement.id;
    expect(announcementId).toBeTruthy();

    const adminList = await getJson(`${server.baseUrl}/admin/announcements`, adminCookie);
    expect(adminList.status).toBe(200);
    expect((adminList.json as { announcements: { id: string; _count: { views: number } }[] }).announcements)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId, _count: { views: 0 } })]));

    const activeBeforeRead = await getJson(`${server.baseUrl}/announcements/active`, studentCookie);
    expect(activeBeforeRead.status).toBe(200);
    expect((activeBeforeRead.json as { announcements: { id: string; publishedAt: string }[] }).announcements)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId })]));

    const historyBeforeRead = await getJson(`${server.baseUrl}/announcements`, studentCookie);
    expect((historyBeforeRead.json as { announcements: { id: string; seenAt: string | null }[] }).announcements)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId, seenAt: null })]));

    const acknowledged = await postJson(
      `${server.baseUrl}/announcements/${announcementId}/read`,
      {},
      studentCookie,
    );
    expect(acknowledged.status).toBe(200);
    expect((acknowledged.json as { seenAt: string }).seenAt).toBeTruthy();

    const activeAfterRead = await getJson(`${server.baseUrl}/announcements/active`, studentCookie);
    expect((activeAfterRead.json as { announcements: { id: string }[] }).announcements)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId })]));

    const historyAfterRead = await getJson(`${server.baseUrl}/announcements`, studentCookie);
    expect((historyAfterRead.json as { announcements: { id: string; seenAt: string | null }[] }).announcements)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId, seenAt: expect.any(String) })]));

    const deleted = await fetch(`${server.baseUrl}/admin/announcements/${announcementId}`, {
      method: "DELETE",
      headers: { cookie: adminCookie },
    });
    expect(deleted.status).toBe(200);
  });
});
