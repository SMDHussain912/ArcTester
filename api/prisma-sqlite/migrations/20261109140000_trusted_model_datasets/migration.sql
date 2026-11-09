CREATE TABLE "ModelDataset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdById" INTEGER,
  "name" TEXT NOT NULL,
  "task" TEXT NOT NULL,
  "featureSchemaJson" TEXT NOT NULL,
  "samplesJson" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "sourceDescription" TEXT NOT NULL,
  "sourceAttested" BOOLEAN NOT NULL DEFAULT false,
  "fingerprint" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelDataset_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ModelDataset_fingerprint_key"
ON "ModelDataset"("fingerprint");
CREATE INDEX "ModelDataset_name_createdAt_idx"
ON "ModelDataset"("name", "createdAt");
CREATE INDEX "ModelDataset_createdById_createdAt_idx"
ON "ModelDataset"("createdById", "createdAt");
