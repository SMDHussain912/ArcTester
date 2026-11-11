import { afterEach, describe, expect, it } from "vitest";
import * as tf from "@tensorflow/tfjs";
import { createTensorflowBrowserPredictor, type BrowserTensorflowArtifact } from "./tensorflowInference.js";

// The published @tensorflow/tfjs-layers package ships only compiled JS (no .d.ts) in
// this environment, so the `export * from '@tensorflow/tfjs-layers'` re-export in
// @tensorflow/tfjs is empty. The layers/weights APIs are cast to `any` here.
const TF = tf as unknown as {
  setBackend(backend: string): Promise<void>;
  ready(): Promise<void>;
  sequential(layers?: unknown[]): { add(layer: unknown): void; setWeights(weights: unknown[]): void; dispose(): void; save(handler: unknown): Promise<unknown>; predict(input: unknown): unknown; };
  layers: { dense(config: unknown): unknown; [key: string]: (config: unknown) => unknown };
  tensor2d(data: unknown, shape?: number[]): { data(): Promise<unknown>; dispose(): void };
  tensor1d(data: unknown): { data(): Promise<unknown>; dispose(): void };
  io: {
    fromMemory(modelTopology: unknown, weightSpecs?: unknown, weightData?: unknown): unknown;
    withSaveHandler(saveHandler: (artifacts: unknown) => Promise<unknown>): unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

async function makeArtifact(): Promise<BrowserTensorflowArtifact> {
  await TF.setBackend("cpu");
  await TF.ready();
  const model = TF.sequential();
  model.add(TF.layers.dense({ inputShape: [1], units: 1, activation: "linear" }));
  model.setWeights([TF.tensor2d([[2]]), TF.tensor1d([1])]);

  let saved: unknown;
  await model.save(TF.io.withSaveHandler(async (artifacts: unknown) => {
    saved = artifacts;
    const topo = (artifacts as { modelTopology?: unknown })?.modelTopology ?? {};
    const specs = (artifacts as { weightSpecs?: unknown })?.weightSpecs ?? [];
    const weightData = (artifacts as { weightData?: unknown })?.weightData;
    return {
      modelArtifactsInfo: {
        dateSaved: new Date(),
        modelTopologyType: "JSON",
        modelTopologyBytes: JSON.stringify(topo).length,
        weightSpecsBytes: JSON.stringify(specs).length,
        weightDataBytes: Array.isArray(weightData)
          ? weightData.reduce((sum: number, part: { byteLength: number }) => sum + part.byteLength, 0)
          : (weightData as { byteLength?: number })?.byteLength ?? 0,
      },
    };
  }));
  model.dispose();
  const savedArtifacts = saved as { modelTopology: unknown; weightSpecs: unknown; weightData: unknown };
  if (!savedArtifacts?.modelTopology || !savedArtifacts.weightSpecs || !savedArtifacts.weightData) {
    throw new Error("Test model export failed");
  }
  const buffers = Array.isArray(savedArtifacts.weightData) ? savedArtifacts.weightData : [savedArtifacts.weightData];
  const weights = Buffer.concat(buffers.map((buffer) => Buffer.from(buffer as ArrayBuffer))).toString("base64");
  return {
    schemaVersion: 1,
    format: "tensorflow-js-layers-model",
    modelId: "browser-inference-test",
    version: 3,
    task: "regression",
    featureSchema: [{ name: "practice_score", type: "numeric" }],
    normalization: { means: [1], scales: [2] },
    modelTopology: savedArtifacts.modelTopology as Record<string, unknown>,
    weightSpecs: savedArtifacts.weightSpecs as BrowserTensorflowArtifact["weightSpecs"],
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