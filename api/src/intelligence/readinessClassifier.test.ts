import { describe, expect, it } from "vitest";
import { fitReadinessClassifier, predictReadiness, type ReadinessRow } from "./readinessClassifier.js";

const rows: ReadinessRow[] = Array.from({ length: 1200 }, (_, index) => {
  const group = String(Math.floor(index / 10)).padStart(64, "0");
  const labelIndex = Math.floor(index / 400);
  const label = labelIndex === 0 ? "NOT_READY" : labelIndex === 1 ? "DEVELOPING" : "READY";
  return { groupId: group, label, features: [labelIndex * 0.45 + (index % 10) * 0.002, labelIndex, 1 - labelIndex * 0.2] };
});

describe("three-class exam readiness model", () => {
  it("trains a group-identified softmax classifier and returns calibrated-shaped probabilities", () => {
    const model = fitReadinessClassifier(rows, { iterations: 2200 });
    const prediction = predictReadiness(model, [0.9, 2, 0.6], 8);
    expect(prediction.status).toBe("ready");
    expect(prediction.category).toBe("READY");
    expect(prediction.probabilities.NOT_READY + prediction.probabilities.DEVELOPING + prediction.probabilities.READY).toBeCloseTo(1, 8);
    expect(prediction.factors.length).toBeGreaterThan(0);
  });

  it("does not predict readiness with too little history or out-of-distribution features", () => {
    const model = fitReadinessClassifier(rows);
    expect(predictReadiness(model, [0, 0, 1], 4).status).toBe("insufficient_data");
    expect(predictReadiness(model, [1000, 2, 0.5], 9).status).toBe("fallback");
  });

  it("rejects missing learner pseudonyms and class-imbalanced training sets", () => {
    expect(() => fitReadinessClassifier(rows.map((row, index) => index === 0 ? { ...row, groupId: "" } : row)))
      .toThrow("HMAC learner group IDs");
    expect(() => fitReadinessClassifier(rows.filter((row) => row.label !== "READY")))
      .toThrow("at least 100 examples of every readiness class");
  });
});
