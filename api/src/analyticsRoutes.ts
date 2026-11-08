import { Router } from "express";
import { getHistory, getWeakTopics, importProgress, exportProgress } from "./analytics.js";
import { requireAuth, type AuthedRequest } from "./auth.js";
import type { PrismaClient } from "@prisma/client";

export function analyticsRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/weak-topics", requireAuth, async (req, res, next) => {
    try {
      const report = await getWeakTopics(db, (req as AuthedRequest).user!.id);
      res.json(report);
    } catch (error) {
      next(error);
    }
  });

  router.get("/history", requireAuth, async (req, res, next) => {
    try {
      const history = await getHistory(db, (req as AuthedRequest).user!.id);
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

  router.post("/import", requireAuth, async (req, res, next) => {
    try {
      const report = await importProgress(db, (req as AuthedRequest).user!.id, req.body);
      res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
