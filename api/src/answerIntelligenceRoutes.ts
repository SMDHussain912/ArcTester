import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { badRequest, notFound } from "./errors.js";
import { generateAnswerExplanation, getAnswerIntelligenceProviderStatus } from "./intelligence/answerIntelligence.js";
import { decodeOptions } from "./questions.js";

export function answerIntelligenceRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/admin/intelligence/status", requireAuth, requireAdmin(db), (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ok: true, status: getAnswerIntelligenceProviderStatus() });
  });

  router.post("/tests/:id/questions/:questionId/explanation", requireAuth, async (req, res, next) => {
    try {
      const params = z.object({
        id: z.coerce.number().int().positive(),
        questionId: z.coerce.number().int().positive(),
      }).parse(req.params);
      const userId = (req as AuthedRequest).user!.id;
      const attempt = await db.attempt.findFirst({
        where: { id: params.id, userId, finishedAt: { not: null } },
        include: { answers: { where: { questionId: params.questionId }, take: 1 } },
      });
      if (!attempt || attempt.answers.length === 0) return next(notFound("Completed practice question not found."));
      const snapshot = attempt.answers[0];
      let options: string[];
      try { options = decodeOptions(snapshot.optionsSnapshot); }
      catch { return next(badRequest("The saved question options are invalid.")); }
      if (snapshot.correctIndexSnapshot < 0 || snapshot.correctIndexSnapshot >= options.length) {
        return next(badRequest("The saved answer key is invalid."));
      }
      const explanation = await generateAnswerExplanation({
        subject: snapshot.subjectSnapshot,
        topic: snapshot.topicSnapshot,
        difficulty: "unknown",
        text: snapshot.textSnapshot,
        options,
        correctIndex: snapshot.correctIndexSnapshot,
        selectedIndex: snapshot.chosen,
        approvedExplanation: snapshot.explanationSnapshot || "",
      });
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ ok: true, explanation });
    } catch (error) { next(error); }
  });

  return router;
}
