import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, notFound } from "./errors.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "./auth.js";
import { evaluateModelArtifacts } from "./modelInference.js";

const id = () => randomBytes(16).toString("hex");
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return "{" + entries.map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item)).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
const modelIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/);
const datasetInput = z.object({
  name: z.string().trim().min(2).max(100),
  task: z.enum(["classification", "regression"]),
  targetColumn: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  targetType: z.enum(["string", "number"]),
  featureSchema: z.array(z.object({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), type: z.enum(["string", "number", "boolean"]) })).min(1).max(32),
  samples: z.array(z.record(z.string(), z.union([z.string().max(5000), z.number().finite(), z.boolean()]))).min(5).max(500),
  sourceDescription: z.string().trim().min(8).max(1000),
  sourceAttested: z.boolean().default(false),
  confirmSourceAttestation: z.boolean().default(false),
  datasetKind: z.enum(["training", "validation", "verification", "synthetic"]),
});
const sensitive = (name: string) => /(?:studentid|userid|email|phone|name|address|ipaddress|password|token|freetext|rawanswer|answertext)/.test(name.toLowerCase().replace(/[^a-z0-9]/g, ""));

export function adminModelLabRouter(db: PrismaClient): Router {
  const router = Router();
  router.get("/admin/model-lab", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const [datasets, jobs, models, evaluations, drift] = await Promise.all([
        db.modelDataset.findMany({ take: 100, orderBy: { createdAt: "desc" }, select: { id: true, name: true, task: true, targetColumn: true, rowCount: true, sourceDescription: true, sourceAttested: true, datasetKind: true, fingerprint: true, createdAt: true } }),
        db.modelTrainingJob.findMany({ take: 100, orderBy: { createdAt: "desc" }, select: { id: true, datasetId: true, modelId: true, status: true, progress: true, errorMessage: true, workerId: true, leaseExpiresAt: true, seed: true, epochs: true, batchSize: true, createdAt: true, startedAt: true, completedAt: true, updatedAt: true } }),
        db.registeredModel.findMany({ take: 200, orderBy: [{ modelId: "asc" }, { version: "desc" }], select: { id: true, modelId: true, version: true, algorithm: true, task: true, dataset: true, trainingDatasetId: true, isActive: true, createdAt: true, activatedAt: true } }),
        db.modelEvaluation.findMany({ take: 100, orderBy: { evaluatedAt: "desc" }, select: { id: true, modelId: true, candidateVersion: true, baselineVersion: true, datasetId: true, evaluationDataset: true, sampleCount: true, metricsJson: true, status: true, evaluatedAt: true } }),
        db.modelDriftBucket.findMany({ take: 100, orderBy: { periodStart: "desc" }, select: { modelId: true, version: true, featureName: true, bucket: true, periodStart: true, count: true } }),
      ]);
      res.json({ ok: true, datasets, jobs, models, evaluations: evaluations.map(item => ({ ...item, metrics: safeJson(item.metricsJson), metricsJson: undefined })), drift });
    } catch (error) { next(error); }
  });

  router.post("/admin/model-lab/datasets", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = datasetInput.parse(req.body);
      if (input.task === "regression" && input.targetType !== "number") return next(badRequest("Regression target must be numeric."));
      if (input.sourceAttested && !input.confirmSourceAttestation) return next(badRequest("Confirm source attestation before marking this dataset verified."));
      const featureNames = input.featureSchema.map(feature => feature.name);
      if (new Set(featureNames).size !== featureNames.length || featureNames.includes(input.targetColumn)) return next(badRequest("Feature names must be unique and must not include the target column."));
      const expected = [...featureNames, input.targetColumn].sort();
      for (let rowIndex = 0; rowIndex < input.samples.length; rowIndex++) {
        const row = input.samples[rowIndex];
        if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(expected)) return next(badRequest("Every sample must contain exactly the declared feature columns and target."));
        for (const feature of input.featureSchema) {
          const value = row[feature.name];
          if (typeof value !== feature.type || (typeof value === "number" && !Number.isFinite(value))) return next(badRequest("Sample " + rowIndex + " has an invalid value for " + feature.name + "."));
        }
        const target = row[input.targetColumn];
        if (typeof target !== input.targetType || (typeof target === "number" && !Number.isFinite(target))) return next(badRequest("Sample " + rowIndex + " has an invalid target value."));
      }
      if ([...featureNames, input.targetColumn].some(sensitive)) return next(badRequest("Dataset columns must not contain personal identifiers or raw free-text/answer fields."));
      const samplesJson = stableJson(input.samples);
      if (Buffer.byteLength(samplesJson, "utf8") > 1_500_000) return next(badRequest("Dataset payload exceeds the 1.5 MB limit."));
      const schemaJson = stableJson({ features: input.featureSchema, targetColumn: input.targetColumn, targetType: input.targetType });
      const fingerprint = sha(stableJson({ task: input.task, schema: JSON.parse(schemaJson), samples: JSON.parse(samplesJson) }));
      const dataset = await db.modelDataset.create({ data: { id: id(), createdById: req.user!.id, name: input.name, task: input.task, targetColumn: input.targetColumn, featureSchemaJson: schemaJson, samplesJson, rowCount: input.samples.length, sourceDescription: input.sourceDescription, sourceAttested: input.sourceAttested, datasetKind: input.datasetKind, fingerprint }, select: { id: true, name: true, task: true, targetColumn: true, rowCount: true, sourceDescription: true, sourceAttested: true, datasetKind: true, fingerprint: true, createdAt: true } });
      res.status(201).json({ ok: true, dataset });
    } catch (error) { next(error); }
  });

  router.patch("/admin/model-lab/datasets/:id", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ name: z.string().trim().min(2).max(100).optional(), sourceDescription: z.string().trim().min(8).max(1000).optional() }).refine(value => Object.keys(value).length > 0).parse(req.body);
      const existing = await db.modelDataset.findUnique({ where: { id: req.params.id } });
      if (!existing) return next(notFound("Dataset not found."));
      const dataset = await db.modelDataset.update({ where: { id: existing.id }, data: input, select: { id: true, name: true, sourceDescription: true, datasetKind: true, rowCount: true, fingerprint: true } });
      await db.modelRegistryAudit.create({ data: { id: id(), actorId: req.user!.id, modelId: "dataset:" + existing.id, version: 0, action: "DATASET_UPDATED", details: stableJson(input) } });
      res.json({ ok: true, dataset });
    } catch (error) { next(error); }
  });

  router.delete("/admin/model-lab/datasets/:id", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const existing = await db.modelDataset.findUnique({ where: { id: req.params.id } });
      if (!existing) return next(notFound("Dataset not found."));
      const jobs = await db.modelTrainingJob.count({ where: { datasetId: existing.id } });
      if (jobs) return next(badRequest("This dataset is referenced by training jobs and cannot be deleted. Keep it for audit history."));
      await db.modelRegistryAudit.create({ data: { id: id(), actorId: req.user!.id, modelId: "dataset:" + existing.id, version: 0, action: "DATASET_DELETED", details: stableJson({ fingerprint: existing.fingerprint, name: existing.name }) } });
      await db.modelDataset.delete({ where: { id: existing.id } });
      res.json({ ok: true, deleted: true });
    } catch (error) { next(error); }
  });

  router.post("/admin/model-lab/training", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ datasetId: z.string().min(1), modelId: modelIdSchema, seed: z.number().int().min(0).max(1_000_000).default(42), epochs: z.number().int().min(1).max(200).default(80), batchSize: z.number().int().min(1).max(512).default(32) }).parse(req.body);
      const dataset = await db.modelDataset.findUnique({ where: { id: input.datasetId } });
      if (!dataset) return next(notFound("Dataset not found."));
      if (!["training", "synthetic"].includes(dataset.datasetKind)) return next(badRequest("Training can use training or synthetic datasets only; verification data is never used for training."));
      const job = await db.modelTrainingJob.create({ data: { id: id(), datasetId: dataset.id, createdById: req.user!.id, modelId: input.modelId, seed: input.seed, epochs: input.epochs, batchSize: input.batchSize, status: "QUEUED", progress: 0 } });
      res.status(202).json({ ok: true, job });
    } catch (error) { next(error); }
  });

  router.post("/admin/model-lab/evaluate", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ modelId: modelIdSchema, candidateVersion: z.number().int().min(1), baselineVersion: z.number().int().min(1), datasetId: z.string().min(1) }).parse(req.body);
      if (input.candidateVersion === input.baselineVersion) return next(badRequest("Candidate and baseline versions must differ."));
      const [candidate, baseline, dataset] = await Promise.all([
        db.registeredModel.findUnique({ where: { modelId_version: { modelId: input.modelId, version: input.candidateVersion } } }),
        db.registeredModel.findUnique({ where: { modelId_version: { modelId: input.modelId, version: input.baselineVersion } } }),
        db.modelDataset.findUnique({ where: { id: input.datasetId } }),
      ]);
      if (!candidate || !baseline || !dataset) return next(notFound("Candidate, baseline, or verification dataset not found."));
      if (dataset.datasetKind !== "verification" || !dataset.sourceAttested || candidate.task !== baseline.task || candidate.task !== dataset.task) return next(badRequest("Use a source-attested verification dataset with matching model tasks."));
      const c = JSON.parse(candidate.artifactJson) as { sha256?: unknown; modelArtifact?: unknown };
      const b = JSON.parse(baseline.artifactJson) as { sha256?: unknown; modelArtifact?: unknown };
      if (typeof c.sha256 !== "string" || !c.modelArtifact || sha(stableJson(c.modelArtifact)) !== c.sha256 || typeof b.sha256 !== "string" || !b.modelArtifact || sha(stableJson(b.modelArtifact)) !== b.sha256) return next(badRequest("Automated evaluation requires checksum-valid native model artifacts."));
      const rows = JSON.parse(dataset.samplesJson) as Record<string, unknown>[];
      if (rows.length !== dataset.rowCount) return next(badRequest("Verification dataset row count does not match its stored metadata."));
      const metrics = evaluateModelArtifacts(c.modelArtifact, b.modelArtifact, rows, dataset.targetColumn, candidate.task as "classification" | "regression");
      const passed = candidate.task === "classification" ? metrics.accuracy >= metrics.baselineAccuracy : metrics.mae <= metrics.baselineMae;
      const evaluation = await db.modelEvaluation.create({ data: { id: id(), actorId: req.user!.id, modelId: input.modelId, candidateVersion: input.candidateVersion, baselineVersion: input.baselineVersion, datasetId: dataset.id, evaluationDataset: dataset.name, datasetFingerprint: dataset.fingerprint, sampleCount: dataset.rowCount, metricsJson: stableJson(metrics), status: passed ? "PASSED" : "FAILED" } });
      await db.modelRegistryAudit.create({ data: { id: id(), actorId: req.user!.id, modelId: input.modelId, version: input.candidateVersion, action: "EVALUATED", details: stableJson({ evaluationId: evaluation.id, datasetId: dataset.id, status: evaluation.status, metrics }) } });
      res.json({ ok: true, evaluation, metrics, primaryMetric: candidate.task === "classification" ? "accuracy" : "mae" });
    } catch (error) { next(error); }
  });

  router.post("/admin/model-lab/models/:modelId/:version/activate", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const modelId = modelIdSchema.parse(req.params.modelId);
      const version = z.coerce.number().int().min(1).parse(req.params.version);
      const candidate = await db.registeredModel.findUnique({ where: { modelId_version: { modelId, version } } });
      if (!candidate) return next(notFound("Model version not found."));
      const passing = await db.modelEvaluation.findFirst({ where: { modelId, candidateVersion: version, status: "PASSED" }, orderBy: { evaluatedAt: "desc" } });
      if (!passing) return next(badRequest("Evaluate this candidate on an attested verification dataset before activation."));
      await db.$transaction(async tx => {
        await tx.registeredModel.updateMany({ where: { modelId, isActive: true }, data: { isActive: false } });
        await tx.registeredModel.update({ where: { id: candidate.id }, data: { isActive: true, activatedAt: new Date() } });
        await tx.modelRegistryAudit.create({ data: { id: id(), actorId: req.user!.id, modelId, version, action: "ACTIVATED", details: stableJson({ evaluationId: passing.id, verificationDatasetId: passing.datasetId }) } });
      });
      res.json({ ok: true, modelId, activeVersion: version });
    } catch (error) { next(error); }
  });

  router.patch("/admin/model-lab/models/:modelId/:version", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const currentModelId = modelIdSchema.parse(req.params.modelId);
      const version = z.coerce.number().int().min(1).parse(req.params.version);
      const input = z.object({ modelId: modelIdSchema }).parse(req.body);
      const candidate = await db.registeredModel.findUnique({ where: { modelId_version: { modelId: currentModelId, version } } });
      if (!candidate) return next(notFound("Model version not found."));
      if (candidate.isActive) return next(badRequest("Activate another passing version before editing an active model ID."));
      const collision = await db.registeredModel.findUnique({ where: { modelId_version: { modelId: input.modelId, version } } });
      if (collision && collision.id !== candidate.id) return next(badRequest("That model ID already has this version."));
      const updated = await db.registeredModel.update({ where: { id: candidate.id }, data: { modelId: input.modelId }, select: { id: true, modelId: true, version: true, isActive: true } });
      await db.modelRegistryAudit.create({ data: { id: id(), actorId: req.user!.id, modelId: input.modelId, version, action: "MODEL_ID_UPDATED", details: stableJson({ previousModelId: currentModelId }) } });
      res.json({ ok: true, model: updated });
    } catch (error) { next(error); }
  });

  router.delete("/admin/model-lab/models/:modelId/:version", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const modelId = modelIdSchema.parse(req.params.modelId);
      const version = z.coerce.number().int().min(1).parse(req.params.version);
      const candidate = await db.registeredModel.findUnique({ where: { modelId_version: { modelId, version } } });
      if (!candidate) return next(notFound("Model version not found."));
      if (candidate.isActive) return next(badRequest("Deactivate this model version by activating another passing version before deleting it."));
      await db.modelRegistryAudit.create({ data: { id: id(), actorId: req.user!.id, modelId, version, action: "DELETED", details: stableJson({ algorithm: candidate.algorithm, task: candidate.task, dataset: candidate.dataset }) } });
      await db.registeredModel.delete({ where: { id: candidate.id } });
      res.json({ ok: true, deleted: true });
    } catch (error) { next(error); }
  });
  return router;
}
function safeJson(raw: string): unknown { try { return JSON.parse(raw); } catch { return {}; } }
