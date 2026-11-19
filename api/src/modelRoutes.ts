import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, conflict, notFound } from "./errors.js";
import { createAdaptiveLearnerGroupId, requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import {
  predictWithRegistryArtifact,
  validateRegistryArtifact,
  type RegisterModelInput,
} from "./intelligence/modelRegistry.js";
import { evaluateRegistryCandidate } from "./intelligence/modelEvaluation.js";
import { buildPerformanceDataset, type PerformanceDatasetAttempt, type PerformanceTopicAvailability } from "./intelligence/performanceDataset.js";
import { assessFeatureDrift, driftBucket, expectedDriftCounts } from "./intelligence/modelDrift.js";
import { rankTrainingResults, trainRegisteredDataset } from "./intelligence/registeredDatasetTraining.js";
import { fitReadinessClassifier, type ReadinessClass } from "./intelligence/readinessClassifier.js";
import { isTensorflowJsArtifactProductionEligible, validateTensorflowJsArtifact } from "./intelligence/tensorflowJsArtifact.js";

const FeatureSchema = z.discriminatedUnion("type", [
  z.object({ name: z.string().trim().min(1).max(120), type: z.literal("numeric") }).strict(),
  z.object({
    name: z.string().trim().min(1).max(120),
    type: z.literal("categorical"),
    categories: z.array(z.string().max(120)).max(500),
  }).strict(),
]);

const RegisterSchema = z.object({
  modelId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  algorithm: z.enum([
    "multiple-linear-regression",
    "logistic-regression",
    "knn",
    "decision-tree",
    "gaussian-naive-bayes",
    "performance-gradient-boosting",
    "performance-random-forest",
    "exam-readiness-softmax",
  ]),
  task: z.enum(["regression", "binary-classification", "multiclass-classification"]),
  dataset: z.string().trim().min(1).max(120),
  targetColumn: z.string().trim().min(1).max(120),
  featureSchema: z.array(FeatureSchema).min(1).max(100),
  model: z.unknown(),
}).strict();

const PredictionSchema = z.object({
  features: z.record(z.string(), z.union([z.number().finite(), z.string().max(500)])),
}).strict();

const TrainingSchema = z.object({
  modelId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  seed: z.number().int().min(0).max(0xffffffff).default(42),
}).strict();

const EvaluationSchema = z.object({
  baselineModelId: ModelIdSchema.optional(),
  baselineVersion: z.number().int().positive(),
  datasetId: z.string().min(1).max(64),
}).strict();
const GovernanceActionSchema = z.object({
  reason: z.string().trim().min(10).max(500),
}).strict();

const DatasetSampleSchema = z.object({
  features: z.record(z.string(), z.union([z.number().finite(), z.string().max(500)])),
  target: z.number().finite(),
  // Keyed HMAC-SHA-256 pseudonym only; never store a learner name, email or database ID here.
  groupId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  occurredAt: z.string().datetime().optional(),
  unansweredCount: z.number().int().min(0).optional(),
}).strict();

const DatasetRegistrationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  task: z.enum(["regression", "binary-classification", "multiclass-classification"]),
  targetColumn: z.string().trim().min(1).max(120),
  featureSchema: z.array(FeatureSchema).min(1).max(100),
  samples: z.array(DatasetSampleSchema).min(10).max(5000),
  sourceDescription: z.string().trim().min(10).max(500),
  sourceAttested: z.literal(true),
  datasetKind: z.enum(["synthetic", "real-anonymized"]).default("synthetic"),
}).strict();

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const STUDENT_POPULATION_FEATURES = [
  "completed_attempts",
  "previous_accuracy",
  "recent_average_accuracy",
  "overall_average_accuracy",
  "previous_question_count",
] as const;

function validateStudentPopulationDataset(
  featureSchema: Array<{ name: string; type: "numeric" | "categorical" }>,
  samples: Array<{ features: Record<string, number | string>; target: number }>,
): void {
  const actual = featureSchema.map((feature) => feature.name);
  if (featureSchema.some((feature) => feature.type !== "numeric") ||
      actual.length !== STUDENT_POPULATION_FEATURES.length ||
      STUDENT_POPULATION_FEATURES.some((name) => !actual.includes(name))) {
    throw new Error("student-score-population requires exactly the five registered student inference features");
  }
  for (const [index, sample] of samples.entries()) {
    const values = sample.features;
    if (!Number.isInteger(values.completed_attempts) || (values.completed_attempts as number) < 3 ||
        !Number.isInteger(values.previous_question_count) || (values.previous_question_count as number) < 1 ||
        ![values.previous_accuracy, values.recent_average_accuracy, values.overall_average_accuracy]
          .every((value) => typeof value === "number" && value >= 0 && value <= 1) ||
        sample.target < 0 || sample.target > 1) {
      throw new Error(`student-score-population sample ${index + 1} has invalid counts or accuracy fractions; targets must be between 0 and 1`);
    }
  }
}

const ModelIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const VersionSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export function modelRegistryRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/models/:modelId/active/tensorflow", requireAuth, async (req, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const model = await db.registeredModel.findFirst({
        where: { modelId, algorithm: "tensorflow-js-layers", isActive: true },
        select: { artifactJson: true },
      });
      if (!model) return next(notFound("No active TensorFlow.js model is available."));
      const artifact = validateTensorflowJsArtifact(JSON.parse(model.artifactJson));
      if (artifact.modelId !== modelId || !isTensorflowJsArtifactProductionEligible(artifact)) {
        return next(conflict("The active TensorFlow.js artifact has not passed production eligibility."));
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ ok: true, artifact });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  router.get("/admin/model-datasets", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const datasets = await db.modelDataset.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true, name: true, task: true, targetColumn: true, featureSchemaJson: true,
          rowCount: true, sourceDescription: true, sourceAttested: true, datasetKind: true,
          fingerprint: true, createdById: true, createdAt: true,
        },
      });
      res.json({ ok: true, datasets: datasets.map((dataset) => ({
        ...dataset, featureSchema: JSON.parse(dataset.featureSchemaJson),
      })) });
    } catch (error) { next(error); }
  });

  router.post("/admin/model-datasets", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = DatasetRegistrationSchema.parse(req.body);
      const payload = {
        name: input.name,
        task: input.task,
        targetColumn: input.targetColumn,
        featureSchema: input.featureSchema,
        samples: input.samples,
        datasetKind: input.datasetKind,
      };
      if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 8 * 1024 * 1024) {
        return next(badRequest("Dataset payload exceeds the 8 MB limit."));
      }
      const names = input.featureSchema.map((feature) => feature.name);
      if (new Set(names).size !== names.length) return next(badRequest("Dataset feature names must be unique."));
      for (const [index, sample] of input.samples.entries()) {
        const keys = Object.keys(sample.features).sort();
        if (keys.join("\\0") !== [...names].sort().join("\\0")) {
          return next(badRequest(`Dataset sample ${index + 1} must contain exactly the declared features.`));
        }
        for (const feature of input.featureSchema) {
          const value = sample.features[feature.name];
          if (feature.type === "numeric" && typeof value !== "number") {
            return next(badRequest(`Dataset feature ${feature.name} must be numeric.`));
          }
          if (feature.type === "categorical" && typeof value !== "string") {
            return next(badRequest(`Dataset feature ${feature.name} must be categorical.`));
          }
        }
      }
      if (input.datasetKind === "real-anonymized") {
        if (input.samples.some((sample) => !sample.groupId)) {
          return next(badRequest("Real learner datasets require a keyed HMAC-SHA-256 pseudonymous groupId on every sample."));
        }
        if (new Set(input.samples.map((sample) => sample.groupId)).size < 5) {
          return next(badRequest("Real learner datasets require at least five distinct learner groups for a leakage-safe holdout."));
        }
      }
      if (input.task === "binary-classification") {
        if (input.samples.some((sample) => sample.target !== 0 && sample.target !== 1)) {
          return next(badRequest("Classification targets must be binary."));
        }
        if (new Set(input.samples.map((sample) => sample.target)).size !== 2) {
          return next(badRequest("Classification evaluation datasets must contain both classes."));
        }
      }
      if (input.task === "multiclass-classification") {
        if (input.samples.some((sample) => !Number.isInteger(sample.target) || sample.target < 0 || sample.target > 2)) {
          return next(badRequest("Readiness classification targets must be encoded as 0, 1 or 2."));
        }
        if ([0, 1, 2].some((label) => input.samples.filter((sample) => sample.target === label).length < 10)) {
          return next(badRequest("Readiness datasets require at least 10 examples of each readiness class."));
        }
      }
      const fingerprint = createHash("sha256").update(canonicalJson(payload)).digest("hex");
      const created = await db.modelDataset.create({
        data: {
          createdById: req.user!.id,
          name: input.name,
          task: input.task,
          targetColumn: input.targetColumn,
          featureSchemaJson: JSON.stringify(input.featureSchema),
          samplesJson: JSON.stringify(input.samples),
          rowCount: input.samples.length,
          sourceDescription: input.sourceDescription,
          sourceAttested: true,
          datasetKind: input.datasetKind,
          fingerprint,
        },
        select: {
          id: true, name: true, task: true, rowCount: true, sourceDescription: true,
          sourceAttested: true, datasetKind: true, fingerprint: true, createdById: true, createdAt: true,
        },
      });
      res.status(201).json({ ok: true, dataset: { ...created, featureSchema: input.featureSchema } });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error && "code" in error && error.code === "P2002") {
        return next(conflict("This exact dataset version has already been registered."));
      }
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });


  router.post("/admin/model-datasets/build-performance", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({
        name: z.string().trim().min(1).max(120),
        sourceDescription: z.string().trim().min(10).max(200),
        sourceAttested: z.literal(true),
      }).strict().parse(req.body);
      const [attempts, subjects, questions] = await Promise.all([
        db.attempt.findMany({
          where: { mode: "practice", finishedAt: { not: null } },
          orderBy: [{ startedAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            userId: true,
            startedAt: true,
            finishedAt: true,
            answers: {
              select: {
                chosen: true,
                isCorrect: true,
                subjectSnapshot: true,
                topicSnapshot: true,
                question: {
                  select: {
                    createdAt: true,
                    subject: { select: { name: true } },
                    topic: { select: { name: true } },
                  },
                },
              },
            },
          },
        }),
        db.subject.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
        db.question.findMany({
          where: { topicId: { not: null } },
          select: {
            createdAt: true,
            subject: { select: { name: true } },
            topic: { select: { name: true } },
          },
        }),
      ]);
      const result = buildPerformanceDataset({
        attempts: attempts as unknown as PerformanceDatasetAttempt[],
        subjects: subjects.map((subject) => subject.name),
        topicAvailability: questions.map((question) => ({
          createdAt: question.createdAt,
          subjectName: question.subject.name,
          topicName: question.topic?.name ?? null,
        })) as PerformanceTopicAvailability[],
        learnerGroupId: createAdaptiveLearnerGroupId,
        maxSamples: 5000,
      });
      const { metadata } = result;
      if (metadata.sampleCount < 500 || metadata.learnerGroupCount < 50 ||
          metadata.improvingLearnerGroups < 1 || metadata.decliningLearnerGroups < 1) {
        return res.status(409).json({
          ok: false,
          error: `Insufficient authorized learner history: found ${metadata.sampleCount} rows across ${metadata.learnerGroupCount} learner groups; require at least 500 rows, 50 groups, and both improving and declining trajectories.`,
          qualification: {
            requiredRows: 500,
            requiredLearnerGroups: 50,
            requiredImprovingGroups: 1,
            requiredDecliningGroups: 1,
            ...metadata,
          },
        });
      }
      const subjectSummary = metadata.subjectVocabulary.map((subject) => subject.slice(0, 24)).join(",");
      const sourceDescription = [
        "ArcTester point-in-time performance-v1 extraction",
        input.sourceDescription,
        `schema=${metadata.featureSchemaVersion}`,
        `extractedAt=${new Date().toISOString()}`,
        `rows=${metadata.sampleCount}`,
        `groups=${metadata.learnerGroupCount}`,
        `improving=${metadata.improvingLearnerGroups}`,
        `declining=${metadata.decliningLearnerGroups}`,
        `excludedNoAnswered=${metadata.excludedNoAnsweredAttempts}`,
        `unanswered=${metadata.unansweredResponses}`,
        `subjects=${subjectSummary}`,
      ].join("; ").slice(0, 500);
      const payload = {
        name: input.name,
        task: "regression",
        targetColumn: "next_attempt_accuracy",
        featureSchema: result.featureSchema,
        samples: result.samples,
        datasetKind: "real-anonymized",
      };
      const fingerprint = createHash("sha256").update(canonicalJson(payload)).digest("hex");
      const dataset = await db.modelDataset.create({
        data: {
          createdById: req.user!.id,
          name: input.name,
          task: "regression",
          targetColumn: "next_attempt_accuracy",
          featureSchemaJson: JSON.stringify(result.featureSchema),
          samplesJson: JSON.stringify(result.samples),
          rowCount: result.samples.length,
          sourceDescription,
          sourceAttested: true,
          datasetKind: "real-anonymized",
          fingerprint,
        },
        select: {
          id: true, name: true, task: true, targetColumn: true, rowCount: true,
          sourceDescription: true, sourceAttested: true, datasetKind: true,
          fingerprint: true, createdById: true, createdAt: true,
        },
      });
      res.status(201).json({
        ok: true,
        dataset: { ...dataset, featureSchema: result.featureSchema },
        qualification: metadata,
      });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error && "code" in error && error.code === "P2002") {
        return next(conflict("This exact performance dataset version has already been registered."));
      }
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  router.patch("/admin/model-datasets/:datasetId", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const datasetId = z.string().min(1).max(64).parse(req.params.datasetId);
      const input = z.object({
        name: z.string().trim().min(1).max(120),
        sourceDescription: z.string().trim().min(10).max(500),
      }).strict().parse(req.body);
      const updated = await db.$transaction(async (tx) => {
        const dataset = await tx.modelDataset.findUnique({ where: { id: datasetId } });
        if (!dataset) return null;
        const [modelCount, jobCount] = await Promise.all([
          tx.registeredModel.count({ where: { trainingDatasetId: datasetId } }),
          tx.modelTrainingJob.count({ where: { datasetId } }),
        ]);
        if (modelCount || jobCount) return { error: "in-use" as const };
        const payload = {
          name: input.name, task: dataset.task, targetColumn: dataset.targetColumn,
          featureSchema: JSON.parse(dataset.featureSchemaJson),
          samples: JSON.parse(dataset.samplesJson), datasetKind: dataset.datasetKind,
        };
        const fingerprint = createHash("sha256").update(canonicalJson(payload)).digest("hex");
        return tx.modelDataset.update({
          where: { id: datasetId },
          data: { name: input.name, sourceDescription: input.sourceDescription, fingerprint },
          select: { id: true, name: true, task: true, targetColumn: true, rowCount: true, sourceDescription: true, datasetKind: true, fingerprint: true, createdAt: true },
        });
      });
      if (!updated) return next(notFound("Dataset was not found."));
      if ("error" in updated) return next(conflict("This dataset is already referenced by a model or training job. Register a new dataset version instead."));
      res.json({ ok: true, dataset: updated });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error && "code" in error && error.code === "P2002") return next(conflict("A dataset with this exact content already exists."));
      next(error);
    }
  });

  router.delete("/admin/model-datasets/:datasetId", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const datasetId = z.string().min(1).max(64).parse(req.params.datasetId);
      const result = await db.$transaction(async (tx) => {
        const dataset = await tx.modelDataset.findUnique({ where: { id: datasetId }, select: { id: true } });
        if (!dataset) return "missing" as const;
        const [modelCount, jobCount] = await Promise.all([
          tx.registeredModel.count({ where: { trainingDatasetId: datasetId } }),
          tx.modelTrainingJob.count({ where: { datasetId } }),
        ]);
        if (modelCount || jobCount) return "in-use" as const;
        await tx.modelDataset.delete({ where: { id: datasetId } });
        return "deleted" as const;
      });
      if (result === "missing") return next(notFound("Dataset was not found."));
      if (result === "in-use") return next(conflict("This dataset is referenced by a model or training job and cannot be deleted."));
      res.json({ ok: true, deleted: true, datasetId });
    } catch (error) { next(error); }
  });

  router.post("/admin/model-datasets/:datasetId/train", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const datasetId = z.string().min(1).max(64).parse(req.params.datasetId);
      const input = TrainingSchema.parse(req.body);
      const dataset = await db.modelDataset.findUnique({ where: { id: datasetId } });
      if (!dataset) return next(notFound("Registered training dataset was not found."));
      if (dataset.task === "multiclass-classification") return next(badRequest("Use the readiness classifier training workflow for multiclass datasets."));
      const featureSchema = JSON.parse(dataset.featureSchemaJson) as Array<{ name: string; type: "numeric" | "categorical"; categories?: string[] }>;
      const samples = JSON.parse(dataset.samplesJson) as Array<{
        features: Record<string, number | string>;
        target: number;
        groupId?: string;
        occurredAt?: string;
        unansweredCount?: number;
      }>;
      if (input.modelId === "performance") {
        const requiredFeatures = [
          "completed_attempts", "previous_accuracy", "recent_accuracy_mean_3",
          "overall_accuracy_mean", "previous_question_count", "recent_accuracy_slope_3",
          "topic_coverage_ratio", "topic_coverage_ratio_missing", "days_since_last_attempt",
        ];
        const featureNames = new Set(featureSchema.map((feature) => feature.name));
        const subjectFeatures = featureSchema
          .filter((feature) => feature.name.startsWith("subject_accuracy_") && !feature.name.endsWith("_missing"))
          .map((feature) => feature.name);
        const validSubjectFeatures = subjectFeatures.length > 0 &&
          subjectFeatures.every((name) => featureNames.has(`${name}_missing`));
        const grouped = new Map<string, Array<{ occurredAt: number; target: number }>>();
        for (const sample of samples) {
          if (!sample.groupId || !/^[a-f0-9]{64}$/.test(sample.groupId) ||
              typeof sample.occurredAt !== "string" || !Number.isFinite(Date.parse(sample.occurredAt)) ||
              !Number.isInteger(sample.unansweredCount) || sample.unansweredCount! < 0 ||
              !Number.isFinite(sample.target) || sample.target < 0 || sample.target > 1) {
            return next(badRequest("Performance rows require HMAC learner groups, ISO timestamps, unanswered counts and accuracy targets from 0 to 1."));
          }
          const rows = grouped.get(sample.groupId) ?? [];
          rows.push({ occurredAt: Date.parse(sample.occurredAt), target: sample.target });
          grouped.set(sample.groupId, rows);
        }
        let improvingGroups = 0;
        let decliningGroups = 0;
        for (const rows of grouped.values()) {
          rows.sort((left, right) => left.occurredAt - right.occurredAt);
          if (rows.length < 2) continue;
          const slope = (rows[rows.length - 1]!.target - rows[0]!.target) / (rows.length - 1);
          if (slope > 0.005) improvingGroups += 1;
          if (slope < -0.005) decliningGroups += 1;
        }
        if (dataset.task !== "regression" || dataset.targetColumn !== "next_attempt_accuracy" ||
            dataset.datasetKind !== "real-anonymized" || !dataset.sourceAttested ||
            !dataset.sourceDescription.startsWith("ArcTester point-in-time performance-v1 extraction") ||
            samples.length < 500 || grouped.size < 50 ||
            featureSchema.length < requiredFeatures.length || featureSchema.some((feature) => feature.type !== "numeric") ||
            requiredFeatures.some((name) => !featureNames.has(name)) || !validSubjectFeatures ||
            improvingGroups < 1 || decliningGroups < 1) {
          return next(badRequest("The performance model ID requires a qualified performance-v1 dataset: 500+ snapshots, 50+ HMAC learner groups, improving and declining trajectories, and the complete numeric feature contract."));
        }
      }
      const trained = trainRegisteredDataset(
        samples,
        featureSchema,
        dataset.task as "regression" | "binary-classification",
        input.seed,
        input.modelId === "performance" ? { splitStrategy: "chronological-grouped" } : {},
      );
      const ranked = rankTrainingResults(trained, dataset.task as "regression" | "binary-classification");
      const created = await db.$transaction(async (tx) => {
        const models = [];
        for (const result of ranked) {
          const modelId = input.modelId === "performance" ? result.algorithm : `${input.modelId}-${result.algorithm}`;
          const latest = await tx.registeredModel.aggregate({ where: { modelId }, _max: { version: true } });
          const version = (latest._max.version ?? 0) + 1;
          const artifact = validateRegistryArtifact({
            registrySchemaVersion: 1,
            modelId,
            version,
            algorithm: result.algorithm,
            task: dataset.task,
            dataset: dataset.name,
            targetColumn: dataset.targetColumn,
            featureSchema,
            model: result.model,
            ...(result.uncertainty ? { uncertainty: result.uncertainty } : {}),
            createdAt: new Date().toISOString(),
          });
          const model = await tx.registeredModel.create({
            data: {
              modelId, version, algorithm: result.algorithm, task: dataset.task,
              dataset: dataset.name, trainingDatasetId: dataset.id, artifactJson: JSON.stringify(artifact),
              isActive: false, activatedAt: null,
            },
            select: { modelId: true, version: true, algorithm: true, task: true, dataset: true, isActive: true, createdAt: true },
          });
          await tx.modelRegistryAudit.create({
            data: {
              actorId: req.user!.id, modelId, version, action: "TRAINED",
              details: JSON.stringify({
                datasetId, datasetFingerprint: dataset.fingerprint,
                trainRows: result.trainRows, validationRows: result.validationRows ?? null, testRows: result.testRows,
                splitStrategy: result.splitStrategy ?? "grouped-random",
                timeSplit: result.timeSplit ?? null,
                validationMetrics: result.validationMetrics ?? null,
                heldOutMetrics: result.metrics, crossValidation: result.crossValidation ?? null,
                parameters: result.parameters ?? null, uncertainty: result.uncertainty ?? null, seed: input.seed,
              }),
            },
          });
          models.push({
            ...model,
            rank: result.rank,
            trainRows: result.trainRows,
            validationRows: result.validationRows ?? null,
            testRows: result.testRows,
            splitStrategy: result.splitStrategy ?? "grouped-random",
            timeSplit: result.timeSplit ?? null,
            validationMetrics: result.validationMetrics ?? null,
            heldOutMetrics: result.metrics,
            crossValidation: result.crossValidation ?? null,
            parameters: result.parameters ?? null,
            uncertainty: result.uncertainty ?? null,
          });
        }
        return models;
      });
      res.status(201).json({
        ok: true,
        dataset: { id: dataset.id, name: dataset.name, fingerprint: dataset.fingerprint, rowCount: dataset.rowCount },
        models: created,
        promoted: false,
        ranking: {
          method: input.modelId === "performance"
            ? "Chronological 70/15/15; validation-selected parameters; held-out RMSE ascending, then MAE ascending"
            : dataset.task === "regression" ? "RMSE ascending, then MAE ascending" : "F1 descending, then accuracy, precision and recall descending",
          scope: input.modelId === "performance"
            ? "learner-group-disjoint chronological windows with two rolling-origin folds"
            : "same deterministic held-out split from this training run",
          note: "Experiment ranking only; this does not approve production promotion.",
        },
        message: "Training completed. Candidates remain inactive until they pass evaluation against an existing baseline.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  router.post("/admin/model-datasets/:datasetId/train-readiness", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const datasetId = z.string().min(1).max(64).parse(req.params.datasetId);
      const input = TrainingSchema.parse(req.body);
      const dataset = await db.modelDataset.findUnique({ where: { id: datasetId } });
      if (!dataset) return next(notFound("Registered readiness dataset was not found."));
      if (dataset.task !== "multiclass-classification") return next(badRequest("Readiness training requires a multiclass-classification dataset with labels 0, 1 and 2."));
      if (dataset.datasetKind !== "real-anonymized" || !dataset.sourceAttested) {
        return next(badRequest("Readiness training requires an attested real-anonymized learner dataset."));
      }
      const featureSchema = JSON.parse(dataset.featureSchemaJson) as Array<{ name: string; type: "numeric" | "categorical"; categories?: string[] }>;
      if (!featureSchema.length || featureSchema.some((feature) => feature.type !== "numeric") ||
        !featureSchema.some((feature) => feature.name === "completed_attempts")) {
        return next(badRequest("Readiness training requires numeric features including completed_attempts."));
      }
      const samples = JSON.parse(dataset.samplesJson) as Array<{ features: Record<string, number | string>; target: number; groupId?: string }>;
      if (samples.some((sample) => !sample.groupId || !/^[a-f0-9]{64}$/.test(sample.groupId) ||
        !Number.isInteger(sample.target) || sample.target < 0 || sample.target > 2 ||
        featureSchema.some((feature) => typeof sample.features[feature.name] !== "number" ||
          !Number.isFinite(sample.features[feature.name])))) {
        return next(badRequest("Readiness samples need HMAC learner group IDs, finite numeric features and target labels 0, 1 or 2."));
      }
      const labels = ["NOT_READY", "DEVELOPING", "READY"] as const;
      const readinessRows = samples.map((sample) => ({
        features: featureSchema.map((feature) => sample.features[feature.name] as number),
        label: labels[sample.target] as ReadinessClass,
        groupId: sample.groupId!,
      }));
      const modelArtifact = fitReadinessClassifier(readinessRows);
      const modelId = `${input.modelId}-exam-readiness-softmax`;
      const created = await db.$transaction(async (tx) => {
        const latest = await tx.registeredModel.aggregate({ where: { modelId }, _max: { version: true } });
        const version = (latest._max.version ?? 0) + 1;
        const artifact = validateRegistryArtifact({
          registrySchemaVersion: 1, modelId, version,
          algorithm: "exam-readiness-softmax", task: "multiclass-classification",
          dataset: dataset.name, targetColumn: dataset.targetColumn,
          featureSchema, model: modelArtifact, createdAt: new Date().toISOString(),
        });
        const registered = await tx.registeredModel.create({
          data: {
            modelId, version, algorithm: "exam-readiness-softmax", task: "multiclass-classification",
            dataset: dataset.name, trainingDatasetId: dataset.id,
            artifactJson: JSON.stringify(artifact), isActive: false, activatedAt: null,
          },
          select: { modelId: true, version: true, algorithm: true, task: true, dataset: true, isActive: true, createdAt: true },
        });
        await tx.modelRegistryAudit.create({
          data: {
            actorId: req.user!.id, modelId, version, action: "TRAINED",
            details: JSON.stringify({
              datasetId, datasetFingerprint: dataset.fingerprint,
              samples: samples.length, learnerGroups: modelArtifact.trainingGroups,
              classCounts: Object.fromEntries(labels.map((label) => [label, readinessRows.filter((row) => row.label === label).length])),
              targetEncoding: { 0: "NOT_READY", 1: "DEVELOPING", 2: "READY" },
              policyVersion: modelArtifact.policyVersion,
              evaluationRequired: true,
              note: "Candidate only. Run independent group-separated calibration and false-READY evaluation before activation.",
              seed: input.seed,
            }),
          },
        });
        return registered;
      });
      res.status(201).json({
        ok: true, model: created, promoted: false,
        message: "Readiness classifier trained as an inactive candidate. Independent group-separated calibration and false-READY evaluation are still required.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  // Compatibility endpoint: enqueue durable work instead of training inside an HTTP request.
  router.post("/admin/model-datasets/:datasetId/train-tensorflow", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const datasetId = z.string().min(1).max(64).parse(req.params.datasetId);
      const input = TrainingSchema.extend({
        epochs: z.number().int().min(1).max(500).default(80),
        batchSize: z.number().int().min(1).max(256).default(32),
      }).parse(req.body);
      const dataset = await db.modelDataset.findUnique({ where: { id: datasetId } });
      if (!dataset) return next(notFound("Registered training dataset was not found."));
      if (dataset.task !== "regression") return next(badRequest("TensorFlow.js training currently supports regression datasets only."));
      const featureSchema = JSON.parse(dataset.featureSchemaJson) as Array<{ name: string; type: "numeric" | "categorical" }>;
      if (!featureSchema.length || featureSchema.some((feature) => feature.type !== "numeric")) {
        return next(badRequest("TensorFlow.js training requires a non-empty numeric-only feature schema."));
      }
      const samples = JSON.parse(dataset.samplesJson) as Array<{ features: Record<string, number | string>; target: number; groupId?: string }>;
      if (samples.length < 30 || samples.length > 5000) {
        return next(badRequest("TensorFlow.js training requires between 30 and 5000 rows."));
      }
      if (samples.some((sample) =>
        !sample.groupId || !/^[a-f0-9]{64}$/.test(sample.groupId) ||
        !Number.isFinite(sample.target) ||
        featureSchema.some((feature) => typeof sample.features[feature.name] !== "number" ||
          !Number.isFinite(sample.features[feature.name]))
      )) {
        return next(badRequest("Every TensorFlow sample must contain finite numeric features, a finite target and a keyed HMAC-SHA-256 pseudonymous groupId."));
      }
      if (input.modelId === "student-score-population") validateStudentPopulationDataset(featureSchema, samples);

      const job = await db.modelTrainingJob.create({
        data: {
          datasetId,
          createdById: req.user!.id,
          modelId: input.modelId,
          seed: input.seed,
          epochs: input.epochs,
          batchSize: input.batchSize,
        },
        select: {
          id: true, datasetId: true, modelId: true, seed: true, epochs: true, batchSize: true,
          status: true, progress: true, errorMessage: true, createdAt: true, startedAt: true,
          completedAt: true, updatedAt: true,
        },
      });
      res.status(202).json({
        ok: true,
        job: { ...job, result: null },
        statusUrl: `/admin/model-training-jobs/${job.id}`,
        message: "Training job queued. Poll the status URL for progress and results.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  router.get("/admin/models", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const models = await db.registeredModel.findMany({
        orderBy: [{ modelId: "asc" }, { version: "desc" }],
        select: {
          id: true,
          modelId: true,
          version: true,
          algorithm: true,
          task: true,
          dataset: true,
          artifactJson: true,
          isActive: true,
          createdAt: true,
          activatedAt: true,
        },
        take: 500,
      });
      res.json({
        ok: true,
        models: models.map(({ artifactJson, ...model }) => ({
          ...model,
          productionEligible: model.algorithm === "tensorflow-js-layers"
            ? (() => {
              try {
                return isTensorflowJsArtifactProductionEligible(validateTensorflowJsArtifact(JSON.parse(artifactJson)));
              } catch {
                return false;
              }
            })()
            : null,
        })),
      });
    } catch (error) { next(error); }
  });

  router.post("/admin/models", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = RegisterSchema.parse(req.body) as RegisterModelInput;
      const created = await db.$transaction(async (tx) => {
        const latest = await tx.registeredModel.aggregate({
          where: { modelId: input.modelId },
          _max: { version: true },
        });
        const version = (latest._max.version ?? 0) + 1;
        const artifact = validateRegistryArtifact({
          registrySchemaVersion: 1,
          ...input,
          version,
          createdAt: new Date().toISOString(),
        });
        const isFirstVersion = version === 1;
        if (isFirstVersion) {
          await tx.registeredModel.updateMany({
            where: { modelId: input.modelId, isActive: true },
            data: { isActive: false },
          });
        }
        const model = await tx.registeredModel.create({
          data: {
            modelId: input.modelId,
            version,
            algorithm: input.algorithm,
            task: input.task,
            dataset: input.dataset,
            artifactJson: JSON.stringify(artifact),
            isActive: isFirstVersion,
            activatedAt: isFirstVersion ? new Date() : null,
          },
          select: {
            id: true, modelId: true, version: true, algorithm: true,
            task: true, dataset: true, isActive: true, createdAt: true, activatedAt: true,
          },
        });
        await tx.modelRegistryAudit.create({
          data: {
            actorId: req.user!.id, modelId: input.modelId, version,
            action: "REGISTERED",
            details: JSON.stringify({ dataset: input.dataset, algorithm: input.algorithm, task: input.task }),
          },
        });
        if (isFirstVersion) {
          await tx.modelRegistryAudit.create({
            data: { actorId: req.user!.id, modelId: input.modelId, version, action: "ACTIVATED", details: JSON.stringify({ reason: "first-version" }) },
          });
        }
        return model;
      });
      res.status(201).json({ ok: true, model: created });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });


  router.delete("/admin/models/:modelId/:version", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const version = VersionSchema.parse(req.params.version);
      const outcome = await db.$transaction(async (tx) => {
        const model = await tx.registeredModel.findUnique({ where: { modelId_version: { modelId, version } } });
        if (!model) return "missing" as const;
        if (model.isActive) return "active" as const;
        const runningJobs = await tx.modelTrainingJob.count({
          where: { modelId, status: { in: ["QUEUED", "RUNNING"] } },
        });
        if (runningJobs) return "training" as const;
        await tx.registeredModel.delete({ where: { id: model.id } });
        await tx.modelRegistryAudit.create({
          data: { actorId: req.user!.id, modelId, version, action: "DELETED", details: JSON.stringify({ reason: "administrator-deleted-inactive-version" }) },
        });
        return "deleted" as const;
      });
      if (outcome === "missing") return next(notFound("Model version was not found."));
      if (outcome === "active") return next(conflict("The active production model cannot be deleted. Activate another version or roll back first."));
      if (outcome === "training") return next(conflict("A model with queued or running training jobs cannot be deleted."));
      res.json({ ok: true, deleted: true, modelId, version });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      next(error);
    }
  });

  router.get("/admin/models/:modelId/audit", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const events = await db.modelRegistryAudit.findMany({
        where: { modelId }, orderBy: { createdAt: "desc" }, take: 200,
        select: { id: true, actorId: true, modelId: true, version: true, action: true, details: true, createdAt: true },
      });
      res.json({ ok: true, events: events.map((event) => ({ ...event, details: JSON.parse(event.details) })) });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      next(error);
    }
  });


  router.get("/admin/models/:modelId/evaluations", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const evaluations = await db.modelEvaluation.findMany({
        where: { modelId }, orderBy: { evaluatedAt: "desc" }, take: 200,
        select: {
          id: true, actorId: true, modelId: true, candidateVersion: true,
          baselineVersion: true, evaluationDataset: true, datasetFingerprint: true,
          sampleCount: true, metricsJson: true, status: true, evaluatedAt: true,
        },
      });
      res.json({ ok: true, evaluations: evaluations.map((item) => ({
        id: item.id, actorId: item.actorId, modelId: item.modelId,
        candidateVersion: item.candidateVersion, baselineVersion: item.baselineVersion,
        evaluationDataset: item.evaluationDataset, datasetFingerprint: item.datasetFingerprint,
        sampleCount: item.sampleCount, metrics: JSON.parse(item.metricsJson),
        status: item.status, evaluatedAt: item.evaluatedAt,
      })) });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      next(error);
    }
  });

  router.post("/admin/models/:modelId/:version/evaluate", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const version = VersionSchema.parse(req.params.version);
      const input = EvaluationSchema.parse(req.body);
      const baselineModelId = input.baselineModelId ?? modelId;
      if (baselineModelId === modelId && input.baselineVersion === version) {
        return next(badRequest("Candidate and baseline versions must differ."));
      }
      if ((modelId === "performance-gradient-boosting" || modelId === "performance-random-forest") &&
          baselineModelId !== "performance-multiple-linear-regression") {
        return next(badRequest("Performance Gradient Boosting and Random Forest candidates must be evaluated against the registered linear-regression baseline."));
      }
      const [candidateRow, baselineRow, dataset] = await Promise.all([
        db.registeredModel.findUnique({ where: { modelId_version: { modelId, version } } }),
        db.registeredModel.findUnique({ where: { modelId_version: { modelId: baselineModelId, version: input.baselineVersion } } }),
        db.modelDataset.findUnique({ where: { id: input.datasetId } }),
      ]);
      if (!candidateRow || !baselineRow) return next(notFound("Candidate or baseline model version was not found."));
      if (candidateRow.algorithm === "tensorflow-js-layers" || baselineRow.algorithm === "tensorflow-js-layers") {
        return next(badRequest("TensorFlow.js candidates are evaluated during training and cannot use the statistical registry evaluation endpoint."));
      }
      if (!dataset) return next(notFound("Registered evaluation dataset was not found."));
      if (!dataset.sourceAttested) return next(conflict("Dataset source has not been attested."));
      if (candidateRow.trainingDatasetId === dataset.id || baselineRow.trainingDatasetId === dataset.id) {
        return next(conflict("Evaluation data must be separate from both candidate and baseline training datasets."));
      }

      // Distinct dataset IDs are not sufficient evidence of an independent holdout:
      // the same learner can appear in separately uploaded datasets. Compare keyed
      // pseudonymous learner groups before computing any evaluation metrics.
      const trainingDatasetIds = [...new Set(
        [candidateRow.trainingDatasetId, baselineRow.trainingDatasetId]
          .filter((id): id is string => Boolean(id)),
      )];
      if (trainingDatasetIds.length) {
        const trainingDatasets = await db.modelDataset.findMany({
          where: { id: { in: trainingDatasetIds } },
          select: { id: true, datasetKind: true, sourceAttested: true, samplesJson: true },
        });
        const evaluationSamples = JSON.parse(dataset.samplesJson) as Array<{ groupId?: string }>;
        const evaluationGroupRows = evaluationSamples.flatMap((sample) =>
          typeof sample.groupId === "string" && /^[a-f0-9]{64}$/.test(sample.groupId)
            ? [sample.groupId]
            : [],
        );
        const evaluationGroups = new Set(evaluationGroupRows);
        for (const trainingDataset of trainingDatasets) {
          const trainingSamples = JSON.parse(trainingDataset.samplesJson) as Array<{ groupId?: string }>;
          const trainingGroups = trainingSamples.flatMap((sample) =>
            typeof sample.groupId === "string" && /^[a-f0-9]{64}$/.test(sample.groupId)
              ? [sample.groupId]
              : [],
          );
          if (dataset.datasetKind === "real-anonymized" && trainingDataset.datasetKind === "real-anonymized" &&
              (trainingGroups.length !== trainingSamples.length || evaluationGroupRows.length !== evaluationSamples.length)) {
            return next(conflict("Cannot verify learner separation: real-anonymized training and evaluation datasets must contain keyed pseudonymous learner groups on every row."));
          }
          if (trainingGroups.some((groupId) => evaluationGroups.has(groupId))) {
            return next(conflict("Evaluation data contains learner groups already present in a candidate or baseline training dataset."));
          }
        }
      }

      const candidate = validateRegistryArtifact(JSON.parse(candidateRow.artifactJson));
      const baseline = validateRegistryArtifact(JSON.parse(baselineRow.artifactJson));
      const datasetFeatures = JSON.parse(dataset.featureSchemaJson);
      if (dataset.task !== candidate.task || JSON.stringify(datasetFeatures) !== JSON.stringify(candidate.featureSchema)) {
        return next(badRequest("Evaluation dataset task or feature schema does not match the model."));
      }
      const samples = JSON.parse(dataset.samplesJson) as Array<{
        features: Record<string, number | string>;
        target: number;
        groupId?: string;
        occurredAt?: string;
        unansweredCount?: number;
      }>;
      if (modelId === "performance-gradient-boosting" || modelId === "performance-random-forest") {
        const evaluationGroups = new Set(samples.map((sample) => sample.groupId).filter((value): value is string =>
          typeof value === "string" && /^[a-f0-9]{64}$/.test(value)));
        const trainingDatasets = await db.modelDataset.findMany({
          where: { id: { in: [candidateRow.trainingDatasetId, baselineRow.trainingDatasetId].filter((id): id is string => Boolean(id)) } },
          select: { datasetKind: true, sourceAttested: true },
        });
        if (dataset.task !== "regression" || dataset.datasetKind !== "real-anonymized" ||
            !candidateRow.trainingDatasetId || !baselineRow.trainingDatasetId ||
            samples.length < 200 || evaluationGroups.size < 50 ||
            samples.some((sample) => !sample.groupId || !/^[a-f0-9]{64}$/.test(sample.groupId) ||
              typeof sample.occurredAt !== "string" || !Number.isFinite(Date.parse(sample.occurredAt)) ||
              !Number.isInteger(sample.unansweredCount) || sample.unansweredCount! < 0 ||
              !Number.isFinite(sample.target) || sample.target < 0 || sample.target > 1) ||
            trainingDatasets.length !== new Set([candidateRow.trainingDatasetId, baselineRow.trainingDatasetId].filter(Boolean)).size ||
            trainingDatasets.some((trainingDataset) => trainingDataset.datasetKind !== "real-anonymized" || !trainingDataset.sourceAttested)) {
          return next(conflict("Performance evaluation requires an attested real-anonymized holdout with 200+ timestamped snapshots across 50+ independent learner groups, separate from eligible training data."));
        }
      }
      const report = evaluateRegistryCandidate(candidate, baseline, samples, dataset.name);
      const reportWithBaseline = { ...report, baselineModelId };
      await db.$transaction(async (tx) => {
        await tx.modelEvaluation.create({
          data: {
            actorId: req.user!.id,
            modelId,
            candidateVersion: version,
            baselineVersion: input.baselineVersion,
            datasetId: dataset.id,
            evaluationDataset: report.evaluationDataset,
            datasetFingerprint: report.datasetFingerprint,
            sampleCount: report.sampleCount,
            metricsJson: JSON.stringify({
              candidate: report.candidateMetrics,
              baseline: report.baselineMetrics,
              baselineModelId,
              acceptanceRule: report.acceptanceRule,
            }),
            status: report.status,
          },
        });
        await tx.modelRegistryAudit.create({
          data: {
            actorId: req.user!.id, modelId, version, action: "EVALUATED",
            details: JSON.stringify({
              status: report.status,
              baselineModelId,
              baselineVersion: report.baselineVersion,
              evaluationDataset: report.evaluationDataset,
              datasetId: dataset.id,
              datasetFingerprint: report.datasetFingerprint,
              sampleCount: report.sampleCount,
            }),
          },
        });
      });
      res.json({ ok: true, report: reportWithBaseline });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  router.post("/admin/models/:modelId/:version/activate", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const version = VersionSchema.parse(req.params.version);
      const action = GovernanceActionSchema.parse(req.body);
      const activated = await db.$transaction(async (tx) => {
        const target = await tx.registeredModel.findUnique({
          where: { modelId_version: { modelId, version } },
        });
        if (!target) return null;
        if (target.algorithm === "tensorflow-js-layers") {
          const tensorflowArtifact = validateTensorflowJsArtifact(JSON.parse(target.artifactJson));
          if (!isTensorflowJsArtifactProductionEligible(tensorflowArtifact)) {
            return { error: "tensorflow-production-gate" as const };
          }
        } else {
          validateRegistryArtifact(JSON.parse(target.artifactJson));
        }
        if (!target.isActive && target.algorithm !== "tensorflow-js-layers") {
          // A production candidate must have a traceable, authorized real-learner
          // training dataset as well as an independent real-learner evaluation set.
          const trainingDataset = target.trainingDatasetId
            ? await tx.modelDataset.findUnique({
              where: { id: target.trainingDatasetId },
              select: { id: true, datasetKind: true, sourceAttested: true },
            })
            : null;
          if (!trainingDataset
            || trainingDataset.datasetKind !== "real-anonymized"
            || !trainingDataset.sourceAttested) {
            return { error: "training-dataset-ineligible" as const };
          }
          const evaluation = await tx.modelEvaluation.findFirst({
            where: { modelId, candidateVersion: version },
            orderBy: { evaluatedAt: "desc" },
          });
          if (!evaluation || evaluation.status !== "PASSED") {
            return { error: "evaluation-required" as const };
          }
          // A passing score on synthetic or unattested data is useful for development,
          // but it is not sufficient evidence for production promotion.
          const evaluationDataset = evaluation.datasetId
            ? await tx.modelDataset.findUnique({
              where: { id: evaluation.datasetId },
              select: { id: true, datasetKind: true, sourceAttested: true },
            })
            : null;
          if (!evaluationDataset
            || evaluationDataset.datasetKind !== "real-anonymized"
            || !evaluationDataset.sourceAttested) {
            return { error: "evaluation-dataset-ineligible" as const };
          }
          if (trainingDataset.id === evaluationDataset.id) {
            return { error: "training-evaluation-overlap" as const };
          }
        }
        await tx.registeredModel.updateMany({ where: { modelId }, data: { isActive: false } });
        const model = await tx.registeredModel.update({
          where: { id: target.id },
          data: { isActive: true, activatedAt: new Date() },
          select: { modelId: true, version: true, isActive: true, activatedAt: true },
        });
        await tx.modelRegistryAudit.create({
          data: { actorId: req.user!.id, modelId, version, action: "ACTIVATED", details: JSON.stringify({ reason: action.reason ?? "Administrator requested model promotion." }) },
        });
        return model;
      });
      if (!activated) return next(notFound("Model version was not found."));
      if ("error" in activated) {
        if (activated.error === "tensorflow-production-gate") {
          return next(conflict("TensorFlow.js model cannot be activated until it passes real-anonymized production eligibility."));
        }
        if (activated.error === "training-dataset-ineligible") {
          return next(conflict("This candidate must be trained from a registered, attested real-anonymized dataset before production activation."));
        }
        if (activated.error === "evaluation-dataset-ineligible") {
          return next(conflict("This model version needs a passing evaluation on an attested real-anonymized dataset before production activation."));
        }
        if (activated.error === "training-evaluation-overlap") {
          return next(conflict("Candidate training and evaluation datasets must be independent."));
        }
        return next(conflict("This model version needs a passing evaluation against a baseline before activation."));
      }
      res.json({ ok: true, model: activated });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  router.post("/admin/models/:modelId/rollback", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const action = GovernanceActionSchema.parse(req.body);
      const outcome = await db.$transaction(async (tx) => {
        const active = await tx.registeredModel.findFirst({ where: { modelId, isActive: true } });
        if (!active) return { error: "missing-active" as const };
        const previous = await tx.registeredModel.findFirst({
          where: { modelId, version: { lt: active.version }, activatedAt: { not: null } },
          orderBy: { version: "desc" },
        });
        if (!previous) return { error: "missing-previous" as const };
        if (previous.algorithm === "tensorflow-js-layers") {
          const tensorflowArtifact = validateTensorflowJsArtifact(JSON.parse(previous.artifactJson));
          if (!isTensorflowJsArtifactProductionEligible(tensorflowArtifact)) {
            return { error: "previous-tensorflow-ineligible" as const };
          }
        } else {
          validateRegistryArtifact(JSON.parse(previous.artifactJson));
          const evaluation = await tx.modelEvaluation.findFirst({
            where: { modelId, candidateVersion: previous.version },
            orderBy: { evaluatedAt: "desc" },
          });
          if (!evaluation || evaluation.status !== "PASSED") {
            return { error: "previous-evaluation-required" as const };
          }
          const [previousTrainingDataset, evaluationDataset, evaluatedBaseline] = await Promise.all([
            previous.trainingDatasetId
              ? tx.modelDataset.findUnique({
                where: { id: previous.trainingDatasetId },
                select: { id: true, datasetKind: true, sourceAttested: true },
              })
              : null,
            evaluation.datasetId
              ? tx.modelDataset.findUnique({
                where: { id: evaluation.datasetId },
                select: { id: true, datasetKind: true, sourceAttested: true },
              })
              : null,
            tx.registeredModel.findUnique({
              where: {
                modelId_version: {
                  modelId: (() => {
                    try {
                      const details = JSON.parse(evaluation.metricsJson) as { baselineModelId?: string };
                      return details.baselineModelId ?? modelId;
                    } catch {
                      return modelId;
                    }
                  })(),
                  version: evaluation.baselineVersion,
                },
              },
              select: { trainingDatasetId: true },
            }),
          ]);
          if (!previousTrainingDataset
            || previousTrainingDataset.datasetKind !== "real-anonymized"
            || !previousTrainingDataset.sourceAttested) {
            return { error: "previous-training-dataset-ineligible" as const };
          }
          if (!evaluationDataset
            || evaluationDataset.datasetKind !== "real-anonymized"
            || !evaluationDataset.sourceAttested
            || previousTrainingDataset.id === evaluationDataset.id
            || evaluatedBaseline?.trainingDatasetId === evaluationDataset.id) {
            return { error: "previous-evaluation-dataset-ineligible" as const };
          }
        }
        await tx.registeredModel.updateMany({ where: { modelId }, data: { isActive: false } });
        const model = await tx.registeredModel.update({
          where: { id: previous.id },
          data: { isActive: true, activatedAt: new Date() },
          select: { modelId: true, version: true, isActive: true, activatedAt: true },
        });
        await tx.modelRegistryAudit.create({
          data: { actorId: req.user!.id, modelId, version: previous.version, action: "ROLLED_BACK", details: JSON.stringify({ fromVersion: active.version, reason: action.reason ?? "Administrator requested rollback." }) },
        });
        return { model };
      });
      if ("error" in outcome) {
        if (outcome.error === "missing-active") return next(notFound("No active model version was found."));
        if (outcome.error === "previous-evaluation-required") {
          return next(conflict("The previous model version needs a passing evaluation before rollback."));
        }
        if (outcome.error === "previous-training-dataset-ineligible") {
          return next(conflict("Rollback requires the previous version to have a registered, attested real-anonymized training dataset."));
        }
        if (outcome.error === "previous-evaluation-dataset-ineligible") {
          return next(conflict("Rollback requires a passing evaluation on an independent, attested real-anonymized dataset."));
        }
        return next(badRequest("No earlier model version is available for rollback."));
      }
      res.json({ ok: true, model: outcome.model });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  router.get("/admin/models/:modelId/:version/drift", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const version = VersionSchema.parse(req.params.version);
      const model = await db.registeredModel.findUnique({ where: { modelId_version: { modelId, version } } });
      if (!model) return next(notFound("Model version was not found."));
      if (!model.trainingDatasetId) return next(conflict("This model has no registered training dataset baseline for drift monitoring."));
      const baseline = await db.modelDataset.findUnique({ where: { id: model.trainingDatasetId } });
      if (!baseline) return next(conflict("The model training dataset baseline is unavailable."));
      const featureSchema = JSON.parse(baseline.featureSchemaJson) as Array<{ name: string; type: "numeric" | "categorical"; categories?: string[] }>;
      const baselineSamples = JSON.parse(baseline.samplesJson) as Array<{ features: Record<string, number | string>; target: number }>;
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const stored = await db.modelDriftBucket.findMany({
        where: { modelId, version, periodStart: { gte: since } },
        select: { featureName: true, bucket: true, count: true },
      });
      const assessments = featureSchema.map((feature) => {
        const observed: Record<string, number> = {};
        for (const row of stored.filter((item) => item.featureName === feature.name)) observed[row.bucket] = (observed[row.bucket] ?? 0) + row.count;
        return assessFeatureDrift(feature.name, expectedDriftCounts(feature, baselineSamples), observed);
      });
      const statuses = assessments.map((item) => item.status);
      const overall = statuses.includes("HIGH") ? "HIGH" : statuses.includes("MODERATE") ? "MODERATE" : statuses.every((status) => status === "NO_DATA") ? "NO_DATA" : "LOW";
      res.json({ ok: true, modelId, version, baselineDataset: baseline.name, windowDays: 30, overall, features: assessments });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  router.get("/admin/adaptive-learning/analytics", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = z.object({
        days: z.coerce.number().int().min(1).max(365).default(30),
        limit: z.coerce.number().int().min(1).max(10000).default(5000),
      }).parse(req.query);
      const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
      const rows = await db.adaptiveDecisionLog.findMany({
        where: { selectedAt: { gte: since } },
        orderBy: { selectedAt: "desc" },
        take: query.limit,
        select: {
          reasonCode: true,
          policyVersion: true,
          policyMode: true,
          selectionScore: true,
          reward: true,
          outcomeStatus: true,
          selectedAt: true,
          outcomeAt: true,
        },
      });

      const byReason = new Map<string, number>();
      const byPolicy = new Map<string, number>();
      const byOutcome = new Map<string, number>();
      const byDay = new Map<string, { selected: number; observed: number; rewardTotal: number }>();
      let scoreTotal = 0;
      let observed = 0;
      let rewardTotal = 0;
      let pending = 0;
      let unanswered = 0;

      for (const row of rows) {
        byReason.set(row.reasonCode, (byReason.get(row.reasonCode) ?? 0) + 1);
        const policy = `${row.policyMode}:v${row.policyVersion}`;
        byPolicy.set(policy, (byPolicy.get(policy) ?? 0) + 1);
        byOutcome.set(row.outcomeStatus, (byOutcome.get(row.outcomeStatus) ?? 0) + 1);
        scoreTotal += row.selectionScore;
        const day = row.selectedAt.toISOString().slice(0, 10);
        const bucket = byDay.get(day) ?? { selected: 0, observed: 0, rewardTotal: 0 };
        bucket.selected += 1;
        if (row.reward !== null) {
          observed += 1;
          rewardTotal += row.reward;
          bucket.observed += 1;
          bucket.rewardTotal += row.reward;
        }
        if (row.outcomeStatus === "pending") pending += 1;
        if (row.outcomeStatus === "unanswered") unanswered += 1;
        byDay.set(day, bucket);
      }

      res.json({
        ok: true,
        windowDays: query.days,
        sampleLimit: query.limit,
        sampled: rows.length,
        truncated: rows.length === query.limit,
        summary: {
          selected: rows.length,
          observed,
          pending,
          unanswered,
          averageReward: observed ? Number((rewardTotal / observed).toFixed(4)) : null,
          averageSelectionScore: rows.length ? Number((scoreTotal / rows.length).toFixed(4)) : null,
          outcomeCoverage: rows.length ? Number((observed / rows.length).toFixed(4)) : 0,
        },
        byReason: [...byReason].map(([reasonCode, count]) => ({ reasonCode, count })).sort((a, b) => b.count - a.count),
        byPolicy: [...byPolicy].map(([policy, count]) => ({ policy, count })).sort((a, b) => b.count - a.count),
        byOutcome: [...byOutcome].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
        daily: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({
          date,
          selected: value.selected,
          observed: value.observed,
          averageReward: value.observed ? Number((value.rewardTotal / value.observed).toFixed(4)) : null,
        })),
        privacy: { learnerIdentifiersIncluded: false, questionTextIncluded: false },
      });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      next(error);
    }
  });

  router.post("/admin/models/:modelId/predict", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const { features } = PredictionSchema.parse(req.body);
      const active = await db.registeredModel.findFirst({ where: { modelId, isActive: true } });
      if (!active) return next(notFound("No active model version is registered."));
      const artifact = validateRegistryArtifact(JSON.parse(active.artifactJson));
      const prediction = predictWithRegistryArtifact(artifact, features);
      if (active.trainingDatasetId) {
        try {
          const baseline = await db.modelDataset.findUnique({
          where: { id: active.trainingDatasetId },
          select: { featureSchemaJson: true, samplesJson: true },
        });
        if (baseline) {
          const featureSchema = JSON.parse(baseline.featureSchemaJson) as Array<{ name: string; type: "numeric" | "categorical"; categories?: string[] }>;
          const baselineSamples = JSON.parse(baseline.samplesJson) as Array<{ features: Record<string, number | string>; target: number }>;
          const periodStart = new Date();
          periodStart.setUTCHours(0, 0, 0, 0);
          await db.$transaction(featureSchema.map((feature) => {
            const bucket = driftBucket(feature, features[feature.name]!, baselineSamples);
            return db.modelDriftBucket.upsert({
              where: { modelId_version_featureName_bucket_periodStart: {
                modelId, version: active.version, featureName: feature.name, bucket, periodStart,
              } },
              create: { modelId, version: active.version, featureName: feature.name, bucket, periodStart, count: 1 },
              update: { count: { increment: 1 } },
            });
          }));
          }
        } catch (telemetryError) {
          console.error("Model drift telemetry write failed:", telemetryError);
        }
      }
      res.json({ ok: true, prediction });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  return router;
}
