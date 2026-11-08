import {
  evaluateDecisionTree, fitDecisionTree,
} from "./decisionTree.js";
import {
  evaluateKnn, fitKnn,
} from "./knn.js";
import {
  evaluateLogisticRegression, fitLogisticRegression,
} from "./logisticRegression.js";
import {
  evaluateNaiveBayes, fitNaiveBayes,
} from "./naiveBayes.js";
import {
  evaluateLinearRegression, fitLinearRegression,
  type RegressionSample,
} from "./linearRegression.js";
import type { BinaryTrainingSample } from "./classificationValidation.js";
import type { DatasetRow } from "./datasetFactory.js";
import type { DatasetDefinition } from "./datasetQuality.js";

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export interface DatasetSplitOptions {
  testFraction?: number;
  seed?: number;
}

export interface EncodedDataset {
  featureNames: string[];
  train: Array<{ features: number[]; target: number }>;
  test: Array<{ features: number[]; target: number }>;
  trainRows: number;
  testRows: number;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  values.push(value);
  return values;
}

/** Parses a CSV document with quoted commas, escaped quotes and CRLF support. */
export function parseDatasetCsv(input: string): CsvTable {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) throw new Error("CSV must contain a header and at least one data row");
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  if (!headers.length || headers.some((header) => !header)) throw new Error("CSV headers cannot be empty");
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate headers");
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} columns; expected ${headers.length}`);
    return values;
  });
  return { headers, rows };
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

/** Deterministic row-level split. Preprocessing is fitted only after this split. */
export function splitDatasetRows<T>(
  rows: T[],
  options: DatasetSplitOptions = {},
): { train: T[]; test: T[] } {
  const testFraction = options.testFraction ?? 0.2;
  const seed = options.seed ?? 42;
  if (!Number.isFinite(testFraction) || testFraction <= 0 || testFraction >= 0.5) {
    throw new Error("testFraction must be greater than 0 and less than 0.5");
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed is invalid");
  if (rows.length < 5) throw new Error("At least five rows are required for a train/test split");
  const indices = rows.map((_, index) => index);
  const random = randomGenerator(seed);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
  }
  const testCount = Math.max(1, Math.floor(rows.length * testFraction));
  const testIndices = new Set(indices.slice(0, testCount));
  return {
    train: rows.filter((_, index) => !testIndices.has(index)),
    test: rows.filter((_, index) => testIndices.has(index)),
  };
}

function validateRow(row: DatasetRow, definition: DatasetDefinition, index: number): void {
  for (const column of [definition.idColumn, ...definition.featureColumns, definition.targetColumn]) {
    const value = row[column];
    if (value === undefined || value === null || value === "") throw new Error(`Row ${index} is missing ${column}`);
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Row ${index} has invalid ${column}`);
  }
  if (definition.task === "binary-classification" && row[definition.targetColumn] !== 0 && row[definition.targetColumn] !== 1) {
    throw new Error(`Row ${index} has a non-binary target`);
  }
  if (definition.task === "regression" && typeof row[definition.targetColumn] !== "number") {
    throw new Error(`Row ${index} has a non-numeric regression target`);
  }
}

function encodeFeatures(
  trainRows: DatasetRow[],
  testRows: DatasetRow[],
  definition: DatasetDefinition,
): { train: number[][]; test: number[][]; featureNames: string[] } {
  const encoders = definition.featureColumns.map((column) => {
    const values = trainRows.map((row) => row[column]);
    if (values.every((value) => typeof value === "number")) return { column, type: "numeric" as const, categories: [] as string[] };
    if (values.every((value) => typeof value === "string")) {
      return { column, type: "categorical" as const, categories: [...new Set(values as string[])].sort() };
    }
    throw new Error(`Feature ${column} mixes numeric and categorical values`);
  });
  const featureNames = encoders.flatMap((encoder) =>
    encoder.type === "numeric" ? [encoder.column] : encoder.categories.map((category) => `${encoder.column}=${category}`).concat(`${encoder.column}=__UNKNOWN__`)
  );
  const transform = (rows: DatasetRow[]) => rows.map((row) => encoders.flatMap((encoder) => {
    const value = row[encoder.column];
    if (encoder.type === "numeric") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Feature ${encoder.column} must be numeric`);
      return [value];
    }
    if (typeof value !== "string") throw new Error(`Feature ${encoder.column} must be categorical`);
    return [...encoder.categories.map((category) => Number(value === category)), Number(!encoder.categories.includes(value))];
  }));
  return { train: transform(trainRows), test: transform(testRows), featureNames };
}

/** Splits first, then learns categorical vocabulary from training rows only. */
export function prepareDataset(
  rows: DatasetRow[],
  definition: DatasetDefinition,
  options: DatasetSplitOptions = {},
): EncodedDataset {
  if (definition.featureColumns.includes(definition.targetColumn)) throw new Error("Target leakage: target cannot be a feature");
  if (rows.length < 5) throw new Error("At least five dataset rows are required");
  rows.forEach((row, index) => validateRow(row, definition, index));
  const ids = rows.map((row) => String(row[definition.idColumn]));
  if (new Set(ids).size !== ids.length) throw new Error("Dataset identifiers must be unique before splitting");
  const split = splitDatasetRows(rows, options);
  const encoded = encodeFeatures(split.train, split.test, definition);
  const target = (row: DatasetRow) => Number(row[definition.targetColumn]);
  const train = split.train.map((row, index) => ({ features: encoded.train[index], target: target(row) }));
  const test = split.test.map((row, index) => ({ features: encoded.test[index], target: target(row) }));
  return { featureNames: encoded.featureNames, train, test, trainRows: train.length, testRows: test.length };
}

export interface ClassifierExperiment {
  algorithm: string;
  metrics: ReturnType<typeof evaluateLogisticRegression>;
  model: unknown;
}

export interface RegressionExperiment {
  algorithm: "multiple-linear-regression";
  metrics: ReturnType<typeof evaluateLinearRegression>;
  model: unknown;
}

export function runClassifierExperiments(
  trainRows: Array<{ features: number[]; target: number }>,
  testRows: Array<{ features: number[]; target: number }>,
): ClassifierExperiment[] {
  const train: BinaryTrainingSample[] = trainRows.map((row) => ({ features: row.features, label: row.target as 0 | 1 }));
  const test: BinaryTrainingSample[] = testRows.map((row) => ({ features: row.features, label: row.target as 0 | 1 }));
  if (train.some((row) => row.label !== 0 && row.label !== 1) || test.some((row) => row.label !== 0 && row.label !== 1)) {
    throw new Error("Classifier experiment requires binary targets");
  }
  if (new Set(train.map((row) => row.label)).size < 2) throw new Error("Training split must contain both classes");
  const logistic = fitLogisticRegression(train);
  const knn = fitKnn(train, { k: 5 });
  const tree = fitDecisionTree(train);
  const naiveBayes = fitNaiveBayes(train);
  return [
    { algorithm: "logistic-regression", model: logistic, metrics: evaluateLogisticRegression(logistic, test) },
    { algorithm: "knn", model: knn, metrics: evaluateKnn(knn, test) },
    { algorithm: "decision-tree", model: tree, metrics: evaluateDecisionTree(tree, test) },
    { algorithm: "gaussian-naive-bayes", model: naiveBayes, metrics: evaluateNaiveBayes(naiveBayes, test) },
  ];
}

export function runRegressionExperiment(
  trainRows: Array<{ features: number[]; target: number }>,
  testRows: Array<{ features: number[]; target: number }>,
): RegressionExperiment {
  const train: RegressionSample[] = trainRows;
  const test: RegressionSample[] = testRows;
  const model = fitLinearRegression(train);
  return { algorithm: "multiple-linear-regression", model, metrics: evaluateLinearRegression(model, test) };
}

export function serializeExperimentArtifact(input: {
  dataset: string;
  featureNames: string[];
  targetColumn: string;
  task: DatasetDefinition["task"];
  model: unknown;
}): string {
  return JSON.stringify({
    schemaVersion: 1,
    source: "synthetic-or-imported-dataset",
    dataset: input.dataset,
    task: input.task,
    featureNames: input.featureNames,
    targetColumn: input.targetColumn,
    model: input.model,
  }, null, 2);
}
