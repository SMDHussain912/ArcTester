import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, conflict, notFound } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import {
  predictWithRegistryArtifact,
  validateRegistryArtifact,
  type RegisterModelInput,
} from "./intelligence/modelRegistry.js";
import { evaluateRegistryCandidate } from "./intelligence/modelEvaluation.js";
import { assessFeatureDrift, driftBucket, expectedDriftCounts } from "./intelligence/modelDrift.js";
import { rankTrainingResults, trainRegisteredDataset } from "./intelligence/registeredDatasetTraining.js";
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
  ]),
  task: z.enum(["regression", "binary-classification"]),
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
  baselineVersion: z.number().int().positive(),
  datasetId: z.string().min(1).max(64),
}).strict();

const DatasetSampleSchema = z.object({
  features: z.record(z.string(), z.union([z.number().finite(), z.string().max(500)])),
  target: z.number().finite(),
  // Keyed HMAC-SHA-256 pseudonym only; never store a learner name, email or database ID here.
  groupId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

const DatasetRegistrationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  task: z.enum(["regression", "binary-classification"]),
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

  router.post("/admin/model-datasets/:datasetId/train", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const datasetId = z.string().min(1).max(64).parse(req.params.datasetId);
      const input = TrainingSchema.parse(req.body);
      const dataset = await db.modelDataset.findUnique({ where: { id: datasetId } });
      if (!dataset) return next(notFound("Registered training dataset was not found."));
      const featureSchema = JSON.parse(dataset.featureSchemaJson) as Array<{ name: string; type: "numeric" | "categorical"; categories?: string[] }>;
      const samples = JSON.parse(dataset.samplesJson) as Array<{ features: Record<string, number | string>; target: number; groupId?: string }>;
      const trained = trainRegisteredDataset(samples, featureSchema, dataset.task as "regression" | "binary-classification", input.seed);
      const ranked = rankTrainingResults(trained, dataset.task as "regression" | "binary-classification");
      const created = await db.$transaction(async (tx) => {
        const models = [];
        for (const result of ranked) {
          const modelId = `${input.modelId}-${result.algorithm}`;
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
                trainRows: result.trainRows, testRows: result.testRows,
                heldOutMetrics: result.metrics, crossValidation: result.crossValidation ?? null,
                parameters: result.parameters ?? null, uncertainty: result.uncertainty ?? null, seed: input.seed,
              }),
            },
          });
          models.push({
            ...model,
            rank: result.rank,
            trainRows: result.trainRows,
            testRows: result.testRows,
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
          method: dataset.task === "regression" ? "RMSE ascending, then MAE ascending" : "F1 descending, then accuracy, precision and recall descending",
          scope: "same deterministic held-out split from this training run",
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

  router.post("/admin/models/:modelId/:version/evaluate", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const version = VersionSchema.parse(req.params.version);
      const input = EvaluationSchema.parse(req.body);
      if (input.baselineVersion === version) return next(badRequest("Candidate and baseline versions must differ."));
      const [candidateRow, baselineRow, dataset] = await Promise.all([
        db.registeredModel.findUnique({ where: { modelId_version: { modelId, version } } }),
        db.registeredModel.findUnique({ where: { modelId_version: { modelId, version: input.baselineVersion } } }),
        db.modelDataset.findUnique({ where: { id: input.datasetId } }),
      ]);
      if (!candidateRow || !baselineRow) return next(notFound("Candidate or baseline model version was not found."));
      if (candidateRow.algorithm === "tensorflow-js-layers" || baselineRow.algorithm === "tensorflow-js-layers") {
        return next(badRequest("TensorFlow.js candidates are evaluated during training and cannot use the statistical registry evaluation endpoint."));
      }
      if (!dataset) return next(notFound("Registered evaluation dataset was not found."));
      if (!dataset.sourceAttested) return next(conflict("Dataset source has not been attested."));
      const candidate = validateRegistryArtifact(JSON.parse(candidateRow.artifactJson));
      const baseline = validateRegistryArtifact(JSON.parse(baselineRow.artifactJson));
      const datasetFeatures = JSON.parse(dataset.featureSchemaJson);
      if (dataset.task !== candidate.task || JSON.stringify(datasetFeatures) !== JSON.stringify(candidate.featureSchema)) {
        return next(badRequest("Evaluation dataset task or feature schema does not match the model."));
      }
      const samples = JSON.parse(dataset.samplesJson) as Array<{ features: Record<string, number | string>; target: number }>;
      const report = evaluateRegistryCandidate(candidate, baseline, samples, dataset.name);
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
              baselineVersion: report.baselineVersion,
              evaluationDataset: report.evaluationDataset,
              datasetId: dataset.id,
              datasetFingerprint: report.datasetFingerprint,
              sampleCount: report.sampleCount,
            }),
          },
        });
      });
      res.json({ ok: true, report });
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
          const evaluation = await tx.modelEvaluation.findFirst({
            where: { modelId, candidateVersion: version },
            orderBy: { evaluatedAt: "desc" },
          });
          if (!evaluation || evaluation.status !== "PASSED") {
            return { error: "evaluation-required" as const };
          }
        }
        await tx.registeredModel.updateMany({ where: { modelId }, data: { isActive: false } });
        const model = await tx.registeredModel.update({
          where: { id: target.id },
          data: { isActive: true, activatedAt: new Date() },
          select: { modelId: true, version: true, isActive: true, activatedAt: true },
        });
        await tx.modelRegistryAudit.create({
          data: { actorId: req.user!.id, modelId, version, action: "ACTIVATED", details: JSON.stringify({ reason: "manual-promotion" }) },
        });
        return model;
      });
      if (!activated) return next(notFound("Model version was not found."));
      if ("error" in activated) {
        if (activated.error === "tensorflow-production-gate") {
          return next(conflict("TensorFlow.js model cannot be activated until it passes real-anonymized production eligibility."));
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
        }
        await tx.registeredModel.updateMany({ where: { modelId }, data: { isActive: false } });
        const model = await tx.registeredModel.update({
          where: { id: previous.id },
          data: { isActive: true, activatedAt: new Date() },
          select: { modelId: true, version: true, isActive: true, activatedAt: true },
        });
        await tx.modelRegistryAudit.create({
          data: { actorId: req.user!.id, modelId, version: previous.version, action: "ROLLED_BACK", details: JSON.stringify({ fromVersion: active.version }) },
        });
        return { model };
      });
      if ("error" in outcome) {
        if (outcome.error === "missing-active") return next(notFound("No active model version was found."));
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
