CREATE TABLE "AdaptiveDecisionLog" (
  "id" TEXT NOT NULL PRIMARY KEY, "attemptId" INTEGER NOT NULL, "learnerGroupId" TEXT NOT NULL,
  "selectedQuestionId" INTEGER NOT NULL, "eligibleQuestionIdsJson" TEXT NOT NULL,
  "selectionProbability" REAL NOT NULL DEFAULT 1, "stateFeaturesJson" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL, "policyMode" TEXT NOT NULL DEFAULT 'deterministic-top-k',
  "reasonCode" TEXT NOT NULL, "selectionScore" REAL NOT NULL,
  "selectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "reward" REAL,
  "outcomeStatus" TEXT NOT NULL DEFAULT 'pending', "outcomeAt" DATETIME,
  CONSTRAINT "AdaptiveDecisionLog_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdaptiveDecisionLog_attemptId_selectedQuestionId_key" ON "AdaptiveDecisionLog"("attemptId", "selectedQuestionId");
CREATE INDEX "AdaptiveDecisionLog_learnerGroupId_selectedAt_idx" ON "AdaptiveDecisionLog"("learnerGroupId", "selectedAt");
CREATE INDEX "AdaptiveDecisionLog_outcomeStatus_selectedAt_idx" ON "AdaptiveDecisionLog"("outcomeStatus", "selectedAt");
CREATE INDEX "AdaptiveDecisionLog_selectedQuestionId_selectedAt_idx" ON "AdaptiveDecisionLog"("selectedQuestionId", "selectedAt");
