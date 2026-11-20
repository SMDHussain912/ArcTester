import { z } from "zod";
export const READINESS_CLASSES = ["NOT_READY", "DEVELOPING", "READY"] as const;
export type ReadinessClass = typeof READINESS_CLASSES[number];
export interface ReadinessRow { features: number[]; label: ReadinessClass; groupId: string }
export interface ReadinessModel {
  modelType: "exam-readiness-softmax";
  version: 1;
  featureCount: number;
  means: number[];
  scales: number[];
  weights: number[][];
  intercepts: number[];
  trainingGroups: number;
  policyVersion: 1;
}
export interface ReadinessPrediction {
  category: ReadinessClass | null;
  probabilities: Record<ReadinessClass, number>;
  confidence: number;
  modelVersion: number;
  status: "ready" | "insufficient_data" | "fallback";
  factors: Array<{ featureIndex: number; direction: "positive" | "negative" }>;
}
const classIndex = (label: ReadinessClass) => READINESS_CLASSES.indexOf(label);
function validateRows(rows: ReadinessRow[]): number {
  if (rows.length < 1000) throw new Error("Readiness training requires at least 1,000 labeled snapshots");
  if (new Set(rows.map((row) => row.groupId)).size < 100) {
    throw new Error("Readiness training requires at least 100 distinct learner groups");
  }
  if (rows.some((row) => !row.groupId || !/^[a-f0-9]{64}$/.test(row.groupId))) {
    throw new Error("Readiness training requires keyed HMAC learner group IDs");
  }
  const featureCount = rows[0].features.length;
  if (!featureCount || rows.some((row) => row.features.length !== featureCount ||
    row.features.some((value) => !Number.isFinite(value)) || !READINESS_CLASSES.includes(row.label))) {
    throw new Error("Readiness rows contain invalid features or labels");
  }
  for (const label of READINESS_CLASSES) {
    const classRows = rows.filter((row) => row.label === label);
    if (classRows.length < 100) {
      throw new Error("Readiness training requires at least 100 examples of every readiness class");
    }
    if (new Set(classRows.map((row) => row.groupId)).size < 20) {
      throw new Error("Every readiness class must include at least 20 distinct learner groups");
    }
  }
  return featureCount;
}
function softmax(values: number[]): number[] {
  const maximum = Math.max(...values);
  const exponents = values.map((value) => Math.exp(Math.max(-40, Math.min(40, value - maximum))));
  const total = exponents.reduce((sum, value) => sum + value, 0);
  return exponents.map((value) => value / total);
}
export function fitReadinessClassifier(
  rows: ReadinessRow[],
  options: { iterations?: number; learningRate?: number; l2?: number } = {},
): ReadinessModel {
  const featureCount = validateRows(rows);
  const iterations = options.iterations ?? 1800;
  const learningRate = options.learningRate ?? 0.04;
  const l2 = options.l2 ?? 0.001;
  if (!Number.isInteger(iterations) || iterations < 100 || iterations > 10000 ||
    !Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 0.2 ||
    !Number.isFinite(l2) || l2 < 0 || l2 > 1) throw new Error("Readiness classifier training options are invalid");
  const means = Array.from({ length: featureCount }, (_, feature) =>
    rows.reduce((sum, row) => sum + row.features[feature], 0) / rows.length);
  const scales = Array.from({ length: featureCount }, (_, feature) => {
    const variance = rows.reduce((sum, row) => sum + (row.features[feature] - means[feature]) ** 2, 0) / rows.length;
    return Math.sqrt(variance) || 1;
  });
  const x = rows.map((row) => row.features.map((value, index) => (value - means[index]) / scales[index]));
  const weights = Array.from({ length: 3 }, () => Array.from({ length: featureCount }, () => 0));
  const intercepts = [0, 0, 0];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const weightGradients = weights.map((classWeights) => classWeights.map(() => 0));
    const interceptGradients = [0, 0, 0];
    rows.forEach((row, rowIndex) => {
      const probabilities = softmax(weights.map((classWeights, index) =>
        intercepts[index] + classWeights.reduce((sum, weight, feature) => sum + weight * x[rowIndex][feature], 0)));
      const actual = classIndex(row.label);
      probabilities.forEach((probability, classIdx) => {
        const error = probability - Number(classIdx === actual);
        interceptGradients[classIdx] += error / rows.length;
        x[rowIndex].forEach((value, feature) => {
          weightGradients[classIdx][feature] += (error * value) / rows.length;
        });
      });
    });
    for (let classIdx = 0; classIdx < 3; classIdx += 1) {
      intercepts[classIdx] -= learningRate * interceptGradients[classIdx];
      for (let feature = 0; feature < featureCount; feature += 1) {
        weights[classIdx][feature] -= learningRate * (weightGradients[classIdx][feature] + l2 * weights[classIdx][feature]);
      }
    }
  }
  return {
    modelType: "exam-readiness-softmax", version: 1, featureCount, means, scales,
    weights, intercepts, trainingGroups: new Set(rows.map((row) => row.groupId)).size, policyVersion: 1,
  };
}
export function predictReadiness(
  model: ReadinessModel,
  features: number[],
  priorCompletedAttempts: number,
): ReadinessPrediction {
  const empty: Record<ReadinessClass, number> = { NOT_READY: 0, DEVELOPING: 0, READY: 0 };
  if (!Number.isInteger(priorCompletedAttempts) || priorCompletedAttempts < 0) {
    throw new Error("priorCompletedAttempts must be a non-negative integer");
  }
  if (priorCompletedAttempts < 5) return {
    category: null, probabilities: empty, confidence: 0, modelVersion: model.version,
    status: "insufficient_data", factors: [],
  };
  if (model.modelType !== "exam-readiness-softmax" || model.version !== 1 ||
    features.length !== model.featureCount || features.some((value) => !Number.isFinite(value))) {
    throw new Error("Readiness prediction features do not match the trained model");
  }
  const normalized = features.map((value, index) => (value - model.means[index]) / model.scales[index]);
  if (normalized.some((value) => Math.abs(value) > 5)) return {
    category: null, probabilities: empty, confidence: 0, modelVersion: model.version,
    status: "fallback", factors: [],
  };
  const values = model.weights.map((classWeights, index) =>
    model.intercepts[index] + classWeights.reduce((sum, weight, feature) => sum + weight * normalized[feature], 0));
  const probabilities = softmax(values);
  const best = probabilities.indexOf(Math.max(...probabilities));
  const category = READINESS_CLASSES[best];
  const named = Object.fromEntries(READINESS_CLASSES.map((label, index) => [label, probabilities[index]])) as Record<ReadinessClass, number>;
  const factors = model.weights[best].map((weight, featureIndex) => ({ weight, featureIndex }))
    .filter((factor) => Math.abs(factor.weight) > 0.05)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 5)
    .map(({ weight, featureIndex }) => ({ featureIndex, direction: weight >= 0 ? "positive" as const : "negative" as const }));
  if (Math.max(...probabilities) < 0.55) return {
    category: null, probabilities: named, confidence: Math.max(...probabilities), modelVersion: model.version,
    status: "fallback", factors,
  };
  return { category, probabilities: named, confidence: Math.max(...probabilities), modelVersion: model.version, status: "ready", factors };
}

const ReadinessModelSchema = z.object({
  modelType: z.literal("exam-readiness-softmax"),
  version: z.literal(1),
  featureCount: z.number().int().positive(),
  means: z.array(z.number().finite()),
  scales: z.array(z.number().finite().positive()),
  weights: z.array(z.array(z.number().finite())).length(3),
  intercepts: z.array(z.number().finite()).length(3),
  trainingGroups: z.number().int().min(100),
  policyVersion: z.literal(1),
}).strict().superRefine((model, context) => {
  if (model.means.length !== model.featureCount || model.scales.length !== model.featureCount ||
    model.weights.some((weights) => weights.length !== model.featureCount)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Readiness model feature dimensions do not match" });
  }
});
export function validateReadinessModel(input: unknown): ReadinessModel {
  return ReadinessModelSchema.parse(input);
}
