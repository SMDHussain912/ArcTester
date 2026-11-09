import { describe, expect, it } from "vitest";
import {
  evaluateLogisticRegression,
  fitLogisticRegression,
  predictLogisticClass,
  predictLogisticProbability,
  validateLogisticRegressionArtifact,
  type ClassificationSample,
} from "../src/intelligence/logisticRegression.js";

const samples: ClassificationSample[] = [
  { features: [1, 10], label: 0 },
  { features: [2, 9], label: 0 },
  { features: [3, 8], label: 0 },
  { features: [4, 7], label: 0 },
  { features: [7, 4], label: 1 },
  { features: [8, 3], label: 1 },
  { features: [9, 2], label: 1 },
  { features: [10, 1], label: 1 },
];

describe("binary logistic regression", () => {
  it("learns a binary decision boundary and returns probabilities", () => {
    const model = fitLogisticRegression(samples);
    const negative = predictLogisticProbability(model, [1.5, 9.5]);
    const positive = predictLogisticProbability(model, [9.5, 1.5]);

    expect(model.algorithm).toBe("logistic-regression");
    expect(model.featureCount).toBe(2);
    expect(negative).toBeLessThan(0.2);
    expect(positive).toBeGreaterThan(0.8);
    expect(predictLogisticClass(model, [9.5, 1.5])).toBe(1);
    expect(predictLogisticClass(model, [1.5, 9.5])).toBe(0);
  });

  it("handles constant-valued features without division by zero", () => {
    const model = fitLogisticRegression([
      { features: [5, 1], label: 0 },
      { features: [5, 2], label: 0 },
      { features: [5, 3], label: 1 },
      { features: [5, 4], label: 1 },
    ]);
    expect(predictLogisticProbability(model, [5, 4])).toBeGreaterThan(0.5);
  });

  it("reports confusion matrix and classification metrics", () => {
    const model = fitLogisticRegression(samples);
    const metrics = evaluateLogisticRegression(model, samples);

    expect(metrics.rows).toBe(8);
    expect(metrics.accuracy).toBe(1);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.f1).toBe(1);
    expect(metrics.truePositive).toBe(4);
    expect(metrics.trueNegative).toBe(4);
    expect(metrics.falsePositive).toBe(0);
    expect(metrics.falseNegative).toBe(0);
  });

  it("validates artifacts and prediction input", () => {
    const model = fitLogisticRegression(samples);
    expect(validateLogisticRegressionArtifact(model)).toEqual(model);
    expect(() => validateLogisticRegressionArtifact({
      ...model,
      featureCount: 3,
    })).toThrow("Invalid logistic regression model artifact");
    expect(() => predictLogisticProbability(model, [1])).toThrow(
      "Prediction features do not match the model feature schema",
    );
  });

  it("rejects malformed training data and one-class datasets", () => {
    expect(() => fitLogisticRegression([
      { features: [1], label: 0 },
    ])).toThrow("At least two training samples");
    expect(() => fitLogisticRegression([
      { features: [1], label: 0 },
      { features: [1, 2], label: 1 },
    ])).toThrow("inconsistent feature count");
    expect(() => fitLogisticRegression([
      { features: [1], label: 0 },
      { features: [2], label: 0 },
    ])).toThrow("both binary classes");
    expect(() => fitLogisticRegression([
      { features: [1], label: 0 },
      { features: [2], label: 2 as 0 | 1 },
    ])).toThrow("invalid binary label");
    expect(() => fitLogisticRegression(samples, { learningRate: 0 })).toThrow(
      "learningRate must be greater than 0",
    );
  });

  it("rejects invalid thresholds and malformed evaluation labels", () => {
    const model = fitLogisticRegression(samples);
    expect(() => predictLogisticClass(model, [1, 2], 1)).toThrow("threshold");
    expect(() => evaluateLogisticRegression(model, [
      { features: [1, 2], label: 2 as 0 | 1 },
    ])).toThrow("invalid binary label");
  });
});
