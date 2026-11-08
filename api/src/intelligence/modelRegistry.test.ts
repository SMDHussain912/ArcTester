import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fitLinearRegression } from "./linearRegression.js";
import { fitLogisticRegression } from "./logisticRegression.js";
import { ModelRegistry, transformFeatures } from "./modelRegistry.js";

describe("ModelRegistry", () => {
  let directory: string;
  let registry: ModelRegistry;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "arctester-model-registry-"));
    registry = new ModelRegistry(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const classifierInput = (dataset = "demo") => ({
    modelId: "demo-classifier",
    algorithm: "logistic-regression" as const,
    task: "binary-classification" as const,
    dataset,
    targetColumn: "target_label",
    featureSchema: [{ name: "score", type: "numeric" as const }],
    model: fitLogisticRegression([
      { features: [0], label: 0 },
      { features: [1], label: 0 },
      { features: [9], label: 1 },
      { features: [10], label: 1 },
    ]),
  });

  it("registers, activates, lists and predicts from a saved model without fitting again", async () => {
    const saved = await registry.register(classifierInput());
    expect(saved.version).toBe(1);
    expect(await registry.list("demo-classifier")).toEqual([saved]);

    const prediction = await registry.predict("demo-classifier", { score: 10 });
    expect(prediction.version).toBe(1);
    expect(prediction.task).toBe("binary-classification");
    expect(prediction.prediction).toBe(1);
    expect(prediction.probability).toBeGreaterThan(0.5);

    const restartedRegistry = new ModelRegistry(directory);
    await expect(restartedRegistry.predict("demo-classifier", { score: 0 }))
      .resolves.toMatchObject({ modelId: "demo-classifier", version: 1, prediction: 0 });
  });

  it("versions models and supports explicit activation and rollback", async () => {
    await registry.register(classifierInput("dataset-v1"));
    const second = await registry.register(classifierInput("dataset-v2"));
    expect(second.version).toBe(2);
    await registry.activate("demo-classifier", 2);
    expect((await registry.predict("demo-classifier", { score: 10 })).version).toBe(2);
    await expect(registry.rollback("demo-classifier")).resolves.toBe(1);
    expect((await registry.predict("demo-classifier", { score: 0 })).version).toBe(1);
  });

  it("rejects unsafe identifiers, invalid artifacts and incompatible preprocessing schemas", async () => {
    await expect(registry.register({ ...classifierInput(), modelId: "../escape" }))
      .rejects.toThrow("modelId");
    await expect(registry.register({
      ...classifierInput(),
      featureSchema: [{ name: "score", type: "numeric" as const }, { name: "other", type: "numeric" as const }],
    })).rejects.toThrow("feature count");
    await expect(registry.register({
      ...classifierInput(),
      task: "regression" as const,
    })).rejects.toThrow("Task does not match algorithm");
  });

  it("rejects corrupt saved model JSON instead of loading it", async () => {
    await registry.register(classifierInput());
    const artifactPath = path.join(directory, "demo-classifier", "versions", "1.json");
    await writeFile(artifactPath, "{broken", "utf8");
    const restartedRegistry = new ModelRegistry(directory);
    await expect(restartedRegistry.predict("demo-classifier", { score: 5 }))
      .rejects.toThrow("invalid JSON");
  });

  it("persists regression models and returns numeric predictions", async () => {
    const model = fitLinearRegression([
      { features: [0], target: 2 },
      { features: [1], target: 4 },
      { features: [2], target: 6 },
      { features: [3], target: 8 },
    ]);
    await registry.register({
      modelId: "score-regressor",
      algorithm: "multiple-linear-regression",
      task: "regression",
      dataset: "scores",
      targetColumn: "target_score",
      featureSchema: [{ name: "attempts", type: "numeric" }],
      model,
    });
    const prediction = await registry.predict("score-regressor", { attempts: 4 });
    expect(prediction.task).toBe("regression");
    expect(typeof prediction.prediction).toBe("number");
    expect(prediction.prediction).toBeCloseTo(10, 0);
  });

  it("encodes unseen categories into the reserved unknown bucket", () => {
    expect(transformFeatures([
      { name: "subject", type: "categorical", categories: ["C", "Java"] },
      { name: "attempts", type: "numeric" },
    ], { subject: "Python", attempts: 3 })).toEqual([0, 0, 1, 3]);
  });

  it("requires an exact input feature schema", () => {
    const schema = [{ name: "attempts", type: "numeric" as const }];
    expect(() => transformFeatures(schema, {})).toThrow("Missing prediction feature");
    expect(() => transformFeatures(schema, { attempts: 2, extra: 1 })).toThrow("Unknown prediction feature");
    expect(() => transformFeatures(schema, { attempts: "2" })).toThrow("finite number");
  });

  it("rejects rollback when only one version exists", async () => {
    await registry.register(classifierInput());
    await expect(registry.rollback("demo-classifier")).rejects.toThrow("No previous model version");
  });

  it("does not expose a missing active model as an empty prediction", async () => {
    await mkdir(path.join(directory, "empty-model"), { recursive: true });
    await expect(registry.predict("empty-model", { score: 1 }))
      .rejects.toThrow("No active model version");
  });
});
