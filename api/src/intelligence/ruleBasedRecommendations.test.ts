import { describe, expect, it } from "vitest";
import { buildRuleBasedRecommendations } from "./ruleBasedRecommendations.js";

const config = {
  minimumAnswers: 5,
  weakAccuracyThreshold: 0.6,
  recentPracticeDays: 7,
  now: Date.parse("2026-11-10T12:00:00.000Z"),
};

describe("buildRuleBasedRecommendations", () => {
  it("uses topic evidence first and reserves high priority for severe, sufficiently sampled gaps", () => {
    const result = buildRuleBasedRecommendations({
      ...config,
      topics: [
        { subject: "CSE", topic: "Moderate", seen: 10, correct: 5, wrong: 5, accuracy: 0.5 },
        { subject: "CSE", topic: "Severe", seen: 8, correct: 3, wrong: 5, accuracy: 0.375 },
      ],
      subjects: [{ subject: "CSE", topic: null, seen: 18, correct: 8, wrong: 10, accuracy: 8 / 18 }],
      recentActivity: [],
    });
    expect(result.recommendations[0]).toMatchObject({ topic: "Severe", priority: "high", mode: "practice" });
    expect(result.recommendations.find((item) => item.topic === "Moderate")?.priority).toBe("medium");
    expect(result.recommendations.some((item) => item.id.startsWith("revise-subject-"))).toBe(false);
  });

  it("uses subject-level recommendations when named topic evidence is unavailable", () => {
    const result = buildRuleBasedRecommendations({
      ...config,
      topics: [{ subject: "Mathematics", topic: null, seen: 8, correct: 2, wrong: 6, accuracy: 0.25 }],
      subjects: [{ subject: "Mathematics", topic: null, seen: 8, correct: 2, wrong: 6, accuracy: 0.25 }],
      recentActivity: [],
    });
    expect(result.recommendations).toMatchObject([
      expect.objectContaining({
        id: "revise-subject-Mathematics",
        title: "Revise Mathematics",
        subject: "Mathematics",
        topic: null,
        priority: "high",
        questionCount: 15,
      }),
      expect.objectContaining({ id: "review-subject-mistakes-Mathematics", mode: "mistakes", questionCount: 6 }),
    ]);
  });

  it("does not let a weak subject aggregate override sufficiently sampled healthy topics", () => {
    const result = buildRuleBasedRecommendations({
      ...config,
      topics: [
        { subject: "CSE", topic: "Arrays", seen: 10, correct: 8, wrong: 2, accuracy: 0.8 },
        { subject: "CSE", topic: "Trees", seen: 10, correct: 7, wrong: 3, accuracy: 0.7 },
      ],
      subjects: [{ subject: "CSE", topic: null, seen: 20, correct: 8, wrong: 12, accuracy: 0.4 }],
      recentActivity: [],
    });
    expect(result.recommendations).toEqual([]);
  });

  it("keeps subject fallback available for a different subject with no sampled topics", () => {
    const result = buildRuleBasedRecommendations({
      ...config,
      topics: [
        { subject: "CSE", topic: "Arrays", seen: 10, correct: 8, wrong: 2, accuracy: 0.8 },
        { subject: "Mathematics", topic: null, seen: 8, correct: 2, wrong: 6, accuracy: 0.25 },
      ],
      subjects: [
        { subject: "CSE", topic: null, seen: 10, correct: 8, wrong: 2, accuracy: 0.8 },
        { subject: "Mathematics", topic: null, seen: 8, correct: 2, wrong: 6, accuracy: 0.25 },
      ],
      recentActivity: [],
    });
    expect(result.recommendations[0]).toMatchObject({
      id: "revise-subject-Mathematics",
      subject: "Mathematics",
      topic: null,
    });
  });

  it("suppresses recently practiced weak topics and releases them after the cooldown", () => {
    const topic = { subject: "CSE", topic: "Graphs", seen: 10, correct: 3, wrong: 7, accuracy: 0.3 };
    const recentActivity = [{ subject: "CSE", topic: "Graphs", lastPracticedAt: new Date(config.now - 24 * 60 * 60 * 1000) }];
    const recent = buildRuleBasedRecommendations({
      ...config, topics: [topic], subjects: [], recentActivity,
    });
    expect(recent.recommendations).toEqual([]);
    expect(recent.recentlyPracticedWeakCount).toBe(1);

    const stale = buildRuleBasedRecommendations({
      ...config,
      topics: [topic],
      subjects: [],
      recentActivity: [{ ...recentActivity[0], lastPracticedAt: new Date(config.now - 8 * 24 * 60 * 60 * 1000) }],
    });
    expect(stale.recommendations[0]).toMatchObject({ topic: "Graphs", mode: "practice" });
  });

  it("caps topic plans at three areas and adds mistake review only when at least three answers are incorrect", () => {
    const topics = [
      { subject: "CSE", topic: "Arrays", seen: 10, correct: 2, wrong: 8, accuracy: 0.2 },
      { subject: "CSE", topic: "Trees", seen: 10, correct: 3, wrong: 7, accuracy: 0.3 },
      { subject: "CSE", topic: "Graphs", seen: 10, correct: 4, wrong: 6, accuracy: 0.4 },
      { subject: "CSE", topic: "Queues", seen: 10, correct: 5, wrong: 5, accuracy: 0.5 },
    ];
    const result = buildRuleBasedRecommendations({
      ...config, topics, subjects: [], recentActivity: [],
    });
    const practicePlans = result.recommendations.filter((item) => item.mode === "practice");
    const mistakePlans = result.recommendations.filter((item) => item.mode === "mistakes");
    expect(practicePlans).toHaveLength(3);
    expect(mistakePlans).toHaveLength(3);
    expect(practicePlans.some((item) => item.topic === "Queues")).toBe(false);
  });

  it("does not recommend an area before the minimum answered sample is reached", () => {
    const result = buildRuleBasedRecommendations({
      ...config,
      topics: [{ subject: "CSE", topic: "Trees", seen: 4, correct: 0, wrong: 4, accuracy: 0 }],
      subjects: [{ subject: "CSE", topic: null, seen: 4, correct: 0, wrong: 4, accuracy: 0 }],
      recentActivity: [],
    });
    expect(result.recommendations).toEqual([]);
  });
});
