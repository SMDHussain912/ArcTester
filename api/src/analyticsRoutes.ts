import { Router } from "express";
import express from "express";
import { z } from "zod";
import {
  getHistory,
  getPerformanceOverview,
  getWeakTopics,
  getQuestionPerformance,
  getStudyRecommendations,
  importProgress,
  exportProgress,
} from "./analytics.js";
import { requireAuth, type AuthedRequest } from "./auth.js";
import type { PrismaClient } from "@prisma/client";
import { getStudentScorePrediction } from "./intelligence/studentScorePrediction.js";
import { buildCurrentReadinessFeatures, READINESS_FEATURE_NAMES, type ReadinessPracticeAttempt } from "./intelligence/examReadinessDataset.js";
import { predictWithRegistryArtifact, validateRegistryArtifact } from "./intelligence/modelRegistry.js";

export function analyticsRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/overview", requireAuth, async (req, res, next) => {
    try {
      const report = await getPerformanceOverview(db, (req as AuthedRequest).user!.id);
      res.json(report);
    } catch (error) {
      next(error);
    }
  });

  router.get("/weak-topics", requireAuth, async (req, res, next) => {
    try {
      const report = await getWeakTopics(db, (req as AuthedRequest).user!.id);
      res.json(report);
    } catch (error) {
      next(error);
    }
  });

  router.get("/question-performance", requireAuth, async (req, res, next) => {
    try {
      const report = await getQuestionPerformance(db, (req as AuthedRequest).user!.id);
      res.json(report);
    } catch (error) {
      next(error);
    }
  });

  router.get("/recommendations", requireAuth, async (req, res, next) => {
    try {
      const report = await getStudyRecommendations(db, (req as AuthedRequest).user!.id);
      res.json(report);
    } catch (error) {
      next(error);
    }
  });

  router.get("/readiness", requireAuth, async (req, res, next) => {
    try {
      const userId = (req as AuthedRequest).user!.id;
      const rows = await db.attempt.findMany({
        where: {
          userId,
          mode: "practice",
          finishedAt: { not: null, lte: new Date() },
          answers: { some: {} },
        },
        orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
        take: 250,
        select: {
          finishedAt: true,
          answers: { select: { isCorrect: true, subjectSnapshot: true } },
        },
      });
      const attempts: ReadinessPracticeAttempt[] = rows.flatMap((row) => {
        if (!row.finishedAt || row.answers.length === 0) return [];
        return [{
          userId,
          finishedAt: row.finishedAt,
          correct: row.answers.filter((answer) => answer.isCorrect).length,
          total: row.answers.length,
          subjects: [...new Set(row.answers.map((answer) => answer.subjectSnapshot.trim()).filter(Boolean))],
        }];
      });
      res.setHeader("Cache-Control", "private, no-store");
      if (attempts.length < 5) {
        return res.json({
          status: "insufficient_data",
          category: null,
          completedAttempts: attempts.length,
          requiredCompletedAttempts: 5,
          message: "Complete at least five practice attempts before requesting a readiness estimate.",
        });
      }
      const active = await db.registeredModel.findFirst({
        where: { algorithm: "exam-readiness-softmax", task: "multiclass-classification", isActive: true },
        orderBy: { activatedAt: "desc" },
      });
      if (!active) {
        return res.json({
          status: "unavailable",
          category: null,
          completedAttempts: attempts.length,
          message: "No qualified readiness model is currently active. Continue using your practice results and study recommendations.",
        });
      }
      const artifact = validateRegistryArtifact(JSON.parse(active.artifactJson));
      if (artifact.algorithm !== "exam-readiness-softmax" || artifact.task !== "multiclass-classification" ||
          artifact.featureSchema.some((feature) => feature.type !== "numeric" ||
            !READINESS_FEATURE_NAMES.includes(feature.name as typeof READINESS_FEATURE_NAMES[number]))) {
        return res.json({
          status: "unavailable",
          category: null,
          completedAttempts: attempts.length,
          message: "The active readiness model does not support the current learner feature schema.",
        });
      }
      const vector = buildCurrentReadinessFeatures(attempts, userId);
      if (!vector) {
        return res.json({
          status: "insufficient_data",
          category: null,
          completedAttempts: attempts.length,
          requiredCompletedAttempts: 5,
          message: "There is not enough completed practice history for a readiness estimate.",
        });
      }
      const values = Object.fromEntries(READINESS_FEATURE_NAMES.map((name, index) => [name, vector[index]!]));
      const features = Object.fromEntries(artifact.featureSchema.map((feature) => [
        feature.name,
        values[feature.name as typeof READINESS_FEATURE_NAMES[number]],
      ]));
      const prediction = predictWithRegistryArtifact(artifact, features);
      const readiness = prediction.readiness;
      if (!readiness) {
        return res.json({
          status: "unavailable",
          category: null,
          completedAttempts: attempts.length,
          message: "The active model did not return a readiness result.",
        });
      }
      res.json({
        status: readiness.status,
        category: readiness.category,
        probabilities: readiness.probabilities,
        confidence: readiness.confidence,
        modelVersion: readiness.modelVersion,
        completedAttempts: attempts.length,
        factors: readiness.factors,
        message: readiness.status === "ready"
          ? "Estimate based on your completed practice history; actual exam results may differ."
          : "The model did not meet its confidence or data-safety threshold, so no readiness category is shown.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      if (error instanceof Error) {
        // A missing, malformed or incompatible artifact must never become a confident student-facing prediction.
        return res.status(503).json({
          status: "unavailable",
          category: null,
          message: "Readiness estimation is temporarily unavailable. Your practice history is unchanged.",
        });
      }
      next(error);
    }
  });

  router.get("/score-prediction", requireAuth, async (req, res, next) => {
    try {
      const report = await getStudentScorePrediction(db, (req as AuthedRequest).user!.id);
      res.json(report);
    } catch (error) {
      next(error);
    }
  });

  router.get("/history", requireAuth, async (req, res, next) => {
    try {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      }).parse(req.query);
      const history = await getHistory(db, (req as AuthedRequest).user!.id, query.page, query.limit);
      res.json(history);
    } catch (error) {
      next(error);
    }
  });

  router.get("/export", requireAuth, async (req, res, next) => {
    try {
      const payload = await exportProgress(db, (req as AuthedRequest).user!.id);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/import", requireAuth, express.json({ limit: "50mb" }), async (req, res, next) => {
    try {
      const report = await importProgress(db, (req as AuthedRequest).user!.id, req.body);
      res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
