-- Rule-based topic mastery, due-date spaced repetition, and durable badge unlocks.
CREATE TABLE "UserQuestionReview" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "questionId" INTEGER NOT NULL,
  "lastReviewedAt" TIMESTAMP(3),
  "nextReviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "intervalDays" INTEGER NOT NULL DEFAULT 0,
  "repetitions" INTEGER NOT NULL DEFAULT 0,
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "lastWasCorrect" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserQuestionReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserQuestionReview_userId_questionId_key" ON "UserQuestionReview"("userId", "questionId");
CREATE INDEX "UserQuestionReview_userId_nextReviewAt_idx" ON "UserQuestionReview"("userId", "nextReviewAt");
CREATE INDEX "UserQuestionReview_userId_lastReviewedAt_idx" ON "UserQuestionReview"("userId", "lastReviewedAt");
ALTER TABLE "UserQuestionReview" ADD CONSTRAINT "UserQuestionReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserQuestionReview" ADD CONSTRAINT "UserQuestionReview_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserBadge" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "badgeKey" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserBadge_userId_badgeKey_key" ON "UserBadge"("userId", "badgeKey");
CREATE INDEX "UserBadge_userId_unlockedAt_idx" ON "UserBadge"("userId", "unlockedAt");
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
