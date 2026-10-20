import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { importFromCsv, importFromJson } from "../src/importService.js";
import { BASE_QUESTIONS } from "./baseQuestions.js";

const db = new PrismaClient();

const USAGE = `
Import questions into the bank from a CSV or JSON file.

  npm run import:questions --workspace=api -- <file>

The path is relative to the api/ folder (or use an absolute path).

Format is taken from the file extension:
  .csv  -> subject,text,optionA,optionB,optionC,optionD,correctIndex
           (optional: topic,explanation,source,difficulty)
  .json -> a list shaped like the legacy BASE array:
           [[subject, question, [A,B,C,D], correctIndex, explanation?]]

Examples:
  npm run import:questions --workspace=api -- prisma/questions-template.csv
  npm run import:questions --workspace=api -- /home/me/questions.csv

Run with no file to seed the starter bank instead.
`.trim();

/** Read + parse the file, then import it. Returns a human-readable summary. */
async function main(): Promise<void> {
  const file = process.argv[2];

  // No file -> seed the starter bank instead. Same code path as the seed
  // script, so it stays idempotent (duplicates are skipped).
  if (!file || file === "--help" || file === "-h") {
    console.log(USAGE);
    if (!file) {
      console.log("\nNo file given - seeding the starter bank instead.\n");
      const report = await importFromJson(db, BASE_QUESTIONS);
      console.log(summary("Seed", report));
    }
    return;
  }

  const path = resolve(file);
  const extension = extname(path).toLowerCase();
  if (extension !== ".csv" && extension !== ".json") {
    console.error(`Unsupported file type "${extension || "(none)"}". Use .csv or .json.`);
    process.exitCode = 1;
    return;
  }

  const content = await readFile(path, "utf8");
  const report =
    extension === ".csv"
      ? await importFromCsv(db, content)
      : await importFromJson(db, JSON.parse(content));

  console.log(summary(path, report));

  // Invalid rows are reported but do not fail the run: the valid rows are
  // already committed (imports are one transaction over the valid subset).
  if (report.invalid.length > 0) {
    console.log("\nInvalid rows:");
    for (const row of report.invalid.slice(0, 20)) {
      console.log(`  row ${row.row}: ${row.reason}`);
    }
    if (report.invalid.length > 20) {
      console.log(`  ... and ${report.invalid.length - 20} more`);
    }
  }
}

function summary(
  label: string,
  report: { added: number; duplicates: number; invalid: { row: number }[]; total: number }
): string {
  return [
    `${label}: ${report.added} added, ${report.duplicates} duplicates skipped, ` +
      `${report.invalid.length} invalid, ${report.total} rows read.`,
  ].join("\n");
}

main()
  .catch((error) => {
    console.error("Import failed. Check the file format and that the database is migrated.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
