import { z } from "zod";

export interface RegressionSample {
  features: number[];
  target: number;
}

export interface RegressionMetrics {
  rows: number;
  mae: number;
  rmse: number;
  rSquared: number | null;
}

const linearRegressionArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  algorithm: z.literal("multiple-linear-regression"),
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

export type LinearRegressionArtifact = z.infer<typeof linearRegressionArtifactSchema>;

export interface LinearRegressionOptions {
  iterations?: number;
  learningRate?: number;
}

function validateSamples(samples: RegressionSample[]): number {
  if (samples.length < 2) throw new Error("At least two training samples are required");
  const featureCount = samples[0]?.features.length ?? 0;
  if (featureCount === 0) throw new Error("Each sample must contain at least one feature");

  for (const [index, sample] of samples.entries()) {
    if (sample.features.length !== featureCount) {
      throw new Error(`Sample ${index} has an inconsistent feature count`);
    }
    if (!Number.isFinite(sample.target) || sample.features.some((value) => !Number.isFinite(value))) {
      throw new Error(`Sample ${index} contains a non-finite value`);
    }
  }
  return featureCount;
}

/** Fits a standardized multiple linear regression model using batch gradient descent. */
export function fitLinearRegression(
  samples: RegressionSample[],
  options: LinearRegressionOptions = {},
): LinearRegressionArtifact {
  const featureCount = validateSamples(samples);
  const iterations = options.iterations ?? 3000;
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

  const coefficients = Array.from({ length: featureCount }, () => 0);
  let intercept = samples.reduce((sum, sample) => sum + sample.target, 0) / samples.length;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let interceptGradient = 0;
    const coefficientGradients = Array.from({ length: featureCount }, () => 0);

    for (let row = 0; row < samples.length; row += 1) {
      const prediction = intercept + normalized[row].reduce(
        (sum, value, column) => sum + value * coefficients[column], 0
      );
      const error = prediction - samples[row].target;
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

  const artifact: LinearRegressionArtifact = {
    schemaVersion: 1,
    algorithm: "multiple-linear-regression",
    trainedAt: new Date().toISOString(),
    trainingRows: samples.length,
    featureCount,
    featureMeans,
    featureScales,
    coefficients,
    intercept,
  };
  return validateLinearRegressionArtifact(artifact);
}

export function validateLinearRegressionArtifact(input: unknown): LinearRegressionArtifact {
  const result = linearRegressionArtifactSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid linear regression model artifact");
  return result.data;
}

export function predictLinearRegression(
  modelInput: unknown,
  features: number[],
): number {
  const model = validateLinearRegressionArtifact(modelInput);
  if (features.length !== model.featureCount || features.some((value) => !Number.isFinite(value))) {
    throw new Error("Prediction features do not match the model feature schema");
  }
  return model.intercept + features.reduce((sum, value, column) =>
    sum + ((value - model.featureMeans[column]) / model.featureScales[column]) * model.coefficients[column], 0
  );
}

export function evaluateLinearRegression(
  model: unknown,
  samples: RegressionSample[],
): RegressionMetrics {
  if (samples.length === 0) throw new Error("At least one evaluation sample is required");
  for (const [index, sample] of samples.entries()) {
    if (!Number.isFinite(sample.target)) {
      throw new Error(`Evaluation sample ${index} contains a non-finite target`);
    }
  }
  const predictions = samples.map((sample) => predictLinearRegression(model, sample.features));
  const meanTarget = samples.reduce((sum, sample) => sum + sample.target, 0) / samples.length;
  const absoluteError = samples.reduce((sum, sample, index) =>
    sum + Math.abs(sample.target - predictions[index]), 0
  );
  const squaredError = samples.reduce((sum, sample, index) =>
    sum + (sample.target - predictions[index]) ** 2, 0
  );
  const totalSquared = samples.reduce((sum, sample) => sum + (sample.target - meanTarget) ** 2, 0);

  return {
    rows: samples.length,
    mae: absoluteError / samples.length,
    rmse: Math.sqrt(squaredError / samples.length),
    rSquared: totalSquared > 0 ? 1 - squaredError / totalSquared : null,
  };
}

/** Keeps the newest rows for evaluation; callers must pass samples in chronological order. */
export function splitChronological(
  samples: RegressionSample[],
  testFraction = 0.2,
): { train: RegressionSample[]; test: RegressionSample[] } {
  if (samples.length < 3) throw new Error("At least three samples are required for a chronological split");
  if (!Number.isFinite(testFraction) || testFraction <= 0 || testFraction >= 0.5) {
    throw new Error("testFraction must be greater than 0 and less than 0.5");
  }
  const testCount = Math.max(1, Math.ceil(samples.length * testFraction));
  const splitIndex = samples.length - testCount;
  if (splitIndex < 2) throw new Error("Chronological split must leave at least two training samples");
  return {
    train: samples.slice(0, splitIndex),
    test: samples.slice(splitIndex),
  };
}
