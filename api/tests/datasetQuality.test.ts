import { describe, expect, it } from "vitest";
import { analyzeDatasetQuality, SYNTHETIC_DATASET_DEFINITIONS } from "../src/intelligence/datasetQuality.js";
import { generateSyntheticDatasets } from "../src/intelligence/datasetFactory.js";

describe("dataset quality analysis", () => {
  it("reports row counts, numeric ranges, target balance and clean identifiers", () => {
    const data = generateSyntheticDatasets({ rowsPerDataset: 100, seed: 42 });
    const report = analyzeDatasetQuality(data.examReadiness, SYNTHETIC_DATASET_DEFINITIONS.examReadiness);
    expect(report.rows).toBe(100);
    expect(report.duplicateIds).toBe(0);
    expect(report.missingValues).toBe(0);
    expect(report.invalidRows).toBe(0);
    expect(report.numericFeatures.prior_practice_attempts.min).toBeGreaterThanOrEqual(3);
    expect(Object.values(report.targetDistribution).reduce((sum, count) => sum + count, 0)).toBe(100);
    expect(report.warnings).toEqual([]);
  });

  it("rejects a target column included among model features", () => {
    expect(() => analyzeDatasetQuality([{ id: "x", value: 1 }], {
      idColumn: "id", featureColumns: ["value"], targetColumn: "value",
      task: "regression", description: "invalid",
    })).toThrow("Target column");
  });

  it("detects duplicate IDs, missing values and invalid feature rows", () => {
    const report = analyzeDatasetQuality([
      { student_id: "SYN_1", feature: 0.4, target: 0 },
      { student_id: "SYN_1", feature: Number.NaN, target: 1 },
      { student_id: "SYN_3", feature: "", target: 0 },
    ], {
      idColumn: "student_id", featureColumns: ["feature"], targetColumn: "target",
      task: "binary-classification", description: "fixture",
    });
    expect(report.duplicateIds).toBe(1);
    expect(report.missingValues).toBe(1);
    expect(report.invalidRows).toBe(2);
    expect(report.warnings).toHaveLength(3);
  });

  it("defines target columns separately from all feature columns", () => {
    for (const definition of Object.values(SYNTHETIC_DATASET_DEFINITIONS)) {
      expect(definition.featureColumns).not.toContain(definition.targetColumn);
    }
  });
});
