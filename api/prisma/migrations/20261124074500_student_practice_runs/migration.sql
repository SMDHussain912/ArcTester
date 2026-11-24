CREATE TABLE "StudentPracticeRun" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "practiceSetId" TEXT,
  "titleSnapshot" TEXT NOT NULL,
  "totalQuestions" INTEGER NOT NULL,
  "answeredCount" INTEGER NOT NULL,
  "correctCount" INTEGER NOT NULL,
  "percentage" DOUBLE PRECISION NOT NULL,
  "answers" JSONB NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentPracticeRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StudentPracticeRun_userId_completedAt_idx" ON "StudentPracticeRun"("userId","completedAt");
CREATE INDEX "StudentPracticeRun_practiceSetId_idx" ON "StudentPracticeRun"("practiceSetId");
ALTER TABLE "StudentPracticeRun" ADD CONSTRAINT "StudentPracticeRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentPracticeRun" ADD CONSTRAINT "StudentPracticeRun_practiceSetId_fkey" FOREIGN KEY ("practiceSetId") REFERENCES "StudentPracticeSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
