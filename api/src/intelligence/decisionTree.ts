import { z } from "zod";

export interface DecisionTreeSample { features: number[]; label: 0 | 1 }
export interface DecisionTreeOptions {
  maxDepth?: number;
  minSamplesSplit?: number;
  minSamplesLeaf?: number;
  minImpurityDecrease?: number;
  threshold?: number;
}

interface LeafNode { type: "leaf"; samples: number; positives: number; probability: number }
interface SplitNode {
  type: "split"; feature: number; value: number; impurityDecrease: number;
  samples: number; positives: number; left: DecisionTreeNode; right: DecisionTreeNode;
}
type DecisionTreeNode = LeafNode | SplitNode;

const nodeSchema: z.ZodType<DecisionTreeNode> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({
    type: z.literal("leaf"), samples: z.number().int().positive(),
    positives: z.number().int().min(0), probability: z.number().min(0).max(1),
  }).strict().superRefine((node, context) => {
    if (node.positives > node.samples || Math.abs(node.probability - node.positives / node.samples) > 1e-10) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Leaf statistics are inconsistent" });
    }
  }),
  z.object({
    type: z.literal("split"), feature: z.number().int().min(0), value: z.number().finite(),
    impurityDecrease: z.number().finite().min(0), samples: z.number().int().positive(),
    positives: z.number().int().min(0), left: nodeSchema, right: nodeSchema,
  }).strict().superRefine((node, context) => {
    if (node.positives > node.samples || node.left.samples + node.right.samples !== node.samples ||
        node.left.positives + node.right.positives !== node.positives) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Split statistics are inconsistent" });
    }
  }),
]));
const artifactSchema = z.object({
  schemaVersion: z.literal(1), algorithm: z.literal("decision-tree"),
  trainedAt: z.string().datetime(), trainingRows: z.number().int().min(2),
  featureCount: z.number().int().positive(), maxDepth: z.number().int().positive(),
  minSamplesSplit: z.number().int().min(2), minSamplesLeaf: z.number().int().positive(),
  minImpurityDecrease: z.number().finite().min(0), root: nodeSchema,
}).strict().superRefine((model, context) => {
  if (model.minSamplesLeaf * 2 > model.minSamplesSplit) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["minSamplesLeaf"], message: "minSamplesLeaf cannot exceed half minSamplesSplit" });
  }
  if (model.root.samples !== model.trainingRows) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["root"], message: "Root sample count must match trainingRows" });
  }
  const checkFeatures = (node: DecisionTreeNode): void => {
    if (node.type === "split") {
      if (node.feature >= model.featureCount) context.addIssue({ code: z.ZodIssueCode.custom, path: ["root"], message: "Tree references an unknown feature" });
      checkFeatures(node.left); checkFeatures(node.right);
    }
  };
  checkFeatures(model.root);
});
export type DecisionTreeArtifact = z.infer<typeof artifactSchema>;

function gini(positives: number, count: number): number {
  if (count === 0) return 0;
  const p = positives / count;
  return 2 * p * (1 - p);
}
function validateSamples(samples: DecisionTreeSample[]): number {
  if (samples.length < 2) throw new Error("At least two training samples are required");
  const featureCount = samples[0]?.features.length ?? 0;
  if (!featureCount) throw new Error("Each sample must contain at least one feature");
  for (const [index, sample] of samples.entries()) {
    if (sample.features.length !== featureCount) throw new Error(`Sample ${index} has an inconsistent feature count`);
    if (sample.features.some((value) => !Number.isFinite(value))) throw new Error(`Sample ${index} contains a non-finite feature`);
    if (sample.label !== 0 && sample.label !== 1) throw new Error(`Sample ${index} has an invalid binary label`);
  }
  return featureCount;
}
function makeLeaf(rows: DecisionTreeSample[]): LeafNode {
  const positives = rows.reduce((sum, row) => sum + row.label, 0);
  return { type: "leaf", samples: rows.length, positives, probability: positives / rows.length };
}
function buildNode(rows: DecisionTreeSample[], depth: number, featureCount: number, options: Required<Pick<DecisionTreeOptions, "maxDepth" | "minSamplesSplit" | "minSamplesLeaf" | "minImpurityDecrease">>): DecisionTreeNode {
  const positives = rows.reduce((sum, row) => sum + row.label, 0);
  const parentGini = gini(positives, rows.length);
  if (depth >= options.maxDepth || rows.length < options.minSamplesSplit || parentGini === 0) return makeLeaf(rows);

  let best: { feature: number; value: number; decrease: number; left: DecisionTreeSample[]; right: DecisionTreeSample[] } | undefined;
  for (let feature = 0; feature < featureCount; feature += 1) {
    const values = [...new Set(rows.map((row) => row.features[feature]))].sort((a, b) => a - b);
    for (let i = 0; i < values.length - 1; i += 1) {
      const value = values[i] + (values[i + 1] - values[i]) / 2;
      const left = rows.filter((row) => row.features[feature] <= value);
      const right = rows.length - left.length;
      if (left.length < options.minSamplesLeaf || right < options.minSamplesLeaf) continue;
      const rightRows = rows.filter((row) => row.features[feature] > value);
      const leftPositive = left.reduce((sum, row) => sum + row.label, 0);
      const rightPositive = positives - leftPositive;
      const weighted = left.length / rows.length * gini(leftPositive, left.length) + right / rows.length * gini(rightPositive, right);
      const decrease = parentGini - weighted;
      if (!best || decrease > best.decrease + 1e-12) best = { feature, value, decrease, left, right: rightRows };
    }
  }
  if (!best || best.decrease + 1e-12 < options.minImpurityDecrease) return makeLeaf(rows);
  return {
    type: "split", feature: best.feature, value: best.value, impurityDecrease: best.decrease,
    samples: rows.length, positives,
    left: buildNode(best.left, depth + 1, featureCount, options),
    right: buildNode(best.right, depth + 1, featureCount, options),
  };
}

/** Builds a deterministic CART-style binary classifier using Gini impurity. */
export function fitDecisionTree(samples: DecisionTreeSample[], options: DecisionTreeOptions = {}): DecisionTreeArtifact {
  const featureCount = validateSamples(samples);
  const settings = {
    maxDepth: options.maxDepth ?? 5,
    minSamplesSplit: options.minSamplesSplit ?? 2,
    minSamplesLeaf: options.minSamplesLeaf ?? 1,
    minImpurityDecrease: options.minImpurityDecrease ?? 1e-7,
  };
  if (!Number.isInteger(settings.maxDepth) || settings.maxDepth < 1 || settings.maxDepth > 64) throw new Error("maxDepth must be an integer between 1 and 64");
  if (!Number.isInteger(settings.minSamplesSplit) || settings.minSamplesSplit < 2) throw new Error("minSamplesSplit must be an integer of at least 2");
  if (!Number.isInteger(settings.minSamplesLeaf) || settings.minSamplesLeaf < 1 || settings.minSamplesLeaf * 2 > settings.minSamplesSplit) throw new Error("minSamplesLeaf must be positive and no greater than half minSamplesSplit");
  if (!Number.isFinite(settings.minImpurityDecrease) || settings.minImpurityDecrease < 0 || settings.minImpurityDecrease > 1) throw new Error("minImpurityDecrease must be between 0 and 1");
  return validateDecisionTreeArtifact({
    schemaVersion: 1, algorithm: "decision-tree", trainedAt: new Date().toISOString(),
    trainingRows: samples.length, featureCount, ...settings,
    root: buildNode(samples, 0, featureCount, settings),
  });
}
export function validateDecisionTreeArtifact(input: unknown): DecisionTreeArtifact {
  const result = artifactSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid decision tree model artifact");
  return result.data;
}
function leafProbability(node: DecisionTreeNode, features: number[]): number {
  if (node.type === "leaf") return node.probability;
  return leafProbability(features[node.feature] <= node.value ? node.left : node.right, features);
}
export function predictDecisionTreeProbability(modelInput: unknown, features: number[]): number {
  const model = validateDecisionTreeArtifact(modelInput);
  if (features.length !== model.featureCount || features.some((value) => !Number.isFinite(value))) throw new Error("Prediction features do not match the model feature schema");
  return leafProbability(model.root, features);
}
export function predictDecisionTreeClass(model: unknown, features: number[], threshold = 0.5): 0 | 1 {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) throw new Error("threshold must be greater than 0 and less than 1");
  return predictDecisionTreeProbability(model, features) >= threshold ? 1 : 0;
}
export function evaluateDecisionTree(model: unknown, samples: DecisionTreeSample[], threshold = 0.5) {
  if (!samples.length) throw new Error("At least one evaluation sample is required");
  let truePositive = 0, trueNegative = 0, falsePositive = 0, falseNegative = 0;
  for (const [index, sample] of samples.entries()) {
    if (sample.label !== 0 && sample.label !== 1) throw new Error(`Evaluation sample ${index} has an invalid binary label`);
    const prediction = predictDecisionTreeClass(model, sample.features, threshold);
    if (prediction === 1 && sample.label === 1) truePositive += 1;
    else if (prediction === 0 && sample.label === 0) trueNegative += 1;
    else if (prediction === 1) falsePositive += 1;
    else falseNegative += 1;
  }
  const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
  const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
  return {
    rows: samples.length, accuracy: (truePositive + trueNegative) / samples.length, precision, recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    truePositive, trueNegative, falsePositive, falseNegative,
  };
}
