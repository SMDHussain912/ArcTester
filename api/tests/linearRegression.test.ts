import { describe, expect, it } from "vitest";
import {
  evaluateLinearRegression,
  fitLinearRegression,
  predictLinearRegression,
  splitChronological,
  validateLinearRegressionArtifact,
  type RegressionSample,
} from "../src/intelligence/linearRegression.js";

const samples: RegressionSample[] = [
  { features: [1, 2], target: 6 },
  { features: [2, 1], target: 11 },
  { features: [3, 4], target: 4 },
  { features: [4, 3], target: 9 },
  { features: [5, 6], target: 2 },
  { features: [6, 5], target: 7 },
  { features: [7, 8], target: 0 },
  { features: [8, 7], target: 5 },
];

describe("multiple linear regression", () => {
  it("fits multiple features and predicts unseen rows", () => {
    const model = fitLinearRegression(samples);
    const prediction = predictLinearRegression(model, [9, 10]);

    expect(model.algorithm).toBe("multiple-linear-regression");
    expect(model.featureCount).toBe(2);
    expect(model.trainingRows).toBe(samples.length);
    expect(prediction).toBeCloseTo(-2, 1);
  });

  it("handles constant-valued features without dividing by zero", () => {
    const model = fitLinearRegression([
      { features: [5, 1], target: 3 },
      { features: [5, 2], target: 5 },
      { features: [5, 3], target: 7 },
    ]);
    expect(predictLinearRegression(model, [5, 4])).toBeCloseTo(9, 2);
  });

  it("reports MAE, RMSE and R-squared", () => {
    const model = fitLinearRegression(samples);
    const metrics = evaluateLinearRegression(model, samples);

    expect(metrics.rows).toBe(samples.length);
    expect(metrics.mae).toBeLessThan(0.1);
    expect(metrics.rmse).toBeLessThan(0.1);
    expect(metrics.rSquared).toBeGreaterThan(0.999);
  });

  it("validates model artifacts before prediction", () => {
    const model = fitLinearRegression(samples);
    expect(validateLinearRegressionArtifact(model)).toEqual(model);
    expect(() => validateLinearRegressionArtifact({
      ...model,
      featureCount: 3,
    })).toThrow("Invalid linear regression model artifact");
    expect(() => predictLinearRegression(model, [1])).toThrow(
      "Prediction features do not match the model feature schema",
    );
  });

  it("rejects malformed training data and unsafe options", () => {
    expect(() => fitLinearRegression([{ features: [1], target: 2 }])).toThrow(
      "At least two training samples are required",
    );
    expect(() => fitLinearRegression([
      { features: [1], target: 2 },
      { features: [1, 2], target: 3 },
    ])).toThrow("inconsistent feature count");
    expect(() => fitLinearRegression([
      { features: [1], target: 2 },
      { features: [2], target: Number.NaN },
    ])).toThrow("non-finite value");
    expect(() => fitLinearRegression(samples, { iterations: 0 })).toThrow(
      "iterations must be an integer",
    );
  });

  it("splits chronological data without putting newer rows in training", () => {
    const split = splitChronological(samples, 0.25);
    expect(split.train).toEqual(samples.slice(0, 6));
    expect(split.test).toEqual(samples.slice(6));
  });

  it("rejects invalid chronological splits", () => {
    expect(() => splitChronological(samples, 0)).toThrow("testFraction");
    expect(() => splitChronological(samples.slice(0, 2))).toThrow(
      "At least three samples",
    );
  });
});
