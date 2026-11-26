ALTER TABLE "Question"
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'DRAFT';

CREATE INDEX "Question_reviewStatus_subjectId_idx"
ON "Question"("reviewStatus", "subjectId");
