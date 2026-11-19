import { describe, expect, it, vi } from "vitest";
import { persistAdaptiveSelection, recordAdaptiveAnswerOutcome } from "./adaptiveDecisionPersistence.js";
import type { AdaptiveSelection } from "./adaptiveQuestionSelector.js";

const selection: AdaptiveSelection = {
  rankedQuestionIds: ["12", "13"],
  scores: [2.4, 1.8],
  reasons: [
    { questionId: "12", reasonCode: "WEAK_TOPIC" },
    { questionId: "13", reasonCode: "NOVELTY" },
  ],
  policyVersion: 3,
  fallbackUsed: false,
};

type MockDatabase = {
  adaptiveDecisionLog: {
    createMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

function database(): MockDatabase {
  return {
    adaptiveDecisionLog: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

const persistenceDb = (db: MockDatabase) =>
  db as unknown as Parameters<typeof persistAdaptiveSelection>[0];

describe("adaptive decision persistence", () => {
  it("stores selected questions with the full eligible set and privacy-safe learner grouping", async () => {
    const db = database();
    const result = await persistAdaptiveSelection(persistenceDb(db), {
      attemptId: 7,
      learnerGroupId: "a".repeat(64),
      eligibleQuestionIds: ["12", "13", "14"],
      stateFeatures: [0.42, 0.7, 3],
      selection,
      selectedAt: new Date("2026-11-19T12:00:00.000Z"),
    });

    expect(result).toEqual({ created: 2, skipped: 0 });
    const call = db.adaptiveDecisionLog.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toHaveLength(2);
    expect(call.data[0]).toMatchObject({
      attemptId: 7,
      learnerGroupId: "a".repeat(64),
      selectedQuestionId: 12,
      eligibleQuestionIdsJson: "[12,13,14]",
      policyVersion: 3,
      policyMode: "deterministic-top-k",
      reasonCode: "WEAK_TOPIC",
      selectionProbability: 1,
      outcomeStatus: "pending",
      reward: null,
    });
  });

  it("rejects raw identifiers, invalid question IDs and selected questions outside the eligible set", async () => {
    const db = database();
    await expect(persistAdaptiveSelection(db, {
      attemptId: 7, learnerGroupId: "student-42", eligibleQuestionIds: ["12"],
      stateFeatures: [1], selection, 
    })).rejects.toThrow("HMAC learner pseudonym");
    await expect(persistAdaptiveSelection(db, {
      attemptId: 7, learnerGroupId: "a".repeat(64), eligibleQuestionIds: ["12"],
      stateFeatures: [1], selection,
    })).rejects.toThrow("present in the eligible set");
    await expect(persistAdaptiveSelection(db, {
      attemptId: 7, learnerGroupId: "a".repeat(64), eligibleQuestionIds: ["not-an-id"],
      stateFeatures: [1], selection: { ...selection, rankedQuestionIds: [] , scores: [], reasons: [] },
    })).rejects.toThrow("positive database question IDs");
  });

  it("reports duplicate rows as skipped instead of duplicating decision history", async () => {
    const db = database();
    (db as any).adaptiveDecisionLog.createMany.mockResolvedValue({ count: 1 });
    const result = await persistAdaptiveSelection(db, {
      attemptId: 7, learnerGroupId: "b".repeat(64), eligibleQuestionIds: ["12", "13"],
      stateFeatures: [1], selection,
    });
    expect(result).toEqual({ created: 1, skipped: 1 });
  });

  it("records a correct or incorrect answer once and leaves unmatched decisions pending", async () => {
    const db = database();
    expect(await recordAdaptiveAnswerOutcome(persistenceDb(db), {
      attemptId: 7, questionId: 12, isCorrect: true,
    })).toBe(true);
    const call = (db as any).adaptiveDecisionLog.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ attemptId: 7, selectedQuestionId: 12, outcomeStatus: "pending" });
    expect(call.data).toMatchObject({ reward: 1, outcomeStatus: "observed" });

    (db as any).adaptiveDecisionLog.updateMany.mockResolvedValue({ count: 0 });
    expect(await recordAdaptiveAnswerOutcome(db, {
      attemptId: 7, questionId: 13, isCorrect: false,
    })).toBe(false);
    expect((db as any).adaptiveDecisionLog.updateMany.mock.calls[1][0].data.reward).toBe(0);
  });

  it("rejects invalid outcome identifiers", async () => {
    const db = database();
    await expect(recordAdaptiveAnswerOutcome(db, {
      attemptId: 0, questionId: 12, isCorrect: true,
    })).rejects.toThrow("outcome is invalid");
  });
});
