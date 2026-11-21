import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";

const CreateAnnouncementSchema = z.object({
  title: z.string().trim().min(2).max(120),
  message: z.string().trim().min(1).max(4000),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const AfterSchema = z.string().datetime().optional();

export function announcementRouter(db: PrismaClient): Router {
  const router = Router();

  router.post(
    "/admin/announcements",
    requireAuth,
    requireAdmin(db),
    async (req: AuthedRequest, res, next) => {
      try {
        const input = CreateAnnouncementSchema.parse(req.body);
        const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
        const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
        if (expiresAt && expiresAt.getTime() <= Math.max(startsAt.getTime(), Date.now())) {
          return next(badRequest("Announcement expiry must be after its publish time and in the future."));
        }

        const announcement = await db.announcement.create({
          data: {
            title: input.title,
            message: input.message,
            startsAt,
            expiresAt,
            createdById: req.user!.id,
          },
          select: {
            id: true,
            title: true,
            message: true,
            createdAt: true,
            startsAt: true,
            expiresAt: true,
          },
        });
        res.status(201).json({ ok: true, announcement: { ...announcement, _count: { views: 0 } } });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/announcements",
    requireAuth,
    requireAdmin(db),
    async (_req, res, next) => {
      try {
        const announcements = await db.announcement.findMany({
          orderBy: { startsAt: "desc" },
          take: 100,
          select: {
            id: true,
            title: true,
            message: true,
            createdAt: true,
            startsAt: true,
            expiresAt: true,
            _count: { select: { views: true } },
          },
        });
        res.json({ ok: true, announcements });
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    "/admin/announcements/:id",
    requireAuth,
    requireAdmin(db),
    async (req, res, next) => {
      try {
        const deleted = await db.announcement.deleteMany({ where: { id: req.params.id } });
        if (deleted.count === 0) return next(badRequest("Announcement not found."));
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get("/announcements/active", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const now = new Date();
      const announcements = await db.announcement.findMany({
        where: {
          startsAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          views: { none: { userId: req.user!.id } },
        },
        orderBy: { startsAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          message: true,
          createdAt: true,
          startsAt: true,
          expiresAt: true,
        },
      });
      res.json({
        ok: true,
        announcements: announcements.map((announcement) => ({
          ...announcement,
          publishedAt: announcement.startsAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(["/announcements/:id/read", "/announcements/:id/acknowledge"], requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const now = new Date();
      const announcement = await db.announcement.findFirst({
        where: {
          id: req.params.id,
          startsAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      });
      if (!announcement) return next(badRequest("This announcement is no longer available."));
      const view = await db.announcementView.upsert({
        where: {
          announcementId_userId: {
            announcementId: announcement.id,
            userId: req.user!.id,
          },
        },
        create: { announcementId: announcement.id, userId: req.user!.id, acknowledgedAt: now },
        // Acknowledgement is a durable per-student fact. Repeated requests
        // must not move the original acknowledgement timestamp forward.
        update: {},
        select: { seenAt: true, acknowledgedAt: true },
      });
      res.json({ ok: true, seenAt: view.seenAt.toISOString(), acknowledgedAt: view.acknowledgedAt?.toISOString() ?? null });
    } catch (error) {
      next(error);
    }
  });

  router.get("/announcements", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const parsedAfter = AfterSchema.safeParse(req.query.after);
      if (!parsedAfter.success) return next(badRequest("The announcement cursor is invalid."));
      const after = parsedAfter.data ? new Date(parsedAfter.data) : undefined;
      const now = new Date();
      const announcements = await db.announcement.findMany({
        where: {
          startsAt: { lte: now, ...(after ? { gt: after } : {}) },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { startsAt: "desc" },
        take: 200,
        select: {
          id: true,
          title: true,
          message: true,
          createdAt: true,
          startsAt: true,
          expiresAt: true,
          views: {
            where: { userId: req.user!.id },
            select: { seenAt: true, acknowledgedAt: true },
            take: 1,
          },
        },
      });
      res.json({
        ok: true,
        announcements: announcements.map(({ views, ...announcement }) => ({
          ...announcement,
          publishedAt: announcement.startsAt,
          seenAt: views[0]?.seenAt ?? null,
          acknowledgedAt: views[0]?.acknowledgedAt ?? null,
        })),
        serverTime: now.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });


  const NotificationPreferencesSchema = z.object({ examAssignments: z.boolean().optional(), examResults: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0, "Choose at least one preference to update.");

  router.get("/notifications/preferences", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const preferences = await db.studentNotificationPreference.findUnique({ where: { userId: req.user!.id }, select: { examAssignments: true, examResults: true, updatedAt: true } });
      res.json({ ok: true, preferences: preferences ?? { examAssignments: true, examResults: true, updatedAt: null } });
    } catch (error) { next(error); }
  });

  router.patch("/notifications/preferences", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = NotificationPreferencesSchema.parse(req.body);
      const preferences = await db.studentNotificationPreference.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, ...input }, update: input, select: { examAssignments: true, examResults: true, updatedAt: true } });
      res.json({ ok: true, preferences });
    } catch (error) { next(error); }
  });

  router.get("/notifications", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const now = new Date();
      const unreadOnly = req.query.unread === "true";
      const notifications = await db.studentNotification.findMany({
        where: {
          userId: req.user!.id,
          kind: { notIn: ["EXAM_ASSIGNMENT", "EXAM_RESULT"] },
          ...(unreadOnly ? { readAt: null } : {}),
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          kind: true,
          title: true,
          message: true,
          href: true,
          createdAt: true,
          readAt: true,
          expiresAt: true,
        },
      });
      const unreadCount = await db.studentNotification.count({
        where: {
          userId: req.user!.id,
          kind: { notIn: ["EXAM_ASSIGNMENT", "EXAM_RESULT"] },
          readAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });
      res.json({ ok: true, notifications, unreadCount, serverTime: now.toISOString() });
    } catch (error) {
      next(error);
    }
  });

  router.post("/notifications/:id/read", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const notification = await db.studentNotification.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
        select: { id: true, readAt: true, expiresAt: true },
      });
      if (!notification) return next(badRequest("Notification not found."));
      if (notification.expiresAt && notification.expiresAt <= new Date()) {
        return next(badRequest("This notification has expired."));
      }
      if (notification.readAt) {
        return res.json({ ok: true, readAt: notification.readAt.toISOString(), alreadyRead: true });
      }
      const now = new Date();
      const updated = await db.studentNotification.updateMany({
        where: { id: notification.id, userId: req.user!.id, readAt: null },
        data: { readAt: now },
      });
      const saved = await db.studentNotification.findFirstOrThrow({
        where: { id: notification.id, userId: req.user!.id },
        select: { readAt: true },
      });
      res.json({ ok: true, readAt: saved.readAt?.toISOString() ?? now.toISOString(), alreadyRead: updated.count === 0 });
    } catch (error) {
      next(error);
    }
  });

  router.post("/notifications/read-all", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const now = new Date();
      const updated = await db.studentNotification.updateMany({
        where: {
          userId: req.user!.id,
          readAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { readAt: now },
      });
      res.json({ ok: true, updatedCount: updated.count, readAt: now.toISOString() });
    } catch (error) {
      next(error);
    }
  });


  router.get("/admin/notifications/summary", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const now = new Date();
      const activeWhere = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
      const [total, active, unread, read, expired, grouped, preferences, students] = await Promise.all([
        db.studentNotification.count(),
        db.studentNotification.count({ where: activeWhere }),
        db.studentNotification.count({ where: { readAt: null, ...activeWhere } }),
        db.studentNotification.count({ where: { readAt: { not: null }, ...activeWhere } }),
        db.studentNotification.count({ where: { expiresAt: { lte: now } } }),
        db.studentNotification.groupBy({ by: ["kind"], _count: { _all: true }, orderBy: { kind: "asc" } }),
        db.studentNotificationPreference.findMany({ select: { examAssignments: true, examResults: true } }),
        db.user.count({ where: { role: "STUDENT" } }),
      ]);
      res.json({
        ok: true,
        generatedAt: now.toISOString(),
        total, active, unread, read, expired,
        byKind: grouped.map((item) => ({ kind: item.kind, count: item._count._all })),
        preferences: {
          students,
          configuredStudents: preferences.length,
          examAssignmentsDisabled: preferences.filter((item) => !item.examAssignments).length,
          examResultsDisabled: preferences.filter((item) => !item.examResults).length,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
