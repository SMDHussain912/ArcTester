export interface ExamSessionTelemetry {
  focus_loss_count: number;
  disconnect_count: number;
  heartbeat_gap_count: number;
  heartbeat_gap_max_seconds: number;
  answer_change_count: number;
  rapid_answer_burst_count: number;
  submission_retry_count: number;
  session_duration_ratio: number;
  event_rate_deviation: number | null;
  client_kind: "web" | "android" | "ios" | "unknown";
  telemetry_coverage: number;
}
export interface IsolationTreeNode {
  size: number;
  featureIndex?: number;
  splitValue?: number;
  left?: IsolationTreeNode;
  right?: IsolationTreeNode;
}
export interface IsolationForestArtifact {
  modelType: "exam-session-isolation-forest";
  version: 1;
  featureCount: number;
  sampleSize: number;
  trees: IsolationTreeNode[];
}
export interface AnomalyPrediction {
  anomalyScore: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  reasonCodes: string[];
  telemetryCoverage: number;
  modelVersion: number;
  reviewRequired: boolean;
}
const FEATURE_NAMES = [
  "focus_loss_count", "disconnect_count", "heartbeat_gap_count", "heartbeat_gap_max_seconds",
  "answer_change_count", "rapid_answer_burst_count", "submission_retry_count",
  "session_duration_ratio", "event_rate_deviation",
] as const;
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function harmonic(n: number): number {
  if (n <= 1) return 0;
  let sum = 0;
  for (let i = 1; i < n; i += 1) sum += 1 / i;
  return sum;
}
function averagePathCorrection(size: number): number {
  if (size <= 1) return 0;
  return 2 * harmonic(size - 1) - (2 * (size - 1)) / size;
}
function validateMatrix(rows: number[][]): number {
  if (rows.length < 16) throw new Error("Isolation forest requires at least 16 complete reference sessions");
  const count = rows[0].length;
  if (!count || rows.some((row) => row.length !== count || row.some((value) => !Number.isFinite(value)))) {
    throw new Error("Isolation forest rows must be finite and have a consistent feature schema");
  }
  return count;
}
function buildIsolationTree(rows: number[][], heightLimit: number, randomValue: () => number, depth = 0): IsolationTreeNode {
  if (depth >= heightLimit || rows.length <= 1) return { size: rows.length };
  const featureCount = rows[0].length;
  const candidates = Array.from({ length: featureCount }, (_, index) => index)
    .filter((feature) => Math.min(...rows.map((row) => row[feature])) < Math.max(...rows.map((row) => row[feature])));
  if (!candidates.length) return { size: rows.length };
  const featureIndex = candidates[Math.floor(randomValue() * candidates.length)];
  const values = rows.map((row) => row[featureIndex]);
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const splitValue = minimum + randomValue() * (maximum - minimum);
  const leftRows = rows.filter((row) => row[featureIndex] < splitValue);
  const rightRows = rows.filter((row) => row[featureIndex] >= splitValue);
  if (!leftRows.length || !rightRows.length) return { size: rows.length };
  return {
    size: rows.length, featureIndex, splitValue,
    left: buildIsolationTree(leftRows, heightLimit, randomValue, depth + 1),
    right: buildIsolationTree(rightRows, heightLimit, randomValue, depth + 1),
  };
}
function pathLength(node: IsolationTreeNode, row: number[], depth = 0): number {
  if (node.featureIndex === undefined || !node.left || !node.right) return depth + averagePathCorrection(node.size);
  return pathLength(row[node.featureIndex] < (node.splitValue as number) ? node.left : node.right, row, depth + 1);
}
function telemetryVector(telemetry: ExamSessionTelemetry): number[] {
  const vector = FEATURE_NAMES.map((name) => telemetry[name]);
  if (telemetry.event_rate_deviation !== null) vector[8] = telemetry.event_rate_deviation;
  return vector;
}
export function fitExamSessionIsolationForest(
  referenceRows: number[][],
  options: { trees?: number; sampleSize?: number; seed?: number } = {},
): IsolationForestArtifact {
  const featureCount = validateMatrix(referenceRows);
  if (featureCount !== FEATURE_NAMES.length) throw new Error("Isolation forest requires the approved nine-feature telemetry schema");
  const treesCount = options.trees ?? 100;
  const sampleSize = options.sampleSize ?? Math.min(256, referenceRows.length);
  if (!Number.isInteger(treesCount) || treesCount < 16 || treesCount > 300 ||
    !Number.isInteger(sampleSize) || sampleSize < 8 || sampleSize > referenceRows.length) {
    throw new Error("Isolation forest training options are invalid");
  }
  const randomValue = random(options.seed ?? 42);
  const heightLimit = Math.ceil(Math.log2(sampleSize));
  const trees = Array.from({ length: treesCount }, () => {
    const sample = [...referenceRows];
    for (let index = sample.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(randomValue() * (index + 1));
      [sample[index], sample[swap]] = [sample[swap], sample[index]];
    }
    return buildIsolationTree(sample.slice(0, sampleSize), heightLimit, randomValue);
  });
  return { modelType: "exam-session-isolation-forest", version: 1, featureCount, sampleSize, trees };
}
export function scoreExamSessionAnomaly(model: IsolationForestArtifact, telemetry: ExamSessionTelemetry): AnomalyPrediction {
  if (model.modelType !== "exam-session-isolation-forest" || model.version !== 1 ||
    model.featureCount !== FEATURE_NAMES.length || !model.trees.length) throw new Error("Isolation forest artifact is invalid");
  const counts = [
    telemetry.focus_loss_count, telemetry.disconnect_count, telemetry.heartbeat_gap_count,
    telemetry.heartbeat_gap_max_seconds, telemetry.answer_change_count, telemetry.rapid_answer_burst_count,
    telemetry.submission_retry_count,
  ];
  if (counts.some((value) => !Number.isFinite(value) || value < 0) ||
    !Number.isFinite(telemetry.session_duration_ratio) || telemetry.session_duration_ratio < 0 ||
    (telemetry.event_rate_deviation !== null && !Number.isFinite(telemetry.event_rate_deviation)) ||
    !Number.isFinite(telemetry.telemetry_coverage) || telemetry.telemetry_coverage < 0 || telemetry.telemetry_coverage > 1) {
    throw new Error("Exam telemetry contains invalid values");
  }
  const coverage = telemetry.telemetry_coverage;
  if (coverage < 0.7) return {
    anomalyScore: 0, severity: "LOW", reasonCodes: ["TELEMETRY_INCOMPLETE"],
    telemetryCoverage: coverage, modelVersion: model.version, reviewRequired: false,
  };
  const vector = telemetryVector(telemetry);
  const averagePath = model.trees.reduce((sum, tree) => sum + pathLength(tree, vector), 0) / model.trees.length;
  const denominator = averagePathCorrection(model.sampleSize) || 1;
  const anomalyScore = Math.max(0, Math.min(1, 2 ** (-averagePath / denominator)));
  const reasons: string[] = [];
  if (telemetry.rapid_answer_burst_count >= 8) reasons.push("RAPID_ANSWER_BURSTS");
  if (telemetry.submission_retry_count >= 4) reasons.push("REPEATED_SUBMISSION_RETRIES");
  if (telemetry.heartbeat_gap_max_seconds >= 60) reasons.push("LONG_HEARTBEAT_GAP");
  if (telemetry.answer_change_count >= 20) reasons.push("UNUSUAL_ANSWER_CHANGES");
  if (telemetry.event_rate_deviation !== null && Math.abs(telemetry.event_rate_deviation) >= 3) reasons.push("EVENT_RATE_DEVIATION");
  const ruleSignal = reasons.length > 0;
  const combined = Math.min(1, anomalyScore * 0.75 + (ruleSignal ? 0.25 : 0));
  const severity = combined >= 0.75 ? "HIGH" : combined >= 0.55 ? "MEDIUM" : "LOW";
  if (ruleSignal && severity !== "LOW") reasons.unshift("POLICY_SIGNAL_REQUIRES_REVIEW");
  return {
    anomalyScore: combined, severity, reasonCodes: reasons,
    telemetryCoverage: coverage, modelVersion: model.version,
    reviewRequired: severity !== "LOW",
  };
}
