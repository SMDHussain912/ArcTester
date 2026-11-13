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
