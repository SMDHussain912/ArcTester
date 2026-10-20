import { Router } from "express";
import { z } from "zod";
import {
  CreateTestSchema,
  createTest,
  getAttemptView,
  getResult,
  submitTest,
  SubmitTestSchema,
} from "./testService.js";
import type { PrismaClient } from "@prisma/client";
import { analyticsRouter } from "./analyticsRoutes.js";
import { requireAuth, type AuthedRequest } from "./auth.js";

const AttemptIdSchema = z.object({ id: z.coerce.number().int().positive() });

export function testRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/bank", async (_req, res, next) => {
    try {
      const rows = await db.subject.findMany({
        select: { name: true, _count: { select: { questions: true } } },
        orderBy: { name: "asc" },
      });
      const subjects = rows.map((r) => ({ subject: r.name, count: r._count.questions }));
      res.json({
        subjects,
        total: subjects.reduce((sum, s) => sum + s.count, 0),
        serverNow: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/tests",
    requireAuth,
    async (req, res, next) => {
    try {
      const input = CreateTestSchema.parse(req.body);
      const created = await createTest(db, (req as AuthedRequest).user!.id, input);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/tests/:id/submit",
    requireAuth,
    async (req, res, next) => {
    try {
      const { id } = AttemptIdSchema.parse(req.params);
      const input = SubmitTestSchema.parse(req.body);
      const summary = await submitTest(db, (req as AuthedRequest).user!.id, id, input);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/tests/:id/result",
    requireAuth,
    async (req, res, next) => {
    try {
      const { id } = AttemptIdSchema.parse(req.params);
      const result = await getResult(db, (req as AuthedRequest).user!.id, id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/tests/:id",
    requireAuth,
    async (req, res, next) => {
    try {
      const { id } = AttemptIdSchema.parse(req.params);
      const view = await getAttemptView(db, (req as AuthedRequest).user!.id, id);
      res.json(view);
    } catch (error) {
      next(error);
    }
  });

  router.use("/analytics", analyticsRouter(db));

  return router;
}
