import { describe, expect, it } from "vitest";
import {
  evaluateBinaryClassifierWalkForward,
  type BinaryClassifierAdapter,
  type BinaryTrainingSample,
} from "../src/intelligence/classificationValidation.js";

const samples: BinaryTrainingSample[] = [
  { features: [0], label: 0 },
  { features: [0.1], label: 0 },
  { features: [0.2], label: 0 },
  { features: [0.8], label: 1 },
  { features: [0.9], label: 1 },
  { features: [1], label: 1 },
];

const thresholdClassifier: BinaryClassifierAdapter<{ threshold: number }> = {
  fit: (training) => ({
    threshold: training.reduce((sum, row) => sum + row.features[0], 0) / training.length,
  }),
  predict: (model, features) => features[0] > model.threshold ? 1 : 0,
};

describe("walk-forward classification validation", () => {
  it("evaluates only later rows and beats a majority-class baseline on separable data", () => {
    const result = evaluateBinaryClassifierWalkForward(samples, thresholdClassifier, {
      minimumTrainingRows: 3,
    });
    expect(result.trainingRowsAtFirstFold).toBe(3);
    expect(result.evaluationRows).toBe(3);
    expect(result.folds).toBe(3);
    expect(result.modelMetrics.accuracy).toBe(1);
    expect(result.majorityBaselineMetrics.accuracy).toBe(0);
    expect(result.beatsMajorityBaseline).toBe(true);
  });

  it("does not claim improvement when a model ties the majority baseline", () => {
    const constantClassifier: BinaryClassifierAdapter<0> = {
      fit: () => 0,
      predict: () => 0,
    };
    const result = evaluateBinaryClassifierWalkForward(samples, constantClassifier, {
      minimumTrainingRows: 3,
    });
    expect(result.modelMetrics.accuracy).toBe(result.majorityBaselineMetrics.accuracy);
    expect(result.beatsMajorityBaseline).toBe(false);
  });

  it("rejects malformed samples and invalid fold settings", () => {
    expect(() => evaluateBinaryClassifierWalkForward([
      { features: [0], label: 0 },
      { features: [1], label: 0 },
      { features: [2], label: 0 },
    ], thresholdClassifier)).toThrow("both binary classes");
    expect(() => evaluateBinaryClassifierWalkForward([
      ...samples.slice(0, 3),
      { features: [0.8, 2], label: 1 },
      ...samples.slice(4),
    ], thresholdClassifier)).toThrow("inconsistent feature count");
    expect(() => evaluateBinaryClassifierWalkForward(samples, thresholdClassifier, {
      minimumTrainingRows: 6,
    })).toThrow("minimumTrainingRows");
    expect(() => evaluateBinaryClassifierWalkForward(samples, thresholdClassifier, {
      maximumEvaluationRows: 0,
    })).toThrow("maximumEvaluationRows");
  });

  it("rejects a classifier that returns a non-binary prediction", () => {
    const invalid: BinaryClassifierAdapter<number> = {
      fit: () => 0,
      predict: () => 2 as 0 | 1,
    };
    expect(() => evaluateBinaryClassifierWalkForward(samples, invalid, {
      minimumTrainingRows: 3,
    })).toThrow("invalid binary prediction");
  });
});
