import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, notFound } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import {
  predictWithRegistryArtifact,
  validateRegistryArtifact,
  type RegisterModelInput,
} from "./intelligence/modelRegistry.js";

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
  features: z.record(z.union([z.number().finite(), z.string().max(500)])),
}).strict();

const ModelIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const VersionSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export function modelRegistryRouter(db: PrismaClient): Router {
  const router = Router();

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
          isActive: true,
          createdAt: true,
          activatedAt: true,
        },
        take: 500,
      });
      res.json({ ok: true, models });
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
        return tx.registeredModel.create({
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
      });
      res.status(201).json({ ok: true, model: created });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  router.post("/admin/models/:modelId/:version/activate", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const version = VersionSchema.parse(req.params.version);
      const activated = await db.$transaction(async (tx) => {
        const target = await tx.registeredModel.findUnique({
          where: { modelId_version: { modelId, version } },
        });
        if (!target) return null;
        validateRegistryArtifact(JSON.parse(target.artifactJson));
        await tx.registeredModel.updateMany({ where: { modelId }, data: { isActive: false } });
        return tx.registeredModel.update({
          where: { id: target.id },
          data: { isActive: true, activatedAt: new Date() },
          select: { modelId: true, version: true, isActive: true, activatedAt: true },
        });
      });
      if (!activated) return next(notFound("Model version was not found."));
      res.json({ ok: true, model: activated });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  router.post("/admin/models/:modelId/rollback", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const modelId = ModelIdSchema.parse(req.params.modelId);
      const active = await db.registeredModel.findFirst({ where: { modelId, isActive: true } });
      if (!active) return next(notFound("No active model version was found."));
      const previous = await db.registeredModel.findFirst({
        where: { modelId, version: { lt: active.version } },
        orderBy: { version: "desc" },
      });
      if (!previous) return next(badRequest("No earlier model version is available for rollback."));
      validateRegistryArtifact(JSON.parse(previous.artifactJson));
      const rolledBack = await db.$transaction(async (tx) => {
        await tx.registeredModel.updateMany({ where: { modelId }, data: { isActive: false } });
        return tx.registeredModel.update({
          where: { id: previous.id },
          data: { isActive: true, activatedAt: new Date() },
          select: { modelId: true, version: true, isActive: true, activatedAt: true },
        });
      });
      res.json({ ok: true, model: rolledBack });
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
      res.json({ ok: true, prediction });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) return next(badRequest(error.message));
      next(error);
    }
  });

  return router;
}
