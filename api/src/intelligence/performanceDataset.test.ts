import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildPerformanceDataset,
  type PerformanceDatasetAttempt,
  type PerformanceTopicAvailability,
} from "./performanceDataset.js";

const baseTime = Date.UTC(2026, 0, 1);

function makeAttempt(
  id: number,
  userId: number,
  day: number,
  correctCount: number,
  options: { unansweredIndex?: number; overlapStart?: number } = {},
): PerformanceDatasetAttempt {
  const startedAt = new Date(baseTime + (options.overlapStart ?? day) * 24 * 60 * 60 * 1000);
  const finishedAt = new Date(startedAt.getTime() + 60 * 60 * 1000);
  return {
    id,
    userId,
    startedAt,
    finishedAt,
    answers: Array.from({ length: 10 }, (_, index) => ({
      chosen: index === options.unansweredIndex ? null : 0,
      isCorrect: index < correctCount,
      subjectSnapshot: index < 5 ? "Mathematics" : "Computer Science",
      topicSnapshot: `Topic${index % 5}`,
    })),
  };
}

const topicAvailability: PerformanceTopicAvailability[] = [
  ...["Mathematics", "Computer Science"].flatMap((subjectName) =>
    Array.from({ length: 5 }, (_, index) => ({
      subjectName,
      topicName: `Topic${index}`,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    }))),
];

function learnerGroupId(userId: number): string {
  return createHash("sha256").update(`test-learner:${userId}`).digest("hex");
}

describe("point-in-time performance dataset builder", () => {
  it("uses only earlier completed attempts and keeps unanswered responses out of accuracy", () => {
    const attempts = [
      makeAttempt(1, 12345, 0, 1),
      makeAttempt(2, 12345, 1, 2),
      makeAttempt(3, 12345, 2, 3),
      makeAttempt(4, 12345, 3, 4, { unansweredIndex: 9 }),
      makeAttempt(5, 12345, 4, 9),
    ];
    const result = buildPerformanceDataset({
      attempts,
      subjects: ["Mathematics", "Computer Science", "Physics"],
      topicAvailability,
      learnerGroupId,
    });

    expect(result.samples).toHaveLength(2);
    const fourthAttempt = result.samples[0]!;
    expect(fourthAttempt.features).toMatchObject({
      completed_attempts: 3,
      previous_accuracy: 0.3,
      recent_accuracy_mean_3: 0.2,
      overall_accuracy_mean: 0.2,
      previous_question_count: 10,
      recent_accuracy_slope_3: 0.1,
      topic_coverage_ratio: 1,
      topic_coverage_ratio_missing: 0,
    });
    expect(fourthAttempt.features.days_since_last_attempt).toBeCloseTo(23 / 24, 5);
    expect(fourthAttempt.target).toBeCloseTo(4 / 9, 8);
    expect(fourthAttempt.unansweredCount).toBe(1);
    const physicsMissing = result.featureSchema.find((feature) =>
      feature.name.startsWith("subject_accuracy_physics_") && feature.name.endsWith("_missing"));
    expect(physicsMissing).toBeDefined();
    expect(fourthAttempt.features[physicsMissing!.name]).toBe(1);
    expect(JSON.stringify(result.samples)).not.toContain('"userId"');
    expect(JSON.stringify(result.samples)).not.toContain("12345");
  });

  it("does not use an overlapping attempt until it has actually finished", () => {
    const attempts = [
      makeAttempt(1, 8, 0, 5),
      makeAttempt(2, 8, 1, 6, { overlapStart: 0 }),
      makeAttempt(3, 8, 2, 7),
      makeAttempt(4, 8, 3, 8),
      makeAttempt(5, 8, 4, 9),
    ];
    const result = buildPerformanceDataset({
      attempts,
      subjects: ["Mathematics", "Computer Science"],
      topicAvailability,
      learnerGroupId,
    });
    const firstEligible = result.samples[0];
    expect(firstEligible).toBeDefined();
    expect(firstEligible!.features.completed_attempts).toBe(3);
    expect(firstEligible!.features.previous_accuracy).toBe(0.7);
  });

  it("requires keyed learner pseudonyms and excludes attempts with no answered responses", () => {
    const unanswered = makeAttempt(4, 9, 3, 0);
    unanswered.answers = unanswered.answers.map((answer) => ({ ...answer, chosen: null }));
    const attempts = [
      makeAttempt(1, 9, 0, 2),
      makeAttempt(2, 9, 1, 3),
      makeAttempt(3, 9, 2, 4),
      unanswered,
      makeAttempt(5, 9, 4, 5),
    ];
    const result = buildPerformanceDataset({
      attempts,
      subjects: ["Mathematics", "Computer Science"],
      topicAvailability: [],
      learnerGroupId,
    });
    expect(result.metadata.excludedNoAnsweredAttempts).toBe(1);
    expect(result.metadata.unansweredResponses).toBe(0);
    expect(result.samples[0]?.features.topic_coverage_ratio).toBe(0);
    expect(result.samples[0]?.features.topic_coverage_ratio_missing).toBe(1);
    expect(() => buildPerformanceDataset({
      attempts,
      subjects: ["Mathematics"],
      topicAvailability: [],
      learnerGroupId: () => "raw-user-id",
    })).toThrow("keyed HMAC-SHA-256");
  });

  it("retains both improving and declining learner trajectories in a production-sized dataset", () => {
    const attempts: PerformanceDatasetAttempt[] = [];
    for (let learner = 1; learner <= 50; learner += 1) {
      for (let index = 0; index < 14; index += 1) {
        const improving = learner <= 25;
        const correctCount = improving
          ? 2 + Math.floor(index * 0.5)
          : 9 - Math.floor(index * 0.5);
        attempts.push(makeAttempt(learner * 100 + index, learner, index, correctCount));
      }
    }
    const result = buildPerformanceDataset({
      attempts,
      subjects: ["Mathematics", "Computer Science"],
      topicAvailability,
      learnerGroupId,
    });
    expect(result.metadata.sampleCount).toBe(550);
    expect(result.metadata.learnerGroupCount).toBe(50);
    expect(result.metadata.improvingLearnerGroups).toBe(25);
    expect(result.metadata.decliningLearnerGroups).toBe(25);
    expect(result.metadata.featureSchemaVersion).toMatch(/^performance-v1:[a-f0-9]{12}$/);
    expect(result.samples.every((sample) => /^[a-f0-9]{64}$/.test(sample.groupId))).toBe(true);
    expect(result.featureSchema.every((feature) => feature.type === "numeric")).toBe(true);
  });
});
