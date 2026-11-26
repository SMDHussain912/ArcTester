CREATE TABLE "QuestionEmbedding" (
  "id" TEXT NOT NULL, "questionId" INTEGER NOT NULL, "embeddingJson" TEXT NOT NULL,
  "embeddingModel" TEXT NOT NULL, "embeddingVersion" INTEGER NOT NULL, "sourceHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionEmbedding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuestionEmbedding_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QuestionEmbedding_questionId_key" ON "QuestionEmbedding"("questionId");
CREATE INDEX "QuestionEmbedding_embeddingModel_embeddingVersion_idx" ON "QuestionEmbedding"("embeddingModel", "embeddingVersion");
CREATE INDEX "QuestionEmbedding_sourceHash_idx" ON "QuestionEmbedding"("sourceHash");
CREATE TABLE "QuestionEmbeddingJob" (
  "id" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED', "batchSize" INTEGER NOT NULL DEFAULT 16,
  "force" BOOLEAN NOT NULL DEFAULT FALSE, "progress" INTEGER NOT NULL DEFAULT 0, "total" INTEGER NOT NULL DEFAULT 0,
  "cursorQuestionId" INTEGER NOT NULL DEFAULT 0, "errorMessage" TEXT NOT NULL DEFAULT '',
  "workerId" TEXT NOT NULL DEFAULT '', "leaseExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionEmbeddingJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuestionEmbeddingJob_status_createdAt_idx" ON "QuestionEmbeddingJob"("status", "createdAt");
