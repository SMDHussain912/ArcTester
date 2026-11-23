import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { publishLessonDraftVersion } from "./lessonPackageAdminRoutes.js";
import { R2StorageError, type R2ObjectMetadata } from "./r2ObjectStorage.js";
import { sha256Hex } from "./lessonPackage.js";

class MemoryStore {
  objects = new Map<string, { bytes: Uint8Array; contentType: string; sha256: string }>();
  async putObject(key: string, bytes: Uint8Array, contentType: string): Promise<R2ObjectMetadata> {
    const sha256 = sha256Hex(bytes);
    this.objects.set(key, { bytes: new Uint8Array(bytes), contentType, sha256 });
    return { key, sizeBytes: bytes.byteLength, etag: null, contentType, sha256 };
  }
  async headObject(key: string): Promise<R2ObjectMetadata> {
    const item = this.objects.get(key);
    if (!item) throw new R2StorageError("missing", 404, "head");
    return { key, sizeBytes: item.bytes.byteLength, etag: null, contentType: item.contentType, sha256: item.sha256 };
  }
}

const draft = {
  id: "lesson_1",
  title: "Stack basics",
  subject: "Computer Science",
  topic: "Stacks",
  status: "DRAFT",
  storyboardJson: JSON.stringify({
    scenes: [
      { sceneType: "title_card", title: "Stack", narration: "Learn stack.", onScreenText: "Stack", durationMs: 3000, visual: {} },
      { sceneType: "step_sequence", title: "Push pop", narration: "Push and pop.", onScreenText: "LIFO", durationMs: 5000, visual: { steps: ["Push A", "Pop A"] } },
      { sceneType: "checkpoint", title: "Recall", narration: "What is LIFO?", onScreenText: "Recall", durationMs: 3000, visual: {} },
    ],
  }),
};

describe("admin immutable lesson version publishing", () => {
  it("uploads scene objects and manifest before atomically activating a READY version", async () => {
    const store = new MemoryStore();
    let createdVersion: { id: string; version: number } | null = null;
    let versionUpdate: Record<string, unknown> | null = null;
    let assetRows: unknown[] = [];
    let draftUpdate: Record<string, unknown> | null = null;
    const tx = {
      lessonVersion: {
        update: async (args: { data: Record<string, unknown> }) => { versionUpdate = args.data; return {}; },
      },
      lessonVersionAsset: {
        createMany: async (args: { data: unknown[] }) => { assetRows = args.data; return { count: assetRows.length }; },
      },
      lessonDraft: {
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { draftUpdate = args.data; return { count: 1 }; },
      },
    };
    const db = {
      lessonDraft: { findUnique: async () => draft },
      lessonVersion: {
        findFirst: async () => ({ version: 2 }),
        create: async (args: { data: { version: number } }) => {
          createdVersion = { id: "version_3", version: args.data.version };
          return { id: createdVersion.id };
        },
        updateMany: async () => ({ count: 1 }),
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaClient;

    const result = await publishLessonDraftVersion(db, draft.id, 42, store);

    expect(result).toMatchObject({ versionId: "version_3", version: 3, sceneCount: 3, uploadedObjectCount: 4 });
    expect(createdVersion).toEqual({ id: "version_3", version: 3 });
    expect(versionUpdate).toMatchObject({ status: "READY", manifestKey: expect.stringContaining("/manifest.json") });
    expect(assetRows).toHaveLength(3);
    expect(draftUpdate).toEqual({ status: "PUBLISHED", activeVersionId: "version_3" });
    expect([...store.objects.keys()].some((key) => key.endsWith("/manifest.json"))).toBe(true);
  });

  it("does not activate a version when the draft changed during upload", async () => {
    const store = new MemoryStore();
    const tx = {
      lessonVersion: { update: async () => ({}) },
      lessonVersionAsset: { createMany: async () => ({ count: 3 }) },
      lessonDraft: { updateMany: async () => ({ count: 0 }) },
    };
    const db = {
      lessonDraft: { findUnique: async () => draft },
      lessonVersion: {
        findFirst: async () => null,
        create: async () => ({ id: "version_1" }),
        updateMany: async () => ({ count: 1 }),
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaClient;

    await expect(publishLessonDraftVersion(db, draft.id, 42, store)).rejects.toThrow(/changed during publish/i);
  });
});
