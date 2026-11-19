import { z } from "zod";

const featureSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.literal("numeric"),
}).strict();

const weightSpecSchema = z.object({
  name: z.string().min(1).max(160),
  shape: z.array(z.number().int().positive()).min(1).max(8),
  dtype: z.enum(["float32", "int32", "bool"]),
}).strict();

const evaluationSchema = z.object({
  candidateMae: z.number().finite().nonnegative(),
  baselineMae: z.number().finite().nonnegative(),
  candidateRmse: z.number().finite().nonnegative(),
  baselineRmse: z.number().finite().nonnegative(),
  testSamples: z.number().int().min(20),
  splitMethod: z.enum(["grouped-student-holdout", "walk-forward"]),
  datasetKind: z.enum(["synthetic", "real-anonymized"]),
}).strict().superRefine((evaluation, context) => {
  if (evaluation.candidateMae > evaluation.baselineMae) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidateMae"], message: "TensorFlow candidate must beat or tie baseline MAE" });
  }
  if (evaluation.candidateRmse > evaluation.baselineRmse) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidateRmse"], message: "TensorFlow candidate must beat or tie baseline RMSE" });
  }
});

export const tensorflowJsArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  format: z.literal("tensorflow-js-layers-model"),
  modelId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  version: z.number().int().positive(),
  task: z.enum(["regression", "binary-classification"]),
  featureSchema: z.array(featureSchema).min(1).max(128),
  normalization: z.object({
    means: z.array(z.number().finite()),
    scales: z.array(z.number().positive().finite()),
  }).strict(),
  modelTopology: z.record(z.string(), z.unknown()),
  weightSpecs: z.array(weightSpecSchema).min(1).max(512),
  weightDataBase64: z.string().superRefine((value, context) => {
    // Check the size before running the regex: huge strings can make regex
    // validation expensive enough to overflow the JavaScript call stack.
    if (value.length > 16_000_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Model weight payload exceeds 16 MB" });
      return;
    }
    if (value.length < 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Model weight payload must be valid base64" });
    }
  }),
  evaluation: evaluationSchema,
  trainedAt: z.string().datetime(),
}).strict().superRefine((artifact, context) => {
  const featureCount = artifact.featureSchema.length;
  if (new Set(artifact.featureSchema.map((feature) => feature.name)).size !== featureCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["featureSchema"], message: "Feature names must be unique" });
  }
  if (artifact.normalization.means.length !== featureCount || artifact.normalization.scales.length !== featureCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["normalization"], message: "Normalization arrays must match feature count" });
  }
  if (artifact.evaluation.datasetKind === "synthetic" && artifact.evaluation.testSamples < 20) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evaluation", "testSamples"], message: "Synthetic experiments require at least 20 held-out samples" });
  }
});

export type TensorflowJsArtifact = z.infer<typeof tensorflowJsArtifactSchema>;

export function validateTensorflowJsArtifact(input: unknown): TensorflowJsArtifact {
  const parsed = tensorflowJsArtifactSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid TensorFlow.js model artifact: ${details}`);
  }
  return parsed.data;
}

/** Synthetic experiments may be evaluated, but can never be deployed to student devices. */
export function isTensorflowJsArtifactProductionEligible(artifact: TensorflowJsArtifact): boolean {
  return artifact.evaluation.datasetKind === "real-anonymized" &&
    artifact.evaluation.testSamples >= 20 &&
    artifact.evaluation.candidateMae <= artifact.evaluation.baselineMae &&
    artifact.evaluation.candidateRmse <= artifact.evaluation.baselineRmse;
}
