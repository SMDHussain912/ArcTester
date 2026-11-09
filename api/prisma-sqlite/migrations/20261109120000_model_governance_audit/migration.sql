-- Keep the most recently activated active version if older data contains duplicates.
UPDATE "RegisteredModel"
SET "isActive" = false
WHERE "isActive" = true
  AND "id" NOT IN (
    SELECT "id" FROM (
      SELECT "id",
        ROW_NUMBER() OVER (
          PARTITION BY "modelId"
          ORDER BY COALESCE("activatedAt", "createdAt") DESC, "version" DESC
        ) AS position
      FROM "RegisteredModel"
      WHERE "isActive" = true
    )
    WHERE position = 1
  );

CREATE UNIQUE INDEX "RegisteredModel_one_active_per_model"
ON "RegisteredModel"("modelId")
WHERE "isActive" = true;

CREATE TABLE "ModelRegistryAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" INTEGER,
  "modelId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelRegistryAudit_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ModelRegistryAudit_modelId_version_createdAt_idx"
ON "ModelRegistryAudit"("modelId", "version", "createdAt");
CREATE INDEX "ModelRegistryAudit_actorId_createdAt_idx"
ON "ModelRegistryAudit"("actorId", "createdAt");
