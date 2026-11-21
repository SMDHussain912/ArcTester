CREATE TABLE "LessonDraft" (
  "id" TEXT NOT NULL,
  "createdById" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "sourceTitle" TEXT NOT NULL,
  "sourceText" TEXT NOT NULL,
  "scriptJson" TEXT NOT NULL,
  "storyboardJson" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LessonDraft_status_updatedAt_idx" ON "LessonDraft"("status", "updatedAt");
CREATE INDEX "LessonDraft_createdById_idx" ON "LessonDraft"("createdById");
