import { runRegressionExperiment, splitDatasetRows, splitDatasetRowsByGroup } from "./datasetPipeline.js";
import type { DatasetFeatureEncoder } from "./datasetPipeline.js";
import { evaluateLogisticRegression, fitLogisticRegression } from "./logisticRegression.js";
import { tuneClassifierHyperparameters } from "./modelValidation.js";
import { fitLinearRegression, predictLinearRegression } from "./linearRegression.js";
import {
  fitGradientBoostingRegressor, fitRandomForestRegressor,
  predictGradientBoosting, predictRandomForest,
} from "./treeEnsembles.js";

export interface RegisteredTrainingSample {
  features: Record<string, number | string>;
  target: number;
  /** Stable keyed HMAC pseudonym used to keep each learner in one split. */
  groupId?: string;
  /** ISO timestamp for point-in-time, chronological training splits. */
  occurredAt?: string;
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
  validationRows?: number;
  validationMetrics?: object;
  splitStrategy?: string;
  timeSplit?: {
    trainGroups: number;
    validationGroups: number;
    testGroups: number;
    trainRows: number;
    validationRows: number;
    testRows: number;
    trainCutoff: string;
    validationCutoff: string;
    discardedRows: number;
  };
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

interface PerformanceTrainingRow {
  id: number;
  groupId: string;
  features: number[];
  target: number;
  occurredAt: number;
}

interface ChronologicalGroupSplit {
  train: PerformanceTrainingRow[];
  validation: PerformanceTrainingRow[];
  test: PerformanceTrainingRow[];
  trainGroups: number;
  validationGroups: number;
  testGroups: number;
  trainCutoff: number;
  validationCutoff: number;
  discardedRows: number;
}

function calculateRegressionMetrics(
  rows: Array<{ features: number[]; target: number }>,
  predict: (features: number[]) => number,
): { mae: number; rmse: number; r2: number } {
  const errors = rows.map((row) => row.target - predict(row.features));
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length);
  const targetMean = rows.reduce((sum, row) => sum + row.target, 0) / rows.length;
  const total = rows.reduce((sum, row) => sum + (row.target - targetMean) ** 2, 0);
  const residual = errors.reduce((sum, error) => sum + error ** 2, 0);
  return { mae, rmse, r2: total > 0 ? 1 - residual / total : 0 };
}

function splitChronologicallyByGroup(rows: PerformanceTrainingRow[]): ChronologicalGroupSplit {
  if (rows.length < 500) throw new Error("Performance training requires at least 500 point-in-time snapshots.");
  const grouped = new Map<string, PerformanceTrainingRow[]>();
  for (const row of rows) {
    if (!/^[a-f0-9]{64}$/.test(row.groupId) || !Number.isFinite(row.occurredAt)) {
      throw new Error("Performance training requires a keyed learner group ID and a valid occurredAt timestamp on every row.");
    }
    const groupRows = grouped.get(row.groupId) ?? [];
    groupRows.push(row);
    grouped.set(row.groupId, groupRows);
  }
  if (grouped.size < 50) throw new Error("Performance training requires at least 50 distinct learner groups.");
  const firstByGroup = [...grouped.entries()].map(([groupId, groupRows]) => ({
    groupId,
    firstAt: Math.min(...groupRows.map((row) => row.occurredAt)),
  })).sort((left, right) => left.firstAt - right.firstAt || left.groupId.localeCompare(right.groupId));
  const uniqueStarts = [...new Set(firstByGroup.map((group) => group.firstAt))].sort((a, b) => a - b);
  if (uniqueStarts.length < 10) {
    throw new Error("Performance training requires at least 10 distinct learner-cohort start times for chronological validation.");
  }
  const trainIndex = Math.max(0, Math.floor(uniqueStarts.length * 0.70) - 1);
  const validationIndex = Math.max(trainIndex + 1, Math.floor(uniqueStarts.length * 0.85) - 1);
  if (validationIndex >= uniqueStarts.length - 1) {
    throw new Error("Performance training cannot form separate chronological train, validation and test windows.");
  }
  const trainCutoff = uniqueStarts[trainIndex]!;
  const validationCutoff = uniqueStarts[validationIndex]!;
  const trainGroupIds = new Set(firstByGroup.filter((group) => group.firstAt <= trainCutoff).map((group) => group.groupId));
  const validationGroupIds = new Set(firstByGroup.filter((group) =>
    group.firstAt > trainCutoff && group.firstAt <= validationCutoff).map((group) => group.groupId));
  const testGroupIds = new Set(firstByGroup.filter((group) => group.firstAt > validationCutoff).map((group) => group.groupId));
  const train = rows.filter((row) => trainGroupIds.has(row.groupId) && row.occurredAt <= trainCutoff);
  const validation = rows.filter((row) => validationGroupIds.has(row.groupId) &&
    row.occurredAt > trainCutoff && row.occurredAt <= validationCutoff);
  const test = rows.filter((row) => testGroupIds.has(row.groupId) && row.occurredAt > validationCutoff);
  if (trainGroupIds.size < 30 || validationGroupIds.size < 5 || testGroupIds.size < 5 ||
      train.length < 30 || validation.length < 20 || test.length < 20) {
    throw new Error(
      `Chronological 70/15/15 split is too small (train ${train.length}/${trainGroupIds.size} groups, validation ${validation.length}/${validationGroupIds.size}, test ${test.length}/${testGroupIds.size}). Collect more learner history across time.`,
    );
  }
  return {
    train,
    validation,
    test,
    trainGroups: trainGroupIds.size,
    validationGroups: validationGroupIds.size,
    testGroups: testGroupIds.size,
    trainCutoff,
    validationCutoff,
    discardedRows: rows.length - train.length - validation.length - test.length,
  };
}

function rollingOriginFoldPlans(rows: PerformanceTrainingRow[]): Array<{
  train: PerformanceTrainingRow[];
  test: PerformanceTrainingRow[];
  trainGroups: number;
  testGroups: number;
  trainCutoff: number;
  testCutoff: number;
}> {
  const grouped = new Map<string, PerformanceTrainingRow[]>();
  for (const row of rows) {
    const groupRows = grouped.get(row.groupId) ?? [];
    groupRows.push(row);
    grouped.set(row.groupId, groupRows);
  }
  const groups = [...grouped.entries()].map(([groupId, groupRows]) => ({
    groupId,
    firstAt: Math.min(...groupRows.map((row) => row.occurredAt)),
  })).sort((left, right) => left.firstAt - right.firstAt || left.groupId.localeCompare(right.groupId));
  const starts = [...new Set(groups.map((group) => group.firstAt))].sort((a, b) => a - b);
  const windows: Array<[number, number]> = [[0.40, 0.55], [0.55, 0.70]];
  const plans = windows.flatMap(([trainFraction, testFraction]) => {
    const trainIndex = Math.max(0, Math.floor(starts.length * trainFraction) - 1);
    const testIndex = Math.max(trainIndex + 1, Math.floor(starts.length * testFraction) - 1);
    if (testIndex >= starts.length) return [];
    const trainCutoff = starts[trainIndex]!;
    const testCutoff = starts[testIndex]!;
    const trainGroupIds = new Set(groups.filter((group) => group.firstAt <= trainCutoff).map((group) => group.groupId));
    const testGroupIds = new Set(groups.filter((group) =>
      group.firstAt > trainCutoff && group.firstAt <= testCutoff).map((group) => group.groupId));
    const train = rows.filter((row) => trainGroupIds.has(row.groupId) && row.occurredAt <= trainCutoff);
    const test = rows.filter((row) => testGroupIds.has(row.groupId) &&
      row.occurredAt > trainCutoff && row.occurredAt <= testCutoff);
    if (trainGroupIds.size < 20 || testGroupIds.size < 5 || train.length < 30 || test.length < 20) return [];
    return [{
      train,
      test,
      trainGroups: trainGroupIds.size,
      testGroups: testGroupIds.size,
      trainCutoff,
      testCutoff,
    }];
  });
  if (plans.length < 2) {
    throw new Error("Performance training requires at least two valid rolling-origin, learner-group-isolated folds.");
  }
  return plans;
}

function trainPerformanceModelsChronologically(
  rows: PerformanceTrainingRow[],
  seed: number,
): RegisteredTrainingResult[] {
  const split = splitChronologicallyByGroup(rows);
  const fitRows = [...split.train, ...split.validation];
  const validationMetrics = (predict: (features: number[]) => number) =>
    calculateRegressionMetrics(split.validation, predict);
  const testMetrics = (predict: (features: number[]) => number) =>
    calculateRegressionMetrics(split.test, predict);

  const baselineForValidation = fitLinearRegression(split.train, { iterations: 1200, learningRate: 0.05 });
  const baselineValidation = validationMetrics((features) => predictLinearRegression(baselineForValidation, features));

  const gradientConfigs = [
    { trees: 40, learningRate: 0.05, maxDepth: 2, minLeafSize: 4 },
    { trees: 80, learningRate: 0.05, maxDepth: 2, minLeafSize: 4 },
    { trees: 120, learningRate: 0.03, maxDepth: 2, minLeafSize: 4 },
  ];
  let bestGradientConfig = gradientConfigs[0]!;
  let bestGradientValidation = { mae: Number.POSITIVE_INFINITY, rmse: Number.POSITIVE_INFINITY, r2: 0 };
  for (const config of gradientConfigs) {
    const model = fitGradientBoostingRegressor(split.train, { ...config, seed });
    const metrics = validationMetrics((features) => predictGradientBoosting(model, features));
    if (metrics.rmse < bestGradientValidation.rmse) {
      bestGradientConfig = config;
      bestGradientValidation = metrics;
    }
  }

  const forestConfigs = [
    { trees: 48, maxDepth: 4, minLeafSize: 5 },
    { trees: 64, maxDepth: 6, minLeafSize: 5 },
    { trees: 96, maxDepth: 8, minLeafSize: 8 },
  ];
  let bestForestConfig = forestConfigs[0]!;
  let bestForestValidation = { mae: Number.POSITIVE_INFINITY, rmse: Number.POSITIVE_INFINITY, r2: 0 };
  for (const config of forestConfigs) {
    const model = fitRandomForestRegressor(split.train, { ...config, seed });
    const metrics = validationMetrics((features) => predictRandomForest(model, features));
    if (metrics.rmse < bestForestValidation.rmse) {
      bestForestConfig = config;
      bestForestValidation = metrics;
    }
  }

  const baseline = fitLinearRegression(fitRows, { iterations: 1600, learningRate: 0.05 });
  const gradient = fitGradientBoostingRegressor(fitRows, { ...bestGradientConfig, seed });
  const forest = fitRandomForestRegressor(fitRows, { ...bestForestConfig, seed });
  const baselineTest = testMetrics((features) => predictLinearRegression(baseline, features));
  const gradientTest = testMetrics((features) => predictGradientBoosting(gradient, features));
  const forestTest = testMetrics((features) => predictRandomForest(forest, features));

  const foldPlans = rollingOriginFoldPlans(rows);
  const crossValidationFor = (
    algorithm: "multiple-linear-regression" | "performance-gradient-boosting" | "performance-random-forest",
    parameters: Record<string, number>,
  ) => {
    const folds = foldPlans.map((fold, index) => {
      const model = algorithm === "multiple-linear-regression"
        ? fitLinearRegression(fold.train, { iterations: 600, learningRate: 0.05 })
        : algorithm === "performance-gradient-boosting"
          ? fitGradientBoostingRegressor(fold.train, {
            trees: Math.min(32, parameters.trees ?? 32),
            learningRate: parameters.learningRate ?? 0.05,
            maxDepth: parameters.maxDepth ?? 2,
            minLeafSize: parameters.minLeafSize ?? 4,
            seed: seed + index,
          })
          : fitRandomForestRegressor(fold.train, {
            trees: Math.min(32, parameters.trees ?? 32),
            maxDepth: parameters.maxDepth ?? 6,
            minLeafSize: parameters.minLeafSize ?? 5,
            seed: seed + index,
          });
      const metrics = algorithm === "multiple-linear-regression"
        ? calculateRegressionMetrics(fold.test, (features) => predictLinearRegression(model, features))
        : algorithm === "performance-gradient-boosting"
          ? calculateRegressionMetrics(fold.test, (features) => predictGradientBoosting(model, features))
          : calculateRegressionMetrics(fold.test, (features) => predictRandomForest(model, features));
      return {
        fold: index + 1,
        trainRows: fold.train.length,
        testRows: fold.test.length,
        trainGroups: fold.trainGroups,
        testGroups: fold.testGroups,
        trainCutoff: new Date(fold.trainCutoff).toISOString(),
        testCutoff: new Date(fold.testCutoff).toISOString(),
        ...metrics,
      };
    });
    return {
      method: "rolling-origin-grouped",
      folds,
      meanMae: folds.reduce((sum, fold) => sum + fold.mae, 0) / folds.length,
      meanRmse: folds.reduce((sum, fold) => sum + fold.rmse, 0) / folds.length,
    };
  };

  const timeSplit = {
    trainGroups: split.trainGroups,
    validationGroups: split.validationGroups,
    testGroups: split.testGroups,
    trainRows: split.train.length,
    validationRows: split.validation.length,
    testRows: split.test.length,
    trainCutoff: new Date(split.trainCutoff).toISOString(),
    validationCutoff: new Date(split.validationCutoff).toISOString(),
    discardedRows: split.discardedRows,
  };
  const common = {
    trainRows: fitRows.length,
    testRows: split.test.length,
    validationRows: split.validation.length,
    splitStrategy: "chronological-grouped-70-15-15",
    timeSplit,
    groupSplit: {
      trainGroups: split.trainGroups + split.validationGroups,
      testGroups: split.testGroups,
    },
  };
  return [
    {
      algorithm: "multiple-linear-regression",
      model: baseline,
      metrics: baselineTest,
      validationMetrics: baselineValidation,
      crossValidation: crossValidationFor("multiple-linear-regression", { iterations: 1600, learningRate: 0.05 }),
      parameters: { iterations: 1600, learningRate: 0.05 },
      uncertainty: { residualStdDev: baselineTest.rmse, method: "holdout-rmse" },
      ...common,
    },
    {
      algorithm: "performance-gradient-boosting",
      model: gradient,
      metrics: gradientTest,
      validationMetrics: bestGradientValidation,
      crossValidation: crossValidationFor("performance-gradient-boosting", bestGradientConfig),
      parameters: bestGradientConfig,
      uncertainty: { residualStdDev: gradientTest.rmse, method: "holdout-rmse" },
      ...common,
    },
    {
      algorithm: "performance-random-forest",
      model: forest,
      metrics: forestTest,
      validationMetrics: bestForestValidation,
      crossValidation: crossValidationFor("performance-random-forest", bestForestConfig),
      parameters: bestForestConfig,
      uncertainty: { residualStdDev: forestTest.rmse, method: "holdout-rmse" },
      ...common,
    },
  ];
}

export function trainRegisteredDataset(
  samples: RegisteredTrainingSample[],
  schema: DatasetFeatureEncoder[],
  task: "regression" | "binary-classification",
  seed = 42,
  options: { splitStrategy?: "grouped-random" | "chronological-grouped" } = {},
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
    const occurredAt = sample.occurredAt ? Date.parse(sample.occurredAt) : undefined;
    return {
      id: index,
      ...(sample.groupId ? { groupId: sample.groupId } : {}),
      ...(occurredAt !== undefined ? { occurredAt } : {}),
      features,
      target: sample.target,
    };
  });
  if (task === "binary-classification" && new Set(rows.map((row) => row.target)).size !== 2) {
    throw new Error("Classification training data must contain both classes");
  }
  if (options.splitStrategy === "chronological-grouped") {
    if (task !== "regression") throw new Error("Chronological performance training is only supported for regression datasets.");
    const performanceRows: PerformanceTrainingRow[] = rows.map((row) => {
      if (!row.groupId || !Number.isFinite(row.occurredAt)) {
        throw new Error("Performance training requires a keyed learner group ID and a valid occurredAt timestamp on every row.");
      }
      return { ...row, groupId: row.groupId, occurredAt: row.occurredAt! };
    });
    return trainPerformanceModelsChronologically(performanceRows, seed);
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
