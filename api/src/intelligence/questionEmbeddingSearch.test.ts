import { describe, expect, it, vi } from "vitest";
import { searchPersistedQuestionEmbeddings } from "./questionEmbeddingSearch.js";
import type { QuestionEmbeddingEncoder } from "./questionEmbeddings.js";

const vector = (first: number, second = 0) => {
  const values = new Array(384).fill(0);
  values[0] = first;
  values[1] = second;
  return values;
};

describe("persisted question embedding search", () => {
  it("searches only a bounded, model-version-matched candidate window", async () => {
    const encoder: QuestionEmbeddingEncoder = {
      modelName: "test-encoder@v1",
      modelVersion: 1,
      encode: vi.fn(async () => vector(1)),
    };
    const rows = [
      {
        questionId: 11,
        embeddingJson: JSON.stringify(vector(1)),
        embeddingModel: encoder.modelName,
        embeddingVersion: 1,
        sourceHash: "a".repeat(64),
        updatedAt: new Date(),
        question: { id: 11, text: "Queue front removal", subject: { name: "Computer Science" }, topic: { name: "Queues" } },
      },
      {
        questionId: 12,
        embeddingJson: JSON.stringify(vector(0, 1)),
        embeddingModel: encoder.modelName,
        embeddingVersion: 1,
        sourceHash: "b".repeat(64),
        updatedAt: new Date(),
        question: { id: 12, text: "Stack push operation", subject: { name: "Computer Science" }, topic: { name: "Stacks" } },
      },
    ];
    const findMany = vi.fn(async (args: { take: number; where: { embeddingModel: string; embeddingVersion: number; question?: unknown } }) => {
      expect(args.take).toBe(2);
      expect(args.where).toMatchObject({
        embeddingModel: encoder.modelName,
        embeddingVersion: 1,
        question: { subject: { name: "Computer Science" } },
      });
      return rows;
    });
    const db = { questionEmbedding: { findMany } } as never;
    const result = await searchPersistedQuestionEmbeddings(db, "queue removal from front", encoder, {
      subject: "Computer Science",
      limit: 1,
      candidateLimit: 2,
    });
    expect(findMany).toHaveBeenCalledOnce();
    expect(result.candidateCount).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.matches).toMatchObject([{
      questionId: 11,
      similarity: 1,
      relation: "POSSIBLE_DUPLICATE",
      question: { text: "Queue front removal", topic: { name: "Queues" } },
    }]);
  });

  it("skips corrupt stored vectors and rejects malformed queries", async () => {
    const encoder: QuestionEmbeddingEncoder = {
      modelName: "test-encoder@v1", modelVersion: 1, encode: vi.fn(async () => vector(1)),
    };
    const db = { questionEmbedding: { findMany: vi.fn(async () => [{
      questionId: 1, embeddingJson: "{bad-json", embeddingModel: encoder.modelName,
      embeddingVersion: 1, sourceHash: "c".repeat(64), updatedAt: new Date(),
      question: { id: 1, text: "bad", subject: { name: "CS" }, topic: { name: "General" } },
    }]) } } as never;
    const result = await searchPersistedQuestionEmbeddings(db, "valid search text", encoder);
    expect(result.matches).toEqual([]);
    await expect(searchPersistedQuestionEmbeddings(db, "  ", encoder)).rejects.toThrow("3 to 1,000");
    await expect(searchPersistedQuestionEmbeddings(db, "valid search text", encoder, { candidateLimit: 501 }))
      .rejects.toThrow("candidateLimit");
  });
});
