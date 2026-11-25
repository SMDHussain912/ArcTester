import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, notFound } from "./errors.js";
import { requireAuth, type AuthedRequest } from "./auth.js";
import { predictActiveModel } from "./modelInference.js";

const featureValue = z.union([z.string().max(128), z.number().finite(), z.boolean()]);
const inputSchema = z.object({
  features: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), featureValue),
}).strict();

const sensitiveFeature = (name: string) => /(?:studentid|userid|email|phone|name|address|ipaddress|password|token|freetext|rawanswer|answertext)/.test(name.toLowerCase().replace(/[^a-z0-9]/g, ""));

export function modelInferenceRouter(db: PrismaClient): Router {
  const router = Router();
  router.post("/student/models/:modelId/predict", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const modelId = z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/).safeParse(req.params.modelId);
      if (!modelId.success) return next(badRequest("Model ID is invalid."));
      const enabledIds = new Set((process.env.MODEL_STUDENT_INFERENCE_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean));
      if (!enabledIds.has(modelId.data)) return next(notFound("This model is not enabled for student inference."));
      const parsed = inputSchema.safeParse(req.body);
      if (!parsed.success) return next(badRequest("Prediction features are invalid."));
      if (Object.keys(parsed.data.features).length < 1 || Object.keys(parsed.data.features).length > 32 || Object.keys(parsed.data.features).some(sensitiveFeature)) {
        return next(badRequest("Provide 1 to 32 non-identifying model features."));
      }
      const result = await predictActiveModel(db, modelId.data, parsed.data.features);
      if (!result) return next(notFound("No active model version is available."));
      res.json({ ok: true, modelId: result.modelId, version: result.version, prediction: result.prediction });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
