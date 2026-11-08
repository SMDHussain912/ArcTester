import { createHash } from "node:crypto";
import { z } from "zod";

// Validated strings instead of Prisma enums: SQLite has no enum type, and
// keeping these as strings avoids a second source of truth. Zod is the guard.

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const IMPORT_SOURCES = ["base", "json", "csv"] as const;

export const OptionsSchema = z
  .array(z.string().trim().min(1, "each option must be non-empty"))
  .length(4, "exactly 4 options are required");

export const QuestionInputSchema = z.object({
  subject: z.string().trim().min(1, "subject is required"),
  topic: z.string().trim().min(1).optional().default("General"),
  text: z.string().trim().min(1, "question text is required"),
  options: OptionsSchema,
  correctIndex: z.number().int().min(0).max(3, "correctIndex must be 0-3"),
  explanation: z.string().default(""),
  source: z.string().default(""),
  difficulty: z.enum(DIFFICULTIES).default("medium"),
});

export type QuestionInput = z.infer<typeof QuestionInputSchema>;

/** BASE-array row: [subject, text, [4 options], correctIndex, explanation?] */
export const BaseRowSchema = z
  .tuple([
    z.string().trim().min(1),
    z.string().trim().min(1),
    OptionsSchema,
    z.number().int().min(0).max(3),
    z.string().optional().default(""),
  ])
  .rest(z.unknown());

export const JsonImportSchema = z.array(BaseRowSchema).min(1, "JSON must be a non-empty list");

/** Collapse "  extra   spaces " -> "extra spaces", then lowercase. */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Stable unique key for duplicate detection. */
export function hashQuestion(text: string): string {
  return createHash("sha256").update(normalizeText(text)).digest("hex");
}

/** Storage form: JSON string of the 4 options (SQLite has no array column). */
export function encodeOptions(options: string[]): string {
  return JSON.stringify(options);
}

export function decodeOptions(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  return OptionsSchema.parse(parsed);
}
