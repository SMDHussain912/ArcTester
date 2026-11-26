CREATE TABLE "QuestionEmbedding" (
  "id" TEXT NOT NULL PRIMARY KEY, "questionId" INTEGER NOT NULL UNIQUE, "embeddingJson" TEXT NOT NULL,
  "embeddingModel" TEXT NOT NULL, "embeddingVersion" INTEGER NOT NULL, "sourceHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "QuestionEmbedding_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "QuestionEmbedding_embeddingModel_embeddingVersion_idx" ON "QuestionEmbedding"("embeddingModel", "embeddingVersion");
CREATE INDEX "QuestionEmbedding_sourceHash_idx" ON "QuestionEmbedding"("sourceHash");
CREATE TABLE "QuestionEmbeddingJob" (
  "id" TEXT NOT NULL PRIMARY KEY, "status" TEXT NOT NULL DEFAULT 'QUEUED', "batchSize" INTEGER NOT NULL DEFAULT 16,
  "force" BOOLEAN NOT NULL DEFAULT 0, "progress" INTEGER NOT NULL DEFAULT 0, "total" INTEGER NOT NULL DEFAULT 0,
  "cursorQuestionId" INTEGER NOT NULL DEFAULT 0, "errorMessage" TEXT NOT NULL DEFAULT '',
  "workerId" TEXT NOT NULL DEFAULT '', "leaseExpiresAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" DATETIME,
  "completedAt" DATETIME, "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "QuestionEmbeddingJob_status_createdAt_idx" ON "QuestionEmbeddingJob"("status", "createdAt");
