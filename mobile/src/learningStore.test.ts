import { describe, expect, it } from "vitest";
import { validateOfflineLearningPackage, validateOfflineStudyMaterial } from "./learningStore";

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

  it("rejects malformed answer options", () => {
    const invalid = { ...validPackage, questions: [{ ...validPackage.questions[0], options: [""] }, validPackage.questions[1]] };
    expect(() => validateOfflineLearningPackage(invalid)).toThrow(/invalid question/i);
  });
});


const validOfflineMaterial = {
  id: "material-1",
  title: "Binary Trees",
  description: "Revision notes",
  subject: "Computer Science",
  topic: "Data Structures",
  fileName: "binary-trees.md",
  mimeType: "text/markdown" as const,
  sizeBytes: 42,
  content: "# Binary Trees\\nA hierarchical data structure.",
  downloadedAt: "2026-11-19T08:00:00.000Z",
};

describe("offline study material", () => {
  it("accepts a complete text or Markdown document", () => {
    expect(validateOfflineStudyMaterial(validOfflineMaterial)).toEqual(validOfflineMaterial);
  });

  it("rejects PDF and unsupported binary formats for the text reader", () => {
    expect(() => validateOfflineStudyMaterial({ ...validOfflineMaterial, mimeType: "application/pdf" })).toThrow(/unsupported or incomplete format/i);
  });

  it("checks the stored byte count using UTF-8 rather than JavaScript character count", () => {
    const unicode = { ...validOfflineMaterial, content: "Résumé", sizeBytes: 8 };
    expect(validateOfflineStudyMaterial(unicode)).toEqual(unicode);
    expect(() => validateOfflineStudyMaterial({ ...unicode, sizeBytes: 6 })).toThrow(/unsupported or incomplete format/i);
  });

  it("rejects content that exceeds the offline storage limit", () => {
    expect(() => validateOfflineStudyMaterial({ ...validOfflineMaterial, sizeBytes: 8 * 1024 * 1024 + 1 })).toThrow(/unsupported or incomplete format/i);
  });

  it("rejects missing content and invalid download timestamps", () => {
    expect(() => validateOfflineStudyMaterial({ ...validOfflineMaterial, content: "" })).toThrow(/unsupported or incomplete format/i);
    expect(() => validateOfflineStudyMaterial({ ...validOfflineMaterial, downloadedAt: "not-a-date" })).toThrow(/unsupported or incomplete format/i);
  });
});
