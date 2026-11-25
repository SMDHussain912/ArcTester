import { describe, expect, it } from "vitest";
import { evaluateModelArtifacts, predictModelArtifact } from "../src/modelInference.js";
import { trainModel, type ModelDatasetInput } from "../src/modelTraining.js";

function makeDataset(task: "classification" | "regression", rows: Record<string, unknown>[]): ModelDatasetInput {
  return {
    task,
    targetColumn: "target",
    featureSchemaJson: JSON.stringify({ targetColumn: "target", targetType: task === "classification" ? "string" : "number", features: [{ name: "score", type: "number" }] }),
    samplesJson: JSON.stringify(rows),
  };
}

describe("registered model inference", () => {
  it("predicts a classification label from the serialized artifact", () => {
    const rows = Array.from({ length: 30 }, (_value, index) => {
      const score = index / 29;
      return { score, target: score < 0.5 ? "not-ready" : "ready" };
    });
    const trained = trainModel(makeDataset("classification", rows), { seed: 17, epochs: 120 });
    const prediction = predictModelArtifact(trained.artifact, { score: 0.95 });
    expect(prediction.type).toBe("classification");
    if (prediction.type === "classification") {
      expect(prediction.label).toBe("ready");
      expect(prediction.confidence).toBeGreaterThan(0.5);
    }
  });

  it("predicts a regression value and rejects missing or extra features", () => {
    const rows = Array.from({ length: 30 }, (_value, index) => {
      const score = index / 10;
      return { score, target: 2 * score + 3 };
    });
    const trained = trainModel(makeDataset("regression", rows), { seed: 3, epochs: 150 });
    const prediction = predictModelArtifact(trained.artifact, { score: 4 });
    expect(prediction.type).toBe("regression");
    if (prediction.type === "regression") expect(prediction.value).toBeCloseTo(11, 0);
    expect(() => predictModelArtifact(trained.artifact, { score: 4, other: 1 })).toThrow(/exactly match/);
  });

  it("computes candidate and baseline metrics from actual verification predictions", () => {
    const rows = Array.from({ length: 30 }, (_value, index) => {
      const score = index / 29;
      return { score, target: score < 0.5 ? "not-ready" : "ready" };
    });
    const input = makeDataset("classification", rows);
    const candidate = trainModel(input, { seed: 11, epochs: 120 });
    const baseline = trainModel(input, { seed: 27, epochs: 10 });
    const metrics = evaluateModelArtifacts(candidate.artifact, baseline.artifact, rows, "target", "classification");
    expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(metrics.accuracy).toBeLessThanOrEqual(1);
    expect(metrics.baselineAccuracy).toBeGreaterThanOrEqual(0);
    expect(metrics.baselineAccuracy).toBeLessThanOrEqual(1);
  });
});
