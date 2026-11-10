import { describe, expect, it } from "vitest";
import { buildPerformanceExplanation } from "./performanceExplanation.js";

describe("buildPerformanceExplanation", () => {
  it("asks for practice data when no answered questions exist", () => {
    const result = buildPerformanceExplanation([], 5, 0.6);
    expect(result.answeredQuestions).toBe(0);
    expect(result.headline).toContain("not enough completed practice data");
  });

  it("explains evidence-backed weak topics using measured accuracy", () => {
    const result = buildPerformanceExplanation([
      { subject: "CSE", topic: "Graphs", seen: 10, correct: 3, wrong: 7, accuracy: 0.3 },
      { subject: "CSE", topic: "Trees", seen: 8, correct: 4, wrong: 4, accuracy: 0.5 },
    ], 5, 0.6);
    expect(result.headline).toContain("Graphs");
    expect(result.details).toContain("Graphs in CSE: 30% accuracy across 10 answered questions, with 7 incorrect.");
    expect(result.answeredQuestions).toBe(18);
    expect(result.incorrectAnswers).toBe(11);
  });

  it("does not call a low-sample topic weak", () => {
    const result = buildPerformanceExplanation([
      { subject: "CSE", topic: "Graphs", seen: 4, correct: 0, wrong: 4, accuracy: 0 },
    ], 5, 0.6);
    expect(result.headline).toContain("More topic-level practice");
    expect(result.details[0]).toContain("minimum of 5");
  });

  it("reports when no topic crosses the weak threshold", () => {
    const result = buildPerformanceExplanation([
      { subject: "CSE", topic: "Graphs", seen: 10, correct: 8, wrong: 2, accuracy: 0.8 },
    ], 5, 0.6);
    expect(result.headline).toContain("No confirmed weak topic");
    expect(result.details[0]).toContain("below 60% accuracy");
  });

  it("excludes unanswered questions from the answered-question explanation totals", () => {
    const result = buildPerformanceExplanation([
      { subject: "CSE", topic: "Graphs", seen: 5, correct: 3, wrong: 2, accuracy: 0.6 },
    ], 5, 0.6);
    expect(result.answeredQuestions).toBe(5);
    expect(result.incorrectAnswers).toBe(2);
  });
});

describe("buildPerformanceExplanation subject fallback", () => {
  it("uses subject-level evidence when topic labels are unavailable", () => {
    const topics = [
      { subject: "Mathematics", topic: null, seen: 8, correct: 2, wrong: 6, accuracy: 0.25 },
    ];
    const subjects = [
      { subject: "Mathematics", topic: null, seen: 8, correct: 2, wrong: 6, accuracy: 0.25 },
    ];
    const result = buildPerformanceExplanation(topics, 5, 0.6, subjects);
    expect(result.headline).toContain("Mathematics");
    expect(result.details.join(" ")).toContain("Topic labels are not available");
    expect(result.incorrectAnswers).toBe(6);
  });

  it("prefers a named weak topic over a broader subject summary", () => {
    const result = buildPerformanceExplanation([
      { subject: "CSE", topic: "Trees", seen: 8, correct: 2, wrong: 6, accuracy: 0.25 },
    ], 5, 0.6, [
      { subject: "CSE", topic: null, seen: 20, correct: 12, wrong: 8, accuracy: 0.6 },
    ]);
    expect(result.headline).toContain("Trees");
  });

  it("uses subject fallback for an under-labelled subject without overriding another subject's topic evidence", () => {
    const result = buildPerformanceExplanation([
      { subject: "CSE", topic: "Arrays", seen: 10, correct: 8, wrong: 2, accuracy: 0.8 },
      { subject: "Mathematics", topic: null, seen: 8, correct: 2, wrong: 6, accuracy: 0.25 },
    ], 5, 0.6, [
      { subject: "CSE", topic: null, seen: 10, correct: 8, wrong: 2, accuracy: 0.8 },
      { subject: "Mathematics", topic: null, seen: 8, correct: 2, wrong: 6, accuracy: 0.25 },
    ]);
    expect(result.headline).toContain("Mathematics");
    expect(result.details.join(" ")).toContain("Topic labels are not available");
  });

  it("does not report a weak subject aggregate when sampled named topics are healthy", () => {
    const result = buildPerformanceExplanation([
      { subject: "CSE", topic: "Arrays", seen: 10, correct: 8, wrong: 2, accuracy: 0.8 },
      { subject: "CSE", topic: "Trees", seen: 10, correct: 7, wrong: 3, accuracy: 0.7 },
    ], 5, 0.6, [
      { subject: "CSE", topic: null, seen: 20, correct: 8, wrong: 12, accuracy: 0.4 },
    ]);
    expect(result.headline).toContain("No confirmed weak topic");
    expect(result.headline).not.toContain("revision gap is CSE");
  });
});
