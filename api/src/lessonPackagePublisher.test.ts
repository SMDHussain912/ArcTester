import { describe, expect, it } from "vitest";
import { lessonPackageManifestHash, sha256Hex } from "./lessonPackage.js";
import { publishImmutableLessonPackage } from "./lessonPackagePublisher.js";
import { R2StorageError, type R2ObjectMetadata } from "./r2ObjectStorage.js";

const sceneBytes = new TextEncoder().encode('{"scene":"stack"}');
const audioBytes = new TextEncoder().encode("static narration");
const sceneHash = sha256Hex(sceneBytes);
const audioHash = sha256Hex(audioBytes);
const sceneKey = "lessons/l_stack/versions/v1/scenes/scene_1-" + sceneHash + ".json";
const audioKey = "lessons/l_stack/versions/v1/assets/audio_1-" + audioHash + ".mp3";
const manifest = {
  packageSchemaVersion: 1 as const,
  lessonId: "l_stack",
  versionId: "v1",
  createdAt: "2026-11-24T00:00:00.000Z",
  title: "Stack",
  subject: "CSE",
  topic: "Stack",
  locale: "en-IN",
  durationMs: 12000,
  scenes: [{ sceneId: "scene_1", position: 0, objectKey: sceneKey, sizeBytes: sceneBytes.byteLength, sha256: sceneHash, durationMs: 12000 }],
  assets: [{ assetId: "audio_1", sceneId: "scene_1", role: "AUDIO" as const, objectKey: audioKey, mimeType: "audio/mpeg" as const, sizeBytes: audioBytes.byteLength, sha256: audioHash, durationMs: 12000, locale: "en-IN" }],
};

class FakeStore {
  objects = new Map<string, { bytes: Uint8Array; contentType: string; sha256: string }>();
  puts: string[] = [];
  async putObject(key: string, bytes: Uint8Array, contentType: string): Promise<R2ObjectMetadata> {
    const sha256 = sha256Hex(bytes);
    this.objects.set(key, { bytes: new Uint8Array(bytes), contentType, sha256 });
    this.puts.push(key);
    return { key, sizeBytes: bytes.byteLength, etag: null, contentType, sha256 };
  }
  async headObject(key: string): Promise<R2ObjectMetadata> {
    const object = this.objects.get(key);
    if (!object) throw new R2StorageError("not found", 404, "head");
    return { key, sizeBytes: object.bytes.byteLength, etag: null, contentType: object.contentType, sha256: object.sha256 };
  }
}

const uploadObjects = [
  { key: sceneKey, bytes: sceneBytes, contentType: "application/json" },
  { key: audioKey, bytes: audioBytes, contentType: "audio/mpeg" },
];

describe("immutable lesson package publisher", () => {
  it("uploads and verifies every scene/media object before writing the manifest", async () => {
    const store = new FakeStore();
    const result = await publishImmutableLessonPackage(store, manifest, uploadObjects);
    const manifestKey = "lessons/l_stack/versions/v1/manifest.json";
    expect(store.puts.at(-1)).toBe(manifestKey);
    expect(result).toMatchObject({ manifestKey, uploadedObjectCount: 3, reusedObjectCount: 0 });
    expect(result.manifestSha256).toBe(lessonPackageManifestHash(manifest));
    expect(store.objects.has(manifestKey)).toBe(true);
  });

  it("reuses exact immutable objects and refuses conflicting existing content", async () => {
    const store = new FakeStore();
    await publishImmutableLessonPackage(store, manifest, uploadObjects);
    const count = store.puts.length;
    const again = await publishImmutableLessonPackage(store, manifest, uploadObjects);
    expect(store.puts).toHaveLength(count);
    expect(again.reusedObjectCount).toBe(3);
    store.objects.set(sceneKey, { bytes: new Uint8Array([1]), contentType: "application/json", sha256: "f".repeat(64) });
    await expect(publishImmutableLessonPackage(store, manifest, uploadObjects)).rejects.toThrow(/mismatched size or checksum/);
  });

  it("rejects missing, extra, and corrupted package objects before storage writes", async () => {
    const store = new FakeStore();
    await expect(publishImmutableLessonPackage(store, manifest, uploadObjects.slice(0, 1))).rejects.toThrow(/count/);
    await expect(publishImmutableLessonPackage(store, manifest, [...uploadObjects, { key: "lessons/l_stack/versions/v1/extra.bin", bytes: new Uint8Array([1]), contentType: "application/octet-stream" }])).rejects.toThrow(/count/);
    await expect(publishImmutableLessonPackage(store, manifest, [{ ...uploadObjects[0]!, bytes: new Uint8Array([9]) }, uploadObjects[1]!])).rejects.toThrow(/checksum/);
    expect(store.puts).toHaveLength(0);
  });
});
