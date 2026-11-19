import { describe, expect, it } from "vitest";
import { createAdaptiveDecisionLog, selectAdaptiveQuestions } from "./adaptiveQuestionSelector.js";

const candidates = [
  { questionId: "q1", subject: "Math", topic: "Matrices", difficulty: 3, exposureCount: 2 },
  { questionId: "q2", subject: "Math", topic: "Matrices", difficulty: 2, exposureCount: 0 },
  { questionId: "q3", subject: "Science", topic: "Physics", difficulty: 4, exposureCount: 0 },
  { questionId: "q4", subject: "Math", topic: "Algebra", difficulty: 3, exposureCount: 1 },
];

describe("adaptive question selection policy", () => {
  it("prioritizes weak topics and novelty while respecting filters and no-repeat rules", () => {
    const result = selectAdaptiveQuestions({
      candidates,
      topicStates: [{ subject: "Math", topic: "Matrices", accuracy: 0.3, answered: 12, exposureCount: 5 }],
      questionCount: 3, subjects: ["Math"], targetDifficulty: 3,
      excludedQuestionIds: ["q1"], now: "2026-11-19T10:00:00Z",
    });
    expect(result.rankedQuestionIds).toContain("q2");
    expect(result.rankedQuestionIds).not.toContain("q1");
    expect(result.rankedQuestionIds).not.toContain("q3");
    expect(new Set(result.rankedQuestionIds).size).toBe(result.rankedQuestionIds.length);
    expect(result.reasons[0]?.reasonCode).toBe("WEAK_TOPIC");
  });

  it("returns deterministic results and indicates candidate shortages", () => {
    const request = { candidates, topicStates: [], questionCount: 5, recentQuestionIds: ["q1", "q2", "q3"] };
    expect(selectAdaptiveQuestions(request)).toEqual(selectAdaptiveQuestions(request));
    expect(selectAdaptiveQuestions(request).fallbackUsed).toBe(true);
  });

  it("creates propensity-logged decisions without learner identifiers", () => {
    const record = createAdaptiveDecisionLog({
      learnerGroupId: "a".repeat(64), selectedQuestionId: "q1", eligibleQuestionIds: ["q1", "q2"],
      selectedPropensity: 0.5, stateFeatures: [0.4, 3, 2], policyVersion: 1,
    });
    expect(record.reward).toBeNull();
    expect(record.outcomeStatus).toBe("pending");
    expect(() => createAdaptiveDecisionLog({
      learnerGroupId: "raw-user-id", selectedQuestionId: "q1", eligibleQuestionIds: ["q1"],
      selectedPropensity: 1, stateFeatures: [1], policyVersion: 1,
    })).toThrow("HMAC learner pseudonym");
  });
});
