import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, notFound } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";

const JobInputSchema = z.object({
  modelId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  seed: z.number().int().min(0).max(0xffffffff).default(42),
  epochs: z.number().int().min(1).max(500).default(80),
  batchSize: z.number().int().min(1).max(256).default(32),
}).strict();

const jobSelect = {
  id: true,
  datasetId: true,
  modelId: true,
  seed: true,
  epochs: true,
  batchSize: true,
  status: true,
  progress: true,
  errorMessage: true,
  resultJson: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  updatedAt: true,
} as const;

export function modelTrainingJobsRouter(db: PrismaClient): Router {
  const router = Router();

  router.post("/admin/model-datasets/:datasetId/tensorflow-jobs", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const datasetId = z.string().min(1).max(64).parse(req.params.datasetId);
      const input = JobInputSchema.parse(req.body);
      const dataset = await db.modelDataset.findUnique({ where: { id: datasetId } });
      if (!dataset) return next(notFound("Registered training dataset was not found."));
      if (dataset.task !== "regression") return next(badRequest("TensorFlow.js training currently supports regression datasets only."));

      const featureSchema = z.array(z.object({
        name: z.string().trim().min(1),
        type: z.literal("numeric"),
      }).strict()).min(1).max(128).superRefine((features, context) => {
        if (new Set(features.map((feature) => feature.name)).size !== features.length) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: "Feature names must be unique." });
        }
      });
      const parsedFeatures = featureSchema.safeParse(JSON.parse(dataset.featureSchemaJson) as unknown);
      if (!parsedFeatures.success) {
        return next(badRequest("TensorFlow.js training requires 1 to 128 uniquely named numeric features."));
      }
      const features = parsedFeatures.data;
      const sampleSchema = z.object({
        features: z.record(z.string(), z.number().finite()),
        target: z.number().finite(),
        groupId: z.string().regex(/^[a-f0-9]{64}$/),
      }).strict();
      const parsedSamples = z.array(sampleSchema).min(30).max(5000)
        .safeParse(JSON.parse(dataset.samplesJson) as unknown);
      if (!parsedSamples.success || parsedSamples.data.length !== dataset.rowCount) {
        return next(badRequest("Training dataset rowCount must match its 30 to 5000 stored samples."));
      }
      const samples = parsedSamples.data;
      if (samples.some((sample) =>
        Object.keys(sample.features).length !== features.length ||
        features.some((feature) => !Object.prototype.hasOwnProperty.call(sample.features, feature.name) ||
          typeof sample.features[feature.name] !== "number")
      )) {
        return next(badRequest("Every sample must contain finite numeric values for all declared features."));
      }

      const job = await db.modelTrainingJob.create({
        data: {
          datasetId,
          createdById: req.user!.id,
          modelId: input.modelId,
          seed: input.seed,
          epochs: input.epochs,
          batchSize: input.batchSize,
        },
        select: jobSelect,
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

  router.get("/admin/model-training-jobs", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const jobs = await db.modelTrainingJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: jobSelect,
      });
      res.json({
        ok: true,
        jobs: jobs.map(({ resultJson, ...job }) => ({
          ...job,
          result: job.status === "SUCCEEDED" ? JSON.parse(resultJson) : null,
        })),
      });
    } catch (error) { next(error); }
  });

  router.get("/admin/model-training-jobs/:jobId", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const jobId = z.string().min(1).max(64).parse(req.params.jobId);
      const job = await db.modelTrainingJob.findUnique({
        where: { id: jobId },
        select: jobSelect,
      });
      if (!job) return next(notFound("Model training job was not found."));
      const { resultJson, ...publicJob } = job;
      res.json({
        ok: true,
        job: {
          ...publicJob,
          result: job.status === "SUCCEEDED" ? JSON.parse(resultJson) : null,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  return router;
}
