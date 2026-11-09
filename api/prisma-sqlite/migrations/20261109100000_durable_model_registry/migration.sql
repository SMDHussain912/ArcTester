CREATE TABLE "RegisteredModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "algorithm" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "artifactJson" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" DATETIME,
    CONSTRAINT "RegisteredModel_modelId_version_key" UNIQUE ("modelId", "version")
);

CREATE INDEX "RegisteredModel_modelId_isActive_idx" ON "RegisteredModel"("modelId", "isActive");
CREATE INDEX "RegisteredModel_createdAt_idx" ON "RegisteredModel"("createdAt");
