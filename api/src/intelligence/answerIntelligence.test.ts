import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAnswerExplanation, getAnswerIntelligenceProviderStatus } from "./answerIntelligence.js";

const question = {
  subject: "Computer Science",
  topic: "Data Structures",
  difficulty: "easy",
  text: "Which data structure follows LIFO?",
  options: ["Queue", "Stack", "Tree", "Graph"],
  correctIndex: 1,
  selectedIndex: 0,
  approvedExplanation: "",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hybrid answer intelligence", () => {
  it("reports provider readiness without exposing credentials", () => {
    vi.stubEnv("ARCTESTER_AI_API_KEY", "");
    vi.stubEnv("ARCTESTER_AI_BASE_URL", "");
    vi.stubEnv("ARCTESTER_AI_MODEL", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ARCTESTER_LOCAL_AI_MODEL", "");
    const status = getAnswerIntelligenceProviderStatus();
    expect(status.external.configured).toBe(false);
    expect(status.local.configured).toBe(false);
    expect(status.fallback).toEqual(["external-ai", "local-ai", "question-bank-explanation", "deterministic-template"]);
    expect(JSON.stringify(status)).not.toContain("API_KEY");
  });

  it("produces an offline explanation with the immutable answer key and all options", async () => {
    vi.stubEnv("ARCTESTER_AI_API_KEY", "");
    vi.stubEnv("ARCTESTER_AI_BASE_URL", "");
    vi.stubEnv("ARCTESTER_AI_MODEL", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ARCTESTER_LOCAL_AI_MODEL", "");
    const result = await generateAnswerExplanation(question);
    expect(result.answer).toBe("Stack");
    expect(result.answerKeyVerified).toBe(true);
    expect(result.explanationVerified).toBe(false);
    expect(result.explanationStatus).toBe("template");
    expect(result.optionAnalysis).toHaveLength(4);
    expect(result.optionAnalysis.map((item) => item.isCorrect)).toEqual([false, true, false, false]);
    expect(result.misconception).toContain("differs");
  });

  it("uses the question-bank explanation when no AI provider is configured", async () => {
    vi.stubEnv("ARCTESTER_AI_API_KEY", "");
    vi.stubEnv("ARCTESTER_AI_BASE_URL", "");
    vi.stubEnv("ARCTESTER_AI_MODEL", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ARCTESTER_LOCAL_AI_MODEL", "");
    const result = await generateAnswerExplanation({ ...question, approvedExplanation: "A stack removes the most recently added item first." });
    expect(result.explanationStatus).toBe("question-bank");
    expect(result.provider).toBe("question-bank");
    expect(result.summary).toContain("most recently added");
  });
});
