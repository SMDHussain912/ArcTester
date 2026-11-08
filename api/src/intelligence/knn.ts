import { z } from "zod";

export interface KnnSample { features: number[]; label: 0 | 1 }
export interface KnnOptions { k?: number }

const schema = z.object({
  schemaVersion: z.literal(1),
  algorithm: z.literal("k-nearest-neighbors"),
  trainedAt: z.string().datetime(),
  trainingRows: z.number().int().min(2),
  featureCount: z.number().int().positive(),
  k: z.number().int().positive(),
  featureMeans: z.array(z.number().finite()),
  featureScales: z.array(z.number().positive().finite()),
  trainingFeatures: z.array(z.array(z.number().finite())),
  labels: z.array(z.union([z.literal(0), z.literal(1)])),
}).strict().superRefine((model, context) => {
  if (model.featureMeans.length !== model.featureCount || model.featureScales.length !== model.featureCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["featureCount"], message: "Feature metadata length mismatch" });
  }
  if (model.trainingFeatures.length !== model.trainingRows || model.labels.length !== model.trainingRows || model.k > model.trainingRows) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["trainingRows"], message: "Training rows, labels and k are inconsistent" });
  }
  if (model.trainingFeatures.some((row) => row.length !== model.featureCount)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["trainingFeatures"], message: "Training feature rows have inconsistent lengths" });
  }
});

export type KnnArtifact = z.infer<typeof schema>;

function validateSamples(samples: KnnSample[]): number {
  if (samples.length < 2) throw new Error("At least two training samples are required");
  const count = samples[0]?.features.length ?? 0;
  if (count === 0) throw new Error("Each sample must contain at least one feature");
  for (const [index, sample] of samples.entries()) {
    if (sample.features.length !== count) throw new Error(`Sample ${index} has an inconsistent feature count`);
    if (sample.features.some((value) => !Number.isFinite(value))) throw new Error(`Sample ${index} contains a non-finite feature`);
    if (sample.label !== 0 && sample.label !== 1) throw new Error(`Sample ${index} has an invalid binary label`);
  }
  return count;
}

/** Stores normalized training rows; inference uses weighted Euclidean neighbours. */
export function fitKnn(samples: KnnSample[], options: KnnOptions = {}): KnnArtifact {
  const featureCount = validateSamples(samples);
  const k = options.k ?? 3;
  if (!Number.isInteger(k) || k < 1 || k > samples.length) throw new Error("k must be an integer between 1 and the number of training samples");
  const featureMeans = Array.from({ length: featureCount }, (_, column) => samples.reduce((sum, row) => sum + row.features[column], 0) / samples.length);
  const featureScales = Array.from({ length: featureCount }, (_, column) => {
    const mean = featureMeans[column];
    const variance = samples.reduce((sum, row) => sum + (row.features[column] - mean) ** 2, 0) / samples.length;
    const scale = Math.sqrt(variance);
    return scale > 0 ? scale : 1;
  });
  const trainingFeatures = samples.map((row) => row.features.map((value, column) => (value - featureMeans[column]) / featureScales[column]));
  return validateKnnArtifact({
    schemaVersion: 1, algorithm: "k-nearest-neighbors", trainedAt: new Date().toISOString(),
    trainingRows: samples.length, featureCount, k, featureMeans, featureScales,
    trainingFeatures, labels: samples.map((row) => row.label),
  });
}

export function validateKnnArtifact(input: unknown): KnnArtifact {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error("Invalid KNN model artifact");
  return result.data;
}

export function predictKnnProbability(modelInput: unknown, features: number[], requestedK?: number): number {
  const model = validateKnnArtifact(modelInput);
  if (features.length !== model.featureCount || features.some((value) => !Number.isFinite(value))) throw new Error("Prediction features do not match the model feature schema");
  const k = requestedK ?? model.k;
  if (!Number.isInteger(k) || k < 1 || k > model.trainingRows) throw new Error("k must be an integer between 1 and the number of training samples");
  const normalized = features.map((value, column) => (value - model.featureMeans[column]) / model.featureScales[column]);
  const nearest = model.trainingFeatures.map((row, index) => ({
    label: model.labels[index],
    distance: Math.sqrt(row.reduce((sum, value, column) => sum + (value - normalized[column]) ** 2, 0)),
    index,
  })).sort((a, b) => a.distance - b.distance || a.index - b.index).slice(0, k);
  const exact = nearest.filter((item) => item.distance === 0);
  const voters = exact.length ? exact : nearest;
  const totalWeight = voters.reduce((sum, item) => sum + (exact.length ? 1 : 1 / item.distance), 0);
  const positiveWeight = voters.reduce((sum, item) => sum + (item.label === 1 ? (exact.length ? 1 : 1 / item.distance) : 0), 0);
  return positiveWeight / totalWeight;
}

export function predictKnnClass(model: unknown, features: number[], threshold = 0.5, k?: number): 0 | 1 {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) throw new Error("threshold must be greater than 0 and less than 1");
  return predictKnnProbability(model, features, k) >= threshold ? 1 : 0;
}

export function evaluateKnn(model: unknown, samples: KnnSample[], threshold = 0.5, k?: number) {
  if (samples.length === 0) throw new Error("At least one evaluation sample is required");
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const [index, sample] of samples.entries()) {
    if (sample.label !== 0 && sample.label !== 1) throw new Error(`Evaluation sample ${index} has an invalid binary label`);
    const prediction = predictKnnClass(model, sample.features, threshold, k);
    if (prediction === 1 && sample.label === 1) tp += 1;
    else if (prediction === 0 && sample.label === 0) tn += 1;
    else if (prediction === 1) fp += 1;
    else fn += 1;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const accuracy = (tp + tn) / samples.length;
  return { rows: samples.length, accuracy, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn };
}