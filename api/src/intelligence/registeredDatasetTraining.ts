import { runTunedClassifierExperiments, runRegressionExperiment, splitDatasetRows } from "./datasetPipeline.js";
import type { DatasetFeatureEncoder } from "./datasetPipeline.js";

export interface RegisteredTrainingSample {
  features: Record<string, number | string>;
  target: number;
}

export interface RegisteredTrainingResult {
  algorithm: "logistic-regression" | "knn" | "decision-tree" | "gaussian-naive-bayes" | "multiple-linear-regression";
  model: unknown;
  metrics: Record<string, number | null>;
  crossValidation?: unknown;
  parameters?: Record<string, number>;
  trainRows: number;
  testRows: number;
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
  if (task === "binary-classification") {
    if (samples.some((sample) => sample.target !== 0 && sample.target !== 1)) throw new Error("Classification targets must be binary");
    if (samples.filter((sample) => sample.target === 0).length < 10 || samples.filter((sample) => sample.target === 1).length < 10) {
      throw new Error("Classification training requires at least 10 examples of each class for stratified validation");
    }
  }
  const featureNames = schema.map((feature) => feature.name);
  const encodedNames = schema.flatMap((feature) => feature.type === "numeric"
    ? [feature.name]
    : [...(feature.categories ?? []).map((category) => `${feature.name}=${category}`), `${feature.name}=__UNKNOWN__`]);
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
    return { id: index, features, target: sample.target };
  });
  if (task === "binary-classification" && new Set(rows.map((row) => row.target)).size !== 2) {
    throw new Error("Classification training data must contain both classes");
  }
  const split = task === "binary-classification"
    ? (() => {
      const negative = splitDatasetRows(rows.filter((row) => row.target === 0), { testFraction: 0.2, seed });
      const positive = splitDatasetRows(rows.filter((row) => row.target === 1), { testFraction: 0.2, seed: (seed + 1) >>> 0 });
      return {
        train: [...negative.train, ...positive.train],
        test: [...negative.test, ...positive.test],
      };
    })()
    : splitDatasetRows(rows, { testFraction: 0.2, seed });
  if (task === "binary-classification") {
    const results = runTunedClassifierExperiments(
      split.train.map(({ features, target }) => ({ features, target })),
      split.test.map(({ features, target }) => ({ features, target })),
      { folds: 5, seed },
    );
    return results.map((result) => ({
      algorithm: result.algorithm,
      model: result.model,
      metrics: result.metrics,
      crossValidation: result.crossValidation,
      parameters: result.parameters,
      trainRows: split.train.length,
      testRows: split.test.length,
    }));
  }
  const result = runRegressionExperiment(
    split.train.map(({ features, target }) => ({ features, target })),
    split.test.map(({ features, target }) => ({ features, target })),
  );
  return [{
    algorithm: result.algorithm,
    model: result.model,
    metrics: result.metrics,
    trainRows: split.train.length,
    testRows: split.test.length,
  }];
}
