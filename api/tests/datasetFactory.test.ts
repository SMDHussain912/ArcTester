import { describe, expect, it } from "vitest";
import { datasetToCsv, generateSyntheticDatasets } from "../src/intelligence/datasetFactory.js";

describe("synthetic dataset factory", () => {
  it("generates every ArcTester dataset with the requested row count", () => {
    const datasets = generateSyntheticDatasets({ rowsPerDataset: 25, seed: 7 });
    expect(Object.values(datasets).map((rows) => rows.length)).toEqual([25, 25, 25, 25, 25]);
  });

  it("is reproducible for the same seed and changes when the seed changes", () => {
    expect(generateSyntheticDatasets({ rowsPerDataset: 10, seed: 42 }))
      .toEqual(generateSyntheticDatasets({ rowsPerDataset: 10, seed: 42 }));
    expect(generateSyntheticDatasets({ rowsPerDataset: 10, seed: 42 }))
      .not.toEqual(generateSyntheticDatasets({ rowsPerDataset: 10, seed: 43 }));
  });

  it("keeps generated values in valid ranges and maintains score count consistency", () => {
    const datasets = generateSyntheticDatasets({ rowsPerDataset: 100, seed: 2026 });
    for (const row of datasets.studentPerformance) {
      expect(row.average_accuracy).toBeGreaterThanOrEqual(0);
      expect(row.average_accuracy).toBeLessThanOrEqual(1);
      expect(row.formal_score_percentage).toBeGreaterThanOrEqual(0);
      expect(row.formal_score_percentage).toBeLessThanOrEqual(100);
      expect(row.passed_threshold).toBe(row.formal_score_percentage >= 60);
    }
    for (const row of datasets.topicMastery) {
      expect(row.questions_correct).toBeLessThanOrEqual(row.questions_attempted);
      expect(row.accuracy).toBe(Number((Number(row.questions_correct) / Number(row.questions_attempted)).toFixed(4)));
    }
    for (const row of datasets.examReadiness) {
      expect(row.readiness_label).toBe(Number(row.formal_exam_score_percentage) >= 60 ? 1 : 0);
    }
  });

  it("rejects invalid generation options", () => {
    expect(() => generateSyntheticDatasets({ rowsPerDataset: 0 })).toThrow("rowsPerDataset");
    expect(() => generateSyntheticDatasets({ rowsPerDataset: 1.5 })).toThrow("rowsPerDataset");
    expect(() => generateSyntheticDatasets({ seed: -1 })).toThrow("seed");
  });

  it("exports valid CSV headers, rows and escaped values", () => {
    expect(datasetToCsv([{ id: "SYN_1", note: 'topic, "advanced"', score: 0.75 }]))
      .toBe('id,note,score\nSYN_1,"topic, ""advanced""",0.75\n');
    expect(datasetToCsv([])).toBe("");
  });
});
