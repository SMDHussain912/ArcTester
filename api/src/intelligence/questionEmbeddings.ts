import { createHash } from "node:crypto";

export const QUESTION_EMBEDDING_DIMENSIONS = 384;
export interface QuestionEmbeddingEncoder {
  modelName: string;
  modelVersion: number;
  encode(text: string): Promise<number[]>;
}
export interface QuestionEmbeddingRecord {
  questionId: number;
  embedding: number[];
  embeddingModel: string;
  embeddingVersion: number;
  sourceHash: string;
}
export interface QuestionSearchMatch {
  questionId: number;
  similarity: number;
  relation: "SEMANTICALLY_SIMILAR" | "SAME_CONCEPT" | "POSSIBLE_DUPLICATE";
}
export interface QuestionSearchResult { matches: QuestionSearchMatch[]; indexVersion: number }
export function normalizeQuestionSource(input: {
  stem: string; subject: string; topic: string; approvedExplanation?: string | null;
}): string {
  const fields = [input.subject, input.topic, input.stem, input.approvedExplanation ?? ""]
    .map((value) => value.normalize("NFKC").replace(/\s+/g, " ").trim());
  if (fields[0].length === 0 || fields[1].length === 0 || fields[2].length < 3) {
    throw new Error("Question embedding source requires subject, topic and a question stem");
  }
  return fields.join("\n");
}
export function questionSourceHash(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}
function validateVector(vector: number[]): void {
  if (vector.length !== QUESTION_EMBEDDING_DIMENSIONS ||
    vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`Question embeddings must contain exactly ${QUESTION_EMBEDDING_DIMENSIONS} finite values`);
  }
  if (Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) < 1e-12) {
    throw new Error("Question embedding cannot be a zero vector");
  }
}
function cosine(left: number[], right: number[]): number {
  let dot = 0, leftNorm = 0, rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
export async function buildQuestionEmbedding(
  question: { questionId: number; stem: string; subject: string; topic: string; approvedExplanation?: string | null },
  encoder: QuestionEmbeddingEncoder,
): Promise<QuestionEmbeddingRecord> {
  if (!Number.isInteger(question.questionId) || question.questionId <= 0 ||
    !encoder.modelName.trim() || !Number.isInteger(encoder.modelVersion) || encoder.modelVersion < 1) {
    throw new Error("Question embedding identity or encoder metadata is invalid");
  }
  const source = normalizeQuestionSource(question);
  const embedding = await encoder.encode(source);
  validateVector(embedding);
  return {
    questionId: question.questionId, embedding: [...embedding],
    embeddingModel: encoder.modelName, embeddingVersion: encoder.modelVersion,
    sourceHash: questionSourceHash(source),
  };
}

/** Long-lived API-worker index; load/update it on content changes, not per request. */
export class QuestionVectorIndex {
  private records = new Map<number, QuestionEmbeddingRecord>();
  private version = 1;
  upsert(record: QuestionEmbeddingRecord): void {
    if (!Number.isInteger(record.questionId) || record.questionId <= 0 ||
      !/^[a-f0-9]{64}$/.test(record.sourceHash)) throw new Error("Question embedding record metadata is invalid");
    validateVector(record.embedding);
    this.records.set(record.questionId, { ...record, embedding: [...record.embedding] });
    this.version += 1;
  }
  remove(questionId: number): boolean {
    const removed = this.records.delete(questionId);
    if (removed) this.version += 1;
    return removed;
  }
  search(vector: number[], options: { limit?: number; excludeQuestionIds?: number[]; subjectQuestionIds?: number[] } = {}): QuestionSearchResult {
    validateVector(vector);
    const limit = options.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Question search limit must be from 1 to 50");
    const excluded = new Set(options.excludeQuestionIds ?? []);
    const allowed = options.subjectQuestionIds ? new Set(options.subjectQuestionIds) : null;
    const matches = [...this.records.values()]
      .filter((record) => !excluded.has(record.questionId) && (!allowed || allowed.has(record.questionId)))
      .map((record) => ({ questionId: record.questionId, similarity: cosine(vector, record.embedding) }))
      .sort((a, b) => b.similarity - a.similarity || a.questionId - b.questionId)
      .slice(0, limit)
      .map((item) => ({
        ...item,
        relation: item.similarity >= 0.96 ? "POSSIBLE_DUPLICATE" as const :
          item.similarity >= 0.82 ? "SAME_CONCEPT" as const : "SEMANTICALLY_SIMILAR" as const,
      }));
    return { matches, indexVersion: this.version };
  }
  get size(): number { return this.records.size; }
}
