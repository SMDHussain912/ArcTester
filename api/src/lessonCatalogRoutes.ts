import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, type AuthedRequest } from "./auth.js";


export function lessonCatalogRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/lessons/:id/versions/:versionId/manifest", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({ where: { id: req.user!.id }, select: { role: true } });
      if (account?.role !== "STUDENT") return res.status(403).json({ error: "Published lessons are available to student accounts." });

      const lessonId = req.params.id;
      const versionId = req.params.versionId;
      if (!lessonId || lessonId.length > 64 || !versionId || versionId.length > 64) {
        return res.status(400).json({ error: "Lesson or version ID is invalid." });
      }
      const lesson = await db.lessonDraft.findFirst({
        where: { id: lessonId, status: "PUBLISHED", activeVersionId: versionId, activeVersion: { is: { id: versionId, status: "READY" } } },
        select: { id: true, activeVersion: { select: { id: true, packageSchemaVersion: true, manifestKey: true, manifestSha256: true, manifestSizeBytes: true } } },
      });
      if (!lesson?.activeVersion?.manifestKey || !lesson.activeVersion.manifestSha256) {
        return res.status(404).json({ error: "Published lesson package was not found." });
      }
      // R2 object streaming will be enabled once a private R2 provider is configured.
      return res.status(503).json({ error: "Versioned lesson package delivery is not configured." });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
