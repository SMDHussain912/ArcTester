import { describe, expect, it } from "vitest";
import { generateSyntheticDatasets } from "../src/intelligence/datasetFactory.js";
import { SYNTHETIC_DATASET_DEFINITIONS } from "../src/intelligence/datasetQuality.js";
import {
  parseDatasetCsv,
  prepareDataset,
  runClassifierExperiments,
  runTunedClassifierExperiments,
  runRegressionExperiment,
  serializeExperimentArtifact,
  splitDatasetRows,
} from "../src/intelligence/datasetPipeline.js";

describe("dataset-to-model pipeline", () => {
  it("parses quoted CSV values, escaped quotes and CRLF", () => {
    const parsed = parseDatasetCsv('id,note,score\r\n1,"topic, ""advanced""",0.75\r\n');
    expect(parsed.headers).toEqual(["id", "note", "score"]);
    expect(parsed.rows).toEqual([["1", 'topic, "advanced"', "0.75"]]);
  });

  it("rejects malformed CSV and duplicate headers", () => {
    expect(() => parseDatasetCsv("id,id\na,b\n")).toThrow("duplicate headers");
    expect(() => parseDatasetCsv('id,note\n1,"unterminated\n')).toThrow("unterminated");
    expect(() => parseDatasetCsv("id,name\n1\n")).toThrow("expected 2");
  });

  it("creates deterministic train/test splits with no overlapping rows", () => {
    const rows = Array.from({ length: 50 }, (_, id) => ({ id }));
    const first = splitDatasetRows(rows, { seed: 99 });
    const second = splitDatasetRows(rows, { seed: 99 });
    expect(first).toEqual(second);
    expect(first.train).toHaveLength(40);
    expect(first.test).toHaveLength(10);
    expect(first.train.some((row) => first.test.includes(row))).toBe(false);
  });

  it("fits categorical encoding on training rows and excludes IDs and targets", () => {
    const data = generateSyntheticDatasets({ rowsPerDataset: 120, seed: 42 });
    const definition = SYNTHETIC_DATASET_DEFINITIONS.topicMastery;
    const prepared = prepareDataset(data.topicMastery, definition, { seed: 42 });
    expect(prepared.trainRows + prepared.testRows).toBe(120);
    expect(prepared.featureNames).toContain("subject=Mathematics");
    expect(prepared.featureNames).toContain("topic=Algebra");
    expect(prepared.featureNames).not.toContain("student_id");
    expect(prepared.featureNames).not.toContain(definition.targetColumn);
    expect(prepared.train.every((row) => row.features.length === prepared.featureNames.length)).toBe(true);
  });

  it("trains and compares four classifiers on a held-out readiness split", () => {
    const data = generateSyntheticDatasets({ rowsPerDataset: 160, seed: 2026 });
    const prepared = prepareDataset(data.examReadiness, SYNTHETIC_DATASET_DEFINITIONS.examReadiness, { seed: 12 });
    const results = runClassifierExperiments(prepared.train, prepared.test);
    expect(results.map((result) => result.algorithm)).toEqual([
      "logistic-regression", "knn", "decision-tree", "gaussian-naive-bayes",
    ]);
    for (const result of results) {
      expect(result.metrics.rows).toBe(prepared.testRows);
      expect(result.metrics.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.metrics.accuracy).toBeLessThanOrEqual(1);
      expect(result.model).toBeTruthy();
    }
  });


  it("tunes classifiers on training rows and evaluates the selected models on the held-out set", () => {
    const data = generateSyntheticDatasets({ rowsPerDataset: 180, seed: 2027 });
    const prepared = prepareDataset(data.examReadiness, SYNTHETIC_DATASET_DEFINITIONS.examReadiness, { seed: 29 });
    const results = runTunedClassifierExperiments(prepared.train, prepared.test, { folds: 4, seed: 29 });
    expect(results).toHaveLength(4);
    for (const result of results) {
      expect(result.crossValidation.rows).toBe(prepared.trainRows);
      expect(result.crossValidation.folds).toBe(4);
      expect(result.metrics.rows).toBe(prepared.testRows);
      expect(Object.keys(result.parameters).length).toBeGreaterThan(0);
    }
  });

  it("trains regression and exports a model artifact with feature metadata", () => {
    const data = generateSyntheticDatasets({ rowsPerDataset: 100, seed: 13 });
    const definition = SYNTHETIC_DATASET_DEFINITIONS.scorePrediction;
    const prepared = prepareDataset(data.scorePrediction, definition, { seed: 17 });
    const result = runRegressionExperiment(prepared.train, prepared.test);
    expect(result.metrics.rows).toBe(prepared.testRows);
    expect(result.metrics.mae).toBeGreaterThanOrEqual(0);
    const artifact = JSON.parse(serializeExperimentArtifact({
      dataset: "score-prediction",
      featureNames: prepared.featureNames,
      featureSchema: prepared.featureSchema,
      targetColumn: definition.targetColumn,
      task: definition.task,
      model: result.model,
    }));
    expect(artifact.featureNames).toEqual(prepared.featureNames);
    expect(artifact.featureSchema).toEqual(prepared.featureSchema);
    expect(artifact.targetColumn).toBe(definition.targetColumn);
    expect(artifact.model.algorithm).toBe("multiple-linear-regression");
  });

  it("rejects target leakage, duplicate IDs and one-class training data", () => {
    const data = generateSyntheticDatasets({ rowsPerDataset: 20, seed: 8 });
    expect(() => prepareDataset(data.examReadiness, {
      ...SYNTHETIC_DATASET_DEFINITIONS.examReadiness,
      featureColumns: [...SYNTHETIC_DATASET_DEFINITIONS.examReadiness.featureColumns, "target_readiness_label"],
    })).toThrow("Target leakage");
    const duplicate = [...data.examReadiness];
    duplicate[1] = { ...duplicate[1], student_id: duplicate[0].student_id };
    expect(() => prepareDataset(duplicate, SYNTHETIC_DATASET_DEFINITIONS.examReadiness)).toThrow("unique");
    const allPositive = data.examReadiness.map((row) => ({ ...row, target_readiness_label: 1 }));
    const prepared = prepareDataset(allPositive, SYNTHETIC_DATASET_DEFINITIONS.examReadiness);
    expect(() => runClassifierExperiments(prepared.train, prepared.test)).toThrow("both classes");
  });
});
