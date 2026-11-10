import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv.js";
import { QuestionInputSchema } from "../src/questions.js";

const csvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../content/question-drafts/java-programming.csv");
const table = parseCsv(readFileSync(csvPath, "utf8"));
const headers = table.headers.map((header) => header.toLowerCase());
const cell = (row: string[], name: string) => row[headers.indexOf(name.toLowerCase())] ?? "";

describe("Java Programming question draft batch", () => {
  it("contains 10 single-subject MCQs with four options, explanations, difficulty and NEEDS HUMAN REVIEW markers", () => {
    expect(table.rows).toHaveLength(10);
    expect(headers).toEqual(["subject", "topic", "text", "optiona", "optionb", "optionc", "optiond", "correctindex", "explanation", "source", "difficulty", "review_status"]);
    expect(new Set(table.rows.map((row) => cell(row, "subject")))).toEqual(new Set(["Java Programming"]));
    for (const row of table.rows) {
      const parsed = QuestionInputSchema.safeParse({
        subject: cell(row, "subject"), topic: cell(row, "topic"), text: cell(row, "text"),
        options: ["optionA", "optionB", "optionC", "optionD"].map((name) => cell(row, name)),
        correctIndex: Number(cell(row, "correctIndex")), explanation: cell(row, "explanation"),
        source: cell(row, "source"), difficulty: cell(row, "difficulty"),
      });
      expect(parsed.success).toBe(true);
      expect(cell(row, "explanation").trim().length).toBeGreaterThan(0);
      expect(cell(row, "source")).toBe("NEEDS HUMAN REVIEW");
      expect(cell(row, "review_status")).toBe("NEEDS HUMAN REVIEW");
      expect(Number(cell(row, "correctIndex"))).toBeGreaterThanOrEqual(0);
      expect(Number(cell(row, "correctIndex"))).toBeLessThanOrEqual(3);
    }
  });
});
