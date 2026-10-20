import { Router } from "express";
import { getHistory, getWeakTopics, importProgress, exportProgress } from "./analytics.js";
import type { PrismaClient } from "@prisma/client";

export function analyticsRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/weak-topics", async (_req, res, next) => {
    try {
      const report = await getWeakTopics(db);
      res.json(report);
    } catch (error) {
      next(error);
    }
  });

  router.get("/history", async (_req, res, next) => {
    try {
      const history = await getHistory(db);
      res.json(history);
    } catch (error) {
      next(error);
    }
  });

  router.get("/export", async (_req, res, next) => {
    try {
      const payload = await exportProgress(db);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/import", async (req, res, next) => {
    try {
      const report = await importProgress(db, req.body);
      res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
