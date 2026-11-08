import { describe, expect, it } from "vitest";
import type { BinaryTrainingSample } from "../src/intelligence/classificationValidation.js";
import {
  createStratifiedFolds,
  evaluateClassifierCrossValidation,
  tuneClassifierHyperparameters,
} from "../src/intelligence/modelValidation.js";

function samples(): BinaryTrainingSample[] {
  return Array.from({ length: 80 }, (_, index) => ({
    features: [index / 10, index % 7, (index * 3) % 11],
    label: (index % 4 === 0 || index % 4 === 1 ? 1 : 0) as 0 | 1,
  }));
}

describe("model cross-validation and tuning", () => {
  it("creates deterministic stratified folds without losing samples", () => {
    const rows = samples();
    const first = createStratifiedFolds(rows, { folds: 4, seed: 123 });
    const second = createStratifiedFolds(rows, { folds: 4, seed: 123 });
    expect(first).toEqual(second);
    expect(first.flat()).toHaveLength(rows.length);
    for (const fold of first) {
      expect(fold.some((row) => row.label === 0)).toBe(true);
      expect(fold.some((row) => row.label === 1)).toBe(true);
    }
  });

  it("rejects invalid fold counts and underrepresented classes", () => {
    expect(() => createStratifiedFolds(samples(), { folds: 1 })).toThrow("folds");
    expect(() => createStratifiedFolds([
      ...Array.from({ length: 8 }, () => ({ features: [1], label: 0 as const })),
      ...Array.from({ length: 2 }, () => ({ features: [2], label: 1 as const })),
    ], { folds: 3 })).toThrow("Each class");
  });

  it("evaluates all four classifiers on held-out folds", () => {
    const rows = samples();
    const algorithms = [
      ["logistic-regression", { iterations: 300, learningRate: 0.05 }],
      ["knn", { k: 3 }],
      ["decision-tree", { maxDepth: 3 }],
      ["gaussian-naive-bayes", { varianceSmoothing: 1e-9 }],
    ] as const;
    for (const [algorithm, parameters] of algorithms) {
      const metrics = evaluateClassifierCrossValidation(rows, { algorithm, parameters }, { folds: 4, seed: 9 });
      expect(metrics.folds).toBe(4);
      expect(metrics.rows).toBe(rows.length);
      expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
      expect(metrics.accuracy).toBeLessThanOrEqual(1);
      expect(metrics.f1).toBeGreaterThanOrEqual(0);
      expect(metrics.f1).toBeLessThanOrEqual(1);
    }
  });

  it("selects the best candidate using F1 then accuracy without touching external test data", () => {
    const result = tuneClassifierHyperparameters(samples(), "knn", { folds: 4, seed: 21 });
    expect(result.algorithm).toBe("knn");
    expect(result.candidates).toHaveLength(3);
    expect(result.bestParameters).toEqual(result.candidates[0].parameters);
    expect(result.bestMetrics).toEqual(result.candidates[0].metrics);
  });

  it("tunes every supported classifier family", () => {
    for (const algorithm of [
      "logistic-regression", "knn", "decision-tree", "gaussian-naive-bayes",
    ] as const) {
      const result = tuneClassifierHyperparameters(samples(), algorithm, { folds: 3, seed: 7 });
      expect(result.candidates.length).toBeGreaterThan(1);
      expect(result.bestMetrics.rows).toBe(80);
    }
  });
});
