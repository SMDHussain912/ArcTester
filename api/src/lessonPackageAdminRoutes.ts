import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { LessonStoryboardSchema } from "./lessonGeneration.js";
import {
  canonicalLessonPackageJson,
  lessonSceneObjectKey,
  LessonPackageManifestSchema,
  sha256Hex,
  type LessonPackageManifest,
} from "./lessonPackage.js";
import { publishImmutableLessonPackage, type LessonPackageObjectStore } from "./lessonPackagePublisher.js";
import { getR2StorageConfig, R2ObjectStorage } from "./r2ObjectStorage.js";

export async function publishLessonDraftVersion(
  db: PrismaClient,
  lessonId: string,
  adminId: number,
  store: LessonPackageObjectStore,
) {
  const draft = await db.lessonDraft.findUnique({
    where: { id: lessonId },
    select: { id: true, title: true, subject: true, topic: true, storyboardJson: true, status: true },
  });
  if (!draft) throw new Error("LESSON_DRAFT_NOT_FOUND");
  if (draft.status !== "DRAFT" && draft.status !== "PUBLISHED") throw new Error("LESSON_DRAFT_NOT_PUBLISHABLE");

  const storyboard = LessonStoryboardSchema.parse(JSON.parse(draft.storyboardJson) as unknown);
  const latest = await db.lessonVersion.findFirst({
    where: { lessonDraftId: lessonId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const versionNumber = (latest?.version ?? 0) + 1;
  const version = await db.lessonVersion.create({
    data: {
      lessonDraftId: lessonId,
      version: versionNumber,
      packageSchemaVersion: 1,
      status: "UPLOADING",
      createdById: adminId,
    },
    select: { id: true },
  });
  const createdAt = new Date().toISOString();
  const scenes: LessonPackageManifest["scenes"] = [];
  const objects: { key: string; bytes: Uint8Array; contentType: string }[] = [];
  storyboard.scenes.forEach((scene, index) => {
    const sceneId = `scene_${index + 1}`;
    const bytes = new TextEncoder().encode(canonicalLessonPackageJson(scene));
    const hash = sha256Hex(bytes);
    const objectKey = lessonSceneObjectKey(lessonId, version.id, sceneId, hash);
    scenes.push({ sceneId, position: index, objectKey, sizeBytes: bytes.byteLength, sha256: hash, durationMs: scene.durationMs });
    objects.push({ key: objectKey, bytes, contentType: "application/json" });
  });
  const manifest = LessonPackageManifestSchema.parse({
    packageSchemaVersion: 1,
    lessonId,
    versionId: version.id,
    createdAt,
    title: draft.title,
    subject: draft.subject,
    topic: draft.topic,
    locale: "en-IN",
    durationMs: storyboard.scenes.reduce((sum, scene) => sum + scene.durationMs, 0),
    scenes,
    assets: [],
  });
  try {
    const published = await publishImmutableLessonPackage(store, manifest, objects);
    const verifiedAt = new Date();
    await db.$transaction(async (tx) => {
      await tx.lessonVersion.update({
        where: { id: version.id },
        data: {
          status: "READY",
          manifestKey: published.manifestKey,
          manifestSha256: published.manifestSha256,
          manifestSizeBytes: published.manifestSizeBytes,
          validationJson: JSON.stringify({ sceneCount: scenes.length, uploadedObjectCount: published.uploadedObjectCount, reusedObjectCount: published.reusedObjectCount }),
          verifiedAt,
        },
      });
      await tx.lessonVersionAsset.createMany({
        data: scenes.map((scene) => ({
          lessonVersionId: version.id,
          assetId: scene.sceneId,
          sceneId: scene.sceneId,
          role: "SCENE",
          objectKey: scene.objectKey,
          mimeType: "application/json",
          sizeBytes: scene.sizeBytes,
          sha256: scene.sha256,
          durationMs: scene.durationMs,
        })),
      });
      const updated = await tx.lessonDraft.updateMany({
        where: { id: lessonId, status: { in: ["DRAFT", "PUBLISHED"] }, storyboardJson: draft.storyboardJson },
        data: { status: "PUBLISHED", activeVersionId: version.id },
      });
      if (updated.count !== 1) throw new Error("LESSON_DRAFT_CHANGED_DURING_PUBLISH");
    });
    return {
      versionId: version.id,
      version: versionNumber,
      manifestKey: published.manifestKey,
      manifestSha256: published.manifestSha256,
      sceneCount: scenes.length,
      uploadedObjectCount: published.uploadedObjectCount,
      reusedObjectCount: published.reusedObjectCount,
    };
  } catch (error) {
    await db.lessonVersion.updateMany({ where: { id: version.id, status: "UPLOADING" }, data: { status: "FAILED" } }).catch(() => undefined);
    throw error;
  }
}

export function lessonPackageAdminRouter(db: PrismaClient): Router {
  const router = Router();
  router.post("/admin/lesson-drafts/:id/package/publish", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const lessonId = req.params.id;
      if (!lessonId || !/^[A-Za-z0-9_-]{1,64}$/.test(lessonId)) return res.status(400).json({ error: "Lesson ID is invalid." });
      let storage: R2ObjectStorage;
      try {
        storage = new R2ObjectStorage(getR2StorageConfig());
      } catch {
        return res.status(503).json({ error: "Lesson package storage is not configured. Set the R2 server environment variables before publishing." });
      }
      const result = await publishLessonDraftVersion(db, lessonId, req.user!.id, storage);
      return res.status(201).json({ ok: true, version: result });
    } catch (error) {
      if (error instanceof Error && error.message === "LESSON_DRAFT_NOT_FOUND") return res.status(404).json({ error: "Lesson draft was not found." });
      if (error instanceof Error && error.message === "LESSON_DRAFT_NOT_PUBLISHABLE") return res.status(409).json({ error: "This lesson draft cannot be published in its current state." });
      if (error instanceof Error && error.message === "LESSON_DRAFT_CHANGED_DURING_PUBLISH") return res.status(409).json({ error: "The lesson changed while publishing. Refresh and publish again." });
      next(error);
    }
  });
  return router;
}
