import { describe, expect, it } from "vitest";
import { gradeQuestion, normalizeResponse } from "./questionTypes.js";
import { toPathPublicQuestion } from "./learningPathRoutes.js";

describe("learning path grading", () => {
  it("grades each supported question type through the shared grader", () => {
    expect(gradeQuestion("mcq", 2, {}, 2)).toBe(true);
    expect(gradeQuestion("multi_select", 0, { correctIndices: [1, 3] }, [3, 1])).toBe(true);
    expect(gradeQuestion("true_false", 1, {}, 1)).toBe(true);
    expect(gradeQuestion("fill_blank", 0, { acceptedAnswers: ["Kotlin"] }, " kotlin ")).toBe(true);
    expect(gradeQuestion("numeric", 0, { value: 12.5, tolerance: 0.1 }, 12.55)).toBe(true);
    expect(gradeQuestion("matching", 0, { pairs: [[0, 1], [1, 0]] }, [1, 0])).toBe(true);
  });

  it("normalizes empty student responses to unanswered", () => {
    expect(normalizeResponse("  ")).toBeNull();
    expect(normalizeResponse([])).toBeNull();
  });

  it("does not expose answer fields in the student question shape", () => {
    const question = toPathPublicQuestion({
      id: 9, text: "Prompt", options: JSON.stringify(["A", "B", "C", "D"]),
      questionType: "mcq", promptData: "{}", correctIndex: 2, answerData: '{"value":2}',
      explanation: "secret", subject: { name: "CSE" }, topic: { name: "Basics" },
    });
    expect(question).toEqual({
      id: 9, subject: "CSE", topic: "Basics", text: "Prompt",
      options: ["A", "B", "C", "D"], questionType: "mcq", promptData: {},
    });
    expect(question).not.toHaveProperty("correctIndex");
    expect(question).not.toHaveProperty("answerData");
    expect(question).not.toHaveProperty("explanation");
  });
});
