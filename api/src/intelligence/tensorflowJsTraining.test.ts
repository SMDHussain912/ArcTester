import { describe, expect, it } from "vitest";
import { trainTensorflowRegressionCandidate } from "./tensorflowJsTraining.js";

const samples = Array.from({ length: 100 }, (_, index) => {
  const group = Math.floor(index / 10);
  const local = index % 10;
  const x = group * 10 + local;
  return {
    groupId: `student-${group}`,
    features: [x / 100, (x / 100) ** 2],
    target: 20 + 60 * (x / 100) ** 2,
  };
});

describe("TensorFlow.js regression candidate training", () => {
  it("trains on grouped student data and evaluates on untouched student groups", async () => {
    const result = await trainTensorflowRegressionCandidate(samples, {
      modelId: "tf-student-score",
      version: 1,
      featureNames: ["practiceAccuracy", "practiceAccuracySquared"],
      datasetKind: "synthetic",
      seed: 17,
      epochs: 40,
    });

    expect(result.split).toMatchObject({
      trainRows: 80,
      testRows: 20,
      trainGroups: 8,
      testGroups: 2,
    });
    expect(result.split.trainGroups + result.split.testGroups).toBe(10);
    expect(result.candidate.rows).toBe(20);
    expect(Number.isFinite(result.candidate.mae)).toBe(true);
    expect(Number.isFinite(result.candidate.rmse)).toBe(true);
    expect(Number.isFinite(result.baseline.mae)).toBe(true);
    expect(result.productionEligible).toBe(false);
    if (result.artifact) {
      expect(result.artifact.evaluation.datasetKind).toBe("synthetic");
      expect(result.productionEligible).toBe(false);
    }
  });

  it("rejects missing group identifiers before training", async () => {
    const invalid = samples.map((sample, index) => ({
      ...sample,
      groupId: index === 0 ? "" : sample.groupId,
    }));
    await expect(trainTensorflowRegressionCandidate(invalid, {
      modelId: "tf-student-score",
      version: 1,
      featureNames: ["practiceAccuracy", "practiceAccuracySquared"],
      datasetKind: "synthetic",
    })).rejects.toThrow("Every TensorFlow sample must have a group ID");
  });

  it("rejects fewer than 20 held-out rows", async () => {
    const small = samples.slice(0, 50);
    await expect(trainTensorflowRegressionCandidate(small, {
      modelId: "tf-student-score",
      version: 1,
      featureNames: ["practiceAccuracy", "practiceAccuracySquared"],
      datasetKind: "synthetic",
      testFraction: 0.1,
    })).rejects.toThrow("at least 20 held-out rows");
  });
});
