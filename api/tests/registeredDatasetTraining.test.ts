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
  it("trains only the approved logistic classification baseline with held-out and CV metrics", () => {
    const results = trainRegisteredDataset(classificationSamples, [
      { name: "score", type: "numeric" },
      { name: "subject", type: "categorical", categories: ["Math", "Science"] },
    ], "binary-classification", 42);

    expect(results.map((result) => result.algorithm)).toEqual(["logistic-regression"]);
    expect(results).toHaveLength(1);
    for (const result of results) {
      expect(result.trainRows + result.testRows).toBe(60);
      expect(result.trainRows).toBe(48);
      expect(result.testRows).toBe(12);
      expect(result.metrics).toHaveProperty("accuracy");
      expect(result.crossValidation).toBeDefined();
      expect(result.parameters).toBeDefined();
    }
  });

  it("keeps learner groups isolated during both holdout and classifier hyperparameter tuning", () => {
    const samples: RegisteredTrainingSample[] = Array.from({ length: 100 }, (_, index) => ({
      features: { score: index % 10, attempt: index },
      target: index % 10 < 5 ? 0 : 1,
      groupId: String(Math.floor(index / 10)).padStart(64, "0"),
    }));
    const results = trainRegisteredDataset(samples, [
      { name: "score", type: "numeric" },
      { name: "attempt", type: "numeric" },
    ], "binary-classification", 17);
    expect(results).toHaveLength(1);
    expect(results[0]?.groupSplit?.trainGroups).toBe(8);
    expect(results[0]?.groupSplit?.testGroups).toBe(2);
    expect(results[0]?.crossValidation).toMatchObject({ folds: 5, rows: 80 });
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
    expect(results.map((result) => result.algorithm)).toEqual([
      "multiple-linear-regression",
      "performance-gradient-boosting",
      "performance-random-forest",
    ]);
    for (const result of results) {
      expect(result.metrics).toHaveProperty("mae");
      expect(result.metrics).toHaveProperty("rmse");
      expect(result.uncertainty).toMatchObject({ method: "holdout-rmse" });
      expect(result.uncertainty?.residualStdDev).toBeGreaterThanOrEqual(0);
    }
    expect(results[1]?.model).toHaveProperty("modelType", "gradient-boosting-regressor");
    expect(results[2]?.model).toHaveProperty("modelType", "random-forest-regressor");
  });

  it("ranks classifiers by F1 then accuracy and regression models by error", () => {
    const classifiers = [
      { algorithm: "logistic-regression" as const, model: {}, metrics: { f1: 0.8, accuracy: 0.9 }, trainRows: 48, testRows: 12 },
      { algorithm: "logistic-regression" as const, model: {}, metrics: { f1: 0.9, accuracy: 0.85 }, trainRows: 48, testRows: 12 },
    ];
    expect(rankTrainingResults(classifiers, "binary-classification").map((result) => result.rank))
      .toEqual([1, 2]);

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


  it("uses a learner-group holdout when pseudonymous group IDs are supplied", () => {
    const samples: RegisteredTrainingSample[] = Array.from({ length: 100 }, (_, index) => ({
      features: { attempts: index, accuracy: index / 100 },
      target: index * 1.25 + 3,
      groupId: String(Math.floor(index / 10)).padStart(64, "0"),
    }));
    const results = trainRegisteredDataset(samples, [
      { name: "attempts", type: "numeric" },
      { name: "accuracy", type: "numeric" },
    ], "regression", 42);
    expect(results[0]?.groupSplit).toEqual({ trainGroups: 8, testGroups: 2 });
    expect(results[0]?.trainRows).toBe(80);
    expect(results[0]?.testRows).toBe(20);
  });

  it("rejects incomplete or insufficient learner-group identifiers", () => {
    const grouped = Array.from({ length: 50 }, (_, index) => ({
      features: { attempts: index },
      target: index * 2,
      groupId: String(Math.floor(index / 10)).padStart(64, "0"),
    }));
    expect(() => trainRegisteredDataset(
      grouped.map((sample, index) => index === 0 ? { ...sample, groupId: undefined } : sample),
      [{ name: "attempts", type: "numeric" }],
      "regression",
    )).toThrow("pseudonymous groupId on every sample");
    expect(() => trainRegisteredDataset(
      grouped.slice(0, 40),
      [{ name: "attempts", type: "numeric" }],
      "regression",
    )).toThrow("At least five unique groups");
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


describe("chronological performance model training", () => {
  const featureSchema = [
    { name: "completed_attempts", type: "numeric" as const },
    { name: "previous_accuracy", type: "numeric" as const },
    { name: "recent_accuracy_mean_3", type: "numeric" as const },
  ];

  function performanceSamples() {
    const dayMs = 24 * 60 * 60 * 1000;
    return Array.from({ length: 50 }, (_, groupIndex) => {
      const groupId = createHash("sha256").update(`performance-test-learner:${groupIndex}`).digest("hex");
      return Array.from({ length: 11 }, (_, sampleIndex) => {
        const improving = groupIndex < 25;
        const target = improving
          ? 0.2 + sampleIndex * 0.05
          : 0.8 - sampleIndex * 0.05;
        const occurredAt = new Date(Date.UTC(2026, 0, 1) +
          (groupIndex * 10 + 3 + sampleIndex) * dayMs).toISOString();
        return {
          groupId,
          occurredAt,
          target,
          features: {
            completed_attempts: sampleIndex + 3,
            previous_accuracy: Math.max(0, target - 0.05),
            recent_accuracy_mean_3: Math.max(0, target - 0.1),
          },
        };
      });
    }).flat();
  }

  it("uses chronological 70/15/15 group holdouts, validation selection and rolling-origin folds", () => {
    const results = trainRegisteredDataset(
      performanceSamples(),
      featureSchema,
      "regression",
      42,
      { splitStrategy: "chronological-grouped" },
    );
    expect(results.map((result) => result.algorithm)).toEqual([
      "multiple-linear-regression",
      "performance-gradient-boosting",
      "performance-random-forest",
    ]);
    for (const result of results) {
      expect(result.splitStrategy).toBe("chronological-grouped-70-15-15");
      expect(result.validationRows).toBeGreaterThan(0);
      expect(result.timeSplit).toMatchObject({
        trainGroups: 35,
        validationGroups: 7,
        testGroups: 8,
      });
      expect(result.timeSplit!.trainCutoff < result.timeSplit!.validationCutoff).toBe(true);
      expect(result.crossValidation).toMatchObject({
        method: "rolling-origin-grouped",
        folds: expect.arrayContaining([
          expect.objectContaining({ trainGroups: expect.any(Number), testGroups: expect.any(Number) }),
          expect.objectContaining({ trainGroups: expect.any(Number), testGroups: expect.any(Number) }),
        ]),
      });
      expect(result.metrics).toMatchObject({
        mae: expect.any(Number),
        rmse: expect.any(Number),
        r2: expect.any(Number),
      });
    }
  });

  it("rejects performance training without point-in-time timestamps and enough learner groups", () => {
    const samples = performanceSamples().map((sample, index) =>
      index === 0 ? { ...sample, occurredAt: undefined } : sample);
    expect(() => trainRegisteredDataset(
      samples,
      featureSchema,
      "regression",
      42,
      { splitStrategy: "chronological-grouped" },
    )).toThrow("valid occurredAt timestamp");
  });
});
