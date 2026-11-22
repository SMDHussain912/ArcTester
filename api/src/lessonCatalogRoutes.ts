import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, type AuthedRequest } from "./auth.js";


export function lessonCatalogRouter(db: PrismaClient): Router {
  const router = Router();

  // Summary-only feed. The client fetches the exact package manifest separately.
  router.get("/lessons", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({
        where: { id: req.user!.id },
        select: { role: true },
      });
      if (account?.role !== "STUDENT") {
        return res.status(403).json({ error: "Published lessons are available to student accounts." });
      }

      const published = await db.lessonDraft.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 100,
        select: {
          id: true,
          title: true,
          subject: true,
          topic: true,
          updatedAt: true,
          activeVersion: {
            select: {
              id: true,
              version: true,
              packageSchemaVersion: true,
              manifestSha256: true,
            },
          },
        },
      });

      const lessons = published.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        topic: lesson.topic,
        updatedAt: lesson.updatedAt,
        // null means a legacy lesson; clients continue through the legacy detail route.
        package: lesson.activeVersion
          ? {
              versionId: lesson.activeVersion.id,
              version: lesson.activeVersion.version,
              schemaVersion: lesson.activeVersion.packageSchemaVersion,
              manifestSha256: lesson.activeVersion.manifestSha256,
            }
          : null,
      }));

      return res.json({ ok: true, lessons });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/lessons/:id/versions/:versionId/manifest", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({
        where: { id: req.user!.id },
        select: { role: true },
      });
      if (account?.role !== "STUDENT") {
        return res.status(403).json({ error: "Published lessons are available to student accounts." });
      }

      const lessonId = req.params.id;
      const versionId = req.params.versionId;
      if (!lessonId || lessonId.length > 64 || !versionId || versionId.length > 64) {
        return res.status(400).json({ error: "Lesson or version ID is invalid." });
      }
      const lesson = await db.lessonDraft.findFirst({
        where: {
          id: lessonId,
          status: "PUBLISHED",
          activeVersionId: versionId,
          activeVersion: { is: { id: versionId, status: "READY" } },
        },
        select: {
          id: true,
          activeVersion: {
            select: {
              id: true,
              packageSchemaVersion: true,
              manifestKey: true,
              manifestSha256: true,
              manifestSizeBytes: true,
            },
          },
        },
      });
      if (!lesson?.activeVersion?.manifestKey || !lesson.activeVersion.manifestSha256) {
        return res.status(404).json({ error: "Published lesson package was not found." });
      }

      // Object storage delivery is deliberately not implemented until R2 credentials
      // and the provider adapter are configured. Do not fall back to arbitrary URLs.
      return res.status(503).json({ error: "Versioned lesson package delivery is not configured." });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
