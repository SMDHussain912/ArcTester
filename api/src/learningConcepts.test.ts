import { describe, expect, it } from "vitest";
import { listLearningConcepts } from "./learningConcepts.js";

describe("branch-aware learning concepts", () => {
  it("shows computing concepts to computer diploma branches", () => {
    const concepts = listLearningConcepts({ branchAware: true, branchCode: "CM", branchName: "Diploma in Computer Engineering" });
    expect(concepts.some((concept) => concept.slug === "stack")).toBe(true);
    expect(concepts.some((concept) => concept.slug === "normalization")).toBe(true);
  });

  it("does not show computing-only concepts to unrelated branches", () => {
    const concepts = listLearningConcepts({ branchAware: true, branchCode: "C", branchName: "Diploma in Civil Engineering" });
    expect(concepts.some((concept) => concept.slug === "stack")).toBe(false);
    expect(concepts.some((concept) => concept.slug === "osi-model")).toBe(false);
    expect(concepts.some((concept) => concept.slug === "newtons-second-law")).toBe(true);
  });

  it("keeps common concepts available when branch profile is unknown", () => {
    const concepts = listLearningConcepts({ branchAware: true });
    expect(concepts.some((concept) => concept.slug === "newtons-second-law")).toBe(true);
    expect(concepts.some((concept) => concept.slug === "stack")).toBe(false);
  });
});
