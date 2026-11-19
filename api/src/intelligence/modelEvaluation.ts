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
  macroF1?: number;
  falseReadyRate?: number;
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

  if (artifact.task === "multiclass-classification") {
    const labels = ["NOT_READY", "DEVELOPING", "READY"] as const;
    const predicted = predictions.map((prediction) =>
      typeof prediction === "string" ? prediction : null);
    const actual = samples.map((sample) => labels[sample.target]);
    let totalCorrect = 0;
    const classF1 = labels.map((label) => {
      let tp = 0, fp = 0, fn = 0;
      samples.forEach((_sample, index) => {
        if (actual[index] === label && predicted[index] === label) tp += 1;
        else if (actual[index] !== label && predicted[index] === label) fp += 1;
        else if (actual[index] === label && predicted[index] !== label) fn += 1;
      });
      return tp + fp + fn === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
    });
    samples.forEach((_sample, index) => { if (actual[index] === predicted[index]) totalCorrect += 1; });
    let notReadyCount = 0;
    let falseReady = 0;
    samples.forEach((sample, index) => {
      if (sample.target === 0) {
        notReadyCount += 1;
        if (predicted[index] === "READY") falseReady += 1;
      }
    });
    return {
      rows: samples.length,
      accuracy: totalCorrect / samples.length,
      macroF1: classF1.reduce((sum, value) => sum + value, 0) / labels.length,
      falseReadyRate: notReadyCount ? falseReady / notReadyCount : 1,
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
  if (candidate.task === "multiclass-classification") {
    if (samples.some((sample) => !Number.isInteger(sample.target) || sample.target < 0 || sample.target > 2)) {
      throw new Error("Readiness evaluation targets must be encoded as 0, 1 or 2");
    }
    if ([0, 1, 2].some((label) => samples.filter((sample) => sample.target === label).length < 10)) {
      throw new Error("Readiness evaluation requires at least 10 examples of every class");
    }
  }

  const candidateMetrics = metrics(candidate, samples);
  const baselineMetrics = metrics(baseline, samples);
  const passed = candidate.task === "regression"
    ? candidateMetrics.mae! <= baselineMetrics.mae! && candidateMetrics.rmse! <= baselineMetrics.rmse!
    : candidate.task === "multiclass-classification"
      ? candidateMetrics.macroF1! >= baselineMetrics.macroF1! &&
        candidateMetrics.accuracy! >= baselineMetrics.accuracy! &&
        candidateMetrics.falseReadyRate! <= baselineMetrics.falseReadyRate!
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
      : candidate.task === "multiclass-classification"
        ? "candidate macro-F1 and accuracy must be no worse than baseline and false-READY rate must not increase"
        : "candidate F1 and accuracy must both be no worse than baseline",
    evaluatedAt: new Date().toISOString(),
  };
}
