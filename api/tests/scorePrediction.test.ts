import { describe, expect, it } from "vitest";
import {
  buildNextAttemptScoreSamples,
  trainAndEvaluateNextAttemptModel,
  type CompletedAttemptScore,
} from "../src/intelligence/scorePrediction.js";

const attempts: CompletedAttemptScore[] = Array.from({ length: 12 }, (_, index) => ({
  finishedAt: new Date(Date.UTC(2026, 0, index + 1)),
  correct: 4 + Math.floor(index / 2),
  total: 10,
}));

describe("next-attempt score prediction dataset", () => {
  it("uses only earlier completed attempts as features", () => {
    const samples = buildNextAttemptScoreSamples(attempts);
    expect(samples).toHaveLength(9);
    expect(samples[0].features).toEqual([
      3,
      0.5,
      (0.4 + 0.4 + 0.5) / 3,
      (0.4 + 0.4 + 0.5) / 3,
      10,
    ]);
    expect(samples[0].target).toBe(0.5);
  });

  it("orders attempts chronologically before building samples", () => {
    const samples = buildNextAttemptScoreSamples([...attempts].reverse());
    expect(samples).toEqual(buildNextAttemptScoreSamples(attempts));
  });

  it("trains on older samples and evaluates against a mean baseline", () => {
    const result = trainAndEvaluateNextAttemptModel(attempts);
    expect(result.model.algorithm).toBe("multiple-linear-regression");
    expect(result.trainRows).toBe(6);
    expect(result.testRows).toBe(3);
    expect(result.evaluationWindows).toBe(3);
    expect(result.regression.rows).toBe(3);
    expect(result.meanBaseline.rows).toBe(3);
    expect(typeof result.beatsMeanBaseline).toBe("boolean");
  });

  it("evaluates each later sample using only its earlier chronological prefix", () => {
    const result = trainAndEvaluateNextAttemptModel(attempts);
    // Nine samples: six seed rows, then three one-step-ahead evaluation windows.
    expect(result.trainRows).toBe(6);
    expect(result.testRows).toBe(3);
    expect(result.evaluationWindows).toBe(3);
    expect(result.regression.mae).toBeGreaterThanOrEqual(0);
    expect(result.meanBaseline.mae).toBeGreaterThanOrEqual(0);
  });

  it("keeps walk-forward metrics finite for a noisy score history", () => {
    const noisyHistory: CompletedAttemptScore[] = [3, 8, 4, 9, 2, 7, 5, 10, 3, 8, 4, 9]
      .map((correct, index) => ({
        finishedAt: new Date(Date.UTC(2026, 3, index + 1)),
        correct,
        total: 10,
      }));
    const result = trainAndEvaluateNextAttemptModel(noisyHistory);
    expect(Number.isFinite(result.regression.mae)).toBe(true);
    expect(Number.isFinite(result.meanBaseline.mae)).toBe(true);
    expect(result.evaluationWindows).toBe(3);
  });

  it("does not claim to beat the baseline on a constant-score history", () => {
    const constantHistory: CompletedAttemptScore[] = Array.from({ length: 12 }, (_, index) => ({
      finishedAt: new Date(Date.UTC(2026, 2, index + 1)),
      correct: 5,
      total: 10,
    }));

    const result = trainAndEvaluateNextAttemptModel(constantHistory);
    expect(result.regression.mae).toBeCloseTo(0, 8);
    expect(result.meanBaseline.mae).toBe(0);
    expect(result.beatsMeanBaseline).toBe(false);
  });

  it("rejects invalid attempt scores and timestamps", () => {
    expect(() => buildNextAttemptScoreSamples([
      ...attempts.slice(0, 3),
      { finishedAt: "not-a-date", correct: 5, total: 10 },
    ])).toThrow("invalid finishedAt");
    expect(() => buildNextAttemptScoreSamples([
      ...attempts.slice(0, 3),
      { finishedAt: new Date(), correct: 11, total: 10 },
    ])).toThrow("invalid score counts");
  });

  it("requires enough sequential observations before model evaluation", () => {
    expect(() => trainAndEvaluateNextAttemptModel(attempts.slice(0, 6))).toThrow(
      "At least four sequential score samples",
    );
  });
});
