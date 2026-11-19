import { describe, expect, it } from "vitest";
import { validateOfflineLearningPackage } from "./learningStore";

const validPackage = {
  schemaVersion: 2 as const,
  exportedAt: "2026-11-19T08:00:00.000Z",
  total: 2,
  subjects: ["Computer Science", "Physics"],
  questions: [
    { id: 1, subject: "Computer Science", topic: "Data Structures", text: "What is FIFO?", options: ["Queue", "Stack"], difficulty: "easy" },
    { id: 2, subject: "Physics", topic: null, text: "What is force?", options: ["F=ma", "V=IR"], difficulty: "medium" },
  ],
};

describe("offline learning package", () => {
  it("accepts a complete versioned question bank", () => {
    expect(validateOfflineLearningPackage(validPackage)).toEqual(validPackage);
  });

  it("rejects a mismatched question count", () => {
    expect(() => validateOfflineLearningPackage({ ...validPackage, total: 3 })).toThrow(/unsupported or incomplete format/i);
  });

  it("rejects duplicate question identifiers", () => {
    const duplicate = { ...validPackage, questions: [validPackage.questions[0], { ...validPackage.questions[1], id: 1 }], total: 2 };
    expect(() => validateOfflineLearningPackage(duplicate)).toThrow(/invalid question/i);
  });

  it("rejects malformed answer options", () => {
    const invalid = { ...validPackage, questions: [{ ...validPackage.questions[0], options: [""] }, validPackage.questions[1]] };
    expect(() => validateOfflineLearningPackage(invalid)).toThrow(/invalid question/i);
  });
});
