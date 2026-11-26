import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, type AuthedRequest } from "./auth.js";
import { listLearningConcepts } from "./learningConcepts.js";

const QuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  subject: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
}).strict();

export function conceptLibraryRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/concept-library", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const query = QuerySchema.parse(req.query);
      const profile = await db.user.findUnique({
        where: { id: req.user!.id },
        select: { role: true, branchCode: true, branchName: true },
      });
      if (!profile || profile.role !== "STUDENT") {
        return res.status(403).json({ error: "The student concept library is available to student accounts." });
      }
      const branchOptions = {
        branchCode: profile.branchCode ?? undefined,
        branchName: profile.branchName ?? undefined,
        branchAware: true,
      };
      const concepts = listLearningConcepts({
        query: query.q,
        subject: query.subject,
        limit: query.limit,
        ...branchOptions,
      });
      const subjects = Array.from(new Set(listLearningConcepts({ ...branchOptions, limit: 50 }).map((concept) => concept.subject))).sort();
      return res.json({
        ok: true,
        branch: { code: profile.branchCode, name: profile.branchName },
        subjects,
        count: concepts.length,
        concepts,
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid concept library filters." });
      return next(error);
    }
  });

  return router;
}
