import {
  assertLessonPackageObjectKey,
  canonicalLessonPackageJson,
  lessonManifestObjectKey,
  lessonPackageManifestHash,
  LessonPackageManifestSchema,
  sha256Hex,
  type LessonPackageManifest,
} from "./lessonPackage.js";
import { R2StorageError, type R2ObjectMetadata } from "./r2ObjectStorage.js";

export interface LessonPackageObjectStore {
  putObject(key: string, bytes: Uint8Array, contentType: string): Promise<R2ObjectMetadata>;
  headObject(key: string): Promise<R2ObjectMetadata>;
}

export interface LessonPackageUploadObject {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface PublishedLessonPackageResult {
  manifestKey: string;
  manifestSha256: string;
  manifestSizeBytes: number;
  uploadedObjectCount: number;
  reusedObjectCount: number;
}

function expectedObjects(manifest: LessonPackageManifest): Map<string, { sha256: string; sizeBytes: number; contentType: string }> {
  const expected = new Map<string, { sha256: string; sizeBytes: number; contentType: string }>();
  for (const scene of manifest.scenes) {
    expected.set(scene.objectKey, { sha256: scene.sha256, sizeBytes: scene.sizeBytes, contentType: "application/json" });
  }
  for (const asset of manifest.assets) {
    expected.set(asset.objectKey, { sha256: asset.sha256, sizeBytes: asset.sizeBytes, contentType: asset.mimeType });
  }
  return expected;
}

async function ensureImmutableObject(
  store: LessonPackageObjectStore,
  key: string,
  bytes: Uint8Array,
  sha256: string,
  contentType: string,
): Promise<"uploaded" | "reused"> {
  const verify = async (): Promise<R2ObjectMetadata> => {
    const metadata = await store.headObject(key);
    if (metadata.sizeBytes !== bytes.byteLength || metadata.sha256 !== sha256) {
      throw new Error("Immutable lesson package object already exists with mismatched size or checksum.");
    }
    return metadata;
  };

  try {
    await verify();
    return "reused";
  } catch (error) {
    if (!(error instanceof R2StorageError) || error.statusCode !== 404 || error.operation !== "head") throw error;
  }

  await store.putObject(key, bytes, contentType);
  await verify();
  return "uploaded";
}

/**
 * Uploads all scene/media objects and verifies them before writing the manifest.
 * The caller must only move the database publication pointer after this succeeds.
 */
export async function publishImmutableLessonPackage(
  store: LessonPackageObjectStore,
  inputManifest: LessonPackageManifest,
  objects: LessonPackageUploadObject[],
): Promise<PublishedLessonPackageResult> {
  const manifest = LessonPackageManifestSchema.parse(inputManifest);
  const expected = expectedObjects(manifest);
  if (objects.length !== expected.size) {
    throw new Error("Package upload object count does not match the manifest.");
  }

  const provided = new Map<string, LessonPackageUploadObject>();
  for (const object of objects) {
    assertLessonPackageObjectKey(manifest.lessonId, manifest.versionId, object.key);
    if (provided.has(object.key) || !expected.has(object.key)) {
      throw new Error("Package upload contains a duplicate or unreferenced object.");
    }
    provided.set(object.key, object);
  }

  for (const [key, descriptor] of expected) {
    const object = provided.get(key);
    if (!object) throw new Error("Package upload is missing a manifest-referenced object.");
    if (
      object.bytes.byteLength !== descriptor.sizeBytes ||
      sha256Hex(object.bytes) !== descriptor.sha256 ||
      object.contentType !== descriptor.contentType
    ) {
      throw new Error("Package object bytes, MIME type or checksum do not match the manifest.");
    }
  }

  let uploadedObjectCount = 0;
  let reusedObjectCount = 0;
  for (const [key, descriptor] of expected) {
    const object = provided.get(key)!;
    const result = await ensureImmutableObject(store, key, object.bytes, descriptor.sha256, descriptor.contentType);
    if (result === "uploaded") uploadedObjectCount++;
    else reusedObjectCount++;
  }

  const manifestKey = lessonManifestObjectKey(manifest.lessonId, manifest.versionId);
  const manifestBytes = new TextEncoder().encode(canonicalLessonPackageJson(manifest));
  const manifestSha256 = sha256Hex(manifestBytes);
  const manifestResult = await ensureImmutableObject(store, manifestKey, manifestBytes, manifestSha256, "application/json");
  if (manifestResult === "uploaded") uploadedObjectCount++;
  else reusedObjectCount++;

  return {
    manifestKey,
    manifestSha256: lessonPackageManifestHash(manifest),
    manifestSizeBytes: manifestBytes.byteLength,
    uploadedObjectCount,
    reusedObjectCount,
  };
}
