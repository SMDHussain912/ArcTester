import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { badRequest, notFound } from "./errors.js";
import { LessonScriptSchema, LessonStoryboardSchema } from "./lessonGeneration.js";
import { isContentAudienceVisible, type ContentAudience } from "./contentAudience.js";

const UpdateLessonDraftSchema = z.object({
  title: z.string().trim().min(3).max(160),
  script: z.unknown(),
  storyboard: z.unknown(),
  audienceScope: z.enum(["ALL", "COLLEGE", "BRANCH"]).optional(),
  targetCollegeCode: z.string().trim().max(40).nullable().optional(),
  targetCollegeName: z.string().trim().max(160).nullable().optional(),
  targetBranchCode: z.string().trim().max(40).nullable().optional(),
  targetBranchName: z.string().trim().max(160).nullable().optional(),
}).strict().superRefine((input, ctx) => {
  if (input.audienceScope === "COLLEGE" && !input.targetCollegeCode?.trim() && !input.targetCollegeName?.trim()) {
    ctx.addIssue({ code: "custom", message: "A college code or name is required.", path: ["targetCollegeName"] });
  }
  if (input.audienceScope === "BRANCH" && !input.targetBranchCode?.trim() && !input.targetBranchName?.trim()) {
    ctx.addIssue({ code: "custom", message: "A branch code or name is required.", path: ["targetBranchName"] });
  }
});

const ImportLessonPackageSchema = z.object({
  title: z.string().trim().min(3).max(160),
  subject: z.string().trim().min(2).max(100),
  topic: z.string().trim().min(2).max(160),
  fileName: z.string().trim().min(1).max(180).optional(),
  script: LessonScriptSchema,
  storyboard: LessonStoryboardSchema,
  audienceScope: z.enum(["ALL", "COLLEGE", "BRANCH"]).default("ALL"),
  targetCollegeCode: z.string().trim().max(40).default(""),
  targetCollegeName: z.string().trim().max(160).default(""),
  targetBranchCode: z.string().trim().max(40).default(""),
  targetBranchName: z.string().trim().max(160).default(""),
}).strict().superRefine((input, ctx) => {
  if (input.title !== input.script.title) {
    ctx.addIssue({ code: "custom", message: "Package title must match the lesson script title.", path: ["title"] });
  }
  if (input.audienceScope === "COLLEGE" && !input.targetCollegeCode && !input.targetCollegeName) {
    ctx.addIssue({ code: "custom", message: "A college code or name is required.", path: ["targetCollegeName"] });
  }
  if (input.audienceScope === "BRANCH" && !input.targetBranchCode && !input.targetBranchName) {
    ctx.addIssue({ code: "custom", message: "A branch code or name is required.", path: ["targetBranchName"] });
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


type LessonAudioStorageConfig = { baseUrl: string; bucket: string; serviceKey: string };
function getLessonAudioStorageConfig(): LessonAudioStorageConfig {
  const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const bucket = process.env.SUPABASE_AUDIO_BUCKET?.trim() || "arctester-lesson-audio";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !serviceKey) throw new Error("LESSON_AUDIO_STORAGE_NOT_CONFIGURED");
  return { baseUrl, bucket, serviceKey };
}
function lessonAudioObjectUrl(config: LessonAudioStorageConfig, storagePath: string): string {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodedPath}`;
}

export function lessonGenerationRouter(db: PrismaClient): Router {
  const router = Router();
  router.get("/lessons/:id", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({ where: { id: req.user!.id }, select: { role: true, collegeCode: true, collegeName: true, branchCode: true, branchName: true } });
      if (account?.role !== "STUDENT") return res.status(403).json({ error: "Published lessons are available to student accounts." });
      const id = z.string().trim().min(1).max(64).parse(req.params.id);
      const draft = await db.lessonDraft.findFirst({ where: { id, status: "PUBLISHED" }, select: { id: true, title: true, subject: true, topic: true, scriptJson: true, storyboardJson: true, audienceScope: true, targetCollegeCode: true, targetCollegeName: true, targetBranchCode: true, targetBranchName: true } });
      if (!draft || !isContentAudienceVisible(draft as ContentAudience, account)) return next(notFound("Published lesson was not found."));
      const script = LessonScriptSchema.parse(JSON.parse(draft.scriptJson) as unknown);
      const storyboard = LessonStoryboardSchema.parse(JSON.parse(draft.storyboardJson) as unknown);
      return res.json({ ok: true, lesson: { id: draft.id, title: draft.title, subject: draft.subject, topic: draft.topic, script, storyboard } });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Lesson ID is invalid."));
      return next(error);
    }
  });
  router.get("/lessons", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({ where: { id: req.user!.id }, select: { role: true, collegeCode: true, collegeName: true, branchCode: true, branchName: true } });
      if (account?.role !== "STUDENT") return res.status(403).json({ error: "Published lessons are available to student accounts." });
      const published = await db.lessonDraft.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 300,
        select: {
          id: true, title: true, subject: true, topic: true, updatedAt: true,
          audienceScope: true, targetCollegeCode: true, targetCollegeName: true, targetBranchCode: true, targetBranchName: true,
          activeVersion: { select: { id: true, version: true, packageSchemaVersion: true, manifestSha256: true } },
        },
      });
      const visiblePublished = published.filter((draft) => isContentAudienceVisible(draft as ContentAudience, account));
      const lessons = visiblePublished.map((draft) => ({
        id: draft.id, title: draft.title, subject: draft.subject, topic: draft.topic, updatedAt: draft.updatedAt,
        package: draft.activeVersion ? {
          versionId: draft.activeVersion.id,
          version: draft.activeVersion.version,
          schemaVersion: draft.activeVersion.packageSchemaVersion,
          manifestSha256: draft.activeVersion.manifestSha256,
        } : null,
      }));
      return res.json({ ok: true, lessons });
    } catch (error) { next(error); }
  });
  router.get("/lessons/:id/scenes/:sceneIndex/audio", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({ where: { id: req.user!.id }, select: { role: true, collegeCode: true, collegeName: true, branchCode: true, branchName: true } });
      if (account?.role !== "STUDENT") return res.status(403).json({ error: "Lesson narration is available to student accounts." });
      const id = z.string().trim().min(1).max(64).parse(req.params.id);
      const sceneIndex = z.coerce.number().int().min(0).max(23).parse(req.params.sceneIndex);
      const draft = await db.lessonDraft.findFirst({ where: { id, status: "PUBLISHED" }, select: { storyboardJson: true, audienceScope: true, targetCollegeCode: true, targetCollegeName: true, targetBranchCode: true, targetBranchName: true } });
      if (!draft || !isContentAudienceVisible(draft as ContentAudience, account)) return next(notFound("Published lesson was not found."));
      const storyboard = LessonStoryboardSchema.parse(JSON.parse(draft.storyboardJson) as unknown);
      const scene = storyboard.scenes[sceneIndex];
      if (!scene) return next(notFound("Lesson scene was not found."));
      const narrationHash = createHash("sha256").update(scene.narration.trim()).digest("hex");
      const asset = await db.lessonAudioAsset.findUnique({ where: { lessonDraftId_sceneIndex: { lessonDraftId: id, sceneIndex } } });
      if (!asset || asset.narrationHash !== narrationHash) return res.status(404).json({ error: "Audio has not been prepared for this scene yet." });
      const storage = getLessonAudioStorageConfig();
      const objectUrl = lessonAudioObjectUrl(storage, asset.storagePath);
      const response = await fetch(objectUrl, { headers: { apikey: storage.serviceKey, authorization: `Bearer ${storage.serviceKey}` } });
      if (!response.ok) return res.status(502).json({ error: "Stored lesson audio is temporarily unavailable." });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== asset.sizeBytes) return res.status(502).json({ error: "Stored lesson audio failed its integrity check." });
      res.setHeader("Content-Type", asset.mimeType);
      res.setHeader("Content-Length", String(bytes.length));
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(200).send(bytes);
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Lesson ID or scene index is invalid."));
      next(error);
    }
  });

  router.post("/admin/lesson-drafts/:id/scenes/:sceneIndex/audio", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const id = z.string().trim().min(1).max(64).parse(req.params.id);
      const sceneIndex = z.coerce.number().int().min(0).max(23).parse(req.params.sceneIndex);
      const body = z.object({
        base64: z.string().min(100).max(18_000_000),
        mimeType: z.enum(["audio/wav", "audio/mpeg", "audio/ogg"]),
        voice: z.string().trim().min(1).max(160).default("unknown"),
        model: z.string().trim().min(1).max(160).default("unknown"),
      }).strict().parse(req.body);
      const draft = await db.lessonDraft.findUnique({ where: { id }, select: { id: true, storyboardJson: true } });
      if (!draft) return next(notFound("Lesson draft was not found."));
      const storyboard = LessonStoryboardSchema.parse(JSON.parse(draft.storyboardJson) as unknown);
      const scene = storyboard.scenes[sceneIndex];
      if (!scene) return next(notFound("Lesson scene was not found."));
      const bytes = Buffer.from(body.base64, "base64");
      if (bytes.toString("base64").replace(/=+$/, "") !== body.base64.replace(/=+$/, "")) return next(badRequest("Audio must be valid base64."));
      if (bytes.length < 44 || bytes.length > 12 * 1024 * 1024) return next(badRequest("Audio must be between 44 bytes and 12 MB."));
      const validAudio = body.mimeType === "audio/wav"
        ? bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE"
        : body.mimeType === "audio/ogg"
          ? bytes.toString("ascii", 0, 4) === "OggS"
          : bytes.toString("ascii", 0, 3) === "ID3" || ((bytes[0] === 0xff) && ((bytes[1] & 0xe0) === 0xe0));
      if (!validAudio) return next(badRequest("Audio bytes do not match the selected audio format."));
      const storage = getLessonAudioStorageConfig();
      const narrationHash = createHash("sha256").update(scene.narration.trim()).digest("hex");
      const extension = body.mimeType === "audio/wav" ? "wav" : body.mimeType === "audio/ogg" ? "ogg" : "mp3";
      const storagePath = `lesson-audio/${id}/${sceneIndex}-${narrationHash.slice(0, 20)}.${extension}`;
      const uploadUrl = lessonAudioObjectUrl(storage, storagePath);
      const uploaded = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          apikey: storage.serviceKey,
          authorization: `Bearer ${storage.serviceKey}`,
          "content-type": body.mimeType,
          "x-upsert": "true",
        },
        body: new Uint8Array(bytes),
      });
      if (!uploaded.ok) return res.status(502).json({ error: "Audio object storage rejected the upload." });
      const asset = await db.lessonAudioAsset.upsert({
        where: { lessonDraftId_sceneIndex: { lessonDraftId: id, sceneIndex } },
        create: {
          lessonDraftId: id, uploadedById: req.user!.id, sceneIndex, storagePath,
          mimeType: body.mimeType, sizeBytes: bytes.length, narrationHash,
          voice: body.voice, model: body.model,
        },
        update: {
          uploadedById: req.user!.id, storagePath, mimeType: body.mimeType,
          sizeBytes: bytes.length, narrationHash, voice: body.voice, model: body.model,
        },
        select: { id: true, sceneIndex: true, mimeType: true, sizeBytes: true, narrationHash: true, voice: true, model: true, updatedAt: true },
      });
      return res.status(201).json({ ok: true, audio: asset });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Audio upload fields or scene index are invalid."));
      next(error);
    }
  });

  router.get("/admin/lesson-drafts", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const drafts = await db.lessonDraft.findMany({
        orderBy: { updatedAt: "desc" }, take: 100,
        select: { id: true, title: true, subject: true, topic: true, status: true, provider: true, model: true, audienceScope: true, targetCollegeCode: true, targetCollegeName: true, targetBranchCode: true, targetBranchName: true, createdAt: true, updatedAt: true },
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
        data: {
          title: input.title, scriptJson: JSON.stringify(script), storyboardJson: JSON.stringify(storyboard),
          ...(input.audienceScope !== undefined ? { audienceScope: input.audienceScope } : {}),
          ...(input.targetCollegeCode !== undefined ? { targetCollegeCode: input.targetCollegeCode || null } : {}),
          ...(input.targetCollegeName !== undefined ? { targetCollegeName: input.targetCollegeName || null } : {}),
          ...(input.targetBranchCode !== undefined ? { targetBranchCode: input.targetBranchCode || null } : {}),
          ...(input.targetBranchName !== undefined ? { targetBranchName: input.targetBranchName || null } : {}),
        },
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
          audienceScope: input.audienceScope,
          targetCollegeCode: input.targetCollegeCode || null,
          targetCollegeName: input.targetCollegeName || null,
          targetBranchCode: input.targetBranchCode || null,
          targetBranchName: input.targetBranchName || null,
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
