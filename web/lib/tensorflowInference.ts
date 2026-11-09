import * as tf from "@tensorflow/tfjs";

export interface BrowserTensorflowArtifact {
  schemaVersion: 1;
  format: "tensorflow-js-layers-model";
  modelId: string;
  version: number;
  task: "regression";
  featureSchema: Array<{ name: string; type: "numeric" }>;
  normalization: { means: number[]; scales: number[] };
  modelTopology: Record<string, unknown>;
  weightSpecs: Array<{ name: string; shape: number[]; dtype: "float32" | "int32" | "bool" }>;
  weightDataBase64: string;
  evaluation: {
    candidateMae: number;
    baselineMae: number;
    candidateRmse: number;
    baselineRmse: number;
    testSamples: number;
    splitMethod: "grouped-student-holdout" | "walk-forward";
    datasetKind: "synthetic" | "real-anonymized";
  };
  trainedAt: string;
}

export interface TensorflowBrowserPredictor {
  modelId: string;
  version: number;
  predict(features: Record<string, number>): Promise<number>;
  dispose(): void;
}

function validateArtifact(artifact: BrowserTensorflowArtifact): void {
  if (artifact.schemaVersion !== 1 || artifact.format !== "tensorflow-js-layers-model" || artifact.task !== "regression") {
    throw new Error("Unsupported TensorFlow.js model artifact");
  }
  const names = artifact.featureSchema.map((feature) => feature.name);
  if (!names.length || new Set(names).size !== names.length ||
      artifact.normalization.means.length !== names.length ||
      artifact.normalization.scales.length !== names.length ||
      artifact.normalization.scales.some((scale) => !Number.isFinite(scale) || scale <= 0) ||
      artifact.normalization.means.some((mean) => !Number.isFinite(mean))) {
    throw new Error("TensorFlow.js feature and normalization schema is invalid");
  }
  if (!artifact.weightDataBase64 || artifact.weightDataBase64.length > 16_000_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(artifact.weightDataBase64)) {
    throw new Error("TensorFlow.js weight payload is invalid");
  }
  if (artifact.evaluation.datasetKind !== "real-anonymized" ||
      artifact.evaluation.testSamples < 20 ||
      artifact.evaluation.candidateMae > artifact.evaluation.baselineMae ||
      artifact.evaluation.candidateRmse > artifact.evaluation.baselineRmse) {
    throw new Error("TensorFlow.js artifact has not passed production eligibility");
  }
}

export async function createTensorflowBrowserPredictor(
  artifact: BrowserTensorflowArtifact,
): Promise<TensorflowBrowserPredictor> {
  validateArtifact(artifact);
  const decoded = atob(artifact.weightDataBase64);
  const weightBytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    weightBytes[index] = decoded.charCodeAt(index);
  }
  const model = await tf.loadLayersModel(tf.io.fromMemory(
    artifact.modelTopology,
    artifact.weightSpecs as tf.io.WeightsManifestEntry[],
    weightBytes.buffer,
  ));

  let disposed = false;
  return {
    modelId: artifact.modelId,
    version: artifact.version,
    async predict(features) {
      if (disposed) throw new Error("TensorFlow.js predictor has been disposed");
      const expected = artifact.featureSchema.map((feature) => feature.name);
      const actual = Object.keys(features);
      if (actual.length !== expected.length || expected.some((name) => !(name in features)) ||
          actual.some((name) => !expected.includes(name))) {
        throw new Error("Prediction features do not match the registered model schema");
      }
      const normalized = expected.map((name, index) => {
        const value = features[name];
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error(`Prediction feature ${name} must be a finite number`);
        }
        return (value - artifact.normalization.means[index]!) / artifact.normalization.scales[index]!;
      });
      const input = tf.tensor2d([normalized], [1, normalized.length]);
      try {
        const output = model.predict(input);
        const prediction = Array.isArray(output) ? output[0] : output;
        if (!prediction) throw new Error("TensorFlow.js model returned no prediction tensor");
        try {
          const values = await prediction.data();
          const result = values[0];
          if (typeof result !== "number" || !Number.isFinite(result)) {
            throw new Error("TensorFlow.js model returned a non-finite prediction");
          }
          return result;
        } finally {
          prediction.dispose();
          if (Array.isArray(output)) output.slice(1).forEach((tensor) => tensor.dispose());
        }
      } finally {
        input.dispose();
      }
    },
    dispose() {
      if (!disposed) {
        model.dispose();
        disposed = true;
      }
    },
  };
}
