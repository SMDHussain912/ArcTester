import { describe, expect, it } from "vitest";
import {
  evaluateNaiveBayes, fitNaiveBayes, predictNaiveBayesClass,
  predictNaiveBayesProbability, validateNaiveBayesArtifact, type NaiveBayesSample,
} from "../src/intelligence/naiveBayes.js";

const samples: NaiveBayesSample[] = [
  { features: [1, 10], label: 0 }, { features: [2, 11], label: 0 },
  { features: [1.5, 9], label: 0 }, { features: [8, 2], label: 1 },
  { features: [9, 3], label: 1 }, { features: [10, 1], label: 1 },
];

describe("Gaussian Naive Bayes classifier", () => {
  it("classifies clearly separated numeric clusters", () => {
    const model = fitNaiveBayes(samples);
    expect(model.algorithm).toBe("gaussian-naive-bayes");
    expect(predictNaiveBayesProbability(model, [1.5, 10])).toBeLessThan(0.01);
    expect(predictNaiveBayesProbability(model, [9, 2])).toBeGreaterThan(0.99);
    expect(predictNaiveBayesClass(model, [9, 2])).toBe(1);
  });

  it("keeps constant and zero-variance features numerically stable", () => {
    const rows: NaiveBayesSample[] = [
      { features: [5, 1], label: 0 }, { features: [5, 1], label: 0 },
      { features: [5, 9], label: 1 }, { features: [5, 9], label: 1 },
    ];
    const model = fitNaiveBayes(rows);
    expect(model.classVariances[0][0]).toBeGreaterThan(0);
    expect(model.classVariances[1][0]).toBeGreaterThan(0);
    expect(predictNaiveBayesProbability(model, [5, 1])).toBeLessThan(0.5);
    expect(predictNaiveBayesProbability(model, [5, 9])).toBeGreaterThan(0.5);
  });

  it("returns bounded probabilities and classification metrics", () => {
    const model = fitNaiveBayes(samples);
    const probability = predictNaiveBayesProbability(model, [4, 5]);
    expect(probability).toBeGreaterThanOrEqual(0);
    expect(probability).toBeLessThanOrEqual(1);
    const metrics = evaluateNaiveBayes(model, samples);
    expect(metrics.accuracy).toBe(1);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.f1).toBe(1);
    expect(metrics.truePositive).toBe(3);
    expect(metrics.trueNegative).toBe(3);
  });

  it("validates model artifacts and rejects incompatible prediction features", () => {
    const model = fitNaiveBayes(samples);
    expect(validateNaiveBayesArtifact(model)).toEqual(model);
    expect(() => validateNaiveBayesArtifact({ ...model, classCounts: [2, 2] })).toThrow("Invalid Gaussian Naive Bayes");
    expect(() => predictNaiveBayesProbability(model, [1])).toThrow("Prediction features do not match");
  });

  it("rejects malformed training data and invalid options", () => {
    expect(() => fitNaiveBayes([{ features: [1], label: 0 }])).toThrow("At least two");
    expect(() => fitNaiveBayes([{ features: [1], label: 0 }, { features: [1, 2], label: 1 }])).toThrow("inconsistent feature count");
    expect(() => fitNaiveBayes([{ features: [1], label: 0 }, { features: [2], label: 0 }])).toThrow("both binary classes");
    expect(() => fitNaiveBayes([{ features: [1], label: 0 }, { features: [Number.NaN], label: 1 }])).toThrow("non-finite feature");
    expect(() => fitNaiveBayes(samples, { varianceSmoothing: 0 })).toThrow("varianceSmoothing");
    expect(() => predictNaiveBayesClass(fitNaiveBayes(samples), [1, 2], 1)).toThrow("threshold");
  });
});
