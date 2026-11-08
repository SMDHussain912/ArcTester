import { z } from "zod";

export interface NaiveBayesSample { features: number[]; label: 0 | 1 }
export interface NaiveBayesOptions { varianceSmoothing?: number }

const artifactSchema = z.object({
  schemaVersion: z.literal(1),
  algorithm: z.literal("gaussian-naive-bayes"),
  trainedAt: z.string().datetime(),
  trainingRows: z.number().int().min(2),
  featureCount: z.number().int().positive(),
  classCounts: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  classPriors: z.tuple([z.number().positive().finite(), z.number().positive().finite()]),
  featureScales: z.array(z.number().positive().finite()),
  classMeans: z.tuple([z.array(z.number().finite()), z.array(z.number().finite())]),
  classVariances: z.tuple([z.array(z.number().positive().finite()), z.array(z.number().positive().finite())]),
  varianceSmoothing: z.number().positive().finite(),
}).strict().superRefine((model, context) => {
  if (model.classCounts[0] + model.classCounts[1] !== model.trainingRows) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["classCounts"], message: "Class counts must match trainingRows" });
  }
  if (Math.abs(model.classPriors[0] + model.classPriors[1] - 1) > 1e-10) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["classPriors"], message: "Class priors must sum to one" });
  }
  if (model.featureScales.length !== model.featureCount ||
      model.classMeans.some((values) => values.length !== model.featureCount) ||
      model.classVariances.some((values) => values.length !== model.featureCount)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["featureCount"], message: "Feature metadata length mismatch" });
  }
});

export type NaiveBayesArtifact = z.infer<typeof artifactSchema>;

function validateSamples(samples: NaiveBayesSample[]): number {
  if (samples.length < 2) throw new Error("At least two training samples are required");
  const featureCount = samples[0]?.features.length ?? 0;
  if (!featureCount) throw new Error("Each sample must contain at least one feature");
  let hasNegative = false;
  let hasPositive = false;
  for (const [index, sample] of samples.entries()) {
    if (sample.features.length !== featureCount) throw new Error(`Sample ${index} has an inconsistent feature count`);
    if (sample.features.some((value) => !Number.isFinite(value))) throw new Error(`Sample ${index} contains a non-finite feature`);
    if (sample.label !== 0 && sample.label !== 1) throw new Error(`Sample ${index} has an invalid binary label`);
    if (sample.label === 0) hasNegative = true;
    else hasPositive = true;
  }
  if (!hasNegative || !hasPositive) throw new Error("Training data must contain both binary classes");
  return featureCount;
}

/** Fits a numeric Gaussian Naive Bayes classifier with per-feature variance smoothing. */
export function fitNaiveBayes(samples: NaiveBayesSample[], options: NaiveBayesOptions = {}): NaiveBayesArtifact {
  const featureCount = validateSamples(samples);
  const varianceSmoothing = options.varianceSmoothing ?? 1e-9;
  if (!Number.isFinite(varianceSmoothing) || varianceSmoothing <= 0 || varianceSmoothing > 1) {
    throw new Error("varianceSmoothing must be greater than 0 and at most 1");
  }

  // Scale each column by its largest observed magnitude to keep moment calculations stable.
  const featureScales = Array.from({ length: featureCount }, (_, column) =>
    Math.max(...samples.map((sample) => Math.abs(sample.features[column])), Number.MIN_VALUE)
  );
  const normalized = samples.map((sample) =>
    sample.features.map((value, column) => value / featureScales[column])
  );
  const classCounts: [number, number] = [0, 0];
  const classMeans: [number[], number[]] = [Array(featureCount).fill(0), Array(featureCount).fill(0)];
  const classVariances: [number[], number[]] = [Array(featureCount).fill(0), Array(featureCount).fill(0)];

  for (const sample of samples) classCounts[sample.label] += 1;
  for (let label = 0 as 0 | 1; label <= 1; label = (label + 1) as 0 | 1) {
    for (let column = 0; column < featureCount; column += 1) {
      const values = normalized.filter((_, index) => samples[index].label === label).map((row) => row[column]);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      classMeans[label][column] = mean;
      classVariances[label][column] = Math.max(variance, varianceSmoothing);
    }
  }

  return validateNaiveBayesArtifact({
    schemaVersion: 1,
    algorithm: "gaussian-naive-bayes",
    trainedAt: new Date().toISOString(),
    trainingRows: samples.length,
    featureCount,
    classCounts,
    classPriors: [classCounts[0] / samples.length, classCounts[1] / samples.length],
    featureScales,
    classMeans,
    classVariances,
    varianceSmoothing,
  });
}

export function validateNaiveBayesArtifact(input: unknown): NaiveBayesArtifact {
  const result = artifactSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid Gaussian Naive Bayes model artifact");
  return result.data;
}

function logLikelihood(model: NaiveBayesArtifact, features: number[], label: 0 | 1): number {
  let score = Math.log(model.classPriors[label]);
  for (let column = 0; column < model.featureCount; column += 1) {
    const normalized = features[column] / model.featureScales[column];
    const difference = normalized - model.classMeans[label][column];
    const variance = model.classVariances[label][column];
    const z = difference / Math.sqrt(variance);
    const squared = Number.isFinite(z) ? Math.min(z * z, 1e300) : 1e300;
    score -= 0.5 * (Math.log(2 * Math.PI * variance) + squared);
  }
  return score;
}

export function predictNaiveBayesProbability(modelInput: unknown, features: number[]): number {
  const model = validateNaiveBayesArtifact(modelInput);
  if (features.length !== model.featureCount || features.some((value) => !Number.isFinite(value))) {
    throw new Error("Prediction features do not match the model feature schema");
  }
  const negative = logLikelihood(model, features, 0);
  const positive = logLikelihood(model, features, 1);
  const difference = positive - negative;
  if (difference >= 0) {
    const exp = Math.exp(-Math.min(difference, 745));
    return 1 / (1 + exp);
  }
  const exp = Math.exp(Math.max(difference, -745));
  return exp / (1 + exp);
}

export function predictNaiveBayesClass(model: unknown, features: number[], threshold = 0.5): 0 | 1 {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new Error("threshold must be greater than 0 and less than 1");
  }
  return predictNaiveBayesProbability(model, features) >= threshold ? 1 : 0;
}

export function evaluateNaiveBayes(model: unknown, samples: NaiveBayesSample[], threshold = 0.5) {
  if (!samples.length) throw new Error("At least one evaluation sample is required");
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new Error("threshold must be greater than 0 and less than 1");
  }
  let truePositive = 0, trueNegative = 0, falsePositive = 0, falseNegative = 0;
  for (const [index, sample] of samples.entries()) {
    if (sample.label !== 0 && sample.label !== 1) throw new Error(`Evaluation sample ${index} has an invalid binary label`);
    const prediction = predictNaiveBayesClass(model, sample.features, threshold);
    if (prediction === 1 && sample.label === 1) truePositive += 1;
    else if (prediction === 0 && sample.label === 0) trueNegative += 1;
    else if (prediction === 1) falsePositive += 1;
    else falseNegative += 1;
  }
  const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
  const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
  return {
    rows: samples.length,
    accuracy: (truePositive + trueNegative) / samples.length,
    precision,
    recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    truePositive, trueNegative, falsePositive, falseNegative,
  };
}
