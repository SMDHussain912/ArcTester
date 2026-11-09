-- Preserve the one-active-version invariant from the legacy SQLite migration.
-- Prisma schema cannot express a partial unique index, so this invariant is
-- maintained with this provider-specific migration.
UPDATE "RegisteredModel"
SET "isActive" = FALSE
WHERE "isActive" = TRUE
  AND "id" NOT IN (
    SELECT "id" FROM (
      SELECT "id",
        ROW_NUMBER() OVER (
          PARTITION BY "modelId"
          ORDER BY COALESCE("activatedAt", "createdAt") DESC, "version" DESC
        ) AS position
      FROM "RegisteredModel"
      WHERE "isActive" = TRUE
    ) ranked
    WHERE position = 1
  );

CREATE UNIQUE INDEX "RegisteredModel_one_active_per_model"
ON "RegisteredModel"("modelId")
WHERE "isActive" = TRUE;
