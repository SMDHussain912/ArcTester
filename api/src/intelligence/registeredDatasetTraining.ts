import { runRegressionExperiment, splitDatasetRows, splitDatasetRowsByGroup } from "./datasetPipeline.js";
import type { DatasetFeatureEncoder } from "./datasetPipeline.js";
import { evaluateLogisticRegression, fitLogisticRegression } from "./logisticRegression.js";
import { tuneClassifierHyperparameters } from "./modelValidation.js";
import { predictLinearRegression } from "./linearRegression.js";
import {
  fitGradientBoostingRegressor, fitRandomForestRegressor,
  predictGradientBoosting, predictRandomForest,
} from "./treeEnsembles.js";

export interface RegisteredTrainingSample {
  features: Record<string, number | string>;
  target: number;
  /** Stable keyed HMAC pseudonym used to keep each learner in one split. */
  groupId?: string;
}

export interface RegisteredTrainingResult {
  algorithm: "logistic-regression" | "multiple-linear-regression" | "performance-gradient-boosting" | "performance-random-forest";
  model: unknown;
  metrics: object;
  crossValidation?: unknown;
  parameters?: Record<string, number>;
  uncertainty?: { residualStdDev: number; method: "holdout-rmse" };
  trainRows: number;
  testRows: number;
  groupSplit?: { trainGroups: number; testGroups: number };
}

function validateSchema(schema: DatasetFeatureEncoder[]): void {
  if (!schema.length || schema.length > 100) throw new Error("Training requires 1 to 100 declared features");
  const names = schema.map((feature) => feature.name);
  if (new Set(names).size !== names.length) throw new Error("Training feature names must be unique");
  for (const feature of schema) {
    if (feature.type === "categorical") {
      const categories = feature.categories ?? [];
      if (!categories.length || categories.length > 500 || new Set(categories).size !== categories.length) {
        throw new Error(`Categorical feature ${feature.name} requires 1 to 500 unique categories`);
      }
    }
  }
}

export function trainRegisteredDataset(
  samples: RegisteredTrainingSample[],
  schema: DatasetFeatureEncoder[],
  task: "regression" | "binary-classification",
  seed = 42,
): RegisteredTrainingResult[] {
  validateSchema(schema);
  if (samples.length < 30 || samples.length > 5000) throw new Error("Automatic training requires between 30 and 5000 dataset rows");
  if (samples.some((sample) => !Number.isFinite(sample.target))) throw new Error("Training targets must be finite numbers");
  const hasGroupIds = samples.some((sample) => sample.groupId !== undefined);
  if (hasGroupIds && samples.some((sample) => typeof sample.groupId !== "string" || !/^[a-f0-9]{64}$/.test(sample.groupId))) {
    throw new Error("Grouped training requires a keyed HMAC-SHA-256 pseudonymous groupId on every sample.");
  }
  if (task === "binary-classification") {
    if (samples.some((sample) => sample.target !== 0 && sample.target !== 1)) throw new Error("Classification targets must be binary");
    if (samples.filter((sample) => sample.target === 0).length < 10 || samples.filter((sample) => sample.target === 1).length < 10) {
      throw new Error("Classification training requires at least 10 examples of each class for stratified validation");
    }
  }
  const featureNames = schema.map((feature) => feature.name);
  const rows = samples.map((sample, index) => {
    const keys = Object.keys(sample.features).sort();
    if (keys.join("\\0") !== [...featureNames].sort().join("\\0")) throw new Error(`Training row ${index + 1} does not match the declared feature schema`);
    const features = schema.flatMap((feature) => {
      const value = sample.features[feature.name];
      if (feature.type === "numeric") {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Feature ${feature.name} must be numeric`);
        return [value];
      }
      if (typeof value !== "string") throw new Error(`Feature ${feature.name} must be categorical`);
      const categories = feature.categories ?? [];
      return [...categories.map((category) => Number(value === category)), Number(!categories.includes(value))];
    });
    return { id: index, ...(sample.groupId ? { groupId: sample.groupId } : {}), features, target: sample.target };
  });
  if (task === "binary-classification" && new Set(rows.map((row) => row.target)).size !== 2) {
    throw new Error("Classification training data must contain both classes");
  }
  const split = hasGroupIds
    ? splitDatasetRowsByGroup(rows, "groupId", { testFraction: 0.2, seed })
    : task === "binary-classification"
      ? (() => {
        const negative = splitDatasetRows(rows.filter((row) => row.target === 0), { testFraction: 0.2, seed });
        const positive = splitDatasetRows(rows.filter((row) => row.target === 1), { testFraction: 0.2, seed: (seed + 1) >>> 0 });
        return {
          train: [...negative.train, ...positive.train],
          test: [...negative.test, ...positive.test],
        };
      })()
      : splitDatasetRows(rows, { testFraction: 0.2, seed });
  if (hasGroupIds && split.test.length < 20) {
    throw new Error("Grouped training requires at least 20 held-out rows. Add more samples across learner groups.");
  }
  if (hasGroupIds && task === "binary-classification") {
    const trainClasses = new Set(split.train.map((row) => row.target));
    const testClasses = new Set(split.test.map((row) => row.target));
    if (trainClasses.size !== 2 || testClasses.size !== 2 ||
        split.train.filter((row) => row.target === 0).length < 10 ||
        split.train.filter((row) => row.target === 1).length < 10) {
      throw new Error("Grouped classification split must retain both classes in train and test, with at least 10 training examples per class. Add more balanced learner groups or choose another seed.");
    }
  }
  if (task === "binary-classification") {
    const trainingSamples = split.train.map(({ features, target, groupId }) => ({
      features,
      label: target as 0 | 1,
      ...(groupId ? { groupId } : {}),
    }));
    const testSamples = split.test.map(({ features, target }) => ({
      features,
      label: target as 0 | 1,
    }));
    const tuned = tuneClassifierHyperparameters(trainingSamples, "logistic-regression", { folds: 5, seed });
    const model = fitLogisticRegression(trainingSamples, {
      iterations: tuned.bestParameters.iterations,
      learningRate: tuned.bestParameters.learningRate,
    });
    return [{
      algorithm: "logistic-regression",
      model,
      metrics: evaluateLogisticRegression(model, testSamples),
      crossValidation: tuned.bestMetrics,
      parameters: tuned.bestParameters,
      trainRows: split.train.length,
      testRows: split.test.length,
      ...(hasGroupIds ? {
        groupSplit: {
          trainGroups: new Set(split.train.map((row) => row.groupId)).size,
          testGroups: new Set(split.test.map((row) => row.groupId)).size,
        },
      } : {}),
    }];
  }
  const result = runRegressionExperiment(
    split.train.map(({ features, target }) => ({ features, target })),
    split.test.map(({ features, target }) => ({ features, target })),
  );
  const trainRows = split.train.map(({ features, target }) => ({ features, target }));
  const testRows = split.test.map(({ features, target }) => ({ features, target }));
  const groupSplit = hasGroupIds ? {
    trainGroups: new Set(split.train.map((row) => row.groupId)).size,
    testGroups: new Set(split.test.map((row) => row.groupId)).size,
  } : undefined;
  const regressionMetrics = (predicted: number[]) => {
    const errors = testRows.map((row, index) => row.target - predicted[index]);
    const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
    const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length);
    const targetMean = testRows.reduce((sum, row) => sum + row.target, 0) / testRows.length;
    const total = testRows.reduce((sum, row) => sum + (row.target - targetMean) ** 2, 0);
    const residual = errors.reduce((sum, error) => sum + error ** 2, 0);
    return { mae, rmse, r2: total > 0 ? 1 - residual / total : 0 };
  };
  const baselinePredictions = testRows.map((row) => predictLinearRegression(result.model, row.features));
  const baselineResiduals = testRows.map((row, index) => row.target - baselinePredictions[index]);
  const residualStdDev = Math.sqrt(baselineResiduals.reduce((sum, residual) => sum + residual ** 2, 0) / baselineResiduals.length);
  const gradient = fitGradientBoostingRegressor(trainRows, { seed });
  const forest = fitRandomForestRegressor(trainRows, { seed });
  const gradientPredictions = testRows.map((row) => predictGradientBoosting(gradient, row.features));
  const forestPredictions = testRows.map((row) => predictRandomForest(forest, row.features));
  return [
    {
      algorithm: result.algorithm,
      model: result.model,
      metrics: regressionMetrics(baselinePredictions),
      uncertainty: { residualStdDev, method: "holdout-rmse" },
      trainRows: split.train.length, testRows: split.test.length,
      ...(groupSplit ? { groupSplit } : {}),
    },
    {
      algorithm: "performance-gradient-boosting",
      model: gradient,
      metrics: regressionMetrics(gradientPredictions),
      uncertainty: {
        residualStdDev: Math.sqrt(gradientPredictions.reduce((sum, prediction, index) =>
          sum + (testRows[index].target - prediction) ** 2, 0) / testRows.length),
        method: "holdout-rmse",
      },
      trainRows: split.train.length, testRows: split.test.length,
      ...(groupSplit ? { groupSplit } : {}),
    },
    {
      algorithm: "performance-random-forest",
      model: forest,
      metrics: regressionMetrics(forestPredictions),
      uncertainty: {
        residualStdDev: Math.sqrt(forestPredictions.reduce((sum, prediction, index) =>
          sum + (testRows[index].target - prediction) ** 2, 0) / testRows.length),
        method: "holdout-rmse",
      },
      trainRows: split.train.length, testRows: split.test.length,
      ...(groupSplit ? { groupSplit } : {}),
    },
  ];
}

export interface RankedTrainingResult extends RegisteredTrainingResult {
  rank: number;
}

function metricValue(metrics: object, key: string): number {
  const value = (metrics as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/**
 * Ranks candidates trained and evaluated on the same holdout partition.
 * This is an experiment leaderboard, not a production promotion decision.
 */
export function rankTrainingResults(
  results: RegisteredTrainingResult[],
  task: "regression" | "binary-classification",
): RankedTrainingResult[] {
  const sorted = [...results].sort((left, right) => {
    const keys = task === "regression"
      ? [{ key: "rmse", direction: 1 }, { key: "mae", direction: 1 }]
      : [{ key: "f1", direction: -1 }, { key: "accuracy", direction: -1 }, { key: "precision", direction: -1 }, { key: "recall", direction: -1 }];
    for (const metric of keys) {
      const difference = metricValue(left.metrics, metric.key) - metricValue(right.metrics, metric.key);
      if (difference !== 0) return difference * metric.direction;
    }
    return left.algorithm.localeCompare(right.algorithm);
  });
  return sorted.map((result, index) => ({ ...result, rank: index + 1 }));
}
