import { describe, expect, it } from "vitest";
import { evaluateKnn, fitKnn, predictKnnClass, predictKnnProbability, validateKnnArtifact, type KnnSample } from "../src/intelligence/knn.js";

const samples: KnnSample[] = [
  { features: [1, 10], label: 0 }, { features: [2, 9], label: 0 },
  { features: [3, 8], label: 0 }, { features: [8, 3], label: 1 },
  { features: [9, 2], label: 1 }, { features: [10, 1], label: 1 },
];

describe("K-nearest neighbors", () => {
  it("classifies nearby samples using standardized weighted distance", () => {
    const model = fitKnn(samples, { k: 3 });
    expect(model.algorithm).toBe("k-nearest-neighbors");
    expect(predictKnnProbability(model, [1.5, 9.5])).toBeLessThan(0.2);
    expect(predictKnnProbability(model, [9.5, 1.5])).toBeGreaterThan(0.8);
    expect(predictKnnClass(model, [9.5, 1.5])).toBe(1);
  });
  it("uses exact-match neighbours without allowing distant rows to affect the vote", () => {
    const model = fitKnn(samples, { k: 5 });
    expect(predictKnnProbability(model, [1, 10])).toBe(0);
  });
  it("reports classification metrics and confusion matrix", () => {
    const model = fitKnn(samples, { k: 1 });
    const metrics = evaluateKnn(model, samples);
    expect(metrics.accuracy).toBe(1);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.f1).toBe(1);
    expect(metrics.truePositive).toBe(3);
    expect(metrics.trueNegative).toBe(3);
  });
  it("validates model artifacts and feature shapes", () => {
    const model = fitKnn(samples);
    expect(validateKnnArtifact(model)).toEqual(model);
    expect(() => validateKnnArtifact({ ...model, featureCount: 4 })).toThrow("Invalid KNN model artifact");
    expect(() => predictKnnProbability(model, [1])).toThrow("Prediction features do not match");
  });
  it("rejects invalid samples and k values", () => {
    expect(() => fitKnn([{ features: [1], label: 0 }])).toThrow("At least two");
    expect(() => fitKnn([{ features: [1], label: 0 }, { features: [1, 2], label: 1 }])).toThrow("inconsistent feature count");
    expect(() => fitKnn([{ features: [1], label: 0 }, { features: [2], label: 2 as 0 | 1 }])).toThrow("invalid binary label");
    expect(() => fitKnn(samples, { k: 7 })).toThrow("k must be an integer");
    expect(() => predictKnnClass(fitKnn(samples), [1, 2], 1)).toThrow("threshold");
  });
});