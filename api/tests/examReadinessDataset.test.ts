import { describe, expect, it } from "vitest";
import {
  buildCurrentReadinessFeatures,
  buildExamReadinessDataset,
  type ReadinessFormalExam,
  type ReadinessPracticeAttempt,
} from "../src/intelligence/examReadinessDataset.js";

const practice: ReadinessPracticeAttempt[] = [
  { userId: 1, finishedAt: "2026-01-01T10:00:00.000Z", correct: 6, total: 10, subjects: ["Maths"] },
  { userId: 1, finishedAt: "2026-01-02T10:00:00.000Z", correct: 7, total: 10, subjects: ["Maths", "Physics"] },
  { userId: 1, finishedAt: "2026-01-03T10:00:00.000Z", correct: 8, total: 10, subjects: ["Physics"] },
  { userId: 2, finishedAt: "2026-01-01T10:00:00.000Z", correct: 2, total: 10, subjects: ["Maths"] },
  { userId: 2, finishedAt: "2026-01-02T10:00:00.000Z", correct: 3, total: 10, subjects: ["Maths"] },
  { userId: 2, finishedAt: "2026-01-03T10:00:00.000Z", correct: 4, total: 10, subjects: ["Physics"] },
];

const exams: ReadinessFormalExam[] = [
  { userId: 1, startedAt: "2026-01-04T10:00:00.000Z", submittedAt: "2026-01-04T11:00:00.000Z", score: 75, maximumScore: 100 },
  { userId: 2, startedAt: "2026-01-04T10:00:00.000Z", submittedAt: "2026-01-04T11:00:00.000Z", score: 45, maximumScore: 100 },
];

describe("exam readiness dataset", () => {
  it("uses prior practice data and graded formal outcomes as binary labels", () => {
    const dataset = buildExamReadinessDataset(practice, exams);
    expect(dataset).toHaveLength(2);
    expect(dataset.map((row) => row.label)).toEqual([1, 0]);
    expect(dataset[0].features).toEqual([3, 0.8, 0.7, 0.7, 30, 2]);
  });

  it("excludes practice attempts that finish at or after the formal exam starts", () => {
    const dataset = buildExamReadinessDataset([
      ...practice,
      { userId: 1, finishedAt: "2026-01-04T10:00:00.000Z", correct: 10, total: 10, subjects: ["Chemistry"] },
      { userId: 1, finishedAt: "2026-01-04T10:30:00.000Z", correct: 10, total: 10, subjects: ["Chemistry"] },
    ], exams);
    expect(dataset[0].features).toEqual([3, 0.8, 0.7, 0.7, 30, 2]);
  });

  it("does not mix one student's practice history into another student's row", () => {
    const dataset = buildExamReadinessDataset(practice, exams);
    expect(dataset[0].features[3]).toBe(0.7);
    expect(dataset[1].features[3]).toBe(0.3);
  });

  it("requires enough prior attempts and supports current learner features", () => {
    expect(buildExamReadinessDataset(practice, exams, { minimumPriorAttempts: 4 })).toEqual([]);
    expect(buildCurrentReadinessFeatures(practice, 1)).toEqual([3, 0.8, 0.7, 0.7, 30, 2]);
    expect(buildCurrentReadinessFeatures(practice, 999)).toBeNull();
  });

  it("rejects invalid thresholds and malformed historical records", () => {
    expect(() => buildExamReadinessDataset(practice, exams, { readinessThreshold: 1 })).toThrow("readinessThreshold");
    expect(() => buildExamReadinessDataset([
      { ...practice[0], total: 0 },
    ], exams)).toThrow("invalid score counts");
    expect(() => buildExamReadinessDataset(practice, [
      { ...exams[0], maximumScore: 0 },
    ])).toThrow("invalid score values");
  });
});
