import { describe, expect, it } from "vitest";
import { stableModelJson, trainModel, type ModelDatasetInput } from "../src/modelTraining.js";

function dataset(task: "classification" | "regression", rows: Record<string, unknown>[]): ModelDatasetInput {
  return {
    task,
    targetColumn: "target",
    featureSchemaJson: JSON.stringify({ targetColumn: "target", targetType: task === "classification" ? "string" : "number", features: [{ name: "score", type: "number" }] }),
    samplesJson: JSON.stringify(rows),
  };
}

describe("lightweight model trainer", () => {
  it("trains a deterministic classifier and evaluates only held-out rows", () => {
    const rows = Array.from({ length: 30 }, (_value, index) => {
      const score = index / 29;
      return { score, target: score < 0.5 ? "not-ready" : "ready" };
    });
    const input = dataset("classification", rows);
    const first = trainModel(input, { seed: 17, epochs: 120 });
    const second = trainModel(input, { seed: 17, epochs: 120 });
    expect(first.algorithm).toBe("logistic_regression");
    expect(first.metrics.accuracy).toBeGreaterThanOrEqual(0.8);
    expect(first.validationRows).toBeGreaterThan(0);
    expect(stableModelJson(first.artifact)).toBe(stableModelJson(second.artifact));
  });

  it("trains regression and reports held-out mean absolute error", () => {
    const rows = Array.from({ length: 30 }, (_value, index) => {
      const score = index / 10;
      return { score, target: 2 * score + 3 };
    });
    const trained = trainModel(dataset("regression", rows), { seed: 3, epochs: 150 });
    expect(trained.algorithm).toBe("linear_regression");
    expect(trained.metrics.mae).toBeLessThan(0.5);
    expect(trained.validationRows).toBeGreaterThan(0);
  });

  it("rejects undersized data and excessive categorical expansion", () => {
    expect(() => trainModel(dataset("regression", [
      { score: 1, target: 3 }, { score: 2, target: 5 }, { score: 3, target: 7 },
    ]), { seed: 1, epochs: 10 })).toThrow(/5 to 500/);
  });
});
