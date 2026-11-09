import { z } from "zod";

export interface ClassificationSample {
  features: number[];
  label: 0 | 1;
}

export interface ClassificationOptions {
  iterations?: number;
  learningRate?: number;
  threshold?: number;
}

export interface ClassificationMetrics {
  rows: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  truePositive: number;
  trueNegative: number;
  falsePositive: number;
  falseNegative: number;
}

const logisticRegressionArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  algorithm: z.literal("logistic-regression"),
  trainedAt: z.string().datetime(),
  trainingRows: z.number().int().min(2),
  featureCount: z.number().int().positive(),
  featureMeans: z.array(z.number().finite()),
  featureScales: z.array(z.number().positive().finite()),
  coefficients: z.array(z.number().finite()),
  intercept: z.number().finite(),
}).strict().superRefine((model, context) => {
  for (const [field, values] of [
    ["featureMeans", model.featureMeans],
    ["featureScales", model.featureScales],
    ["coefficients", model.coefficients],
  ] as const) {
    if (values.length !== model.featureCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} must match featureCount`,
      });
    }
  }
});

export type LogisticRegressionArtifact = z.infer<typeof logisticRegressionArtifactSchema>;

function validateSamples(samples: ClassificationSample[]): number {
  if (samples.length < 2) throw new Error("At least two training samples are required");
  const featureCount = samples[0]?.features.length ?? 0;
  if (featureCount === 0) throw new Error("Each sample must contain at least one feature");

  let hasNegative = false;
  let hasPositive = false;
  for (const [index, sample] of samples.entries()) {
    if (sample.features.length !== featureCount) {
      throw new Error(`Sample ${index} has an inconsistent feature count`);
    }
    if (sample.features.some((value) => !Number.isFinite(value))) {
      throw new Error(`Sample ${index} contains a non-finite feature`);
    }
    if (sample.label !== 0 && sample.label !== 1) {
      throw new Error(`Sample ${index} has an invalid binary label`);
    }
    if (sample.label === 0) hasNegative = true;
    else hasPositive = true;
  }
  if (!hasNegative || !hasPositive) {
    throw new Error("Training data must contain both binary classes");
  }
  return featureCount;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-Math.min(value, 709));
    return 1 / (1 + exp);
  }
  const exp = Math.exp(Math.max(value, -709));
  return exp / (1 + exp);
}

/** Fits standardized binary logistic regression using batch gradient descent. */
export function fitLogisticRegression(
  samples: ClassificationSample[],
  options: ClassificationOptions = {},
): LogisticRegressionArtifact {
  const featureCount = validateSamples(samples);
  const iterations = options.iterations ?? 4000;
  const learningRate = options.learningRate ?? 0.05;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) {
    throw new Error("iterations must be an integer between 1 and 100000");
  }
  if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 1) {
    throw new Error("learningRate must be greater than 0 and at most 1");
  }

  const featureMeans = Array.from({ length: featureCount }, (_, column) =>
    samples.reduce((sum, sample) => sum + sample.features[column], 0) / samples.length
  );
  const featureScales = Array.from({ length: featureCount }, (_, column) => {
    const variance = samples.reduce((sum, sample) =>
      sum + (sample.features[column] - featureMeans[column]) ** 2, 0
    ) / samples.length;
    const scale = Math.sqrt(variance);
    return scale > 0 ? scale : 1;
  });
  const normalized = samples.map((sample) =>
    sample.features.map((value, column) => (value - featureMeans[column]) / featureScales[column])
  );

  const positiveRate = samples.reduce((sum, sample) => sum + sample.label, 0) / samples.length;
  let intercept = Math.log(positiveRate / (1 - positiveRate));
  const coefficients = Array.from({ length: featureCount }, () => 0);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let interceptGradient = 0;
    const coefficientGradients = Array.from({ length: featureCount }, () => 0);

    for (let row = 0; row < samples.length; row += 1) {
      const logit = intercept + normalized[row].reduce(
        (sum, value, column) => sum + value * coefficients[column], 0
      );
      const error = sigmoid(logit) - samples[row].label;
      interceptGradient += error;
      for (let column = 0; column < featureCount; column += 1) {
        coefficientGradients[column] += error * normalized[row][column];
      }
    }

    intercept -= learningRate * (interceptGradient / samples.length);
    for (let column = 0; column < featureCount; column += 1) {
      coefficients[column] -= learningRate * (coefficientGradients[column] / samples.length);
    }
  }

  return validateLogisticRegressionArtifact({
    schemaVersion: 1,
    algorithm: "logistic-regression",
    trainedAt: new Date().toISOString(),
    trainingRows: samples.length,
    featureCount,
    featureMeans,
    featureScales,
    coefficients,
    intercept,
  });
}

export function validateLogisticRegressionArtifact(input: unknown): LogisticRegressionArtifact {
  const result = logisticRegressionArtifactSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid logistic regression model artifact");
  return result.data;
}

export function predictLogisticProbability(modelInput: unknown, features: number[]): number {
  const model = validateLogisticRegressionArtifact(modelInput);
  if (features.length !== model.featureCount || features.some((value) => !Number.isFinite(value))) {
    throw new Error("Prediction features do not match the model feature schema");
  }
  const logit = model.intercept + features.reduce((sum, value, column) =>
    sum + ((value - model.featureMeans[column]) / model.featureScales[column]) * model.coefficients[column], 0
  );
  return sigmoid(logit);
}

export function predictLogisticClass(
  model: unknown,
  features: number[],
  threshold = 0.5,
): 0 | 1 {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new Error("threshold must be greater than 0 and less than 1");
  }
  return predictLogisticProbability(model, features) >= threshold ? 1 : 0;
}

export function evaluateLogisticRegression(
  model: unknown,
  samples: ClassificationSample[],
  threshold = 0.5,
): ClassificationMetrics {
  if (samples.length === 0) throw new Error("At least one evaluation sample is required");
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new Error("threshold must be greater than 0 and less than 1");
  }

  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const [index, sample] of samples.entries()) {
    if (sample.label !== 0 && sample.label !== 1) {
      throw new Error(`Evaluation sample ${index} has an invalid binary label`);
    }
    const prediction = predictLogisticClass(model, sample.features, threshold);
    if (prediction === 1 && sample.label === 1) truePositive += 1;
    else if (prediction === 0 && sample.label === 0) trueNegative += 1;
    else if (prediction === 1) falsePositive += 1;
    else falseNegative += 1;
  }

  const precision = truePositive + falsePositive > 0
    ? truePositive / (truePositive + falsePositive) : 0;
  const recall = truePositive + falseNegative > 0
    ? truePositive / (truePositive + falseNegative) : 0;
  const accuracy = (truePositive + trueNegative) / samples.length;
  return {
    rows: samples.length,
    accuracy,
    precision,
    recall,
    f1: precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0,
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
  };
}
