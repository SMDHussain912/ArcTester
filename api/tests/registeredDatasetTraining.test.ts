import { describe, expect, it } from "vitest";
import { rankTrainingResults, trainRegisteredDataset, type RegisteredTrainingSample } from "../src/intelligence/registeredDatasetTraining.js";

const classificationSamples: RegisteredTrainingSample[] = Array.from({ length: 60 }, (_, index) => ({
  features: {
    score: index,
    subject: index % 2 === 0 ? "Math" : "Science",
  },
  target: index >= 30 ? 1 : 0,
}));

describe("registered dataset training", () => {
  it("trains all supported classifiers and returns held-out and CV metrics", () => {
    const results = trainRegisteredDataset(classificationSamples, [
      { name: "score", type: "numeric" },
      { name: "subject", type: "categorical", categories: ["Math", "Science"] },
    ], "binary-classification", 42);

    expect(results.map((result) => result.algorithm)).toEqual([
      "logistic-regression", "knn", "decision-tree", "gaussian-naive-bayes",
    ]);
    for (const result of results) {
      expect(result.trainRows + result.testRows).toBe(60);
      expect(result.trainRows).toBe(48);
      expect(result.testRows).toBe(12);
      expect(result.metrics).toHaveProperty("accuracy");
      expect(result.crossValidation).toBeDefined();
      expect(result.parameters).toBeDefined();
    }
  });

  it("trains a regression model and reports held-out errors", () => {
    const samples = Array.from({ length: 60 }, (_, index) => ({
      features: { attempts: index, accuracy: index / 60 },
      target: index * 1.5 + 2,
    }));
    const results = trainRegisteredDataset(samples, [
      { name: "attempts", type: "numeric" },
      { name: "accuracy", type: "numeric" },
    ], "regression", 7);
    expect(results).toHaveLength(1);
    expect(results[0]?.algorithm).toBe("multiple-linear-regression");
    expect(results[0]?.metrics).toHaveProperty("mae");
    expect(results[0]?.metrics).toHaveProperty("rmse");
    expect(results[0]?.uncertainty).toMatchObject({ method: "holdout-rmse" });
    expect(results[0]?.uncertainty?.residualStdDev).toBeGreaterThanOrEqual(0);
  });

  it("ranks classifiers by F1 then accuracy and regression models by error", () => {
    const classifiers = [
      { algorithm: "knn" as const, model: {}, metrics: { f1: 0.8, accuracy: 0.9 }, trainRows: 48, testRows: 12 },
      { algorithm: "logistic-regression" as const, model: {}, metrics: { f1: 0.9, accuracy: 0.85 }, trainRows: 48, testRows: 12 },
      { algorithm: "decision-tree" as const, model: {}, metrics: { f1: 0.9, accuracy: 0.95 }, trainRows: 48, testRows: 12 },
    ];
    expect(rankTrainingResults(classifiers, "binary-classification").map((result) => [result.rank, result.algorithm]))
      .toEqual([[1, "decision-tree"], [2, "logistic-regression"], [3, "knn"]]);

    const regressors = [
      { algorithm: "multiple-linear-regression" as const, model: {}, metrics: { rmse: 4, mae: 3 }, trainRows: 48, testRows: 12 },
      { algorithm: "multiple-linear-regression" as const, model: {}, metrics: { rmse: 2, mae: 5 }, trainRows: 48, testRows: 12 },
    ];
    expect(rankTrainingResults(regressors, "regression").map((result) => result.rank)).toEqual([1, 2]);
  });

  it("rejects insufficient data, invalid targets and undeclared features", () => {
    expect(() => trainRegisteredDataset(classificationSamples.slice(0, 20), [
      { name: "score", type: "numeric" },
      { name: "subject", type: "categorical", categories: ["Math", "Science"] },
    ], "binary-classification")).toThrow("between 30 and 5000");

    expect(() => trainRegisteredDataset(classificationSamples.map((sample) => ({ ...sample, target: 2 })), [
      { name: "score", type: "numeric" },
      { name: "subject", type: "categorical", categories: ["Math", "Science"] },
    ], "binary-classification")).toThrow("targets must be binary");

    expect(() => trainRegisteredDataset(classificationSamples.map((sample) => ({
      ...sample, features: { ...sample.features, extra: 1 },
    })), [
      { name: "score", type: "numeric" },
      { name: "subject", type: "categorical", categories: ["Math", "Science"] },
    ], "binary-classification")).toThrow("does not match the declared feature schema");
  });

  it("rejects classification datasets without enough examples of both classes", () => {
    const samples = Array.from({ length: 40 }, (_, index) => ({
      features: { score: index },
      target: index === 0 ? 1 : 0,
    }));
    expect(() => trainRegisteredDataset(samples, [{ name: "score", type: "numeric" }], "binary-classification"))
      .toThrow("at least 10 examples of each class");
  });
});
