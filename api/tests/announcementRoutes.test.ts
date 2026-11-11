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
  let secondStudentCookie = "";

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
    const secondStudent = await server.db.user.create({
      data: { email: "announcement-second-student@example.test", passwordHash: hashPassword("correct-horse-battery"), role: "STUDENT" },
    });
    secondStudentCookie = (await signIn(server.baseUrl, secondStudent.email)).cookie;
  });

  afterAll(async () => {
    await server.close();
  });

  it("rejects an already-expired announcement and hides notices after their expiry", async () => {
    const rejected = await postJson(
      `${server.baseUrl}/admin/announcements`,
      { title: "Expired notice", message: "This should not publish.", expiresAt: new Date(Date.now() - 60_000).toISOString() },
      adminCookie,
    );
    expect(rejected.status).toBe(400);

    const expired = await server.db.announcement.create({
      data: {
        title: "Expired announcement",
        message: "This notice is no longer active.",
        createdById: (await server.db.user.findUniqueOrThrow({ where: { email: "announcement-admin@example.test" } })).id,
        startsAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const active = await getJson(`${server.baseUrl}/announcements/active`, studentCookie);
    expect((active.json as { announcements: { id: string }[] }).announcements)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: expired.id })]));
    const inbox = await getJson(`${server.baseUrl}/announcements`, studentCookie);
    expect((inbox.json as { announcements: { id: string }[] }).announcements)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: expired.id })]));
  });

  it("schedules announcements and rejects expiry before the publish time", async () => {
    const startsAt = new Date(Date.now() + 60_000);
    const expiresAt = new Date(Date.now() + 120_000);
    const invalid = await postJson(
      `${server.baseUrl}/admin/announcements`,
      {
        title: "Invalid schedule",
        message: "Expiry cannot precede publication.",
        startsAt: startsAt.toISOString(),
        expiresAt: new Date(startsAt.getTime() - 1).toISOString(),
      },
      adminCookie,
    );
    expect(invalid.status).toBe(400);

    const alreadyExpired = await postJson(
      `${server.baseUrl}/admin/announcements`,
      {
        title: "Backdated expired notice",
        message: "A past publish time cannot make a past expiry valid.",
        startsAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
      adminCookie,
    );
    expect(alreadyExpired.status).toBe(400);

    const created = await postJson(
      `${server.baseUrl}/admin/announcements`,
      {
        title: "Scheduled notice",
        message: "This notice is not visible yet.",
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
      adminCookie,
    );
    expect(created.status).toBe(201);
    const announcementId = (created.json as { announcement: { id: string; startsAt: string } }).announcement.id;
    expect((created.json as { announcement: { startsAt: string } }).announcement.startsAt).toBe(startsAt.toISOString());

    const beforePublish = await getJson(`${server.baseUrl}/announcements/active`, studentCookie);
    expect((beforePublish.json as { announcements: { id: string }[] }).announcements)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId })]));

    await server.db.announcement.update({
      where: { id: announcementId },
      data: { startsAt: new Date(Date.now() - 1_000) },
    });
    const afterPublish = await getJson(`${server.baseUrl}/announcements/active`, studentCookie);
    expect((afterPublish.json as { announcements: { id: string }[] }).announcements)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId })]));
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
      `${server.baseUrl}/announcements/${announcementId}/acknowledge`,
      {},
      studentCookie,
    );
    expect(acknowledged.status).toBe(200);
    expect((acknowledged.json as { seenAt: string }).seenAt).toBeTruthy();
    const firstAcknowledgedAt = (acknowledged.json as { acknowledgedAt: string }).acknowledgedAt;
    expect(firstAcknowledgedAt).toBeTruthy();
    const repeatedAcknowledgement = await postJson(
      `${server.baseUrl}/announcements/${announcementId}/acknowledge`,
      {},
      studentCookie,
    );
    expect(repeatedAcknowledgement.status).toBe(200);
    expect((repeatedAcknowledgement.json as { acknowledgedAt: string }).acknowledgedAt).toBe(firstAcknowledgedAt);
    expect((await postJson(`${server.baseUrl}/announcements/${announcementId}/read`, {}, studentCookie)).status).toBe(200);

    const activeAfterRead = await getJson(`${server.baseUrl}/announcements/active`, studentCookie);
    expect((activeAfterRead.json as { announcements: { id: string }[] }).announcements)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId })]));

    const historyAfterRead = await getJson(`${server.baseUrl}/announcements`, studentCookie);
    expect((historyAfterRead.json as { announcements: { id: string; seenAt: string | null; acknowledgedAt: string | null }[] }).announcements)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId, seenAt: expect.any(String), acknowledgedAt: expect.any(String) })]));

    const secondStudentFeed = await getJson(`${server.baseUrl}/announcements/active`, secondStudentCookie);
    expect((secondStudentFeed.json as { announcements: { id: string }[] }).announcements)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId })]));
    const secondStudentHistory = await getJson(`${server.baseUrl}/announcements`, secondStudentCookie);
    expect((secondStudentHistory.json as { announcements: { id: string; acknowledgedAt: string | null }[] }).announcements)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: announcementId, acknowledgedAt: null })]));

    const deleted = await fetch(`${server.baseUrl}/admin/announcements/${announcementId}`, {
      method: "DELETE",
      headers: { cookie: adminCookie },
    });
    expect(deleted.status).toBe(200);
  });
});
