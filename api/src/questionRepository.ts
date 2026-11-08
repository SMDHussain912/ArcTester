import type { PrismaClient } from "@prisma/client";
import { encodeOptions, hashQuestion, normalizeText, type QuestionInput } from "./questions.js";

/** Insert one validated question. Returns "inserted" or "duplicate". */
export async function insertQuestion(
  db: PrismaClient,
  input: QuestionInput
): Promise<"inserted" | "duplicate"> {
  const questionHash = hashQuestion(input.text);
  const subjectName = input.subject.trim();
  const topicName = (input.topic ?? "General").trim() || "General";

  const subject = await db.subject.upsert({
    where: { name: subjectName },
    update: {},
    create: { name: subjectName },
  });

  const topic = await db.topic.upsert({
    where: { subjectId_name: { subjectId: subject.id, name: topicName } },
    update: {},
    create: { subjectId: subject.id, name: topicName },
  });

  try {
    await db.question.create({
      data: {
        subjectId: subject.id,
        topicId: topic.id,
        text: input.text.trim(),
        options: encodeOptions(input.options),
        correctIndex: input.correctIndex,
        explanation: input.explanation ?? "",
        source: input.source ?? "",
        difficulty: input.difficulty ?? "medium",
        questionHash,
      },
    });
    return "inserted";
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  // Prisma P2002 = unique constraint failed (works on SQLite too).
  if (record["code"] === "P2002") return true;
  const message = String(
    (record["meta"] as { message?: string } | undefined)?.message ?? record["message"] ?? ""
  );
  return (
    message.includes("UNIQUE constraint failed") || message.includes(normalizeText("questionHash"))
  );
}

export { normalizeText };
