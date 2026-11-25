import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { stableModelJson } from "./modelTraining.js";

type Encoder =
  | { name: string; type: "number"; mean: number; scale: number }
  | { name: string; type: "boolean" }
  | { name: string; type: "string"; categories: string[] };
type Artifact = {
  format: string;
  task: "classification" | "regression";
  encoders: Encoder[];
  weights: number[] | number[][];
  classes?: string[];
  targetMean?: number;
  targetScale?: number;
};

export type ModelPrediction =
  | { type: "classification"; label: string; confidence: number }
  | { type: "regression"; value: number };

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exp = values.map(value => Math.exp(Math.max(-60, Math.min(60, value - max))));
  const sum = exp.reduce((total, value) => total + value, 0) || 1;
  return exp.map(value => value / sum);
}
function argmax(values: number[]) {
  let selected = 0;
  for (let index = 1; index < values.length; index++) if (values[index] > values[selected]) selected = index;
  return selected;
}

export function predictModelArtifact(rawArtifact: unknown, input: Record<string, unknown>): ModelPrediction {
  if (!rawArtifact || typeof rawArtifact !== "object") throw new Error("Model artifact is invalid.");
  const artifact = rawArtifact as Artifact;
  if (artifact.format !== "arctester-linear-v1" || !Array.isArray(artifact.encoders)) throw new Error("Unsupported model artifact format.");
  const expected = artifact.encoders.map(encoder => encoder.name).sort();
  const supplied = Object.keys(input).sort();
  if (stableModelJson(expected) !== stableModelJson(supplied)) throw new Error("Prediction input must exactly match the model feature schema.");
  const vector: number[] = [];
  for (const encoder of artifact.encoders) {
    const value = input[encoder.name];
    if (encoder.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(encoder.mean) || !Number.isFinite(encoder.scale) || encoder.scale <= 0) {
        throw new Error("Invalid numeric prediction feature.");
      }
      vector.push((value - encoder.mean) / encoder.scale);
    } else if (encoder.type === "boolean") {
      if (typeof value !== "boolean") throw new Error("Invalid boolean prediction feature.");
      vector.push(value ? 1 : 0);
    } else if (encoder.type === "string") {
      if (typeof value !== "string" || value.length > 128 || !Array.isArray(encoder.categories)) throw new Error("Invalid categorical prediction feature.");
      const selected = encoder.categories.indexOf(value);
      encoder.categories.forEach((_category, index) => vector.push(index === selected ? 1 : 0));
    } else {
      throw new Error("Unsupported model feature type.");
    }
  }
  vector.push(1);
  if (artifact.task === "classification") {
    if (!Array.isArray(artifact.weights) || !Array.isArray(artifact.classes) || artifact.classes.length !== artifact.weights.length) throw new Error("Classifier weights are invalid.");
    const weights = artifact.weights as number[][];
    const scores = weights.map(row => {
      if (row.length !== vector.length) throw new Error("Classifier feature dimensions do not match.");
      return row.reduce((sum, weight, index) => sum + weight * vector[index], 0);
    });
    const probabilities = softmax(scores);
    const selected = argmax(probabilities);
    const label = artifact.classes[selected];
    if (typeof label !== "string") throw new Error("Classifier label is invalid.");
    return { type: "classification", label, confidence: probabilities[selected] };
  }
  if (artifact.task === "regression") {
    if (!Array.isArray(artifact.weights) || artifact.weights.some(value => typeof value !== "number") || !Number.isFinite(artifact.targetMean) || !Number.isFinite(artifact.targetScale)) {
      throw new Error("Regression weights are invalid.");
    }
    const weights = artifact.weights as number[];
    if (weights.length !== vector.length || artifact.targetScale === undefined || artifact.targetMean === undefined) throw new Error("Regression feature dimensions do not match.");
    const normalized = weights.reduce((sum, weight, index) => sum + weight * vector[index], 0);
    const value = normalized * artifact.targetScale + artifact.targetMean;
    if (!Number.isFinite(value)) throw new Error("Model returned a non-finite prediction.");
    return { type: "regression", value };
  }
  throw new Error("Unsupported model task.");
}

export function evaluateModelArtifacts(candidateArtifact: unknown, baselineArtifact: unknown, rows: Record<string, unknown>[], targetColumn: string, task: "classification" | "regression"): Record<string, number> {
  if (rows.length < 1 || rows.length > 500) throw new Error("Evaluation requires 1 to 500 verification rows.");
  if (task === "classification") {
    let candidateCorrect = 0;
    let baselineCorrect = 0;
    for (const row of rows) {
      const expected = String(row[targetColumn]);
      const features = Object.fromEntries(Object.entries(row).filter(([name]) => name !== targetColumn));
      const candidate = predictModelArtifact(candidateArtifact, features);
      const baseline = predictModelArtifact(baselineArtifact, features);
      if (candidate.type !== "classification" || baseline.type !== "classification") throw new Error("Classification evaluation requires classification artifacts.");
      if (candidate.label === expected) candidateCorrect++;
      if (baseline.label === expected) baselineCorrect++;
    }
    return { accuracy: candidateCorrect / rows.length, baselineAccuracy: baselineCorrect / rows.length };
  }
  let candidateError = 0;
  let baselineError = 0;
  for (const row of rows) {
    const expected = row[targetColumn];
    if (typeof expected !== "number" || !Number.isFinite(expected)) throw new Error("Regression verification targets must be numeric.");
    const features = Object.fromEntries(Object.entries(row).filter(([name]) => name !== targetColumn));
    const candidate = predictModelArtifact(candidateArtifact, features);
    const baseline = predictModelArtifact(baselineArtifact, features);
    if (candidate.type !== "regression" || baseline.type !== "regression") throw new Error("Regression evaluation requires regression artifacts.");
    candidateError += Math.abs(candidate.value - expected);
    baselineError += Math.abs(baseline.value - expected);
  }
  return { mae: candidateError / rows.length, baselineMae: baselineError / rows.length };
}

export async function predictActiveModel(db: PrismaClient, modelId: string, input: Record<string, unknown>): Promise<{ modelId: string; version: number; prediction: ModelPrediction } | null> {
  const model = await db.registeredModel.findFirst({
    where: { modelId, isActive: true },
    select: { modelId: true, version: true, artifactJson: true },
  });
  if (!model) return null;
  const metadata = JSON.parse(model.artifactJson) as { sha256?: unknown; modelArtifact?: unknown };
  if (typeof metadata.sha256 !== "string" || !metadata.modelArtifact || sha256(stableModelJson(metadata.modelArtifact)) !== metadata.sha256) {
    throw new Error("Active model artifact checksum verification failed.");
  }
  return { modelId: model.modelId, version: model.version, prediction: predictModelArtifact(metadata.modelArtifact, input) };
}
