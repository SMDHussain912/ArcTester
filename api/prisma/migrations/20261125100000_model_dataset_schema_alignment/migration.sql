-- Repair model dataset availability in isolated and upgraded PostgreSQL schemas.
-- The baseline contains this table, but some migration-created schemas were missing
-- it while the training-job FK had resolved against another schema.
CREATE TABLE IF NOT EXISTS "ModelDataset" (
    "id" TEXT NOT NULL,
    "createdById" INTEGER,
    "name" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "targetColumn" TEXT NOT NULL DEFAULT 'target',
    "featureSchemaJson" TEXT NOT NULL,
    "samplesJson" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "sourceDescription" TEXT NOT NULL,
    "sourceAttested" BOOLEAN NOT NULL DEFAULT false,
    "datasetKind" TEXT NOT NULL DEFAULT 'synthetic',
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelDataset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ModelDataset_fingerprint_key"
ON "ModelDataset"("fingerprint");
CREATE INDEX IF NOT EXISTS "ModelDataset_name_createdAt_idx"
ON "ModelDataset"("name", "createdAt");
CREATE INDEX IF NOT EXISTS "ModelDataset_createdById_createdAt_idx"
ON "ModelDataset"("createdById", "createdAt");

-- Ensure the asynchronous job table exists in this schema as well.
CREATE TABLE IF NOT EXISTS "ModelTrainingJob" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "createdById" INTEGER,
    "modelId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL DEFAULT 42,
    "epochs" INTEGER NOT NULL DEFAULT 80,
    "batchSize" INTEGER NOT NULL DEFAULT 32,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "workerId" TEXT NOT NULL DEFAULT '',
    "leaseExpiresAt" TIMESTAMP(3),
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModelTrainingJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ModelTrainingJob_status_createdAt_idx" ON "ModelTrainingJob"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ModelTrainingJob_createdById_createdAt_idx" ON "ModelTrainingJob"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "ModelTrainingJob_datasetId_createdAt_idx" ON "ModelTrainingJob"("datasetId", "createdAt");

-- Make the training job dataset relation local to the configured Prisma schema.
ALTER TABLE "ModelTrainingJob"
DROP CONSTRAINT IF EXISTS "ModelTrainingJob_datasetId_fkey";
ALTER TABLE "ModelTrainingJob"
ADD CONSTRAINT "ModelTrainingJob_datasetId_fkey"
FOREIGN KEY ("datasetId") REFERENCES "ModelDataset"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ModelDataset"
ADD CONSTRAINT "ModelDataset_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
