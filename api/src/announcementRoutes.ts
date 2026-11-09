import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";

const CreateAnnouncementSchema = z.object({
  title: z.string().trim().min(2).max(120),
  message: z.string().trim().min(1).max(4000),
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
        const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
        if (expiresAt && expiresAt.getTime() <= Date.now()) {
          return next(badRequest("Announcement expiry must be in the future."));
        }

        const announcement = await db.announcement.create({
          data: {
            title: input.title,
            message: input.message,
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

  router.post("/announcements/:id/read", requireAuth, async (req: AuthedRequest, res, next) => {
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
        create: { announcementId: announcement.id, userId: req.user!.id },
        update: { seenAt: now },
        select: { seenAt: true },
      });
      res.json({ ok: true, seenAt: view.seenAt.toISOString() });
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
            select: { seenAt: true },
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
        })),
        serverTime: now.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
