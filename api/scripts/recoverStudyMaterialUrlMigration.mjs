import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const migrationName = "20261122130000_study_material_urls";
if (!process.env.DATABASE_URL) {
  console.log("No DATABASE_URL; skipping targeted failed-migration recovery.");
  process.exit(0);
}

const prisma = new PrismaClient();
try {
  const failed = await prisma.$queryRaw`
    SELECT "migration_name" AS "migrationName"
    FROM "_prisma_migrations"
    WHERE "migration_name" = ${migrationName}
      AND "finished_at" IS NULL
      AND "rolled_back_at" IS NULL
    LIMIT 1
  `;
  if (Array.isArray(failed) && failed.length > 0) {
    console.warn("Recovering the previously failed study-material URL migration as rolled back before retry.");
    execFileSync("npx", ["prisma", "migrate", "resolve", "--rolled-back", migrationName, "--schema", "prisma/schema.prisma"], { stdio: "inherit" });
  } else {
    console.log("No failed study-material URL migration needs recovery.");
  }
} catch (error) {
  // This is a narrowly scoped repair for one known migration. If it cannot run,
  // the subsequent migrate deploy remains the authoritative failure signal.
  console.warn("Targeted migration recovery could not run; Prisma migrate deploy will report the database state.", error instanceof Error ? error.message : String(error));
} finally {
  await prisma.$disconnect();
}
