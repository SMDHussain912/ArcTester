CREATE TABLE "ModelDriftBucket" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "featureName" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ModelDriftBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelDriftBucket_modelId_version_featureName_bucket_periodStart_key"
    ON "ModelDriftBucket"("modelId", "version", "featureName", "bucket", "periodStart");

CREATE INDEX "ModelDriftBucket_modelId_version_periodStart_idx"
    ON "ModelDriftBucket"("modelId", "version", "periodStart");
