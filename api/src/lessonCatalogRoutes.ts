import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, type AuthedRequest } from "./auth.js";
import {
  assertLessonPackageObjectKey,
  lessonManifestObjectKey,
  LessonPackageManifestSchema,
  sha256Hex,
} from "./lessonPackage.js";
import { getR2StorageConfig, R2ObjectStorage } from "./r2ObjectStorage.js";
import { isContentAudienceVisible, type ContentAudience } from "./contentAudience.js";

const Identifier = /^[A-Za-z0-9_-]{1,64}$/;

async function getActiveLessonVersion(db: PrismaClient, lessonId: string, versionId: string) {
  return db.lessonDraft.findFirst({
    where: {
      id: lessonId,
      status: "PUBLISHED",
      activeVersionId: versionId,
      activeVersion: { is: { id: versionId, status: "READY" } },
    },
    select: {
      id: true,
      audienceScope: true,
      targetCollegeCode: true,
      targetCollegeName: true,
      targetBranchCode: true,
      targetBranchName: true,
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
}

export interface LessonPackageReadStorage {
  getObject(key: string): Promise<{ bytes: Uint8Array; metadata: { key: string; sizeBytes: number; sha256: string | null } }>;
}

export function findLessonPackageObject(
  manifest: import("./lessonPackage.js").LessonPackageManifest,
  assetId: string,
): { assetId: string; objectKey: string; mimeType: string; sizeBytes: number; sha256: string } | null {
  const asset = manifest.assets.find((item) => item.assetId === assetId);
  if (asset) return { assetId: asset.assetId, objectKey: asset.objectKey, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, sha256: asset.sha256 };
  const scene = manifest.scenes.find((item) => item.sceneId === assetId);
  if (scene) return { assetId: scene.sceneId, objectKey: scene.objectKey, mimeType: "application/json", sizeBytes: scene.sizeBytes, sha256: scene.sha256 };
  return null;
}

export async function loadVerifiedManifest(
  db: PrismaClient,
  lessonId: string,
  versionId: string,
  storage: LessonPackageReadStorage,
) {
  const lesson = await getActiveLessonVersion(db, lessonId, versionId);
  const version = lesson?.activeVersion;
  if (!version?.manifestKey || !version.manifestSha256 || !version.manifestSizeBytes) return null;

  const expectedKey = lessonManifestObjectKey(lessonId, versionId);
  if (version.manifestKey !== expectedKey) throw new Error("Published lesson manifest key is invalid.");
  assertLessonPackageObjectKey(lessonId, versionId, version.manifestKey);

  const object = await storage.getObject(version.manifestKey);
  if (object.bytes.byteLength !== version.manifestSizeBytes || sha256Hex(object.bytes) !== version.manifestSha256) {
    throw new Error("Published lesson manifest failed its integrity check.");
  }
  const manifest = LessonPackageManifestSchema.parse(JSON.parse(new TextDecoder().decode(object.bytes)) as unknown);
  if (manifest.lessonId !== lessonId || manifest.versionId !== versionId || manifest.packageSchemaVersion !== version.packageSchemaVersion) {
    throw new Error("Published lesson manifest does not match its catalog version.");
  }
  return { version, manifest, bytes: object.bytes };
}

export function lessonCatalogRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/lessons/:id/versions/:versionId/manifest", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({ where: { id: req.user!.id }, select: { role: true, collegeCode: true, collegeName: true, branchCode: true, branchName: true } });
      if (account?.role !== "STUDENT") return res.status(403).json({ error: "Published lessons are available to student accounts." });

      const lessonId = req.params.id;
      const versionId = req.params.versionId;
      if (!lessonId || !Identifier.test(lessonId) || !versionId || !Identifier.test(versionId)) {
        return res.status(400).json({ error: "Lesson or version ID is invalid." });
      }
      const lesson = await getActiveLessonVersion(db, lessonId, versionId);
      if (!lesson || !isContentAudienceVisible(lesson as ContentAudience, account)) return res.status(404).json({ error: "Published lesson package was not found." });
      if (!lesson.activeVersion?.manifestKey || !lesson.activeVersion.manifestSha256) {
        return res.status(404).json({ error: "Published lesson package was not found." });
      }

      let storage: R2ObjectStorage;
      try {
        storage = new R2ObjectStorage(getR2StorageConfig());
      } catch {
        return res.status(503).json({ error: "Versioned lesson package delivery is not configured." });
      }
      const result = await loadVerifiedManifest(db, lessonId, versionId, storage);
      if (!result) return res.status(404).json({ error: "Published lesson package was not found." });
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Length", String(result.bytes.byteLength));
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(200).send(Buffer.from(result.bytes));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/lessons/:id/versions/:versionId/objects/:assetId", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({ where: { id: req.user!.id }, select: { role: true, collegeCode: true, collegeName: true, branchCode: true, branchName: true } });
      if (account?.role !== "STUDENT") return res.status(403).json({ error: "Published lessons are available to student accounts." });
      const { id: lessonId, versionId, assetId } = req.params;
      if (!lessonId || !Identifier.test(lessonId) || !versionId || !Identifier.test(versionId) || !assetId || !Identifier.test(assetId)) {
        return res.status(400).json({ error: "Lesson, version or asset ID is invalid." });
      }

      const lesson = await getActiveLessonVersion(db, lessonId, versionId);
      if (!lesson?.activeVersion || !isContentAudienceVisible(lesson as ContentAudience, account)) return res.status(404).json({ error: "Published lesson package was not found." });
      let storage: R2ObjectStorage;
      try {
        storage = new R2ObjectStorage(getR2StorageConfig());
      } catch {
        return res.status(503).json({ error: "Versioned lesson package delivery is not configured." });
      }
      const loaded = await loadVerifiedManifest(db, lessonId, versionId, storage);
      if (!loaded) return res.status(404).json({ error: "Published lesson package was not found." });
      const descriptor = findLessonPackageObject(loaded.manifest, assetId);
      if (!descriptor) return res.status(404).json({ error: "Lesson asset was not found." });

      const record = await db.lessonVersionAsset.findUnique({
        where: { lessonVersionId_assetId: { lessonVersionId: lesson.activeVersion.id, assetId } },
        select: { objectKey: true, mimeType: true, sizeBytes: true, sha256: true },
      });
      if (!record || record.objectKey !== descriptor.objectKey || record.mimeType !== descriptor.mimeType ||
        record.sizeBytes !== descriptor.sizeBytes || record.sha256 !== descriptor.sha256) {
        return res.status(404).json({ error: "Lesson asset was not found in the published version." });
      }
      assertLessonPackageObjectKey(lessonId, versionId, descriptor.objectKey);
      const object = await storage.getObject(descriptor.objectKey);
      if (object.bytes.byteLength !== descriptor.sizeBytes || sha256Hex(object.bytes) !== descriptor.sha256) {
        return res.status(502).json({ error: "Stored lesson asset failed its integrity check." });
      }

      res.setHeader("Content-Type", descriptor.mimeType);
      res.setHeader("Content-Length", String(object.bytes.byteLength));
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(200).send(Buffer.from(object.bytes));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
