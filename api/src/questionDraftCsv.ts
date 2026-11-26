import { parseCsv } from "./csv.js";

export type DraftCsvCatalog = Record<string, readonly string[]>;
export type DraftCsvIssue = { row: number; reason: string };

const required = ["subject", "topic", "text", "optiona", "optionb", "optionc", "optiond", "correctindex"] as const;

/** Validate content-review CSV without mutating or auto-creating taxonomy rows. */
export function validateQuestionDraftCsv(content: string, catalog: DraftCsvCatalog): DraftCsvIssue[] {
  let table;
  try { table = parseCsv(content); }
  catch (error) { return [{ row: 1, reason: error instanceof Error ? error.message : "Invalid CSV." }]; }
  const headers = table.headers.map((header) => header.toLowerCase());
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) return [{ row: 1, reason: "Missing columns: " + missing.join(", ") }];
  const col = (name: string) => headers.indexOf(name);
  const issues: DraftCsvIssue[] = [];
  const seen = new Set<string>();
  table.rows.forEach((cells, index) => {
    const row = index + 2;
    const get = (name: string) => (cells[col(name)] ?? "").trim();
    const subject = get("subject"), topic = get("topic") || "General", text = get("text");
    const options = ["optiona", "optionb", "optionc", "optiond"].map(get);
    const rawIndex = get("correctindex");
    const correctIndex = Number(rawIndex);
    if (!subject || !Object.prototype.hasOwnProperty.call(catalog, subject)) issues.push({ row, reason: "Subject does not exist in the catalog." });
    else if (!catalog[subject].includes(topic)) issues.push({ row, reason: "Topic does not exist under the selected subject." });
    if (!text) issues.push({ row, reason: "Question text is required." });
    if (options.some((option) => !option)) issues.push({ row, reason: "Exactly four non-empty options are required." });
    if (new Set(options.map((option) => option.toLocaleLowerCase())).size !== 4) issues.push({ row, reason: "Options must not contain duplicates." });
    if (!/^\d+$/.test(rawIndex) || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) issues.push({ row, reason: "correctIndex must be an integer from 0 through 3." });
    const identity = text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    if (identity && seen.has(identity)) issues.push({ row, reason: "Duplicate question text in this CSV batch." });
    if (identity) seen.add(identity);
  });
  return issues;
}
