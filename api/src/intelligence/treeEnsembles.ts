export interface RegressionRow { features: number[]; target: number }
export interface RegressionTreeNode {
  value: number;
  featureIndex?: number;
  threshold?: number;
  left?: RegressionTreeNode;
  right?: RegressionTreeNode;
}
export interface RegressionTree { root: RegressionTreeNode; featureCount: number }
export interface RandomForestArtifact {
  modelType: "random-forest-regressor";
  version: 1;
  trees: RegressionTree[];
  featureImportance: number[];
  featureCount: number;
}
export interface GradientBoostingArtifact {
  modelType: "gradient-boosting-regressor";
  version: 1;
  initialValue: number;
  learningRate: number;
  trees: RegressionTree[];
  featureImportance: number[];
  featureCount: number;
}
export interface TreeFitOptions {
  maxDepth?: number;
  minLeafSize?: number;
  maxFeatures?: number;
  seed?: number;
}
type MutableImportance = { values: number[] };

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function mean(rows: RegressionRow[]): number {
  return rows.reduce((sum, row) => sum + row.target, 0) / rows.length;
}
function variance(rows: RegressionRow[]): number {
  if (!rows.length) return 0;
  const average = mean(rows);
  return rows.reduce((sum, row) => sum + (row.target - average) ** 2, 0);
}
function sampleFeatures(count: number, requested: number, random: () => number): number[] {
  const indices = Array.from({ length: count }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, Math.max(1, Math.min(count, requested))).sort((a, b) => a - b);
}
function buildTree(
  rows: RegressionRow[],
  options: Required<Omit<TreeFitOptions, "seed">>,
  random: () => number,
  importance: MutableImportance,
  depth = 0,
): RegressionTreeNode {
  const nodeValue = mean(rows);
  if (depth >= options.maxDepth || rows.length < options.minLeafSize * 2 || variance(rows) < 1e-12) return { value: nodeValue };
  const parentError = variance(rows);
  let best: { feature: number; threshold: number; gain: number; left: RegressionRow[]; right: RegressionRow[] } | undefined;
  for (const feature of sampleFeatures(rows[0].features.length, options.maxFeatures, random)) {
    const sorted = [...rows].sort((a, b) => a.features[feature] - b.features[feature]);
    for (let index = options.minLeafSize; index <= sorted.length - options.minLeafSize; index += 1) {
      const current = sorted[index - 1].features[feature];
      const next = sorted[index].features[feature];
      if (current === next) continue;
      const threshold = (current + next) / 2;
      const left = sorted.slice(0, index);
      const right = sorted.slice(index);
      const gain = parentError - variance(left) - variance(right);
      if (!best || gain > best.gain) best = { feature, threshold, gain, left, right };
    }
  }
  if (!best || best.gain <= 1e-10) return { value: nodeValue };
  importance.values[best.feature] += best.gain;
  return {
    value: nodeValue,
    featureIndex: best.feature,
    threshold: best.threshold,
    left: buildTree(best.left, options, random, importance, depth + 1),
    right: buildTree(best.right, options, random, importance, depth + 1),
  };
}
function validateRows(rows: RegressionRow[]): number {
  if (rows.length < 2) throw new Error("Tree ensemble training requires at least two rows");
  const featureCount = rows[0].features.length;
  if (!featureCount || rows.some((row) => row.features.length !== featureCount ||
    row.features.some((value) => !Number.isFinite(value)) || !Number.isFinite(row.target))) {
    throw new Error("Tree ensemble rows must have consistent finite features and targets");
  }
  return featureCount;
}
function normalizedImportance(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? values.map((value) => value / total) : values.map(() => 0);
}
export function predictRegressionTree(tree: RegressionTree, features: number[]): number {
  if (features.length !== tree.featureCount || features.some((value) => !Number.isFinite(value))) {
    throw new Error("Prediction features do not match the regression tree schema");
  }
  let node = tree.root;
  while (node.featureIndex !== undefined) {
    if (node.threshold === undefined || !node.left || !node.right) throw new Error("Regression tree artifact is malformed");
    node = features[node.featureIndex] <= node.threshold ? node.left : node.right;
  }
  return node.value;
}
export function fitRandomForestRegressor(
  rows: RegressionRow[],
  options: { trees?: number; maxDepth?: number; minLeafSize?: number; seed?: number } = {},
): RandomForestArtifact {
  const featureCount = validateRows(rows);
  const treesCount = options.trees ?? 64;
  if (!Number.isInteger(treesCount) || treesCount < 8 || treesCount > 256) throw new Error("Random forest trees must be between 8 and 256");
  const random = rng(options.seed ?? 42);
  const importance = { values: Array.from({ length: featureCount }, () => 0) };
  const trees: RegressionTree[] = [];
  for (let treeIndex = 0; treeIndex < treesCount; treeIndex += 1) {
    const bootstrap = Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)]);
    const root = buildTree(bootstrap, {
      maxDepth: options.maxDepth ?? 8,
      minLeafSize: options.minLeafSize ?? 3,
      maxFeatures: Math.max(1, Math.floor(Math.sqrt(featureCount))),
    }, random, importance);
    trees.push({ root, featureCount });
  }
  return {
    modelType: "random-forest-regressor", version: 1, trees,
    featureImportance: normalizedImportance(importance.values), featureCount,
  };
}
export function predictRandomForest(model: RandomForestArtifact, features: number[]): number {
  if (model.modelType !== "random-forest-regressor" || model.version !== 1 || !model.trees.length) {
    throw new Error("Random forest artifact is invalid");
  }
  return model.trees.reduce((sum, tree) => sum + predictRegressionTree(tree, features), 0) / model.trees.length;
}
export function fitGradientBoostingRegressor(
  rows: RegressionRow[],
  options: { trees?: number; learningRate?: number; maxDepth?: number; minLeafSize?: number; seed?: number } = {},
): GradientBoostingArtifact {
  const featureCount = validateRows(rows);
  const treesCount = options.trees ?? 80;
  const learningRate = options.learningRate ?? 0.05;
  if (!Number.isInteger(treesCount) || treesCount < 8 || treesCount > 300) throw new Error("Gradient boosting trees must be between 8 and 300");
  if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 1) throw new Error("Gradient boosting learningRate must be greater than 0 and at most 1");
  const initialValue = mean(rows);
  const predictions = rows.map(() => initialValue);
  const importance = { values: Array.from({ length: featureCount }, () => 0) };
  const random = rng(options.seed ?? 42);
  const trees: RegressionTree[] = [];
  for (let iteration = 0; iteration < treesCount; iteration += 1) {
    const residualRows = rows.map((row, index) => ({ features: row.features, target: row.target - predictions[index] }));
    const root = buildTree(residualRows, {
      maxDepth: options.maxDepth ?? 2,
      minLeafSize: options.minLeafSize ?? 4,
      maxFeatures: featureCount,
    }, random, importance);
    const tree = { root, featureCount };
    trees.push(tree);
    rows.forEach((row, index) => { predictions[index] += learningRate * predictRegressionTree(tree, row.features); });
  }
  return {
    modelType: "gradient-boosting-regressor", version: 1, initialValue, learningRate,
    trees, featureImportance: normalizedImportance(importance.values), featureCount,
  };
}
export function predictGradientBoosting(model: GradientBoostingArtifact, features: number[]): number {
  if (model.modelType !== "gradient-boosting-regressor" || model.version !== 1) throw new Error("Gradient boosting artifact is invalid");
  return model.initialValue + model.learningRate * model.trees.reduce((sum, tree) => sum + predictRegressionTree(tree, features), 0);
}

import { z } from "zod";

const TreeNodeSchema: z.ZodType<RegressionTreeNode> = z.lazy(() => z.object({
  value: z.number().finite(),
  featureIndex: z.number().int().nonnegative().optional(),
  threshold: z.number().finite().optional(),
  left: TreeNodeSchema.optional(),
  right: TreeNodeSchema.optional(),
}).strict().superRefine((node, context) => {
  const internal = node.featureIndex !== undefined;
  if (internal && (node.threshold === undefined || !node.left || !node.right)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Internal tree nodes require a split and two children" });
  }
  if (!internal && (node.threshold !== undefined || node.left || node.right)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Leaf tree nodes cannot contain split children" });
  }
}) as z.ZodType<RegressionTreeNode>);
const TreeSchema = z.object({
  root: TreeNodeSchema,
  featureCount: z.number().int().positive(),
}).strict();
const ForestSchema = z.object({
  modelType: z.literal("random-forest-regressor"), version: z.literal(1),
  trees: z.array(TreeSchema).min(1).max(256),
  featureImportance: z.array(z.number().finite().nonnegative()),
  featureCount: z.number().int().positive(),
}).strict().superRefine((model, context) => {
  if (model.featureImportance.length !== model.featureCount || model.trees.some((tree) => tree.featureCount !== model.featureCount)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Random forest feature dimensions do not match" });
  }
});
const GradientSchema = z.object({
  modelType: z.literal("gradient-boosting-regressor"), version: z.literal(1),
  initialValue: z.number().finite(), learningRate: z.number().finite().positive().max(1),
  trees: z.array(TreeSchema).min(1).max(300),
  featureImportance: z.array(z.number().finite().nonnegative()),
  featureCount: z.number().int().positive(),
}).strict().superRefine((model, context) => {
  if (model.featureImportance.length !== model.featureCount || model.trees.some((tree) => tree.featureCount !== model.featureCount)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Gradient boosting feature dimensions do not match" });
  }
});
export function validateRandomForestArtifact(input: unknown): RandomForestArtifact {
  return ForestSchema.parse(input);
}
export function validateGradientBoostingArtifact(input: unknown): GradientBoostingArtifact {
  return GradientSchema.parse(input);
}
