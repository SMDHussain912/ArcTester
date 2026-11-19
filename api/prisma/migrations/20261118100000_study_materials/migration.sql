CREATE TABLE "StudyMaterial" (
    "id" TEXT NOT NULL,
    "uploadedById" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentBase64" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudyMaterial_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StudyMaterial_status_subject_title_idx" ON "StudyMaterial"("status", "subject", "title");
CREATE INDEX "StudyMaterial_uploadedById_createdAt_idx" ON "StudyMaterial"("uploadedById", "createdAt");
