import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  canonicalLessonPackageJson,
  lessonManifestObjectKey,
  lessonSceneObjectKey,
  sha256Hex,
  type LessonPackageManifest,
} from "./lessonPackage.js";
import { findLessonPackageObject, loadVerifiedManifest, type LessonPackageReadStorage } from "./lessonCatalogRoutes.js";

function fixture(manifestHashOverride?: string) {
  const lessonId = "lesson_abc";
  const versionId = "ver_1";
  const sceneBytes = new TextEncoder().encode(JSON.stringify({ sceneType: "title_card", title: "Stack" }));
  const sceneHash = sha256Hex(sceneBytes);
  const sceneKey = lessonSceneObjectKey(lessonId, versionId, "scene_1", sceneHash);
  const manifest: LessonPackageManifest = {
    packageSchemaVersion: 1,
    lessonId,
    versionId,
    createdAt: "2026-11-23T00:00:00.000Z",
    title: "Stack",
    subject: "CSE",
    topic: "Data Structures",
    locale: "en",
    durationMs: 3000,
    scenes: [{ sceneId: "scene_1", position: 0, objectKey: sceneKey, sizeBytes: sceneBytes.byteLength, sha256: sceneHash, durationMs: 3000 }],
    assets: [],
  };
  const manifestBytes = new TextEncoder().encode(canonicalLessonPackageJson(manifest));
  const manifestHash = sha256Hex(manifestBytes);
  const db = {
    lessonDraft: {
      findFirst: async () => ({
        id: lessonId,
        activeVersion: {
          id: versionId,
          packageSchemaVersion: 1,
          manifestKey: lessonManifestObjectKey(lessonId, versionId),
          manifestSha256: manifestHashOverride ?? manifestHash,
          manifestSizeBytes: manifestBytes.byteLength,
        },
      }),
    },
  } as unknown as PrismaClient;
  const storage: LessonPackageReadStorage = {
    getObject: async (key) => ({
      bytes: key === lessonManifestObjectKey(lessonId, versionId) ? manifestBytes : sceneBytes,
      metadata: { key, sizeBytes: manifestBytes.byteLength, sha256: null },
    }),
  };
  return { db, storage, lessonId, versionId, manifest };
}

describe("published lesson manifest delivery verification", () => {
  it("resolves scene JSON and media assets through the same authenticated object endpoint", () => {
    const data = fixture();
    const scene = findLessonPackageObject(data.manifest, "scene_1");
    expect(scene).toMatchObject({ assetId: "scene_1", objectKey: data.manifest.scenes[0].objectKey, mimeType: "application/json", sha256: data.manifest.scenes[0].sha256 });
    expect(findLessonPackageObject(data.manifest, "missing")).toBeNull();
  });

  it("returns only a checksum-verified manifest for the requested active version", async () => {
    const data = fixture();
    const result = await loadVerifiedManifest(data.db, data.lessonId, data.versionId, data.storage);
    expect(result?.manifest).toEqual(data.manifest);
  });

  it("rejects a manifest whose bytes do not match the catalog checksum", async () => {
    const data = fixture("0".repeat(64));
    await expect(loadVerifiedManifest(data.db, data.lessonId, data.versionId, data.storage)).rejects.toThrow(/integrity check/i);
  });
});
