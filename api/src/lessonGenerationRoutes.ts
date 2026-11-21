import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { badRequest, notFound } from "./errors.js";
import { GenerateLessonInputSchema, generateLessonContent } from "./lessonGeneration.js";

export function lessonGenerationRouter(db: PrismaClient): Router {
  const router = Router();
  const generationLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Lesson generation limit reached. Try again later." },
  });

  router.get("/admin/lesson-drafts", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const drafts = await db.lessonDraft.findMany({
        orderBy: { updatedAt: "desc" }, take: 100,
        select: { id: true, title: true, subject: true, topic: true, status: true, provider: true, model: true, createdAt: true, updatedAt: true },
      });
      res.json({ ok: true, drafts });
    } catch (error) { next(error); }
  });

  router.get("/admin/lesson-drafts/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.string().trim().min(1).max(64).parse(req.params.id);
      const draft = await db.lessonDraft.findUnique({ where: { id } });
      if (!draft) return next(notFound("Lesson draft was not found."));
      res.json({ ok: true, draft });
    } catch (error) { next(error); }
  });

  router.post("/admin/lesson-drafts/generate", requireAuth, requireAdmin(db), generationLimit, async (req: AuthedRequest, res, next) => {
    try {
      const input = GenerateLessonInputSchema.parse(req.body);
      const generated = await generateLessonContent(input);
      const draft = await db.lessonDraft.create({
        data: {
          createdById: req.user!.id,
          title: generated.script.title,
          subject: input.subject,
          topic: input.topic,
          sourceTitle: input.sourceTitle,
          sourceText: input.sourceText,
          scriptJson: JSON.stringify(generated.script),
          storyboardJson: JSON.stringify(generated.storyboard),
          provider: generated.provider,
          model: generated.model,
          status: "DRAFT",
        },
      });
      res.status(201).json({ ok: true, draft });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Provide a subject, topic, source title and source text (100–30,000 characters)."));
      if (error instanceof Error && error.message === "LESSON_AI_NOT_CONFIGURED") return res.status(503).json({ error: "Lesson AI is not configured on the server." });
      if (error instanceof Error && error.message === "LESSON_AI_RATE_LIMITED") return res.status(429).json({ error: "The lesson AI provider is rate-limiting requests. Try again later." });
      if (error instanceof Error && error.message === "LESSON_AI_PROVIDER_ERROR") return res.status(502).json({ error: "The lesson AI provider could not complete generation." });
      if (error instanceof Error && error.name === "AbortError") return res.status(504).json({ error: "Lesson generation timed out. Try a shorter source." });
      if (error instanceof SyntaxError || error instanceof z.ZodError) return res.status(502).json({ error: "The AI returned lesson content that failed validation. Please retry or adjust the source." });
      next(error);
    }
  });

  return router;
}
