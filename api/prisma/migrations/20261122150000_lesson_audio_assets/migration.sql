CREATE TABLE "LessonAudioAsset" (
  "id" TEXT NOT NULL,
  "lessonDraftId" TEXT NOT NULL,
  "uploadedById" INTEGER NOT NULL,
  "sceneIndex" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "narrationHash" TEXT NOT NULL,
  "voice" TEXT NOT NULL DEFAULT 'unknown',
  "model" TEXT NOT NULL DEFAULT 'unknown',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonAudioAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonAudioAsset_lessonDraftId_fkey" FOREIGN KEY ("lessonDraftId") REFERENCES "LessonDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LessonAudioAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LessonAudioAsset_storagePath_key" ON "LessonAudioAsset"("storagePath");
CREATE UNIQUE INDEX "LessonAudioAsset_lessonDraftId_sceneIndex_key" ON "LessonAudioAsset"("lessonDraftId", "sceneIndex");
CREATE INDEX "LessonAudioAsset_lessonDraftId_narrationHash_idx" ON "LessonAudioAsset"("lessonDraftId", "narrationHash");
