import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth.js";
import { buildApp } from "../src/index.js";
import { getJson, postJson, signIn, startTestServer, type TestServer } from "./server.js";

let server: TestServer;

describe("student notification API", () => {
  let firstCookie = "";
  let secondCookie = "";
  let firstUserId = 0;
  let adminCookie = "";

  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const first = await server.db.user.create({
      data: { email: "notification-first@example.test", passwordHash: hashPassword("correct-horse-battery"), role: "STUDENT" },
    });
    const second = await server.db.user.create({
      data: { email: "notification-second@example.test", passwordHash: hashPassword("correct-horse-battery"), role: "STUDENT" },
    });
    firstUserId = first.id;
    firstCookie = (await signIn(server.baseUrl, first.email)).cookie;
    secondCookie = (await signIn(server.baseUrl, second.email)).cookie;
    await server.db.user.create({
      data: { email: "notification-admin@example.test", passwordHash: hashPassword("correct-horse-battery"), role: "ADMIN" },
    });
    adminCookie = (await signIn(server.baseUrl, "notification-admin@example.test")).cookie;
  });

  afterAll(async () => {
    await server.close();
  });

  it("lists only the authenticated student's active notifications and acknowledges reads idempotently", async () => {
    const active = await server.db.studentNotification.create({
      data: {
        userId: firstUserId,
        kind: "STUDY_UPDATE",
        title: "New exam assigned",
        message: "A mock exam is ready.",
        href: "/assignments",
        dedupeKey: "notification-assignment-first",
      },
    });
    const expired = await server.db.studentNotification.create({
      data: {
        userId: firstUserId,
        kind: "STUDY_UPDATE",
        title: "Expired result notice",
        message: "This notification is expired.",
        href: "/assignments",
        dedupeKey: "notification-expired-first",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await server.db.studentNotification.create({
      data: {
        userId: (await server.db.user.findUniqueOrThrow({ where: { email: "notification-second@example.test" } })).id,
        kind: "STUDY_UPDATE",
        title: "Private result",
        message: "Only the second student can see this.",
        href: "/assignments",
        dedupeKey: "notification-private-second",
      },
    });

    const firstInbox = await getJson(`${server.baseUrl}/notifications`, firstCookie);
    expect(firstInbox.status).toBe(200);
    expect(firstInbox.json).toMatchObject({ unreadCount: 1 });
    expect((firstInbox.json as { notifications: { id: string }[] }).notifications.map((item) => item.id)).toEqual([active.id]);

    const secondInbox = await getJson(`${server.baseUrl}/notifications`, secondCookie);
    expect((secondInbox.json as { notifications: { title: string }[] }).notifications.map((item) => item.title)).toEqual(["Private result"]);

    const acknowledged = await postJson(`${server.baseUrl}/notifications/${active.id}/read`, {}, firstCookie);
    expect(acknowledged.status).toBe(200);
    expect(acknowledged.json).toMatchObject({ ok: true, alreadyRead: false });
    const repeated = await postJson(`${server.baseUrl}/notifications/${active.id}/read`, {}, firstCookie);
    expect(repeated.status).toBe(200);
    expect(repeated.json).toMatchObject({ ok: true, alreadyRead: true });

    const unread = await getJson(`${server.baseUrl}/notifications?unread=true`, firstCookie);
    expect((unread.json as { notifications: unknown[]; unreadCount: number })).toMatchObject({
      notifications: [],
      unreadCount: 0,
    });
    expect((await postJson(`${server.baseUrl}/notifications/${active.id}/read`, {}, secondCookie)).status).toBe(400);
    expect((await postJson(`${server.baseUrl}/notifications/${expired.id}/read`, {}, firstCookie)).status).toBe(400);
  });

  it("marks all active unread notifications as read without touching expired notices or other students", async () => {
    const activeOne = await server.db.studentNotification.create({
      data: {
        userId: firstUserId,
        kind: "STUDY_UPDATE",
        title: "Assignment one",
        message: "A new assignment is ready.",
        href: "/assignments",
        dedupeKey: "notification-read-all-active-one",
      },
    });
    const activeTwo = await server.db.studentNotification.create({
      data: {
        userId: firstUserId,
        kind: "STUDY_UPDATE",
        title: "Result ready",
        message: "Your result is ready.",
        href: "/assignments",
        dedupeKey: "notification-read-all-active-two",
      },
    });
    const expired = await server.db.studentNotification.create({
      data: {
        userId: firstUserId,
        kind: "STUDY_UPDATE",
        title: "Old result",
        message: "This notice has expired.",
        href: "/assignments",
        dedupeKey: "notification-read-all-expired",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await postJson(`${server.baseUrl}/notifications/read-all`, {}, firstCookie);
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ ok: true, updatedCount: 2 });

    const [savedOne, savedTwo, savedExpired] = await Promise.all([
      server.db.studentNotification.findUniqueOrThrow({ where: { id: activeOne.id } }),
      server.db.studentNotification.findUniqueOrThrow({ where: { id: activeTwo.id } }),
      server.db.studentNotification.findUniqueOrThrow({ where: { id: expired.id } }),
    ]);
    expect(savedOne.readAt).not.toBeNull();
    expect(savedTwo.readAt).not.toBeNull();
    expect(savedExpired.readAt).toBeNull();

    const repeated = await postJson(`${server.baseUrl}/notifications/read-all`, {}, firstCookie);
    expect(repeated.status).toBe(200);
    expect(repeated.json).toMatchObject({ ok: true, updatedCount: 0 });
  });
  it("returns default notification preferences and persists partial updates per student", async () => {
    const defaults = await getJson(`${server.baseUrl}/notifications/preferences`, firstCookie);
    expect(defaults.status).toBe(200);
    expect(defaults.json).toMatchObject({ preferences: { examAssignments: true, examResults: true } });
    const updated = await fetch(`${server.baseUrl}/notifications/preferences`, { method: "PATCH", headers: { "content-type": "application/json", cookie: firstCookie }, body: JSON.stringify({ examAssignments: false }) });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ preferences: { examAssignments: false, examResults: true } });
    const secondDefaults = await getJson(`${server.baseUrl}/notifications/preferences`, secondCookie);
    expect(secondDefaults.json).toMatchObject({ preferences: { examAssignments: true, examResults: true } });
    const invalid = await fetch(`${server.baseUrl}/notifications/preferences`, { method: "PATCH", headers: { "content-type": "application/json", cookie: firstCookie }, body: JSON.stringify({ unknown: true }) });
    expect(invalid.status).toBe(400);
  });
  it("exposes notification health metrics only to administrators", async () => {
    const response = await getJson(`${server.baseUrl}/admin/notifications/summary`, adminCookie);
    expect(response.status).toBe(200);
    const summary = response.json as {
      total: number; active: number; unread: number; read: number; expired: number;
      byKind: { kind: string; count: number }[];
      preferences: { students: number; configuredStudents: number; examAssignmentsDisabled: number; examResultsDisabled: number };
    };
    expect(summary.total).toBe(await server.db.studentNotification.count());
    expect(summary.active + summary.expired).toBe(summary.total);
    expect(summary.unread + summary.read).toBe(summary.active);
    expect(summary.byKind.reduce((sum, item) => sum + item.count, 0)).toBe(summary.total);
    expect(summary.preferences.students).toBe(2);
    expect(summary.preferences.configuredStudents).toBeGreaterThanOrEqual(0);
    expect((await getJson(`${server.baseUrl}/admin/notifications/summary`, firstCookie)).status).toBe(403);
  });

});
