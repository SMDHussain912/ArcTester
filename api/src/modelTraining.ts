export type ModelTask = "classification" | "regression";
export type FeatureType = "number" | "boolean" | "string";
export type FeatureDefinition = { name: string; type: FeatureType };
export type ModelDatasetInput = {
  task: ModelTask;
  targetColumn: string;
  featureSchemaJson: string;
  samplesJson: string;
};
export type TrainingOptions = { seed: number; epochs: number };
export type TrainedModel = {
  algorithm: "logistic_regression" | "linear_regression";
  artifact: Record<string, unknown>;
  metrics: Record<string, number>;
  validationRows: number;
};

type Row = Record<string, unknown>;
type Encoder =
  | { name: string; type: "number"; mean: number; scale: number }
  | { name: string; type: "boolean" }
  | { name: string; type: "string"; categories: string[] };
type PreparedData = { xTrain: number[][]; xValidation: number[][]; yTrain: number[]; yValidation: number[]; classes: string[]; encoders: Encoder[] };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return "{" + entries.map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item)).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(values: T[], rng: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function parseFeatureSchema(raw: string): FeatureDefinition[] {
  const parsed = JSON.parse(raw) as { features?: FeatureDefinition[] };
  if (!Array.isArray(parsed.features) || parsed.features.length < 1 || parsed.features.length > 32) {
    throw new Error("Dataset feature schema must contain between 1 and 32 features.");
  }
  const names = new Set<string>();
  for (const feature of parsed.features) {
    if (!feature || typeof feature.name !== "string" || !["number", "boolean", "string"].includes(feature.type) || names.has(feature.name)) {
      throw new Error("Dataset feature schema is invalid or contains duplicate names.");
    }
    names.add(feature.name);
  }
  return parsed.features;
}
function readRows(raw: string, features: FeatureDefinition[], targetColumn: string): Row[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length < 5 || parsed.length > 500) {
    throw new Error("Training requires 5 to 500 dataset rows.");
  }
  const expected = [...features.map(feature => feature.name), targetColumn].sort();
  return parsed.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Dataset row " + index + " is not an object.");
    const row = value as Row;
    if (stableJson(Object.keys(row).sort()) !== stableJson(expected)) throw new Error("Dataset row " + index + " does not match the declared columns.");
    for (const feature of features) {
      const item = row[feature.name];
      if (feature.type === "number" && (typeof item !== "number" || !Number.isFinite(item))) throw new Error("Invalid numeric feature " + feature.name + ".");
      if (feature.type === "boolean" && typeof item !== "boolean") throw new Error("Invalid boolean feature " + feature.name + ".");
      if (feature.type === "string" && (typeof item !== "string" || item.length > 5000)) throw new Error("Invalid categorical feature " + feature.name + ".");
    }
    return row;
  });
}
function splitRows(rows: Row[], task: ModelTask, target: string, seed: number): { train: Row[]; validation: Row[]; classes: string[] } {
  const rng = random(seed);
  if (task === "regression") {
    const order = shuffled(rows, rng);
    const validationCount = Math.max(1, Math.floor(order.length * 0.2));
    return { validation: order.slice(0, validationCount), train: order.slice(validationCount), classes: [] };
  }
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const label = String(row[target]);
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  const classes = [...groups.keys()].sort();
  if (classes.length < 2 || classes.length > 10) throw new Error("Classification training requires 2 to 10 target classes.");
  const train: Row[] = [];
  const validation: Row[] = [];
  for (const label of classes) {
    const group = shuffled(groups.get(label) ?? [], rng);
    if (group.length >= 2) {
      const count = Math.max(1, Math.floor(group.length * 0.2));
      validation.push(...group.slice(0, count));
      train.push(...group.slice(count));
    } else {
      train.push(...group);
    }
  }
  if (validation.length === 0) {
    const largest = classes.map(label => groups.get(label) ?? []).sort((a, b) => b.length - a.length)[0] ?? [];
    if (largest.length < 2) throw new Error("Classification needs repeated labels to create a held-out validation set.");
    const holdout = largest.pop();
    if (holdout) {
      const index = train.indexOf(holdout);
      if (index >= 0) train.splice(index, 1);
      validation.push(holdout);
    }
  }
  return { train, validation, classes };
}
function encodeFeatures(rows: Row[], trainRows: Row[], features: FeatureDefinition[]): { encoders: Encoder[]; matrix: number[][] } {
  const encoders: Encoder[] = [];
  for (const feature of features) {
    if (feature.type === "number") {
      const values = trainRows.map(row => row[feature.name] as number);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      encoders.push({ name: feature.name, type: "number", mean, scale: Math.sqrt(variance) || 1 });
    } else if (feature.type === "boolean") {
      encoders.push({ name: feature.name, type: "boolean" });
    } else {
      const categories = [...new Set(trainRows.map(row => row[feature.name] as string))].sort();
      if (categories.length > 64) throw new Error("Categorical feature " + feature.name + " exceeds 64 training categories.");
      encoders.push({ name: feature.name, type: "string", categories });
    }
  }
  const dimensions = encoders.reduce((sum, encoder) => sum + (encoder.type === "string" ? encoder.categories.length : 1), 0);
  if (dimensions < 1 || dimensions > 64) throw new Error("Encoded feature count must be between 1 and 64.");
  const matrix = rows.map(row => {
    const vector: number[] = [];
    for (const encoder of encoders) {
      const value = row[encoder.name];
      if (encoder.type === "number") vector.push(((value as number) - encoder.mean) / encoder.scale);
      else if (encoder.type === "boolean") vector.push(value === true ? 1 : 0);
      else {
        const selected = encoder.categories.indexOf(value as string);
        encoder.categories.forEach((_category, index) => vector.push(index === selected ? 1 : 0));
      }
    }
    return vector;
  });
  return { encoders, matrix };
}
function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exps = values.map(value => Math.exp(Math.max(-60, Math.min(60, value - max))));
  const total = exps.reduce((sum, value) => sum + value, 0) || 1;
  return exps.map(value => value / total);
}
function argmax(values: number[]): number {
  let best = 0;
  for (let index = 1; index < values.length; index++) if (values[index] > values[best]) best = index;
  return best;
}
function prepare(data: ModelDatasetInput, options: TrainingOptions): PreparedData {
  const schema = JSON.parse(data.featureSchemaJson) as { targetColumn?: string; targetType?: string };
  const targetColumn = data.targetColumn || schema.targetColumn || "";
  if (!targetColumn) throw new Error("Dataset target column is missing.");
  const features = parseFeatureSchema(data.featureSchemaJson);
  const rows = readRows(data.samplesJson, features, targetColumn);
  const split = splitRows(rows, data.task, targetColumn, options.seed);
  const encoded = encodeFeatures([...split.train, ...split.validation], split.train, features);
  const xTrain = encoded.matrix.slice(0, split.train.length);
  const xValidation = encoded.matrix.slice(split.train.length);
  const classes = split.classes;
  const yTrain = split.train.map(row => data.task === "classification" ? classes.indexOf(String(row[targetColumn])) : row[targetColumn] as number);
  const yValidation = split.validation.map(row => data.task === "classification" ? classes.indexOf(String(row[targetColumn])) : row[targetColumn] as number);
  if (data.task === "regression" && [...yTrain, ...yValidation].some(value => !Number.isFinite(value))) throw new Error("Regression target must be numeric and finite.");
  return { xTrain, xValidation, yTrain, yValidation, classes, encoders: encoded.encoders };
}
export function trainModel(data: ModelDatasetInput, options: TrainingOptions): TrainedModel {
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 1_000_000) throw new Error("Training seed is out of range.");
  if (!Number.isInteger(options.epochs) || options.epochs < 1 || options.epochs > 200) throw new Error("Training epochs must be between 1 and 200.");
  const prepared = prepare(data, options);
  const { xTrain, xValidation, yTrain, yValidation, classes, encoders } = prepared;
  const dimension = (xTrain[0]?.length ?? 0) + 1;
  const operations = options.epochs * xTrain.length * dimension * (data.task === "classification" ? classes.length : 1);
  if (operations > 15_000_000) throw new Error("Training exceeds the worker compute budget; reduce epochs or dataset feature count.");
  const xWithBias = xTrain.map(row => [...row, 1]);
  const validationWithBias = xValidation.map(row => [...row, 1]);
  if (data.task === "classification") {
    const weights = classes.map(() => Array.from({ length: dimension }, () => 0));
    for (let epoch = 0; epoch < options.epochs; epoch++) {
      const gradients = weights.map(() => Array.from({ length: dimension }, () => 0));
      for (let rowIndex = 0; rowIndex < xWithBias.length; rowIndex++) {
        const vector = xWithBias[rowIndex];
        const probabilities = softmax(weights.map(weight => weight.reduce((sum, value, index) => sum + value * vector[index], 0)));
        for (let classIndex = 0; classIndex < classes.length; classIndex++) {
          const error = probabilities[classIndex] - (yTrain[rowIndex] === classIndex ? 1 : 0);
          for (let featureIndex = 0; featureIndex < dimension; featureIndex++) gradients[classIndex][featureIndex] += error * vector[featureIndex];
        }
      }
      const rate = 0.15 / Math.sqrt(1 + epoch / 20);
      for (let classIndex = 0; classIndex < classes.length; classIndex++) {
        for (let featureIndex = 0; featureIndex < dimension; featureIndex++) {
          const regularization = featureIndex === dimension - 1 ? 0 : 0.001 * weights[classIndex][featureIndex];
          weights[classIndex][featureIndex] -= rate * (gradients[classIndex][featureIndex] / xWithBias.length + regularization);
        }
      }
    }
    const correct = validationWithBias.reduce((sum, vector, index) => {
      const prediction = argmax(weights.map(weight => weight.reduce((total, value, featureIndex) => total + value * vector[featureIndex], 0)));
      return sum + (prediction === yValidation[index] ? 1 : 0);
    }, 0);
    return {
      algorithm: "logistic_regression",
      artifact: { format: "arctester-linear-v1", task: data.task, classes, encoders, weights, targetColumn: data.targetColumn },
      metrics: { accuracy: correct / validationWithBias.length },
      validationRows: validationWithBias.length,
    };
  }
  const targetMean = yTrain.reduce((sum, value) => sum + value, 0) / yTrain.length;
  const targetVariance = yTrain.reduce((sum, value) => sum + (value - targetMean) ** 2, 0) / yTrain.length;
  const targetScale = Math.sqrt(targetVariance) || 1;
  const normalizedTargets = yTrain.map(value => (value - targetMean) / targetScale);
  const weights = Array.from({ length: dimension }, () => 0);
  for (let epoch = 0; epoch < options.epochs; epoch++) {
    const gradient = Array.from({ length: dimension }, () => 0);
    for (let rowIndex = 0; rowIndex < xWithBias.length; rowIndex++) {
      const vector = xWithBias[rowIndex];
      const prediction = weights.reduce((sum, value, index) => sum + value * vector[index], 0);
      const error = prediction - normalizedTargets[rowIndex];
      for (let featureIndex = 0; featureIndex < dimension; featureIndex++) gradient[featureIndex] += error * vector[featureIndex];
    }
    const rate = 0.08 / Math.sqrt(1 + epoch / 20);
    for (let featureIndex = 0; featureIndex < dimension; featureIndex++) {
      const regularization = featureIndex === dimension - 1 ? 0 : 0.001 * weights[featureIndex];
      weights[featureIndex] -= rate * (gradient[featureIndex] / xWithBias.length + regularization);
    }
  }
  const mae = validationWithBias.reduce((sum, vector, index) => {
    const normalized = weights.reduce((total, value, featureIndex) => total + value * vector[featureIndex], 0);
    return sum + Math.abs(normalized * targetScale + targetMean - yValidation[index]);
  }, 0) / validationWithBias.length;
  return {
    algorithm: "linear_regression",
    artifact: { format: "arctester-linear-v1", task: data.task, encoders, weights, targetColumn: data.targetColumn, targetMean, targetScale },
    metrics: { mae },
    validationRows: validationWithBias.length,
  };
}
export function stableModelJson(value: unknown): string {
  return stableJson(value);
}
