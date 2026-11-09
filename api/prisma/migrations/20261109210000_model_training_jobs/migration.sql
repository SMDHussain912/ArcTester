CREATE TABLE "ModelTrainingJob" (
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

CREATE INDEX "ModelTrainingJob_status_createdAt_idx" ON "ModelTrainingJob"("status", "createdAt");
CREATE INDEX "ModelTrainingJob_createdById_createdAt_idx" ON "ModelTrainingJob"("createdById", "createdAt");
CREATE INDEX "ModelTrainingJob_datasetId_createdAt_idx" ON "ModelTrainingJob"("datasetId", "createdAt");

ALTER TABLE "ModelTrainingJob"
ADD CONSTRAINT "ModelTrainingJob_datasetId_fkey"
FOREIGN KEY ("datasetId") REFERENCES "ModelDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ModelTrainingJob"
ADD CONSTRAINT "ModelTrainingJob_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
