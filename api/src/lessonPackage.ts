import { createHash } from "node:crypto";
import { z } from "zod";

const Identifier = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const SafeMime = z.enum([
  "application/json",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "text/vtt",
]);

export const LessonPackageAssetSchema = z.object({
  assetId: Identifier,
  sceneId: Identifier.optional(),
  role: z.enum(["SCENE", "AUDIO", "IMAGE", "VECTOR", "CAPTION", "PACKAGE"]),
  objectKey: z.string().min(1).max(512),
  mimeType: SafeMime,
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  sha256: Sha256,
  durationMs: z.number().int().positive().max(60 * 60 * 1000).optional(),
  locale: z.string().min(2).max(35).optional(),
  narrationHash: Sha256.optional(),
  altText: z.string().max(500).optional(),
  license: z.string().max(300).optional(),
}).strict();

export const LessonPackageSceneSchema = z.object({
  sceneId: Identifier,
  position: z.number().int().nonnegative().max(500),
  objectKey: z.string().min(1).max(512),
  sizeBytes: z.number().int().positive().max(2 * 1024 * 1024),
  sha256: Sha256,
  durationMs: z.number().int().positive().max(60 * 60 * 1000),
}).strict();

export const LessonPackageManifestSchema = z.object({
  packageSchemaVersion: z.literal(1),
  lessonId: Identifier,
  versionId: Identifier,
  createdAt: z.string().datetime(),
  title: z.string().trim().min(1).max(180),
  subject: z.string().trim().min(1).max(100),
  topic: z.string().trim().min(1).max(160),
  locale: z.string().min(2).max(35),
  durationMs: z.number().int().positive().max(4 * 60 * 60 * 1000),
  scenes: z.array(LessonPackageSceneSchema).min(1).max(500),
  assets: z.array(LessonPackageAssetSchema).max(2000),
}).strict().superRefine((manifest, ctx) => {
  const sceneIds = new Set<string>();
  const scenePositions = new Set<number>();
  for (const scene of manifest.scenes) {
    if (sceneIds.has(scene.sceneId)) ctx.addIssue({ code: "custom", path: ["scenes"], message: "Scene IDs must be unique." });
    if (scenePositions.has(scene.position)) ctx.addIssue({ code: "custom", path: ["scenes"], message: "Scene positions must be unique." });
    sceneIds.add(scene.sceneId);
    scenePositions.add(scene.position);
  }
  const assetIds = new Set<string>();
  for (const asset of manifest.assets) {
    if (assetIds.has(asset.assetId)) ctx.addIssue({ code: "custom", path: ["assets"], message: "Asset IDs must be unique." });
    assetIds.add(asset.assetId);
  }
  const prefix = lessonPackagePrefix(manifest.lessonId, manifest.versionId);
  const allowedKeys = new Set([
    `${prefix}/manifest.json`,
    ...manifest.scenes.map((scene) => scene.objectKey),
    ...manifest.assets.map((asset) => asset.objectKey),
  ]);
  for (const key of allowedKeys) {
    if (!key.startsWith(prefix + "/") || key.split("/").some((part) => part === "." || part === ".." || part === "")) {
      ctx.addIssue({ code: "custom", path: ["assets"], message: "Package object keys must stay inside the immutable lesson version prefix." });
    }
  }
});

export type LessonPackageManifest = z.infer<typeof LessonPackageManifestSchema>;

export function lessonPackagePrefix(lessonId: string, versionId: string): string {
  const lesson = Identifier.parse(lessonId);
  const version = Identifier.parse(versionId);
  return `lessons/${lesson}/versions/${version}`;
}

export function lessonManifestObjectKey(lessonId: string, versionId: string): string {
  return `${lessonPackagePrefix(lessonId, versionId)}/manifest.json`;
}

export function lessonSceneObjectKey(lessonId: string, versionId: string, sceneId: string, sha256: string): string {
  const scene = Identifier.parse(sceneId);
  const hash = Sha256.parse(sha256);
  return `${lessonPackagePrefix(lessonId, versionId)}/scenes/${scene}-${hash}.json`;
}

export function lessonAssetObjectKey(
  lessonId: string,
  versionId: string,
  assetId: string,
  sha256: string,
  extension: string,
): string {
  const asset = Identifier.parse(assetId);
  const hash = Sha256.parse(sha256);
  const ext = z.string().regex(/^(mp3|ogg|wav|png|jpg|webp|svg|vtt)$/).parse(extension);
  return `${lessonPackagePrefix(lessonId, versionId)}/assets/${asset}-${hash}.${ext}`;
}

/** Stable JSON encoding for package hashes: object keys are sorted recursively. */
export function canonicalLessonPackageJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      const record = input as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map((key) => [key, normalize(record[key])]));
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function lessonPackageManifestHash(manifest: LessonPackageManifest): string {
  const parsed = LessonPackageManifestSchema.parse(manifest);
  return sha256Hex(canonicalLessonPackageJson(parsed));
}

/** Prevent an author-supplied arbitrary URL/key from escaping the generated package namespace. */
export function assertLessonPackageObjectKey(
  lessonId: string,
  versionId: string,
  objectKey: string,
): string {
  const prefix = lessonPackagePrefix(lessonId, versionId) + "/";
  if (
    !objectKey.startsWith(prefix) ||
    objectKey.length > 512 ||
    objectKey.split("/").some((part) => part === "." || part === ".." || part === "") ||
    /^[a-z]+:\/\//i.test(objectKey)
  ) {
    throw new Error("Lesson package object key is outside its immutable version namespace.");
  }
  return objectKey;
}
