import { createHash } from "node:crypto";
import {
  predictWithRegistryArtifact,
  type RegistryArtifact,
} from "./modelRegistry.js";

export interface ModelEvaluationSample {
  features: Record<string, number | string>;
  target: number;
}

export interface ModelEvaluationMetrics {
  rows: number;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  mae?: number;
  rmse?: number;
  rSquared?: number | null;
}

export interface ModelEvaluationReport {
  status: "PASSED" | "REJECTED";
  evaluationDataset: string;
  datasetFingerprint: string;
  sampleCount: number;
  candidateVersion: number;
  baselineVersion: number;
  candidateMetrics: ModelEvaluationMetrics;
  baselineMetrics: ModelEvaluationMetrics;
  acceptanceRule: string;
  evaluatedAt: string;
}

function metrics(artifact: RegistryArtifact, samples: ModelEvaluationSample[]): ModelEvaluationMetrics {
  const predictions = samples.map((sample) => predictWithRegistryArtifact(artifact, sample.features).prediction);
  if (artifact.task === "regression") {
    const mean = samples.reduce((sum, sample) => sum + sample.target, 0) / samples.length;
    const squaredError = samples.reduce((sum, sample, index) => sum + (sample.target - Number(predictions[index])) ** 2, 0);
    const absoluteError = samples.reduce((sum, sample, index) => sum + Math.abs(sample.target - Number(predictions[index])), 0);
    const totalSquared = samples.reduce((sum, sample) => sum + (sample.target - mean) ** 2, 0);
    return {
      rows: samples.length,
      mae: absoluteError / samples.length,
      rmse: Math.sqrt(squaredError / samples.length),
      rSquared: totalSquared > 0 ? 1 - squaredError / totalSquared : null,
    };
  }

  let tp = 0, tn = 0, fp = 0, fn = 0;
  samples.forEach((sample, index) => {
    const predicted = Number(predictions[index]);
    if (sample.target === 1 && predicted === 1) tp += 1;
    else if (sample.target === 0 && predicted === 0) tn += 1;
    else if (predicted === 1) fp += 1;
    else fn += 1;
  });
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    rows: samples.length,
    accuracy: (tp + tn) / samples.length,
    precision,
    recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
  };
}

/**
 * Evaluates candidate and baseline against exactly the same admin-supplied holdout.
 * The report records a content fingerprint; provenance of the supplied data must
 * still be verified by an operator before treating it as real-world evidence.
 */
export function evaluateRegistryCandidate(
  candidate: RegistryArtifact,
  baseline: RegistryArtifact,
  samples: ModelEvaluationSample[],
  evaluationDataset: string,
): ModelEvaluationReport {
  if (candidate.modelId !== baseline.modelId) throw new Error("Candidate and baseline must belong to the same model ID");
  if (candidate.version === baseline.version) throw new Error("Candidate and baseline versions must differ");
  if (candidate.task !== baseline.task) throw new Error("Candidate and baseline tasks must match");
  if (JSON.stringify(candidate.featureSchema) !== JSON.stringify(baseline.featureSchema)) {
    throw new Error("Candidate and baseline feature schemas must match");
  }
  if (!evaluationDataset.trim() || evaluationDataset.length > 120) throw new Error("evaluationDataset must contain 1 to 120 characters");
  if (samples.length < 10 || samples.length > 5000) throw new Error("Evaluation requires between 10 and 5000 held-out samples");
  if (samples.some((sample) => !Number.isFinite(sample.target))) throw new Error("Evaluation targets must be finite numbers");
  if (candidate.task === "binary-classification") {
    if (samples.some((sample) => sample.target !== 0 && sample.target !== 1)) throw new Error("Classification targets must be binary");
    if (new Set(samples.map((sample) => sample.target)).size !== 2) throw new Error("Classification evaluation data must contain both classes");
  }

  const candidateMetrics = metrics(candidate, samples);
  const baselineMetrics = metrics(baseline, samples);
  const passed = candidate.task === "regression"
    ? candidateMetrics.mae! <= baselineMetrics.mae! && candidateMetrics.rmse! <= baselineMetrics.rmse!
    : candidateMetrics.f1! >= baselineMetrics.f1! && candidateMetrics.accuracy! >= baselineMetrics.accuracy!;
  const canonical = JSON.stringify(samples);
  return {
    status: passed ? "PASSED" : "REJECTED",
    evaluationDataset: evaluationDataset.trim(),
    datasetFingerprint: createHash("sha256").update(canonical).digest("hex"),
    sampleCount: samples.length,
    candidateVersion: candidate.version,
    baselineVersion: baseline.version,
    candidateMetrics,
    baselineMetrics,
    acceptanceRule: candidate.task === "regression"
      ? "candidate MAE and RMSE must both be no worse than baseline"
      : "candidate F1 and accuracy must both be no worse than baseline",
    evaluatedAt: new Date().toISOString(),
  };
}
