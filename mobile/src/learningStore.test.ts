import { describe, expect, it, vi } from "vitest";
vi.mock("expo-sqlite", () => ({ openDatabaseAsync: vi.fn() }));
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

  it("accepts the new practice-only package schema while retaining version 2 compatibility", () => {
    const practiceOnly = { ...validPackage, schemaVersion: 3 as const, practiceOnly: true as const };
    expect(validateOfflineLearningPackage(practiceOnly)).toEqual(practiceOnly);
  });

  it("rejects version 3 packages that do not declare practice-only content", () => {
    expect(() => validateOfflineLearningPackage({ ...validPackage, schemaVersion: 3 })).toThrow(/unsupported or incomplete format/i);
  });

  it("rejects a mismatched question count", () => {
    expect(() => validateOfflineLearningPackage({ ...validPackage, total: 3 })).toThrow(/unsupported or incomplete format/i);
  });

  it("rejects duplicate question identifiers", () => {
    const duplicate = { ...validPackage, questions: [validPackage.questions[0], { ...validPackage.questions[1], id: 1 }], total: 2 };
    expect(() => validateOfflineLearningPackage(duplicate)).toThrow(/invalid question/i);
  });

  it("rejects answer keys and explanations from an offline practice package", () => {
    const leaked = {
      ...validPackage,
      questions: [
        { ...validPackage.questions[0], correctIndex: 0, explanation: "Protected answer." },
        validPackage.questions[1],
      ],
    };
    expect(() => validateOfflineLearningPackage(leaked)).toThrow(/invalid question/i);
  });

  it("rejects malformed answer options", () => {
    const invalid = { ...validPackage, questions: [{ ...validPackage.questions[0], options: [""] }, validPackage.questions[1]] };
    expect(() => validateOfflineLearningPackage(invalid)).toThrow(/invalid question/i);
  });
});

