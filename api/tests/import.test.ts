import { afterAll, describe, expect, it } from "vitest";
import { importFromCsv, importFromJson } from "../src/importService.js";
import { BASE_QUESTIONS } from "../prisma/baseQuestions.js";
import { closeTestDb, testDb } from "./setup.js";

afterAll(closeTestDb);

const VALID_JSON = [
  ["Maths", "What is 2 + 2?", ["3", "4", "5", "6"], 1, "Basic addition."],
  ["Physics", "SI unit of force is:", ["Joule", "Watt", "Newton", "Pascal"], 2, ""],
];

describe("importFromJson", () => {
  it("imports valid rows", async () => {
    const db = await testDb();
    const report = await importFromJson(db, VALID_JSON);
    expect(report).toMatchObject({ added: 2, duplicates: 0, total: 2 });
    expect(report.invalid).toHaveLength(0);
    expect(await db.question.count()).toBe(2);
  });

  it("skips duplicates by normalized hash (case/spacing-insensitive)", async () => {
    const db = await testDb();
    await importFromJson(db, VALID_JSON);
    const report = await importFromJson(db, [
      ["Maths", "  WHAT  is 2 + 2? ", ["3", "4", "5", "6"], 1, "dup"],
    ]);
    expect(report).toMatchObject({ added: 0, duplicates: 1, total: 1 });
    expect(await db.question.count()).toBe(2);
  });

  it("reports invalid rows with row numbers and reasons", async () => {
    const db = await testDb();
    const report = await importFromJson(db, [
      ["Maths", "Good question?", ["a", "b", "c", "d"], 0, ""],
      ["Maths", "Only three options?", ["a", "b", "c"], 0, ""],
      ["Maths", "Bad index?", ["a", "b", "c", "d"], 9, ""],
      ["", "", ["a", "b", "c", "d"], 0, ""],
    ]);
    expect(report.added).toBe(1);
    expect(report.invalid).toHaveLength(3);
    expect(report.invalid.map((r) => r.row)).toEqual([2, 3, 4]);
    expect(report.invalid.every((r) => r.reason.length > 0)).toBe(true);
  });

  it("seed is idempotent: running twice adds nothing", async () => {
    const db = await testDb();
    const first = await importFromJson(db, BASE_QUESTIONS);
    const second = await importFromJson(db, BASE_QUESTIONS);
    expect(first.added).toBe(28);
    expect(first.invalid).toHaveLength(0);
    expect(second).toMatchObject({ added: 0, duplicates: 28, total: 28 });
    expect(await db.question.count()).toBe(28);
  });
});

describe("importFromCsv", () => {
  const csv = [
    "subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty",
    'Maths,Algebra,"What is 2 + 2?",3,4,5,6,1,Basic addition.,csv,easy',
    'Physics,Units,"SI unit of force is:",Joule,Watt,Newton,Pascal,2,,csv,medium',
  ].join("\n");

  it("imports valid rows", async () => {
    const db = await testDb();
    const report = await importFromCsv(db, csv);
    expect(report).toMatchObject({ added: 2, duplicates: 0, total: 2 });
    expect(report.invalid).toHaveLength(0);
  });

  it("handles duplicates, invalid rows, and quoted commas", async () => {
    const db = await testDb();
    await importFromCsv(db, csv);
    const second = await importFromCsv(
      db,
      [
        "subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty",
        'Maths,Algebra,"What is 2 + 2?",3,4,5,6,1,dup,csv,easy',
        'Maths,Algebra,"Hello, world?",a,b,c,d,0,comma in quotes,csv,easy',
        "Maths,Algebra,Bad index?,a,b,c,d,7,,csv,easy",
        "Maths,Algebra,Missing options?,a,b,,,0,,csv,easy",
      ].join("\n")
    );
    expect(second.added).toBe(1);
    expect(second.duplicates).toBe(1);
    expect(second.invalid.map((r) => r.row)).toEqual([4, 5]);
    expect(await db.question.count()).toBe(3);
  });

  it("rejects a missing required column", async () => {
    const db = await testDb();
    const report = await importFromCsv(db, "subject,text\nMaths,hi");
    expect(report.added).toBe(0);
    expect(report.invalid[0].reason).toContain("missing columns");
  });
});
