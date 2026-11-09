ALTER TABLE "RegisteredModel" ADD COLUMN "trainingDatasetId" TEXT;

CREATE TABLE "ModelDriftBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "featureName" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX "ModelDriftBucket_modelId_version_featureName_bucket_periodStart_key"
ON "ModelDriftBucket"("modelId", "version", "featureName", "bucket", "periodStart");

CREATE INDEX "ModelDriftBucket_modelId_version_periodStart_idx"
ON "ModelDriftBucket"("modelId", "version", "periodStart");
