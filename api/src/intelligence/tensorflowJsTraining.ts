import * as tf from "@tensorflow/tfjs";
import {
  evaluateLinearRegression,
  fitLinearRegression,
  type RegressionMetrics,
  type RegressionSample,
} from "./linearRegression.js";
import { splitDatasetRowsByGroup } from "./datasetPipeline.js";
import {
  isTensorflowJsArtifactProductionEligible,
  validateTensorflowJsArtifact,
  type TensorflowJsArtifact,
} from "./tensorflowJsArtifact.js";

export interface TensorflowTrainingSample extends RegressionSample {
  /** Stable pseudonymous learner key. Never serialized into the model artifact. */
  groupId: string;
}

export interface TensorflowTrainingOptions {
  modelId: string;
  version: number;
  featureNames: string[];
  datasetKind: "synthetic" | "real-anonymized";
  seed?: number;
  testFraction?: number;
  epochs?: number;
  batchSize?: number;
}

export interface TensorflowTrainingResult {
  artifact: TensorflowJsArtifact | null;
  productionEligible: boolean;
  split: { trainRows: number; testRows: number; trainGroups: number; testGroups: number };
  candidate: RegressionMetrics;
  baseline: RegressionMetrics;
  reason: string;
}

function normalizeSamples(samples: RegressionSample[], means: number[], scales: number[]): number[][] {
  return samples.map((sample) =>
    sample.features.map((value, index) => (value - means[index]) / scales[index])
  );
}

function metricsForPredictions(targets: number[], predictions: number[]): RegressionMetrics {
  if (targets.length === 0 || targets.length !== predictions.length) {
    throw new Error("TensorFlow evaluation requires matching non-empty targets and predictions");
  }
  const meanTarget = targets.reduce((sum, value) => sum + value, 0) / targets.length;
  const squaredTotal = targets.reduce((sum, value) => sum + (value - meanTarget) ** 2, 0);
  const absoluteError = targets.reduce((sum, value, index) => sum + Math.abs(value - predictions[index]), 0);
  const squaredError = targets.reduce((sum, value, index) => sum + (value - predictions[index]) ** 2, 0);
  return {
    rows: targets.length,
    mae: absoluteError / targets.length,
    rmse: Math.sqrt(squaredError / targets.length),
    rSquared: squaredTotal > 0 ? 1 - squaredError / squaredTotal : null,
  };
}

function weightDataToBase64(weightData: ArrayBuffer | ArrayBuffer[] | undefined): string {
  if (!weightData) throw new Error("TensorFlow.js did not export model weights");
  const buffers = Array.isArray(weightData) ? weightData : [weightData];
  return Buffer.concat(buffers.map((buffer) => Buffer.from(buffer))).toString("base64");
}

/**
 * Trains a small CPU-compatible TensorFlow.js regression candidate.
 * The exact same student-group holdout is used by the statistical baseline.
 * Candidate artifacts are returned only when both MAE and RMSE beat or tie
 * the baseline; synthetic data can never pass the production eligibility gate.
 */
export async function trainTensorflowRegressionCandidate(
  samples: TensorflowTrainingSample[],
  options: TensorflowTrainingOptions,
): Promise<TensorflowTrainingResult> {
  const seed = options.seed ?? 42;
  const testFraction = options.testFraction ?? 0.2;
  const epochs = options.epochs ?? 80;
  const batchSize = options.batchSize ?? 32;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(options.modelId)) throw new Error("modelId is invalid");
  if (!Number.isInteger(options.version) || options.version < 1) throw new Error("version must be a positive integer");
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed is invalid");
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 500) throw new Error("epochs must be between 1 and 500");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 256) throw new Error("batchSize must be between 1 and 256");
  if (!options.featureNames.length || options.featureNames.length > 128 ||
      new Set(options.featureNames).size !== options.featureNames.length) {
    throw new Error("featureNames must contain 1 to 128 unique names");
  }
  if (samples.length < 30 || samples.length > 5000) throw new Error("TensorFlow training requires 30 to 5000 rows");
  if (samples.some((sample) =>
    typeof sample.groupId !== "string" || !sample.groupId.trim() ||
    sample.features.length !== options.featureNames.length ||
    sample.features.some((value) => !Number.isFinite(value)) ||
    !Number.isFinite(sample.target)
  )) {
    throw new Error("Every TensorFlow sample must have a group ID and finite, schema-matched numeric values");
  }

  const split = splitDatasetRowsByGroup(samples, "groupId", { testFraction, seed });
  const train = split.train.map(({ features, target }) => ({ features, target }));
  const test = split.test.map(({ features, target }) => ({ features, target }));
  if (test.length < 20) throw new Error("TensorFlow evaluation requires at least 20 held-out rows");
  const trainGroups = new Set(split.train.map((sample) => sample.groupId));
  const testGroups = new Set(split.test.map((sample) => sample.groupId));
  if ([...trainGroups].some((group) => testGroups.has(group))) {
    throw new Error("Student group leakage detected between training and evaluation rows");
  }

  const featureCount = options.featureNames.length;
  const means = Array.from({ length: featureCount }, (_, index) =>
    train.reduce((sum, sample) => sum + sample.features[index], 0) / train.length
  );
  const scales = Array.from({ length: featureCount }, (_, index) => {
    const variance = train.reduce((sum, sample) =>
      sum + (sample.features[index] - means[index]) ** 2, 0
    ) / train.length;
    const standardDeviation = Math.sqrt(variance);
    return standardDeviation > 0 ? standardDeviation : 1;
  });
  const normalizedTrain = normalizeSamples(train, means, scales);
  const normalizedTest = normalizeSamples(test, means, scales);

  const baselineModel = fitLinearRegression(train);
  const baseline = evaluateLinearRegression(baselineModel, test);

  await tf.setBackend("cpu");
  await tf.ready();
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        inputShape: [featureCount],
        units: 16,
        activation: "relu",
        kernelInitializer: tf.initializers.glorotUniform({ seed }),
      }),
      tf.layers.dense({
        units: 1,
        activation: "linear",
        kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 1 }),
      }),
    ],
  });
  const trainFeatures = tf.tensor2d(normalizedTrain, [normalizedTrain.length, featureCount]);
  const trainTargets = tf.tensor2d(train.map((sample) => sample.target), [train.length, 1]);
  const testFeatures = tf.tensor2d(normalizedTest, [normalizedTest.length, featureCount]);

  try {
    model.compile({
      optimizer: tf.train.adam(0.01),
      loss: "meanSquaredError",
      metrics: ["mae"],
    });
    await model.fit(trainFeatures, trainTargets, {
      epochs,
      batchSize: Math.min(batchSize, train.length),
      shuffle: false,
      verbose: 0,
    });
    const output = model.predict(testFeatures) as tf.Tensor;
    let candidate: RegressionMetrics;
    try {
      const predictions = Array.from(await output.data());
      candidate = metricsForPredictions(test.map((sample) => sample.target), predictions);
    } finally {
      output.dispose();
    }

    if (candidate.mae > baseline.mae || candidate.rmse > baseline.rmse) {
      return {
        artifact: null,
        productionEligible: false,
        split: { trainRows: train.length, testRows: test.length, trainGroups: trainGroups.size, testGroups: testGroups.size },
        candidate,
        baseline,
        reason: "TensorFlow candidate did not beat both statistical baseline metrics; no deployable artifact was produced.",
      };
    }

    let savedArtifacts: tf.io.ModelArtifacts | undefined;
    await model.save(tf.io.withSaveHandler(async (artifacts) => {
      savedArtifacts = artifacts;
      const topologyBytes = Buffer.byteLength(JSON.stringify(artifacts.modelTopology ?? {}), "utf8");
      const specsBytes = Buffer.byteLength(JSON.stringify(artifacts.weightSpecs ?? []), "utf8");
      const weightBytes = Array.isArray(artifacts.weightData)
        ? artifacts.weightData.reduce((sum, buffer) => sum + buffer.byteLength, 0)
        : artifacts.weightData?.byteLength ?? 0;
      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: "JSON",
          modelTopologyBytes: topologyBytes,
          weightSpecsBytes: specsBytes,
          weightDataBytes: weightBytes,
        },
      };
    }));
    if (!savedArtifacts?.modelTopology || !savedArtifacts.weightSpecs) {
      throw new Error("TensorFlow.js model export was incomplete");
    }
    const artifact = validateTensorflowJsArtifact({
      schemaVersion: 1,
      format: "tensorflow-js-layers-model",
      modelId: options.modelId,
      version: options.version,
      task: "regression",
      featureSchema: options.featureNames.map((name) => ({ name, type: "numeric" as const })),
      normalization: { means, scales },
      modelTopology: savedArtifacts.modelTopology,
      weightSpecs: savedArtifacts.weightSpecs,
      weightDataBase64: weightDataToBase64(savedArtifacts.weightData),
      evaluation: {
        candidateMae: candidate.mae,
        baselineMae: baseline.mae,
        candidateRmse: candidate.rmse,
        baselineRmse: baseline.rmse,
        testSamples: test.length,
        splitMethod: "grouped-student-holdout",
        datasetKind: options.datasetKind,
      },
      trainedAt: new Date().toISOString(),
    });
    return {
      artifact,
      productionEligible: isTensorflowJsArtifactProductionEligible(artifact),
      split: { trainRows: train.length, testRows: test.length, trainGroups: trainGroups.size, testGroups: testGroups.size },
      candidate,
      baseline,
      reason: options.datasetKind === "synthetic"
        ? "Candidate beat the baseline, but synthetic data is never production eligible."
        : "Candidate passed the held-out baseline comparison and real-anonymized provenance gate.",
    };
  } finally {
    trainFeatures.dispose();
    trainTargets.dispose();
    testFeatures.dispose();
    model.dispose();
  }
}
