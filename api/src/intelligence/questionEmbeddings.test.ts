import { describe, expect, it } from "vitest";
import {
  buildQuestionEmbedding, QuestionVectorIndex, questionSourceHash,
  QUESTION_EMBEDDING_DIMENSIONS,
} from "./questionEmbeddings.js";

const vector = (index: number) => Array.from({ length: QUESTION_EMBEDDING_DIMENSIONS }, (_, i) => i === index ? 1 : 0);
const encoder = {
  modelName: "approved-multilingual-encoder",
  modelVersion: 1,
  encode: async (source: string) => source.includes("matrix") ? vector(0) : vector(1),
};

describe("question embedding index", () => {
  it("creates source-versioned embeddings through an injected encoder", async () => {
    const record = await buildQuestionEmbedding({
      questionId: 7, stem: "Find matrix determinant", subject: "Math", topic: "Matrices",
    }, encoder);
    expect(record.embedding).toHaveLength(384);
    expect(record.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.sourceHash).toBe(questionSourceHash("Math\nMatrices\nFind matrix determinant\n"));
  });

  it("indexes vectors and classifies similarity without treating it as probability", () => {
    const index = new QuestionVectorIndex();
    index.upsert({ questionId: 1, embedding: vector(0), embeddingModel: "m", embeddingVersion: 1, sourceHash: "a".repeat(64) });
    index.upsert({ questionId: 2, embedding: vector(1), embeddingModel: "m", embeddingVersion: 1, sourceHash: "b".repeat(64) });
    expect(index.search(vector(0), { limit: 5, excludeQuestionIds: [1] }).matches[0]).toMatchObject({
      questionId: 2, similarity: 0, relation: "SEMANTICALLY_SIMILAR",
    });
    expect(index.size).toBe(2);
  });

  it("rejects invalid model output and invalid vector sizes", async () => {
    await expect(buildQuestionEmbedding({
      questionId: 2, stem: "Question text", subject: "Math", topic: "Algebra",
    }, { ...encoder, encode: async () => [1, 2] })).rejects.toThrow("384");
    const index = new QuestionVectorIndex();
    expect(() => index.search([1, 2])).toThrow("384");
  });
});
