import { PrismaClient } from "@prisma/client";
import { importFromJson } from "../src/importService.js";
import { BASE_QUESTIONS } from "./baseQuestions.js";

const db = new PrismaClient();

async function main() {
  // importFromJson is idempotent: the unique questionHash skips existing rows,
  // so running the seed twice adds nothing.
  const report = await importFromJson(db, BASE_QUESTIONS);
  console.log(
    `Seed complete: ${report.added} added, ${report.duplicates} duplicates skipped, ${report.invalid.length} invalid.`
  );
}

main()
  .catch((error) => {
    console.error("Seed failed. Check DATABASE_URL and run migrations first.");
    throw error;
  })
  .finally(async () => {
    await db.$disconnect();
  });
