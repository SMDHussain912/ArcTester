import { describe, expect, it } from "vitest";
import {
  isTensorflowJsArtifactProductionEligible,
  validateTensorflowJsArtifact,
} from "./tensorflowJsArtifact.js";

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    format: "tensorflow-js-layers-model",
    modelId: "student-score-tf",
    version: 1,
    task: "regression",
    featureSchema: [
      { name: "recentAccuracy", type: "numeric" },
      { name: "attemptCount", type: "numeric" },
    ],
    normalization: { means: [0.5, 12], scales: [0.2, 5] },
    modelTopology: { class_name: "Sequential", config: { layers: [] } },
    weightSpecs: [{ name: "dense/kernel", shape: [2, 1], dtype: "float32" }],
    weightDataBase64: "AAAAAA==",
    evaluation: {
      candidateMae: 0.08,
      baselineMae: 0.1,
      candidateRmse: 0.1,
      baselineRmse: 0.12,
      testSamples: 30,
      splitMethod: "grouped-student-holdout",
      datasetKind: "real-anonymized",
    },
    trainedAt: "2026-11-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("TensorFlow.js artifact contract", () => {
  it("validates a portable model bundle with matching feature preprocessing", () => {
    const validated = validateTensorflowJsArtifact(artifact());
    expect(validated.format).toBe("tensorflow-js-layers-model");
    expect(validated.featureSchema).toHaveLength(2);
    expect(isTensorflowJsArtifactProductionEligible(validated)).toBe(true);
  });

  it("rejects mismatched normalization and feature dimensions", () => {
    expect(() => validateTensorflowJsArtifact(artifact({
      normalization: { means: [0.5], scales: [0.2] },
    }))).toThrow("Normalization arrays must match feature count");
  });

  it("rejects invalid base64 and oversized model weight payloads", () => {
    expect(() => validateTensorflowJsArtifact(artifact({ weightDataBase64: "not base64!" })))
      .toThrow("Invalid TensorFlow.js model artifact");
    expect(() => validateTensorflowJsArtifact(artifact({ weightDataBase64: "A".repeat(16_000_004) })))
      .toThrow("Invalid TensorFlow.js model artifact");
  });

  it("rejects a candidate that does not beat the statistical baseline", () => {
    expect(() => validateTensorflowJsArtifact(artifact({
      evaluation: {
        candidateMae: 0.11,
        baselineMae: 0.1,
        candidateRmse: 0.1,
        baselineRmse: 0.12,
        testSamples: 30,
        splitMethod: "walk-forward",
        datasetKind: "real-anonymized",
      },
    }))).toThrow("TensorFlow candidate must beat or tie baseline MAE");
  });

  it("allows synthetic experiments but never marks them production eligible", () => {
    const validated = validateTensorflowJsArtifact(artifact({
      evaluation: {
        candidateMae: 0.05,
        baselineMae: 0.1,
        candidateRmse: 0.07,
        baselineRmse: 0.12,
        testSamples: 30,
        splitMethod: "walk-forward",
        datasetKind: "synthetic",
      },
    }));
    expect(isTensorflowJsArtifactProductionEligible(validated)).toBe(false);
  });

  it("rejects duplicate features and too-small evaluation sets", () => {
    expect(() => validateTensorflowJsArtifact(artifact({
      featureSchema: [
        { name: "recentAccuracy", type: "numeric" },
        { name: "recentAccuracy", type: "numeric" },
      ],
    }))).toThrow("Feature names must be unique");
    expect(() => validateTensorflowJsArtifact(artifact({
      evaluation: {
        candidateMae: 0.08,
        baselineMae: 0.1,
        candidateRmse: 0.1,
        baselineRmse: 0.12,
        testSamples: 19,
        splitMethod: "grouped-student-holdout",
        datasetKind: "real-anonymized",
      },
    }))).toThrow("too_small");
  });
});
