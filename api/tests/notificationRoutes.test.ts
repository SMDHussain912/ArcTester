import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth.js";
import { buildApp } from "../src/index.js";
import { getJson, postJson, signIn, startTestServer, type TestServer } from "./server.js";

let server: TestServer;

describe("student notification API", () => {
  let firstCookie = "";
  let secondCookie = "";
  let firstUserId = 0;

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
  });

  afterAll(async () => {
    await server.close();
  });

  it("lists only the authenticated student's active notifications and acknowledges reads idempotently", async () => {
    const active = await server.db.studentNotification.create({
      data: {
        userId: firstUserId,
        kind: "EXAM_ASSIGNMENT",
        title: "New exam assigned",
        message: "A mock exam is ready.",
        href: "/assignments",
        dedupeKey: "notification-assignment-first",
      },
    });
    const expired = await server.db.studentNotification.create({
      data: {
        userId: firstUserId,
        kind: "EXAM_RESULT",
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
        kind: "EXAM_RESULT",
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
});
