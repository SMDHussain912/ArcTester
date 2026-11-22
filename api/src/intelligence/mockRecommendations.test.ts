import { describe, expect, it } from "vitest";
import { buildFullMockRecommendations, type MockAnswerEvidence } from "./mockRecommendations.js";

function paper(overrides: Partial<MockAnswerEvidence>[] = []): MockAnswerEvidence[] {
  return Array.from({ length: 200 }, (_, index) => ({
    subject: index < 100 ? "Mathematics" : "CSE",
    topic: index < 100 ? "Matrices" : "Data Structures",
    chosen: 0,
    isCorrect: index % 4 === 0,
    ...overrides[index],
  }));
}

describe("buildFullMockRecommendations", () => {
  it("recommends only sampled weak topics from an exact full mock", () => {
    const result = buildFullMockRecommendations({ answers: paper() });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ subject: "Mathematics", topic: "Matrices", priority: "medium", questionCount: 15 });
    expect(result[0].evidence).toMatchObject({ answeredQuestions: 100, incorrectAnswers: 75, accuracy: 0.25, source: "completed-full-mock" });
  });

  it("does not accept partial mock data", () => {
    expect(buildFullMockRecommendations({ answers: paper().slice(0, 199) })).toEqual([]);
  });

  it("excludes unanswered questions from accuracy and sample size", () => {
    const answers = paper();
    for (let index = 0; index < 96; index += 1) answers[index].chosen = null;
    const result = buildFullMockRecommendations({ answers, minimumAnswers: 5 });
    const math = result.find(item => item.subject === "Mathematics");
    expect(math?.evidence.answeredQuestions).toBe(4);
    expect(result.some(item => item.subject === "Mathematics")).toBe(false);
  });

  it("uses subject fallback only when topic labels lack sufficient sample", () => {
    const answers = paper().map((item, index) => index < 100 ? { ...item, topic: null } : item);
    const result = buildFullMockRecommendations({ answers });
    expect(result.some(item => item.subject === "Mathematics" && item.topic === null)).toBe(true);
  });

  it("returns no recommendation when evidence is healthy or below threshold", () => {
    const answers = paper().map(item => ({ ...item, isCorrect: true }));
    expect(buildFullMockRecommendations({ answers })).toEqual([]);
  });
});
