import type { PrismaClient } from "@prisma/client";
import { parseCsv } from "./csv.js";
import { insertQuestion } from "./questionRepository.js";
import { BaseRowSchema, QuestionInputSchema, hashQuestion, type QuestionInput } from "./questions.js";

export type InvalidRow = { row: number; reason: string };
export type ImportReport = {
  added: number;
  duplicates: number;
  invalid: InvalidRow[];
  total: number;
};

export const MAX_QUESTION_IMPORT_ROWS = 2_000;

const CSV_COLUMNS = [
  "subject",
  "topic",
  "text",
  "optionA",
  "optionB",
  "optionC",
  "optionD",
  "correctIndex",
  "explanation",
  "source",
  "difficulty",
] as const;

function invalidRow(row: number, reason: string): InvalidRow {
  return { row, reason };
}

function describeIssue(error: unknown): string {
  if (typeof error === "object" && error !== null && "issues" in error) {
    const issues = (error as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`).join("; ");
  }
  return error instanceof Error ? error.message : "invalid row";
}

/** Import BASE/JSON rows: [subject, text, [A,B,C,D], correctIndex, explanation?]. Row numbers are 1-based. */
export async function importFromJson(db: PrismaClient, payload: unknown): Promise<ImportReport> {
  const parsed = BaseRowSchema.array().safeParse(payload);
  const report: ImportReport = {
    added: 0,
    duplicates: 0,
    invalid: [],
    total: Array.isArray(payload) ? payload.length : 0,
  };
  if (!parsed.success) {
    // Whole file is not a list: report every row as invalid generically.
    if (!Array.isArray(payload)) {
      report.invalid.push(invalidRow(0, "JSON must be a list of questions"));
      return report;
    }
    // Fall through to per-row validation below for a precise report.
  }
  const rows = Array.isArray(payload) ? payload : [];
  if (rows.length > MAX_QUESTION_IMPORT_ROWS) {
    report.invalid.push(invalidRow(0, `Import exceeds the ${MAX_QUESTION_IMPORT_ROWS}-question limit.`));
    return report;
  }
  const valid: { index: number; input: QuestionInput }[] = [];
  rows.forEach((raw, i) => {
    const rowNumber = i + 1;
    const single = BaseRowSchema.safeParse(raw);
    if (!single.success) {
      report.invalid.push(invalidRow(rowNumber, describeIssue(single.error)));
      return;
    }
    const [subject, text, options, correctIndex, explanation] = single.data;
    const checked = QuestionInputSchema.safeParse({
      subject,
      text,
      options,
      correctIndex,
      explanation: explanation ?? "",
      source: "json",
    });
    if (!checked.success) {
      report.invalid.push(invalidRow(rowNumber, describeIssue(checked.error)));
      return;
    }
    valid.push({ index: rowNumber, input: checked.data });
  });

  // One transaction: either all valid rows land, or none do.
  await db.$transaction(async (tx) => {
    for (const item of valid) {
      const outcome = await insertQuestion(tx as PrismaClient, item.input);
      if (outcome === "inserted") report.added += 1;
      else report.duplicates += 1;
    }
  });
  return report;
}

/** Import CSV text. Required columns: subject,text,optionA..optionD,correctIndex.
 * Optional: topic,explanation,source,difficulty. Row numbers count the header as row 1.
 */
export async function importFromCsv(db: PrismaClient, content: string): Promise<ImportReport> {
  const report: ImportReport = { added: 0, duplicates: 0, invalid: [], total: 0 };
  let table;
  try {
    table = parseCsv(content);
  } catch (error) {
    report.invalid.push(invalidRow(1, error instanceof Error ? error.message : "bad CSV"));
    return report;
  }
  if (table.rows.length > MAX_QUESTION_IMPORT_ROWS) {
    report.total = table.rows.length;
    report.invalid.push(invalidRow(1, `Import exceeds the ${MAX_QUESTION_IMPORT_ROWS}-question limit.`));
    return report;
  }
  const required = ["subject", "text", "optiona", "optionb", "optionc", "optiond", "correctindex"];
  const lower = table.headers.map((h) => h.toLowerCase());
  const missing = required.filter((c) => !lower.includes(c));
  if (missing.length > 0) {
    report.invalid.push(invalidRow(1, `missing columns: ${missing.join(", ")}`));
    return report;
  }
  const col = (name: string) => lower.indexOf(name);
  const valid: QuestionInput[] = [];
  table.rows.forEach((cells, i) => {
    const rowNumber = i + 2; // header is row 1
    report.total += 1;
    const get = (name: string) => (cells[col(name)] ?? "").trim();
    const correctRaw = get("correctindex");
    const correctIndex = Number(correctRaw);
    const checked = QuestionInputSchema.safeParse({
      subject: get("subject"),
      topic: get("topic") || "General",
      text: get("text"),
      options: [get("optiona"), get("optionb"), get("optionc"), get("optiond")],
      correctIndex: Number.isInteger(correctIndex) ? correctIndex : correctRaw,
      explanation: get("explanation"),
      source: get("source") || "csv",
      difficulty: get("difficulty") || "medium",
    });
    if (!checked.success) {
      report.invalid.push(invalidRow(rowNumber, describeIssue(checked.error)));
      return;
    }
    valid.push(checked.data);
  });

  await db.$transaction(async (tx) => {
    for (const input of valid) {
      const outcome = await insertQuestion(tx as PrismaClient, input);
      if (outcome === "inserted") report.added += 1;
      else report.duplicates += 1;
    }
  });
  return report;
}

export const CSV_COLUMN_DOC = CSV_COLUMNS.join(",");


export type ImportPreview = {
  valid: number;
  duplicates: number;
  invalid: InvalidRow[];
  total: number;
};

/** Validate an import without writing to the question bank. */
export async function previewImport(
  db: PrismaClient,
  format: "csv" | "json",
  payload: unknown
): Promise<ImportPreview> {
  const invalid: InvalidRow[] = [];
  const valid: QuestionInput[] = [];
  let total = 0;

  if (format === "json") {
    if (!Array.isArray(payload)) {
      return {
        valid: 0,
        duplicates: 0,
        invalid: [invalidRow(0, "JSON must be a list of questions")],
        total: 0,
      };
    }

    total = payload.length;
    if (total > MAX_QUESTION_IMPORT_ROWS) {
      return { valid: 0, duplicates: 0, invalid: [invalidRow(0, `Import exceeds the ${MAX_QUESTION_IMPORT_ROWS}-question limit.`)], total };
    }
    payload.forEach((raw, index) => {
      const parsed = BaseRowSchema.safeParse(raw);
      if (!parsed.success) {
        invalid.push(invalidRow(index + 1, describeIssue(parsed.error)));
        return;
      }

      const [subject, text, options, correctIndex, explanation] = parsed.data;
      const checked = QuestionInputSchema.safeParse({
        subject,
        text,
        options,
        correctIndex,
        explanation: explanation ?? "",
        source: "json",
      });

      if (!checked.success) {
        invalid.push(invalidRow(index + 1, describeIssue(checked.error)));
      } else {
        valid.push(checked.data);
      }
    });
  } else {
    let table;
    try {
      table = parseCsv(String(payload ?? ""));
    } catch (error) {
      return {
        valid: 0,
        duplicates: 0,
        invalid: [invalidRow(1, error instanceof Error ? error.message : "Invalid CSV")],
        total: 0,
      };
    }

    total = table.rows.length;
    if (total > MAX_QUESTION_IMPORT_ROWS) {
      return { valid: 0, duplicates: 0, invalid: [invalidRow(1, `Import exceeds the ${MAX_QUESTION_IMPORT_ROWS}-question limit.`)], total };
    }
    const required = [
      "subject",
      "text",
      "optiona",
      "optionb",
      "optionc",
      "optiond",
      "correctindex",
    ];
    const lower = table.headers.map((header) => header.toLowerCase());
    const missing = required.filter((column) => !lower.includes(column));
    if (missing.length) {
      return {
        valid: 0,
        duplicates: 0,
        invalid: [invalidRow(1, `Missing columns: ${missing.join(", ")}`)],
        total: 0,
      };
    }

    const col = (name: string) => lower.indexOf(name);
    table.rows.forEach((cells, index) => {
      const get = (name: string) => (cells[col(name)] ?? "").trim();
      const correctRaw = get("correctindex");
      const correctIndex = Number(correctRaw);
      const checked = QuestionInputSchema.safeParse({
        subject: get("subject"),
        topic: get("topic") || "General",
        text: get("text"),
        options: [get("optiona"), get("optionb"), get("optionc"), get("optiond")],
        correctIndex: Number.isInteger(correctIndex) ? correctIndex : correctRaw,
        explanation: get("explanation"),
        source: get("source") || "csv",
        difficulty: get("difficulty") || "medium",
      });

      if (!checked.success) {
        invalid.push(invalidRow(index + 2, describeIssue(checked.error)));
      } else {
        valid.push(checked.data);
      }
    });
  }

  const hashes = valid.map((input) => hashQuestion(input.text));
  const existing = hashes.length
    ? await db.question.findMany({
        where: { questionHash: { in: [...new Set(hashes)] } },
        select: { questionHash: true },
      })
    : [];
  const known = new Set(existing.map((question) => question.questionHash));
  const seen = new Set<string>();
  let duplicates = 0;

  for (const hash of hashes) {
    if (known.has(hash) || seen.has(hash)) {
      duplicates += 1;
    }
    seen.add(hash);
  }

  return {
    valid: valid.length - duplicates,
    duplicates,
    invalid,
    total,
  };
}
