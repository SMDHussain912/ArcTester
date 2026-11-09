CREATE TABLE "ModelEvaluation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" INTEGER,
  "modelId" TEXT NOT NULL,
  "candidateVersion" INTEGER NOT NULL,
  "baselineVersion" INTEGER NOT NULL,
  "evaluationDataset" TEXT NOT NULL,
  "datasetFingerprint" TEXT NOT NULL,
  "sampleCount" INTEGER NOT NULL,
  "metricsJson" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "evaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelEvaluation_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ModelEvaluation_modelId_candidateVersion_evaluatedAt_idx"
ON "ModelEvaluation"("modelId", "candidateVersion", "evaluatedAt");
CREATE INDEX "ModelEvaluation_actorId_evaluatedAt_idx"
ON "ModelEvaluation"("actorId", "evaluatedAt");
