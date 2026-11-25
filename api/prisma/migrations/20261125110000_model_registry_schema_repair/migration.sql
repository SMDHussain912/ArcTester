-- Repair model registry/evaluation tables for isolated schemas that have an
-- incomplete baseline migration history. Every statement is idempotent.
CREATE TABLE IF NOT EXISTS "RegisteredModel" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "algorithm" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "trainingDatasetId" TEXT,
    "artifactJson" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    CONSTRAINT "RegisteredModel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RegisteredModel_modelId_version_key"
ON "RegisteredModel"("modelId", "version");
CREATE INDEX IF NOT EXISTS "RegisteredModel_modelId_isActive_idx"
ON "RegisteredModel"("modelId", "isActive");
CREATE INDEX IF NOT EXISTS "RegisteredModel_createdAt_idx"
ON "RegisteredModel"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RegisteredModel_one_active_per_model"
ON "RegisteredModel"("modelId") WHERE "isActive" = TRUE;

CREATE TABLE IF NOT EXISTS "ModelRegistryAudit" (
    "id" TEXT NOT NULL,
    "actorId" INTEGER,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelRegistryAudit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ModelRegistryAudit_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ModelRegistryAudit_modelId_version_createdAt_idx"
ON "ModelRegistryAudit"("modelId", "version", "createdAt");
CREATE INDEX IF NOT EXISTS "ModelRegistryAudit_actorId_createdAt_idx"
ON "ModelRegistryAudit"("actorId", "createdAt");

CREATE TABLE IF NOT EXISTS "ModelEvaluation" (
    "id" TEXT NOT NULL,
    "actorId" INTEGER,
    "modelId" TEXT NOT NULL,
    "candidateVersion" INTEGER NOT NULL,
    "baselineVersion" INTEGER NOT NULL,
    "datasetId" TEXT NOT NULL DEFAULT '',
    "evaluationDataset" TEXT NOT NULL,
    "datasetFingerprint" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "metricsJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelEvaluation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ModelEvaluation_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ModelEvaluation_modelId_candidateVersion_evaluatedAt_idx"
ON "ModelEvaluation"("modelId", "candidateVersion", "evaluatedAt");
CREATE INDEX IF NOT EXISTS "ModelEvaluation_actorId_evaluatedAt_idx"
ON "ModelEvaluation"("actorId", "evaluatedAt");
