import { createHash } from "node:crypto";
import {
  predictWithRegistryArtifact,
  type RegistryArtifact,
} from "./modelRegistry.js";

export interface ModelEvaluationSample {
  features: Record<string, number | string>;
  target: number;
  /** Required for multiclass readiness evaluation to prove learner-group separation. */
  groupId?: string;
}

export interface ModelEvaluationMetrics {
  rows: number;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  macroF1?: number;
  falseReadyRate?: number;
  balancedAccuracy?: number;
  perClass?: Record<"NOT_READY" | "DEVELOPING" | "READY", {
    precision: number; recall: number; f1: number; support: number;
  }>;
  confusionMatrix?: number[][];
  unclassified?: number;
  logLoss?: number | null;
  brierScore?: number | null;
  expectedCalibrationError?: number | null;
  fallbackRate?: number;
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
    const predictionResults = samples.map((sample) => predictWithRegistryArtifact(artifact, sample.features));
    const predicted = predictionResults.map((result) =>
      typeof result.prediction === "string" && labels.includes(result.prediction as typeof labels[number])
        ? result.prediction as typeof labels[number]
        : null);
    const actual = samples.map((sample) => labels[sample.target]);
    const confusionMatrix = labels.map(() => labels.map(() => 0));
    const perClass = {} as Record<typeof labels[number], {
      precision: number; recall: number; f1: number; support: number;
    }>;
    let totalCorrect = 0;
    let unclassified = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const actualIndex = labels.indexOf(actual[index]);
      const predictedIndex = predicted[index] === null ? -1 : labels.indexOf(predicted[index]!);
      if (predictedIndex < 0) unclassified += 1;
      else confusionMatrix[actualIndex][predictedIndex] += 1;
      if (predicted[index] === actual[index]) totalCorrect += 1;
    }
    let falseReady = 0;
    let notReadyCount = 0;
    let recallTotal = 0;
    for (let classIndex = 0; classIndex < labels.length; classIndex += 1) {
      const label = labels[classIndex];
      const tp = confusionMatrix[classIndex][classIndex];
      const support = samples.filter((sample) => sample.target === classIndex).length;
      const fp = confusionMatrix.reduce((sum, row, rowIndex) =>
        sum + (rowIndex === classIndex ? 0 : row[classIndex]), 0);
      const precision = tp + fp ? tp / (tp + fp) : 0;
      const recall = support ? tp / support : 0;
      const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
      perClass[label] = { precision, recall, f1, support };
      recallTotal += recall;
      if (classIndex === 0) notReadyCount = support;
    }
    samples.forEach((sample, index) => {
      if (sample.target === 0 && predicted[index] === "READY") falseReady += 1;
    });

    const probabilityRows = predictionResults.map((result) => {
      const probabilities = result.readiness?.probabilities;
      if (!probabilities) return null;
      const values = labels.map((label) => probabilities[label]);
      const sum = values.reduce((total, value) => total + value, 0);
      if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
          Math.abs(sum - 1) > 1e-6) return null;
      return values;
    });
    if (probabilityRows.some((row) => row === null)) {
      throw new Error("Readiness evaluation requires a valid class-probability vector for every held-out sample.");
    }
    const probabilities = probabilityRows as number[][];
    const epsilon = 1e-12;
    const logLoss = probabilities.reduce((sum, row, index) =>
      sum - Math.log(Math.max(epsilon, row[samples[index].target])), 0) / samples.length;
    const brierScore = probabilities.reduce((sum, row, index) =>
      sum + row.reduce((rowSum, probability, classIndex) =>
        rowSum + (probability - Number(classIndex === samples[index].target)) ** 2, 0), 0) / samples.length;
    const bins = Array.from({ length: 10 }, () => ({ count: 0, confidence: 0, correct: 0 }));
    probabilities.forEach((row, index) => {
      const confidence = Math.max(...row);
      const binIndex = Math.min(9, Math.floor(confidence * 10));
      const bin = bins[binIndex];
      bin.count += 1;
      bin.confidence += confidence;
      bin.correct += Number(predicted[index] === actual[index]);
    });
    const expectedCalibrationError = bins.reduce((sum, bin) => bin.count
      ? sum + (bin.count / samples.length) * Math.abs(bin.correct / bin.count - bin.confidence / bin.count)
      : sum, 0);
    const fallbackCount = predictionResults.filter((result) => result.readiness?.status !== "ready").length;

    return {
      rows: samples.length,
      accuracy: totalCorrect / samples.length,
      macroF1: labels.reduce((sum, label) => sum + perClass[label].f1, 0) / labels.length,
      balancedAccuracy: recallTotal / labels.length,
      perClass,
      confusionMatrix,
      unclassified,
      falseReadyRate: notReadyCount ? falseReady / notReadyCount : 1,
      logLoss,
      brierScore,
      expectedCalibrationError,
      fallbackRate: fallbackCount / samples.length,
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
    if (samples.length < 1000) {
      throw new Error("Readiness qualification requires at least 1,000 independent held-out snapshots.");
    }
    if (samples.some((sample) => !Number.isInteger(sample.target) || sample.target < 0 || sample.target > 2)) {
      throw new Error("Readiness evaluation targets must be encoded as 0, 1 or 2");
    }
    if (samples.some((sample) => typeof sample.groupId !== "string" || !/^[a-f0-9]{64}$/.test(sample.groupId))) {
      throw new Error("Readiness evaluation requires a keyed HMAC learner group ID on every held-out row.");
    }
    const groups = new Set(samples.map((sample) => sample.groupId));
    if (groups.size < 100) {
      throw new Error("Readiness qualification requires at least 100 distinct held-out learner groups.");
    }
    for (const label of [0, 1, 2]) {
      const classRows = samples.filter((sample) => sample.target === label);
      const classGroups = new Set(classRows.map((sample) => sample.groupId));
      if (classRows.length < 100 || classGroups.size < 20) {
        throw new Error("Readiness qualification requires at least 100 examples across 20 learner groups in every class.");
      }
    }
  }

  const candidateMetrics = metrics(candidate, samples);
  const baselineMetrics = metrics(baseline, samples);
  const passed = candidate.task === "regression"
    ? candidateMetrics.mae! <= baselineMetrics.mae! && candidateMetrics.rmse! <= baselineMetrics.rmse!
    : candidate.task === "multiclass-classification"
      ? candidateMetrics.macroF1! >= baselineMetrics.macroF1! &&
        candidateMetrics.accuracy! >= baselineMetrics.accuracy! &&
        candidateMetrics.balancedAccuracy! >= baselineMetrics.balancedAccuracy! &&
        candidateMetrics.falseReadyRate! <= baselineMetrics.falseReadyRate! &&
        candidateMetrics.falseReadyRate! <= 0.05 &&
        candidateMetrics.logLoss! <= baselineMetrics.logLoss! &&
        candidateMetrics.brierScore! <= baselineMetrics.brierScore! &&
        candidateMetrics.expectedCalibrationError! <= baselineMetrics.expectedCalibrationError! &&
        candidateMetrics.fallbackRate! <= baselineMetrics.fallbackRate!
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
        ? "at least 1,000 held-out snapshots across 100 learner groups and 100 examples per class; macro-F1, accuracy, balanced accuracy and calibration no worse than baseline; false-READY rate no greater than 5%; fallback rate no worse than baseline"
        : "candidate F1 and accuracy must both be no worse than baseline",
    evaluatedAt: new Date().toISOString(),
  };
}
