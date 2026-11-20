import { describe, expect, it } from "vitest";
import {
  buildCurrentReadinessFeatures,
  buildExamReadinessDataset,
  buildReadinessClassificationDataset,
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

  it("builds timestamped three-class samples with shared pseudonymous learner groups and canonical features", () => {
    const practiceForClassification: ReadinessPracticeAttempt[] = [
      ...practice,
      { userId: 1, finishedAt: "2026-01-03T12:00:00.000Z", correct: 9, total: 10, subjects: ["Chemistry"] },
      { userId: 1, finishedAt: "2026-01-03T14:00:00.000Z", correct: 10, total: 10, subjects: ["Maths"] },
      { userId: 2, finishedAt: "2026-01-03T12:00:00.000Z", correct: 5, total: 10, subjects: ["Chemistry"] },
      { userId: 2, finishedAt: "2026-01-03T14:00:00.000Z", correct: 6, total: 10, subjects: ["Physics"] },
    ];
    const classificationExams: ReadinessFormalExam[] = [
      { userId: 1, startedAt: "2026-01-04T10:00:00.000Z", submittedAt: "2026-01-04T11:00:00.000Z", score: 40, maximumScore: 100 },
      { userId: 2, startedAt: "2026-01-04T10:00:00.000Z", submittedAt: "2026-01-04T11:30:00.000Z", score: 60, maximumScore: 100 },
      { userId: 1, startedAt: "2026-01-05T10:00:00.000Z", submittedAt: "2026-01-05T11:00:00.000Z", score: 80, maximumScore: 100 },
    ];
    const dataset = buildReadinessClassificationDataset(
      practiceForClassification,
      classificationExams,
      (userId) => userId === 1 ? "a".repeat(64) : "b".repeat(64),
    );
    expect(dataset.map((row) => row.target)).toEqual([0, 1, 2]);
    expect(dataset[0].groupId).toBe(dataset[2].groupId);
    expect(dataset[0].occurredAt).toBe("2026-01-04T11:00:00.000Z");
    expect(dataset[0].features).toEqual(expect.objectContaining({
      completed_attempts: 5,
      previous_accuracy: 1,
      recent_average_accuracy: 0.9,
      overall_average_accuracy: 0.8,
      previous_question_count: 50,
      subject_count: 3,
    }));
    expect(dataset[0]).not.toHaveProperty("userId");
  });

  it("requires ordered class thresholds and valid keyed learner pseudonyms", () => {
    expect(() => buildReadinessClassificationDataset(practice, exams, () => "bad"))
      .toThrow("keyed HMAC learner group ID");
    expect(() => buildReadinessClassificationDataset(practice, exams, (id) => String(id).padStart(64, "0"), {
      notReadyThreshold: 0.8,
      readyThreshold: 0.7,
    })).toThrow("Readiness class thresholds");
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
