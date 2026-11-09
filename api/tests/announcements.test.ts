import { afterAll, describe, expect, it } from "vitest";
import { closeTestDb, testDb } from "./setup.js";

afterAll(closeTestDb);

describe("announcement delivery", () => {
  it("expires notices and remembers that each student has seen them", async () => {
    const db = await testDb();
    const admin = await db.user.create({
      data: { email: "announcement-admin@example.test", passwordHash: "test", role: "ADMIN" },
    });
    const student = await db.user.create({
      data: { email: "announcement-student@example.test", passwordHash: "test", role: "STUDENT" },
    });
    const active = await db.announcement.create({
      data: {
        title: "Exam schedule",
        message: "The mock test begins tomorrow.",
        createdById: admin.id,
        startsAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const expired = await db.announcement.create({
      data: {
        title: "Old notice",
        message: "This notice has expired.",
        createdById: admin.id,
        startsAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const now = new Date();
    const unseen = await db.announcement.findMany({
      where: {
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        views: { none: { userId: student.id } },
      },
    });
    expect(unseen.map((item) => item.id)).toContain(active.id);
    expect(unseen.map((item) => item.id)).not.toContain(expired.id);

    await db.announcementView.upsert({
      where: { announcementId_userId: { announcementId: active.id, userId: student.id } },
      create: { announcementId: active.id, userId: student.id },
      update: {},
    });
    const afterSeen = await db.announcement.findMany({
      where: {
        startsAt: { lte: new Date() },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        views: { none: { userId: student.id } },
      },
    });
    expect(afterSeen.map((item) => item.id)).not.toContain(active.id);
  });
});
