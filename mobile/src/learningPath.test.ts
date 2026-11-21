import { describe, expect, it } from "vitest";
import { calculateLearningPathProgress, selectNextLearningSubject, type LearningPathSubject } from "./learningPath";

const subjects: LearningPathSubject[] = [
  { subject: "Data Structures", count: 10, practiceCount: 8 },
  { subject: "DBMS", count: 6, practiceCount: 5 },
  { subject: "Empty", count: 0, practiceCount: 0 },
];

describe("learning path progress", () => {
  it("uses practice availability and clamps seen questions", () => {
    expect(calculateLearningPathProgress(subjects, [
      { subject: "Data Structures", seen: 99, accuracy: 0.8 },
      { subject: "DBMS", seen: -2, accuracy: null },
    ])).toEqual({ totalAvailable: 13, totalSeen: 8, ratio: 8 / 13 });
  });

  it("selects the first incomplete subject in catalogue order", () => {
    expect(selectNextLearningSubject(subjects, [
      { subject: "Data Structures", seen: 8, accuracy: 0.7 },
      { subject: "DBMS", seen: 2, accuracy: 0.5 },
    ])?.subject).toBe("DBMS");
  });

  it("falls back to the first available subject when all are reviewed", () => {
    expect(selectNextLearningSubject(subjects, [
      { subject: "Data Structures", seen: 8, accuracy: 0.7 },
      { subject: "DBMS", seen: 5, accuracy: 0.8 },
    ])?.subject).toBe("Data Structures");
  });

  it("returns zero progress and no next subject for an empty catalogue", () => {
    expect(calculateLearningPathProgress([], [])).toEqual({ totalAvailable: 0, totalSeen: 0, ratio: 0 });
    expect(selectNextLearningSubject([], [])).toBeUndefined();
  });
});
