import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { predictLinearRegression, validateLinearRegressionArtifact } from "./linearRegression.js";
import { predictLogisticProbability, validateLogisticRegressionArtifact } from "./logisticRegression.js";
import { predictKnnProbability, validateKnnArtifact } from "./knn.js";
import { predictDecisionTreeProbability, validateDecisionTreeArtifact } from "./decisionTree.js";
import { predictNaiveBayesProbability, validateNaiveBayesArtifact } from "./naiveBayes.js";

const featureEncoderSchema = z.discriminatedUnion("type", [
  z.object({ name: z.string().min(1), type: z.literal("numeric") }).strict(),
  z.object({
    name: z.string().min(1),
    type: z.literal("categorical"),
    categories: z.array(z.string()),
  }).strict(),
]);

const registryArtifactSchema = z.object({
  registrySchemaVersion: z.literal(1),
  modelId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  version: z.number().int().positive(),
  algorithm: z.enum([
    "multiple-linear-regression",
    "logistic-regression",
    "knn",
    "decision-tree",
    "gaussian-naive-bayes",
  ]),
  task: z.enum(["regression", "binary-classification"]),
  dataset: z.string().min(1).max(120),
  targetColumn: z.string().min(1).max(120),
  featureSchema: z.array(featureEncoderSchema).min(1),
  model: z.unknown(),
  createdAt: z.string().datetime(),
}).strict().superRefine((artifact, context) => {
  const isRegression = artifact.algorithm === "multiple-linear-regression";
  if (isRegression !== (artifact.task === "regression")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["task"], message: "Task does not match algorithm" });
  }
  const names = artifact.featureSchema.map((feature) => feature.name);
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["featureSchema"], message: "Feature names must be unique" });
  }
  for (const [index, feature] of artifact.featureSchema.entries()) {
    if (feature.type === "categorical" && new Set(feature.categories).size !== feature.categories.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["featureSchema", index], message: "Feature categories must be unique" });
    }
  }
});
type RegistryArtifact = z.infer<typeof registryArtifactSchema>;

export interface ModelFeatureEncoder {
  name: string;
  type: "numeric" | "categorical";
  categories?: string[];
}

export interface RegisterModelInput {
  modelId: string;
  algorithm: RegistryArtifact["algorithm"];
  task: RegistryArtifact["task"];
  dataset: string;
  targetColumn: string;
  featureSchema: ModelFeatureEncoder[];
  model: unknown;
}

export interface RegisteredModelSummary {
  modelId: string;
  version: number;
  algorithm: RegistryArtifact["algorithm"];
  task: RegistryArtifact["task"];
  dataset: string;
  createdAt: string;
}

export interface ModelPrediction {
  modelId: string;
  version: number;
  task: "regression" | "binary-classification";
  prediction: number | 0 | 1;
  probability?: number;
}

function validateModel(algorithm: RegistryArtifact["algorithm"], input: unknown): unknown {
  switch (algorithm) {
    case "multiple-linear-regression": return validateLinearRegressionArtifact(input);
    case "logistic-regression": return validateLogisticRegressionArtifact(input);
    case "knn": return validateKnnArtifact(input);
    case "decision-tree": return validateDecisionTreeArtifact(input);
    case "gaussian-naive-bayes": return validateNaiveBayesArtifact(input);
  }
}

function validateArtifact(input: unknown): RegistryArtifact {
  const parsed = registryArtifactSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid model registry artifact: ${details}`);
  }
  const artifact = parsed.data;
  const model = validateModel(artifact.algorithm, artifact.model) as { featureCount?: number };
  if (model.featureCount !== artifact.featureSchema.reduce((count, feature) =>
    count + (feature.type === "numeric" ? 1 : feature.categories.length + 1), 0)) {
    throw new Error("Model feature count does not match its preprocessing schema");
  }
  return { ...artifact, model };
}

function assertModelId(modelId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(modelId)) {
    throw new Error("modelId must contain lowercase letters, numbers and hyphens only");
  }
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
  } catch (error) {
    const { unlink } = await import("node:fs/promises");
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

/**
 * Versioned filesystem registry. Supply a persistent directory in production;
 * ephemeral container filesystems lose registered models on redeploy.
 */
export class ModelRegistry {
  private readonly cache = new Map<string, RegistryArtifact>();

  constructor(private readonly rootDirectory: string) {}

  private modelDirectory(modelId: string): string {
    assertModelId(modelId);
    return path.join(this.rootDirectory, modelId);
  }

  private versionPath(modelId: string, version: number): string {
    if (!Number.isSafeInteger(version) || version < 1) throw new Error("Model version is invalid");
    return path.join(this.modelDirectory(modelId), "versions", `${version}.json`);
  }

  private activePath(modelId: string): string {
    return path.join(this.modelDirectory(modelId), "active.json");
  }

  async register(input: RegisterModelInput): Promise<RegisteredModelSummary> {
    assertModelId(input.modelId);
    const model = validateModel(input.algorithm, input.model);
    const featureSchema = input.featureSchema.map((feature) => {
      if (feature.type === "numeric") return { name: feature.name, type: "numeric" as const };
      const categories = feature.categories ?? [];
      if (new Set(categories).size !== categories.length) throw new Error(`Feature ${feature.name} has duplicate categories`);
      return { name: feature.name, type: "categorical" as const, categories: [...categories] };
    });
    const expectedFeatureCount = featureSchema.reduce((count, feature) =>
      count + (feature.type === "numeric" ? 1 : feature.categories.length + 1), 0);
    if ((model as { featureCount?: number }).featureCount !== expectedFeatureCount) {
      throw new Error("Model feature count does not match its preprocessing schema");
    }

    const directory = path.join(this.modelDirectory(input.modelId), "versions");
    await mkdir(directory, { recursive: true });
    const existing = (await readdir(directory)).flatMap((name) => {
      const match = name.match(/^(\d+)\.json$/);
      return match ? [Number(match[1])] : [];
    });
    const version = existing.length ? Math.max(...existing) + 1 : 1;
    const artifact = validateArtifact({
      registrySchemaVersion: 1,
      modelId: input.modelId,
      version,
      algorithm: input.algorithm,
      task: input.task,
      dataset: input.dataset,
      targetColumn: input.targetColumn,
      featureSchema,
      model,
      createdAt: new Date().toISOString(),
    });
    await writeJsonAtomically(this.versionPath(input.modelId, version), artifact);
    if (version === 1) await this.activate(input.modelId, version);
    this.cache.set(`${input.modelId}:${version}`, artifact);
    return this.summary(artifact);
  }

  async list(modelId: string): Promise<RegisteredModelSummary[]> {
    const directory = path.join(this.modelDirectory(modelId), "versions");
    let names: string[];
    try { names = await readdir(directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const versions = names.flatMap((name) => {
      const match = name.match(/^(\d+)\.json$/);
      return match ? [Number(match[1])] : [];
    }).sort((a, b) => a - b);
    const artifacts = await Promise.all(versions.map((version) => this.loadVersion(modelId, version)));
    return artifacts.map((artifact) => this.summary(artifact));
  }

  async activate(modelId: string, version: number): Promise<void> {
    const artifact = await this.loadVersion(modelId, version);
    await writeJsonAtomically(this.activePath(modelId), { version: artifact.version });
    this.cache.set(`${modelId}:${version}`, artifact);
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${modelId}:`) && key !== `${modelId}:${version}`) this.cache.delete(key);
    }
  }

  async rollback(modelId: string): Promise<number> {
    const versions = await this.list(modelId);
    if (versions.length < 2) throw new Error("No previous model version is available for rollback");
    const active = await this.readActiveVersion(modelId);
    const previous = versions.filter((item) => item.version < active).at(-1);
    if (!previous) throw new Error("No earlier model version is available for rollback");
    await this.activate(modelId, previous.version);
    return previous.version;
  }

  async loadActive(modelId: string): Promise<RegistryArtifact> {
    const version = await this.readActiveVersion(modelId);
    const key = `${modelId}:${version}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const artifact = await this.loadVersion(modelId, version);
    this.cache.set(key, artifact);
    return artifact;
  }

  async predict(modelId: string, input: Record<string, number | string>): Promise<ModelPrediction> {
    const artifact = await this.loadActive(modelId);
    const features = transformFeatures(artifact.featureSchema, input);
    if (artifact.task === "regression") {
      return {
        modelId,
        version: artifact.version,
        task: "regression",
        prediction: predictLinearRegression(artifact.model, features),
      };
    }
    let probability: number;
    switch (artifact.algorithm) {
      case "logistic-regression": probability = predictLogisticProbability(artifact.model, features); break;
      case "knn": probability = predictKnnProbability(artifact.model, features); break;
      case "decision-tree": probability = predictDecisionTreeProbability(artifact.model, features); break;
      case "gaussian-naive-bayes": probability = predictNaiveBayesProbability(artifact.model, features); break;
      default: throw new Error("Unsupported classifier algorithm");
    }
    return {
      modelId,
      version: artifact.version,
      task: "binary-classification",
      prediction: probability >= 0.5 ? 1 : 0,
      probability,
    };
  }

  private async loadVersion(modelId: string, version: number): Promise<RegistryArtifact> {
    let raw: string;
    try { raw = await readFile(this.versionPath(modelId, version), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Registered model version was not found");
      throw error;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error("Registered model artifact contains invalid JSON"); }
    const artifact = validateArtifact(parsed);
    if (artifact.modelId !== modelId || artifact.version !== version) {
      throw new Error("Registered model identity does not match its storage location");
    }
    return artifact;
  }

  private async readActiveVersion(modelId: string): Promise<number> {
    let raw: string;
    try { raw = await readFile(this.activePath(modelId), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("No active model version is registered");
      throw error;
    }
    let active: unknown;
    try { active = JSON.parse(raw); }
    catch { throw new Error("Active model pointer is invalid JSON"); }
    const parsed = z.object({ version: z.number().int().positive() }).safeParse(active);
    if (!parsed.success) throw new Error("Active model pointer is invalid");
    return parsed.data.version;
  }

  private summary(artifact: RegistryArtifact): RegisteredModelSummary {
    return {
      modelId: artifact.modelId,
      version: artifact.version,
      algorithm: artifact.algorithm,
      task: artifact.task,
      dataset: artifact.dataset,
      createdAt: artifact.createdAt,
    };
  }
}

export function transformFeatures(
  schema: ModelFeatureEncoder[],
  input: Record<string, number | string>,
): number[] {
  const expectedNames = new Set(schema.map((feature) => feature.name));
  for (const name of expectedNames) {
    if (!(name in input)) throw new Error(`Missing prediction feature: ${name}`);
  }
  for (const name of Object.keys(input)) {
    if (!expectedNames.has(name)) throw new Error(`Unknown prediction feature: ${name}`);
  }
  return schema.flatMap((feature) => {
    const value = input[feature.name];
    if (feature.type === "numeric") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Prediction feature ${feature.name} must be a finite number`);
      }
      return [value];
    }
    if (typeof value !== "string") throw new Error(`Prediction feature ${feature.name} must be a string`);
    const categories = feature.categories ?? [];
    return [...categories.map((category) => Number(value === category)), Number(!categories.includes(value))];
  });
}
