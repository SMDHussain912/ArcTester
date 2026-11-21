import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { badRequest, notFound } from "./errors.js";
import { LessonTtsError, synthesizeLessonSpeech } from "./lessonTts.js";
import {
  GenerateLessonInputSchema,
  generateLessonContent,
  LessonOutputValidationError,
  LessonScriptSchema,
  LessonStoryboardSchema,
} from "./lessonGeneration.js";

const UpdateLessonDraftSchema = z.object({
  title: z.string().trim().min(3).max(160),
  script: z.unknown(),
  storyboard: z.unknown(),
}).strict();

export function lessonGenerationRouter(db: PrismaClient): Router {
  const router = Router();
  const speechLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Lesson voice limit reached. Try again later." },
  });
  const generationLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Lesson generation limit reached. Try again later." },
  });

  router.get("/lessons", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({ where: { id: req.user!.id }, select: { role: true } });
      if (account?.role !== "STUDENT") {
        return res.status(403).json({ error: "Published lessons are available to student accounts." });
      }
      const published = await db.lessonDraft.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: { id: true, title: true, subject: true, topic: true, scriptJson: true, storyboardJson: true },
      });
      const lessons = published.flatMap((draft) => {
        try {
          const script = LessonScriptSchema.parse(JSON.parse(draft.scriptJson) as unknown);
          const storyboard = LessonStoryboardSchema.parse(JSON.parse(draft.storyboardJson) as unknown);
          return [{ id: draft.id, title: draft.title, subject: draft.subject, topic: draft.topic, script, storyboard }];
        } catch {
          // Never send malformed or unvalidated lesson data to student devices.
          return [];
        }
      });
      res.json({ ok: true, lessons });
    } catch (error) { next(error); }
  });

  router.get("/lessons/:id/scenes/:sceneIndex/audio", requireAuth, speechLimit, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({ where: { id: req.user!.id }, select: { role: true } });
      if (account?.role !== "STUDENT") return res.status(403).json({ error: "Lesson narration is available to student accounts." });
      const id = z.string().trim().min(1).max(64).parse(req.params.id);
      const sceneIndex = z.coerce.number().int().min(0).max(23).parse(req.params.sceneIndex);
      const draft = await db.lessonDraft.findFirst({
        where: { id, status: "PUBLISHED" },
        select: { storyboardJson: true },
      });
      if (!draft) return next(notFound("Published lesson was not found."));
      let storyboard;
      try { storyboard = LessonStoryboardSchema.parse(JSON.parse(draft.storyboardJson) as unknown); }
      catch { return next(badRequest("This lesson's storyboard is invalid.")); }
      const scene = storyboard.scenes[sceneIndex];
      if (!scene) return next(notFound("Lesson scene was not found."));
      const audio = await synthesizeLessonSpeech(scene.narration);
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Length", String(audio.length));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(200).send(audio);
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Lesson ID or scene index is invalid."));
      if (error instanceof LessonTtsError) {
        if (error.message === "LESSON_TTS_NOT_CONFIGURED") return res.status(503).json({ error: "Lesson voice is not configured on the server." });
        if (error.message === "LESSON_TTS_RATE_LIMITED") return res.status(429).json({ error: "The speech provider is rate-limiting requests. Try again later." });
        if (error.message === "LESSON_TTS_INVALID_AUDIO") return res.status(502).json({ error: "The speech provider returned invalid audio." });
        return res.status(502).json({ error: "The speech provider could not synthesize this scene." });
      }
      if (error instanceof Error && error.name === "AbortError") return res.status(504).json({ error: "Speech synthesis timed out. Try again." });
      next(error);
    }
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

  router.patch("/admin/lesson-drafts/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.string().trim().min(1).max(64).parse(req.params.id);
      const input = UpdateLessonDraftSchema.parse(req.body);
      const script = LessonScriptSchema.parse(input.script);
      const storyboard = LessonStoryboardSchema.parse(input.storyboard);
      const existing = await db.lessonDraft.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!existing) return next(notFound("Lesson draft was not found."));
      if (existing.status !== "DRAFT") return next(badRequest("Only unpublished lesson drafts can be edited."));
      const draft = await db.lessonDraft.update({
        where: { id },
        data: { title: input.title, scriptJson: JSON.stringify(script), storyboardJson: JSON.stringify(storyboard) },
      });
      res.json({ ok: true, draft });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Lesson title, script or storyboard failed validation."));
      next(error);
    }
  });

  router.delete("/admin/lesson-drafts/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.string().trim().min(1).max(64).parse(req.params.id);
      const existing = await db.lessonDraft.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!existing) return next(notFound("Lesson draft was not found."));
      if (existing.status !== "DRAFT") return next(badRequest("Only unpublished lesson drafts can be deleted."));
      await db.lessonDraft.delete({ where: { id } });
      res.json({ ok: true });
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
      if (error instanceof LessonOutputValidationError) return res.status(502).json({ error: "The AI returned lesson content that failed validation. Please retry or adjust the source." });
      if (error instanceof Error && error.message === "LESSON_AI_NOT_CONFIGURED") return res.status(503).json({ error: "Lesson AI is not configured on the server." });
      if (error instanceof Error && error.message === "LESSON_AI_RATE_LIMITED") return res.status(429).json({ error: "The lesson AI provider is rate-limiting requests. Try again later." });
      if (error instanceof Error && error.message === "LESSON_AI_PROVIDER_ERROR") return res.status(502).json({ error: "The lesson AI provider could not complete generation." });
      if (error instanceof Error && error.name === "AbortError") return res.status(504).json({ error: "Lesson generation timed out. Try a shorter source." });
      if (error instanceof SyntaxError) return res.status(502).json({ error: "The AI provider returned an invalid response. Please retry." });
      next(error);
    }
  });

  return router;
}
