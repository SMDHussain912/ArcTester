import { describe, expect, it } from "vitest";
import { buildPracticeConfig } from "./practiceConfig";

describe("buildPracticeConfig", () => {
  it("serializes selected subjects, topic filters, count and difficulty", () => {
    const result = buildPracticeConfig(["Mathematics", "Physics"], [JSON.stringify(["Mathematics", "Algebra"]), JSON.stringify(["Physics", "Mechanics"])], 40, "hard");
    expect(result).toEqual({ subjects: ["Mathematics", "Physics"], topicFilters: [{ subject: "Mathematics", topic: "Algebra" }, { subject: "Physics", topic: "Mechanics" }], count: 40, difficulty: "hard" });
  });

  it("keeps identically named topics isolated by subject", () => {
    const result = buildPracticeConfig(
      ["Mathematics", "Physics"],
      [JSON.stringify(["Mathematics", "Applications"]), JSON.stringify(["Physics", "Applications"])],
      20,
      "any",
    );
    expect(result.topicFilters).toEqual([
      { subject: "Mathematics", topic: "Applications" },
      { subject: "Physics", topic: "Applications" },
    ]);
  });

  it("ignores malformed, wrongly shaped and empty topic keys", () => {
    const result = buildPracticeConfig(
      ["Mathematics"],
      ["{broken", JSON.stringify(["Mathematics"]), JSON.stringify(["Mathematics", ""]), JSON.stringify(["Mathematics", "Algebra", "extra"]), JSON.stringify(["Mathematics", "Algebra"])],
      10,
      "any",
    );
    expect(result.topicFilters).toEqual([{ subject: "Mathematics", topic: "Algebra" }]);
  });

  it("ignores topic filters belonging to subjects that are no longer selected", () => {
    const result = buildPracticeConfig(
      ["Mathematics"],
      [JSON.stringify(["Physics", "Mechanics"]), JSON.stringify(["Mathematics", "Algebra"])],
      10,
      "easy",
    );
    expect(result.topicFilters).toEqual([{ subject: "Mathematics", topic: "Algebra" }]);
  });

  it("deduplicates repeated subject-topic pairs without collapsing equal topic names across subjects", () => {
    const result = buildPracticeConfig(
      ["Mathematics", "Physics"],
      [JSON.stringify(["Mathematics", "Algebra"]), JSON.stringify(["Mathematics", "Algebra"]), JSON.stringify(["Physics", "Algebra"])],
      10,
      "medium",
    );
    expect(result.topicFilters).toEqual([
      { subject: "Mathematics", topic: "Algebra" },
      { subject: "Physics", topic: "Algebra" },
    ]);
  });

  it("copies selected subjects so the returned config does not share the caller array", () => {
    const subjects = ["Mathematics"];
    const result = buildPracticeConfig(subjects, [], 10, "easy");
    subjects.push("Physics");
    expect(result.subjects).toEqual(["Mathematics"]);
  });
});
