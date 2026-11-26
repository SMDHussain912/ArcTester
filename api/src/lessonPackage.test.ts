import { describe, expect, it } from "vitest";
import {
  assertLessonPackageObjectKey,
  canonicalLessonPackageJson,
  lessonAssetObjectKey,
  lessonManifestObjectKey,
  lessonPackageManifestHash,
  LessonPackageManifestSchema,
  lessonSceneObjectKey,
  sha256Hex,
} from "./lessonPackage.js";

const hash = "a".repeat(64);
const manifest = {
  packageSchemaVersion: 1 as const,
  lessonId: "lesson_01",
  versionId: "version_01",
  createdAt: "2026-11-24T00:00:00.000Z",
  title: "Stacks",
  subject: "Computer Science",
  topic: "Stack",
  locale: "en-IN",
  durationMs: 60000,
  scenes: [{
    sceneId: "scene_01",
    position: 0,
    objectKey: `lessons/lesson_01/versions/version_01/scenes/scene_01-${hash}.json`,
    sizeBytes: 1024,
    sha256: hash,
    durationMs: 60000,
  }],
  assets: [{
    assetId: "audio_01",
    sceneId: "scene_01",
    role: "AUDIO" as const,
    objectKey: `lessons/lesson_01/versions/version_01/assets/audio_01-${hash}.mp3`,
    mimeType: "audio/mpeg" as const,
    sizeBytes: 2048,
    sha256: hash,
    durationMs: 60000,
    locale: "en-IN",
    narrationHash: hash,
  }],
};

describe("immutable lesson package helpers", () => {
  it("validates a bounded manifest with content hashes and version-scoped keys", () => {
    expect(LessonPackageManifestSchema.parse(manifest)).toEqual(manifest);
    expect(lessonManifestObjectKey("lesson_01", "version_01"))
      .toBe("lessons/lesson_01/versions/version_01/manifest.json");
    expect(lessonSceneObjectKey("lesson_01", "version_01", "scene_01", hash))
      .toBe(manifest.scenes[0].objectKey);
    expect(lessonAssetObjectKey("lesson_01", "version_01", "audio_01", hash, "mp3"))
      .toBe(manifest.assets[0].objectKey);
  });

  it("rejects duplicate scene IDs/positions and unsafe object keys", () => {
    expect(() => LessonPackageManifestSchema.parse({
      ...manifest,
      scenes: [manifest.scenes[0], { ...manifest.scenes[0], sceneId: "scene_02" }],
    })).toThrow();
    expect(() => LessonPackageManifestSchema.parse({
      ...manifest,
      assets: [{ ...manifest.assets[0], objectKey: "https://attacker.example/file.mp3" }],
    })).toThrow();
    expect(() => assertLessonPackageObjectKey("lesson_01", "version_01", "lessons/lesson_01/versions/version_01/../secret"))
      .toThrow();
    expect(() => lessonAssetObjectKey("lesson_01", "version_01", "audio_01", hash, "exe"))
      .toThrow();
  });

  it("produces deterministic canonical JSON and manifest hashes regardless of object key insertion order", () => {
    const left = { b: 2, a: { z: 1, c: 3 } };
    const right = { a: { c: 3, z: 1 }, b: 2 };
    expect(canonicalLessonPackageJson(left)).toBe(canonicalLessonPackageJson(right));
    expect(sha256Hex("lesson")).toBe(sha256Hex("lesson"));
    expect(lessonPackageManifestHash(manifest)).toBe(lessonPackageManifestHash(manifest));
  });
});
