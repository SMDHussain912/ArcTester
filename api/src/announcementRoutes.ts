import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";

const CreateAnnouncementSchema = z.object({
  title: z.string().trim().min(2).max(120),
  message: z.string().trim().min(1).max(4000),
  expiresAt: z.string().datetime().optional(),
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
            publishedAt: true,
            expiresAt: true,
          },
        });
        res.status(201).json({ ok: true, announcement });
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
          orderBy: { publishedAt: "desc" },
          take: 100,
          select: {
            id: true,
            title: true,
            message: true,
            createdAt: true,
            publishedAt: true,
            expiresAt: true,
          },
        });
        res.json({ ok: true, announcements });
      } catch (error) {
        next(error);
      }
    }
  );


  router.post("/announcements/:id/read", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const announcement = await db.announcement.findFirst({
        where: {
          id: req.params.id,
          publishedAt: { lte: new Date() },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      });
      if (!announcement) return next(badRequest("This announcement is no longer available."));
      await db.announcementRead.upsert({
        where: {
          announcementId_studentId: {
            announcementId: announcement.id,
            studentId: req.user!.id,
          },
        },
        create: { announcementId: announcement.id, studentId: req.user!.id },
        update: { seenAt: new Date() },
      });
      res.json({ ok: true, seenAt: new Date().toISOString() });
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
          publishedAt: { lte: now, ...(after ? { gt: after } : {}) },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          reads: { none: { studentId: req.user!.id } },
        },
        orderBy: { publishedAt: "asc" },
        take: 200,
        select: {
          id: true,
          title: true,
          message: true,
          createdAt: true,
          publishedAt: true,
          expiresAt: true,
        },
      });
      res.json({ ok: true, announcements, serverTime: now.toISOString() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
