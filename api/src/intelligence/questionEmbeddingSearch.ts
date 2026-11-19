import type { PrismaClient } from "@prisma/client";
import { QuestionVectorIndex, type QuestionEmbeddingEncoder } from "./questionEmbeddings.js";

export interface PersistedQuestionSearchOptions {
  subject?: string;
  limit?: number;
  candidateLimit?: number;
}

/**
 * Searches a bounded candidate window from persistent storage. This avoids
 * loading the full embedding table into every request or API process.
 */
export async function searchPersistedQuestionEmbeddings(
  db: Pick<PrismaClient, "questionEmbedding">,
  query: string,
  encoder: QuestionEmbeddingEncoder,
  options: PersistedQuestionSearchOptions = {},
) {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3 || normalizedQuery.length > 1000) {
    throw new Error("Semantic search query must contain 3 to 1,000 characters.");
  }
  const candidateLimit = options.candidateLimit ?? 500;
  if (!Number.isInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > 500) {
    throw new Error("Semantic search candidateLimit must be from 1 to 500.");
  }
  const records = await db.questionEmbedding.findMany({
    where: {
      embeddingModel: encoder.modelName,
      embeddingVersion: encoder.modelVersion,
      ...(options.subject ? { question: { subject: { name: options.subject } } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: candidateLimit,
    include: {
      question: {
        select: {
          id: true, text: true,
          subject: { select: { name: true } },
          topic: { select: { name: true } },
        },
      },
    },
  });
  const index = new QuestionVectorIndex();
  for (const record of records) {
    let vector: unknown;
    try { vector = JSON.parse(record.embeddingJson); }
    catch { continue; }
    if (!Array.isArray(vector) || !vector.every((value) => typeof value === "number" && Number.isFinite(value))) continue;
    try {
      index.upsert({
        questionId: record.questionId,
        embedding: vector as number[],
        embeddingModel: record.embeddingModel,
        embeddingVersion: record.embeddingVersion,
        sourceHash: record.sourceHash,
      });
    } catch { /* Ignore corrupt or obsolete vectors; report only valid matches. */ }
  }
  const queryVector = await encoder.encode(normalizedQuery);
  const result = index.search(queryVector, { limit: options.limit ?? 10 });
  const questionById = new Map(records.map((record) => [record.questionId, record.question]));
  return {
    ...result,
    candidateCount: records.length,
    candidateLimit,
    truncated: records.length === candidateLimit,
    matches: result.matches.map((match) => ({
      ...match,
      question: questionById.get(match.questionId) ?? null,
    })),
  };
}
