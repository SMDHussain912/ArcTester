import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth.js";
import { buildApp } from "../src/index.js";
import { sessionCookie, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let adminCookie = "";
let studentCookie = "";
let secondStudentCookie = "";

async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string
): Promise<{ status: number; json: Record<string, unknown> }> {
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
  };
}

async function createSession(email: string, role: "ADMIN" | "STUDENT"): Promise<string> {
  await server.db.user.create({
    data: { email, passwordHash: hashPassword("announcement-test-password-123"), role },
  });
  const response = await fetch(`${server.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "announcement-test-password-123" }),
  });
  return sessionCookie(response);
}

describe("admin announcements", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    adminCookie = await createSession("announcement-admin@arctester.test", "ADMIN");
    studentCookie = await createSession("announcement-student@arctester.test", "STUDENT");
    secondStudentCookie = await createSession("announcement-student-2@arctester.test", "STUDENT");
  });

  afterAll(async () => {
    await server.close();
  });

  it("allows admins to publish announcements and students to retrieve them", async () => {
    const created = await request(
      "/admin/announcements",
      "POST",
      {
        title: "Exam schedule updated",
        message: "Your mock exam starts at 10:00 AM tomorrow.",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
      adminCookie
    );
    expect(created.status).toBe(201);
    expect(
      (created.json.announcement as { title: string; expiresAt: string }).title
    ).toBe("Exam schedule updated");
    expect((created.json.announcement as { expiresAt: string }).expiresAt).toBeTruthy();

    const feed = await request("/announcements", "GET", undefined, studentCookie);
    expect(feed.status).toBe(200);
    const announcements = feed.json.announcements as Array<{ title: string; message: string }>;
    expect(announcements).toHaveLength(1);
    expect(announcements[0].message).toContain("10:00 AM");

    const announcementId = (announcements[0] as { id: string }).id;
    const acknowledged = await request(
      `/announcements/${announcementId}/read`,
      "POST",
      {},
      studentCookie
    );
    expect(acknowledged.status).toBe(200);

    const nextFeed = await request("/announcements", "GET", undefined, studentCookie);
    expect(nextFeed.status).toBe(200);
    const seenAnnouncements = nextFeed.json.announcements as Array<{
      id: string;
      seenAt: string | null;
    }>;
    expect(seenAnnouncements).toHaveLength(1);
    expect(seenAnnouncements[0].id).toBe(announcementId);
    expect(seenAnnouncements[0].seenAt).toBeTruthy();

    const otherStudentFeed = await request(
      "/announcements",
      "GET",
      undefined,
      secondStudentCookie
    );
    const otherStudentAnnouncements = otherStudentFeed.json.announcements as Array<{
      id: string;
      seenAt: string | null;
    }>;
    expect(otherStudentAnnouncements).toHaveLength(1);
    expect(otherStudentAnnouncements[0].id).toBe(announcementId);
    expect(otherStudentAnnouncements[0].seenAt).toBeNull();
  });

  it("rejects student publishing and invalid expiry dates", async () => {
    const forbidden = await request(
      "/admin/announcements",
      "POST",
      { title: "Notice", message: "Student cannot publish." },
      studentCookie
    );
    expect(forbidden.status).toBe(403);

    const expired = await request(
      "/admin/announcements",
      "POST",
      {
        title: "Expired notice",
        message: "This should be rejected.",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
      adminCookie
    );
    expect(expired.status).toBe(400);
  });

  it("supports incremental feeds and excludes expired announcements", async () => {
    const cursor = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await server.db.announcement.create({
      data: {
        title: "New message",
        message: "This is newer than the cursor.",
        createdById: (
          await server.db.user.findUniqueOrThrow({
            where: { email: "announcement-admin@arctester.test" },
            select: { id: true },
          })
        ).id,
      },
    });
    await server.db.announcement.create({
      data: {
        title: "Expired message",
        message: "This must not be delivered.",
        expiresAt: new Date(Date.now() - 1000),
        createdById: (await server.db.user.findUniqueOrThrow({
          where: { email: "announcement-admin@arctester.test" },
          select: { id: true },
        })).id,
      },
    });

    const feed = await request(
      `/announcements?after=${encodeURIComponent(cursor)}`,
      "GET",
      undefined,
      studentCookie
    );
    expect(feed.status).toBe(200);
    const announcements = feed.json.announcements as Array<{ title: string }>;
    expect(announcements.map((item) => item.title)).toEqual(["New message"]);
  });
});
