import { fitDecisionTree, predictDecisionTreeClass } from "./decisionTree.js";
import { fitKnn, predictKnnClass } from "./knn.js";
import { fitLogisticRegression, predictLogisticClass } from "./logisticRegression.js";
import { fitNaiveBayes, predictNaiveBayesClass } from "./naiveBayes.js";
import type { BinaryTrainingSample } from "./classificationValidation.js";

export interface CrossValidationOptions {
  folds?: number;
  seed?: number;
}

export interface CrossValidationMetrics {
  folds: number;
  rows: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface HyperparameterCandidate {
  algorithm: "logistic-regression" | "knn" | "decision-tree" | "gaussian-naive-bayes";
  parameters: Record<string, number>;
}

export interface TunedClassifierResult {
  algorithm: HyperparameterCandidate["algorithm"];
  bestParameters: Record<string, number>;
  bestMetrics: CrossValidationMetrics;
  candidates: Array<{ parameters: Record<string, number>; metrics: CrossValidationMetrics }>;
}

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stratified deterministic folds: each fold receives a near-equal class mix. */
export function createStratifiedFolds(
  samples: BinaryTrainingSample[],
  options: CrossValidationOptions = {},
): BinaryTrainingSample[][] {
  const folds = options.folds ?? 5;
  const seed = options.seed ?? 42;
  if (!Number.isInteger(folds) || folds < 2 || folds > 10 || folds > samples.length) {
    throw new Error("folds must be an integer from 2 to 10 and no greater than sample count");
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed is invalid");
  if (samples.some((sample) => sample.label !== 0 && sample.label !== 1)) throw new Error("Samples must have binary labels");
  const classes: [BinaryTrainingSample[], BinaryTrainingSample[]] = [[], []];
  samples.forEach((sample) => classes[sample.label].push(sample));
  if (classes.some((items) => items.length < folds)) {
    throw new Error("Each class must contain at least one sample per fold");
  }
  const random = randomGenerator(seed);
  const result = Array.from({ length: folds }, () => [] as BinaryTrainingSample[]);
  for (const group of classes) {
    for (let index = group.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [group[index], group[swapIndex]] = [group[swapIndex], group[index]];
    }
    group.forEach((sample, index) => result[index % folds].push(sample));
  }
  return result;
}

function calculateMetrics(actual: number[], predicted: number[]): CrossValidationMetrics {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] === 1 && predicted[index] === 1) tp += 1;
    else if (actual[index] === 0 && predicted[index] === 0) tn += 1;
    else if (predicted[index] === 1) fp += 1;
    else fn += 1;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    folds: 0,
    rows: actual.length,
    accuracy: (tp + tn) / actual.length,
    precision,
    recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
  };
}

type ModelAdapter = {
  algorithm: HyperparameterCandidate["algorithm"];
  fit: (samples: BinaryTrainingSample[], parameters: Record<string, number>) => unknown;
  predict: (model: unknown, features: number[], parameters: Record<string, number>) => 0 | 1;
};

const adapters: ModelAdapter[] = [
  {
    algorithm: "logistic-regression",
    fit: (samples, p) => fitLogisticRegression(samples, { iterations: p.iterations, learningRate: p.learningRate }),
    predict: (model, features) => predictLogisticClass(model, features),
  },
  {
    algorithm: "knn",
    fit: (samples, p) => fitKnn(samples, { k: p.k }),
    predict: (model, features, p) => predictKnnClass(model, features, 0.5, p.k),
  },
  {
    algorithm: "decision-tree",
    fit: (samples, p) => fitDecisionTree(samples, { maxDepth: p.maxDepth }),
    predict: (model, features) => predictDecisionTreeClass(model, features),
  },
  {
    algorithm: "gaussian-naive-bayes",
    fit: (samples, p) => fitNaiveBayes(samples, { varianceSmoothing: p.varianceSmoothing }),
    predict: (model, features) => predictNaiveBayesClass(model, features),
  },
];

function validateSamples(samples: BinaryTrainingSample[]): void {
  if (samples.length < 6) throw new Error("At least six samples are required for cross-validation");
  const count = samples[0].features.length;
  if (!count || samples.some((sample) =>
    sample.features.length !== count || sample.features.some((value) => !Number.isFinite(value)) ||
    (sample.label !== 0 && sample.label !== 1)
  )) throw new Error("Samples contain invalid features or labels");
}

export function evaluateClassifierCrossValidation(
  samples: BinaryTrainingSample[],
  candidate: HyperparameterCandidate,
  options: CrossValidationOptions = {},
): CrossValidationMetrics {
  validateSamples(samples);
  const foldRows = createStratifiedFolds(samples, options);
  const adapter = adapters.find((item) => item.algorithm === candidate.algorithm);
  if (!adapter) throw new Error("Unsupported classifier algorithm");
  const actual: number[] = [];
  const predicted: number[] = [];
  foldRows.forEach((validation, foldIndex) => {
    const validationSet = new Set(validation);
    const training = samples.filter((sample) => !validationSet.has(sample));
    if (candidate.algorithm === "knn" && candidate.parameters.k > training.length) {
      throw new Error("KNN k cannot exceed fold training size");
    }
    const model = adapter.fit(training, candidate.parameters);
    for (const sample of validation) {
      actual.push(sample.label);
      predicted.push(adapter.predict(model, sample.features, candidate.parameters));
    }
    if (!validation.length) throw new Error(`Fold ${foldIndex + 1} is empty`);
  });
  return { ...calculateMetrics(actual, predicted), folds: foldRows.length };
}

const candidateGrid: Record<HyperparameterCandidate["algorithm"], Array<Record<string, number>>> = {
  "logistic-regression": [
    { iterations: 500, learningRate: 0.03 },
    { iterations: 1000, learningRate: 0.05 },
    { iterations: 2000, learningRate: 0.03 },
  ],
  knn: [{ k: 3 }, { k: 5 }, { k: 7 }],
  "decision-tree": [{ maxDepth: 3 }, { maxDepth: 5 }, { maxDepth: 8 }],
  "gaussian-naive-bayes": [
    { varianceSmoothing: 1e-9 },
    { varianceSmoothing: 1e-8 },
    { varianceSmoothing: 1e-7 },
  ],
};

/** Selects parameters using cross-validation only; keep the final test set untouched. */
export function tuneClassifierHyperparameters(
  samples: BinaryTrainingSample[],
  algorithm: HyperparameterCandidate["algorithm"],
  options: CrossValidationOptions = {},
): TunedClassifierResult {
  const candidates = candidateGrid[algorithm];
  const evaluated = candidates.map((parameters) => ({
    parameters,
    metrics: evaluateClassifierCrossValidation(samples, { algorithm, parameters }, options),
  }));
  evaluated.sort((left, right) =>
    right.metrics.f1 - left.metrics.f1 ||
    right.metrics.accuracy - left.metrics.accuracy ||
    JSON.stringify(left.parameters).localeCompare(JSON.stringify(right.parameters))
  );
  return {
    algorithm,
    bestParameters: evaluated[0].parameters,
    bestMetrics: evaluated[0].metrics,
    candidates: evaluated,
  };
}
