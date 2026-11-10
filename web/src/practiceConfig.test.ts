import { describe, expect, it } from "vitest";
import { buildPracticeConfig } from "./practiceConfig";
describe("buildPracticeConfig", () => {
  it("serializes selected subjects, topic filters, count and difficulty", () => {
    const result = buildPracticeConfig(["Mathematics", "Physics"], [JSON.stringify(["Mathematics", "Algebra"]), JSON.stringify(["Physics", "Mechanics"])], 40, "hard");
    expect(result).toEqual({ subjects: ["Mathematics", "Physics"], topicFilters: [{ subject: "Mathematics", topic: "Algebra" }, { subject: "Physics", topic: "Mechanics" }], count: 40, difficulty: "hard" });
  });
  it("ignores malformed JSON topic keys without failing paper creation", () => {
    const result = buildPracticeConfig(["Mathematics"], ["{broken", JSON.stringify(["Mathematics", "Algebra"])], 10, "any");
    expect(result.topicFilters).toEqual([{ subject: "Mathematics", topic: "Algebra" }]);
  });
  it("copies selected subjects so the returned config does not share the caller array", () => {
    const subjects = ["Mathematics"];
    const result = buildPracticeConfig(subjects, [], 10, "easy");
    subjects.push("Physics");
    expect(result.subjects).toEqual(["Mathematics"]);
  });
});
