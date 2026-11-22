import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { badRequest, notFound } from "./errors.js";
import { LessonTtsError, synthesizeLessonSpeech } from "./lessonTts.js";
import { LessonScriptSchema, LessonStoryboardSchema } from "./lessonGeneration.js";

const UpdateLessonDraftSchema = z.object({
  title: z.string().trim().min(3).max(160),
  script: z.unknown(),
  storyboard: z.unknown(),
}).strict();

const ImportLessonPackageSchema = z.object({
  title: z.string().trim().min(3).max(160),
  subject: z.string().trim().min(2).max(100),
  topic: z.string().trim().min(2).max(160),
  fileName: z.string().trim().min(1).max(180).optional(),
  script: LessonScriptSchema,
  storyboard: LessonStoryboardSchema,
}).strict().superRefine((input, ctx) => {
  if (input.title !== input.script.title) {
    ctx.addIssue({ code: "custom", message: "Package title must match the lesson script title.", path: ["title"] });
  }
});

export function parseImportedLessonPackage(value: unknown) {
  return ImportLessonPackageSchema.parse(value);
}

export function validateLessonDraftForPublish(scriptJson: string, storyboardJson: string) {
  const script = LessonScriptSchema.parse(JSON.parse(scriptJson) as unknown);
  const storyboard = LessonStoryboardSchema.parse(JSON.parse(storyboardJson) as unknown);
  return { script, storyboard };
}

export function lessonGenerationRouter(db: PrismaClient): Router {
  const router = Router();
  const speechLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Lesson voice limit reached. Try again later." },
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
      const updated = await db.lessonDraft.updateMany({
        where: { id, status: "DRAFT" },
        data: { title: input.title, scriptJson: JSON.stringify(script), storyboardJson: JSON.stringify(storyboard) },
      });
      if (updated.count !== 1) return next(badRequest("Only unpublished lesson drafts can be edited."));
      const draft = await db.lessonDraft.findUnique({ where: { id } });
      res.json({ ok: true, draft });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Lesson title, script or storyboard failed validation."));
      next(error);
    }
  });

  router.post("/admin/lesson-drafts/:id/publish", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.string().trim().min(1).max(64).parse(req.params.id);
      const existing = await db.lessonDraft.findUnique({
        where: { id },
        select: { id: true, status: true, scriptJson: true, storyboardJson: true },
      });
      if (!existing) return next(notFound("Lesson draft was not found."));
      if (existing.status !== "DRAFT") return next(badRequest("Only unpublished lesson drafts can be published."));
      try {
        validateLessonDraftForPublish(existing.scriptJson, existing.storyboardJson);
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return next(badRequest("Lesson script or storyboard failed validation. Fix the draft before publishing."));
        }
        throw error;
      }
      const published = await db.lessonDraft.updateMany({
        where: {
          id,
          status: "DRAFT",
          scriptJson: existing.scriptJson,
          storyboardJson: existing.storyboardJson,
        },
        data: { status: "PUBLISHED" },
      });
      if (published.count !== 1) return next(badRequest("The draft changed while publishing. Refresh and review it again."));
      const draft = await db.lessonDraft.findUnique({ where: { id } });
      return res.json({ ok: true, draft });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Lesson ID is invalid."));
      return next(error);
    }
  });

  router.delete("/admin/lesson-drafts/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.string().trim().min(1).max(64).parse(req.params.id);
      const existing = await db.lessonDraft.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!existing) return next(notFound("Lesson draft was not found."));
      if (existing.status !== "DRAFT") return next(badRequest("Only unpublished lesson drafts can be deleted."));
      const deleted = await db.lessonDraft.deleteMany({ where: { id, status: "DRAFT" } });
      if (deleted.count !== 1) return next(badRequest("Only unpublished lesson drafts can be deleted."));
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  router.post("/admin/lesson-drafts/import", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = parseImportedLessonPackage(req.body);
      const draft = await db.lessonDraft.create({
        data: {
          createdById: req.user!.id,
          title: input.title,
          subject: input.subject,
          topic: input.topic,
          sourceTitle: input.fileName || "Uploaded lesson package",
          sourceText: "Imported static lesson content. No AI generation was requested.",
          scriptJson: JSON.stringify(input.script),
          storyboardJson: JSON.stringify(input.storyboard),
          provider: "admin-upload",
          model: "static-json-v1",
          status: "DRAFT",
        },
      });
      return res.status(201).json({ ok: true, draft });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Uploaded lesson package failed validation. Check the title, subject, topic, script and storyboard."));
      return next(error);
    }
  });


  return router;
}
