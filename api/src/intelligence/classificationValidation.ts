export interface BinaryTrainingSample {
  features: number[];
  label: 0 | 1;
}

export interface BinaryClassifierAdapter<TModel> {
  fit(samples: BinaryTrainingSample[]): TModel;
  predict(model: TModel, features: number[]): 0 | 1;
}

export interface BinaryClassificationMetrics {
  rows: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  truePositive: number;
  trueNegative: number;
  falsePositive: number;
  falseNegative: number;
}

export interface WalkForwardClassificationOptions {
  /** Number of earliest rows required before the first prediction. */
  minimumTrainingRows?: number;
  /** Optional cap on the number of newest rows evaluated. */
  maximumEvaluationRows?: number;
}

function validateSamples(samples: BinaryTrainingSample[]): number {
  if (samples.length < 3) throw new Error("At least three chronological samples are required");
  const featureCount = samples[0]?.features.length ?? 0;
  if (featureCount === 0) throw new Error("Each sample must contain at least one feature");
  let negative = false;
  let positive = false;
  for (const [index, sample] of samples.entries()) {
    if (sample.features.length !== featureCount) throw new Error(`Sample ${index} has an inconsistent feature count`);
    if (sample.features.some((value) => !Number.isFinite(value))) throw new Error(`Sample ${index} contains a non-finite feature`);
    if (sample.label !== 0 && sample.label !== 1) throw new Error(`Sample ${index} has an invalid binary label`);
    if (sample.label === 0) negative = true;
    else positive = true;
  }
  if (!negative || !positive) throw new Error("Chronological data must contain both binary classes");
  return featureCount;
}

function metrics(actual: number[], predicted: number[]): BinaryClassificationMetrics {
  let truePositive = 0, trueNegative = 0, falsePositive = 0, falseNegative = 0;
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] === 1 && predicted[index] === 1) truePositive += 1;
    else if (actual[index] === 0 && predicted[index] === 0) trueNegative += 1;
    else if (predicted[index] === 1) falsePositive += 1;
    else falseNegative += 1;
  }
  const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
  const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
  return {
    rows: actual.length,
    accuracy: (truePositive + trueNegative) / actual.length,
    precision,
    recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    truePositive, trueNegative, falsePositive, falseNegative,
  };
}

/**
 * Evaluates a binary classifier with expanding-window walk-forward validation.
 * Each fold is fitted only on earlier rows; the baseline predicts the majority
 * class from that same training prefix. Samples must already be chronological.
 */
export function evaluateBinaryClassifierWalkForward<TModel>(
  samples: BinaryTrainingSample[],
  adapter: BinaryClassifierAdapter<TModel>,
  options: WalkForwardClassificationOptions = {},
): {
  modelMetrics: BinaryClassificationMetrics;
  majorityBaselineMetrics: BinaryClassificationMetrics;
  beatsMajorityBaseline: boolean;
  trainingRowsAtFirstFold: number;
  evaluationRows: number;
  folds: number;
} {
  validateSamples(samples);
  const minimumTrainingRows = options.minimumTrainingRows ?? Math.max(4, Math.floor(samples.length * 2 / 3));
  if (!Number.isInteger(minimumTrainingRows) || minimumTrainingRows < 2 || minimumTrainingRows >= samples.length) {
    throw new Error("minimumTrainingRows must be an integer between 2 and sample count minus 1");
  }
  const maximumEvaluationRows = options.maximumEvaluationRows ?? samples.length - minimumTrainingRows;
  if (!Number.isInteger(maximumEvaluationRows) || maximumEvaluationRows < 1) {
    throw new Error("maximumEvaluationRows must be a positive integer");
  }
  const firstTestIndex = Math.max(minimumTrainingRows, samples.length - maximumEvaluationRows);
  const actual: number[] = [];
  const modelPredictions: number[] = [];
  const baselinePredictions: number[] = [];

  for (let testIndex = firstTestIndex; testIndex < samples.length; testIndex += 1) {
    const training = samples.slice(0, testIndex);
    const testing = samples[testIndex];
    const model = adapter.fit(training);
    const prediction = adapter.predict(model, testing.features);
    if (prediction !== 0 && prediction !== 1) throw new Error("Classifier returned an invalid binary prediction");
    const positives = training.reduce((sum, sample) => sum + sample.label, 0);
    const majority = positives * 2 > training.length ? 1 : 0;
    actual.push(testing.label);
    modelPredictions.push(prediction);
    baselinePredictions.push(majority);
  }

  const modelMetrics = metrics(actual, modelPredictions);
  const majorityBaselineMetrics = metrics(actual, baselinePredictions);
  return {
    modelMetrics,
    majorityBaselineMetrics,
    beatsMajorityBaseline: modelMetrics.accuracy > majorityBaselineMetrics.accuracy,
    trainingRowsAtFirstFold: firstTestIndex,
    evaluationRows: actual.length,
    folds: actual.length,
  };
}
