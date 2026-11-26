-- Immutable static lesson package versions. Legacy LessonDraft rows remain readable
-- with a NULL activeVersionId until a verified R2 version is published/backfilled.
CREATE TABLE "LessonVersion" (
  "id" TEXT NOT NULL,
  "lessonDraftId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "packageSchemaVersion" INTEGER NOT NULL,
  "manifestKey" TEXT,
  "manifestSha256" TEXT,
  "manifestSizeBytes" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'UPLOADING',
  "validationJson" TEXT NOT NULL DEFAULT '{}',
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "LessonVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonVersion_lessonDraftId_fkey" FOREIGN KEY ("lessonDraftId") REFERENCES "LessonDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LessonVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LessonVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "LessonVersion_schema_check" CHECK ("packageSchemaVersion" > 0),
  CONSTRAINT "LessonVersion_status_check" CHECK ("status" IN ('UPLOADING', 'READY', 'FAILED', 'RETIRED')),
  CONSTRAINT "LessonVersion_manifest_size_check" CHECK ("manifestSizeBytes" IS NULL OR "manifestSizeBytes" BETWEEN 1 AND 1048576)
);
CREATE UNIQUE INDEX "LessonVersion_lessonDraftId_version_key" ON "LessonVersion"("lessonDraftId", "version");
CREATE INDEX "LessonVersion_lessonDraftId_status_version_idx" ON "LessonVersion"("lessonDraftId", "status", "version");

CREATE TABLE "LessonVersionAsset" (
  "id" TEXT NOT NULL,
  "lessonVersionId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "sceneId" TEXT,
  "role" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "durationMs" INTEGER,
  "locale" TEXT,
  "narrationHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonVersionAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonVersionAsset_lessonVersionId_fkey" FOREIGN KEY ("lessonVersionId") REFERENCES "LessonVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LessonVersionAsset_size_check" CHECK ("sizeBytes" > 0),
  CONSTRAINT "LessonVersionAsset_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "LessonVersionAsset_duration_check" CHECK ("durationMs" IS NULL OR "durationMs" > 0),
  CONSTRAINT "LessonVersionAsset_role_check" CHECK ("role" IN ('SCENE', 'AUDIO', 'IMAGE', 'VECTOR', 'CAPTION', 'PACKAGE'))
);
CREATE UNIQUE INDEX "LessonVersionAsset_lessonVersionId_assetId_key" ON "LessonVersionAsset"("lessonVersionId", "assetId");
CREATE UNIQUE INDEX "LessonVersionAsset_objectKey_key" ON "LessonVersionAsset"("objectKey");
CREATE INDEX "LessonVersionAsset_lessonVersionId_sceneId_idx" ON "LessonVersionAsset"("lessonVersionId", "sceneId");

ALTER TABLE "LessonDraft" ADD COLUMN "activeVersionId" TEXT;
ALTER TABLE "LessonDraft" ADD CONSTRAINT "LessonDraft_activeVersionId_fkey"
  FOREIGN KEY ("activeVersionId") REFERENCES "LessonVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce that one version cannot be active for multiple lesson drafts.
CREATE UNIQUE INDEX "LessonDraft_activeVersionId_key" ON "LessonDraft"("activeVersionId");
