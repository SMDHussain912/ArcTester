import { afterEach, describe, expect, it } from "vitest";
import * as tf from "@tensorflow/tfjs";
import { createTensorflowBrowserPredictor, type BrowserTensorflowArtifact } from "./tensorflowInference.js";

async function makeArtifact(): Promise<BrowserTensorflowArtifact> {
  await tf.setBackend("cpu");
  await tf.ready();
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [1], units: 1, activation: "linear" }));
  model.setWeights([tf.tensor2d([[2]]), tf.tensor1d([1])]);

  let saved: tf.io.ModelArtifacts | undefined;
  await model.save(tf.io.withSaveHandler(async (artifacts) => {
    saved = artifacts;
    return {
      modelArtifactsInfo: {
        dateSaved: new Date(),
        modelTopologyType: "JSON",
        modelTopologyBytes: JSON.stringify(artifacts.modelTopology ?? {}).length,
        weightSpecsBytes: JSON.stringify(artifacts.weightSpecs ?? []).length,
        weightDataBytes: Array.isArray(artifacts.weightData)
          ? artifacts.weightData.reduce((sum, part) => sum + part.byteLength, 0)
          : artifacts.weightData?.byteLength ?? 0,
      },
    };
  }));
  model.dispose();
  if (!saved?.modelTopology || !saved.weightSpecs || !saved.weightData) {
    throw new Error("Test model export failed");
  }
  const buffers = Array.isArray(saved.weightData) ? saved.weightData : [saved.weightData];
  const weights = Buffer.concat(buffers.map((buffer) => Buffer.from(buffer))).toString("base64");
  return {
    schemaVersion: 1,
    format: "tensorflow-js-layers-model",
    modelId: "browser-inference-test",
    version: 3,
    task: "regression",
    featureSchema: [{ name: "practice_score", type: "numeric" }],
    normalization: { means: [1], scales: [2] },
    modelTopology: saved.modelTopology as Record<string, unknown>,
    weightSpecs: saved.weightSpecs as BrowserTensorflowArtifact["weightSpecs"],
    weightDataBase64: weights,
    evaluation: {
      candidateMae: 0.1,
      baselineMae: 0.2,
      candidateRmse: 0.1,
      baselineRmse: 0.2,
      testSamples: 24,
      splitMethod: "grouped-student-holdout",
      datasetKind: "real-anonymized",
    },
    trainedAt: new Date().toISOString(),
  };
}

describe("TensorFlow.js browser inference", () => {
  let predictor: Awaited<ReturnType<typeof createTensorflowBrowserPredictor>> | undefined;

  afterEach(() => {
    predictor?.dispose();
    predictor = undefined;
  });

  it("loads a production-eligible artifact and predicts with training normalization", async () => {
    predictor = await createTensorflowBrowserPredictor(await makeArtifact());
    expect(predictor.modelId).toBe("browser-inference-test");
    expect(predictor.version).toBe(3);
    // (5 - mean 1) / scale 2 = 2; model output is 2*2 + 1 = 5.
    await expect(predictor.predict({ practice_score: 5 })).resolves.toBeCloseTo(5, 5);
  });

  it("rejects unknown, missing and non-finite prediction features", async () => {
    predictor = await createTensorflowBrowserPredictor(await makeArtifact());
    await expect(predictor.predict({ wrong_feature: 5 })).rejects.toThrow("do not match");
    await expect(predictor.predict({})).rejects.toThrow("do not match");
    await expect(predictor.predict({ practice_score: Number.NaN })).rejects.toThrow("finite number");
  });

  it("rejects synthetic artifacts before loading them", async () => {
    const artifact = await makeArtifact();
    artifact.evaluation.datasetKind = "synthetic";
    await expect(createTensorflowBrowserPredictor(artifact)).rejects.toThrow("production eligibility");
  });

  it("rejects use after disposal", async () => {
    predictor = await createTensorflowBrowserPredictor(await makeArtifact());
    predictor.dispose();
    await expect(predictor.predict({ practice_score: 5 })).rejects.toThrow("disposed");
  });
});
